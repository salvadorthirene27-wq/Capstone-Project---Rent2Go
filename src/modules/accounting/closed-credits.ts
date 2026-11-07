import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {financialContext} from '../bookings/finance-context';
import {lockBookingAuthority} from '../bookings/quotation';
import {creditIncrement,cumulativeCredit,creditRounding,recoveryConsent,type Recipient} from './credit-calculation';

const reason=z.string().trim().min(1).max(2000),base={version:z.number().int().positive(),idempotencyKey:uuid};
export const closedCreditCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('PROPOSE_CREDIT'),sourceId:uuid,sourceKind:z.enum(['SERVICE','EXTRA']),amountCentavos:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),reason}).strict(),
 z.object({...base,action:z.literal('DECIDE_CREDIT'),creditId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['ACCEPT','DISPUTE']),consent:z.boolean(),reason:z.string().trim().max(2000)}).strict().superRefine((v,c)=>{if(v.decision==='ACCEPT'&&!v.consent)c.addIssue({code:'custom',path:['consent'],message:'Accept the exact credit terms.'});if(v.decision==='DISPUTE'&&!v.reason)c.addIssue({code:'custom',path:['reason'],message:'Explain the disputed terms.'});}),
 z.object({...base,action:z.literal('WITHDRAW_CREDIT'),creditId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),reason}).strict(),
 z.object({...base,action:z.literal('POST_CREDIT'),creditId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),consent:z.literal(true)}).strict()
]);
const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),sourcePage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
const rows=`SELECT a.*,p.created_at AS posted_at,x.reason AS withdrawn_reason,
 (SELECT d.decision FROM booking_closed_credit_decision d WHERE d.credit_id=a.id AND d.party='RENTER') renter_decision,
 (SELECT d.decision FROM booking_closed_credit_decision d WHERE d.credit_id=a.id AND d.party='OWNER') owner_decision
 FROM booking_closed_credit a LEFT JOIN booking_closed_credit_post p ON p.credit_id=a.id LEFT JOIN booking_closed_credit_cancel x ON x.credit_id=a.id`;
const live="posted_at IS NULL AND withdrawn_reason IS NULL AND COALESCE(renter_decision,'')<>'DISPUTE' AND COALESCE(owner_decision,'')<>'DISPUTE'";
type Allocation={entryId:string;recipient:Recipient;originalCentavos:number;creditCentavos:number};
type Body={title:string;agencyName:string;sourceKind:'SERVICE'|'EXTRA';sourceReference:string;startAt:string;endAt:string;amountCentavos:number;alreadyCreditedCentavos:number;originalBasisCentavos:number;roundingRule:string;allocations:Allocation[];owner:{title:string;agencyName:string;sourceKind:'SERVICE'|'EXTRA';sourceReference:string;startAt:string;endAt:string;originalShareBps:number;previousReductionsCentavos:number;originalEarningsCentavos:number;reductionCentavos:number;consentText:string}};
async function detailContext(c:PoolClient,actor:Actor,id:string,lock=false){
 const a=(await c.query(`${rows} WHERE a.id=$1`,[uuid.parse(id)])).rows[0];
 if(!a)throw new DomainError('Financial credit not found.',404);
 if(lock)await c.query('SELECT id FROM booking_request WHERE id=$1 FOR UPDATE',[a.request_id]);
 const user=await storedActor(actor,c),r=(await c.query('SELECT id,agency_id,renter_id,version FROM booking_request WHERE id=$1',[a.request_id])).rows[0];
 const renter=r.renter_id===user.id,owner=!renter&&a.owner_id===user.id&&Number(a.owner_centavos)>0;
 const operator=!renter&&!owner&&Boolean((await c.query('SELECT 1 FROM agency g JOIN app_actor o ON o.id=g.owner_id WHERE g.id=$1 AND g.active AND NOT o.suspended AND NOT o.is_test_fixture AND (g.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$2 AND m.active))',[r.agency_id,user.id])).rowCount);
 if((!renter&&!owner&&!operator)||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Financial credit not found.',404);
 // Re-read after the parent lock: a decision may have committed while we waited.
 const current=lock?(await c.query(`${rows} WHERE a.id=$1`,[id])).rows[0]:a;
 return {a:current,r,user,renter,owner,operator};
}
type Context=Awaited<ReturnType<typeof detailContext>>;
async function view(c:PoolClient,ctx:Context){
 const a=ctx.a,b=a.body as Body,active=!a.posted_at&&!a.withdrawn_reason&&!['DISPUTE'].includes(a.renter_decision)&&!['DISPUTE'].includes(a.owner_decision);
 const decisions=(await c.query('SELECT party,decision,reason,created_at FROM booking_closed_credit_decision WHERE credit_id=$1 ORDER BY created_at',[a.id])).rows;
 return {id:a.id as string,requestId:ctx.owner?null:a.request_id as string,requestVersion:ctx.r.version as number,environment:a.environment as 'MANUAL'|'DEMO',title:b.title,reason:a.reason as string,createdAt:(a.created_at as Date).toISOString(),postedAt:a.posted_at?(a.posted_at as Date).toISOString():null,withdrawnReason:a.withdrawn_reason as string|null,
  isOwner:ctx.owner,isRenter:ctx.renter,isOperator:ctx.operator,backHref:ctx.owner?`/workspace/earnings/${a.agency_id}?environment=${a.environment}`:ctx.renter?`/workspace/bookings/${a.request_id}`:`/agency/${a.agency_id}/bookings/${a.request_id}`,digest:(ctx.owner?a.owner_digest:a.digest) as string,
  terms:ctx.owner?b.owner:{title:b.title,agencyName:b.agencyName,sourceKind:b.sourceKind,sourceReference:b.sourceReference,startAt:b.startAt,endAt:b.endAt,amountCentavos:b.amountCentavos,originalBasisCentavos:b.originalBasisCentavos,alreadyCreditedCentavos:b.alreadyCreditedCentavos,consentText:'I accept this exact credit to my closed booking. A separate refund request, review and payment record are required; acceptance alone does not return money.'},
  allocations:ctx.operator?b.allocations:null,
  decisions:decisions.filter(d=>!ctx.owner||d.party==='OWNER').map(d=>({party:d.party as string,decision:d.decision as string,reason:d.reason as string,createdAt:(d.created_at as Date).toISOString()})),
  renterDecision:ctx.owner?null:a.renter_decision as string|null,ownerDecision:ctx.owner?a.owner_decision as string|null:null,
  canDecide:active&&(ctx.renter&&!a.renter_decision||ctx.owner&&a.renter_decision==='ACCEPT'&&!a.owner_decision),canWithdraw:active&&ctx.operator,
  canPost:active&&ctx.operator&&a.renter_decision==='ACCEPT'&&(Number(a.owner_centavos)===0||a.owner_decision==='ACCEPT'),
  ownerAcceptanceRequired:!ctx.owner&&Number(a.owner_centavos)>0,ownerAccepted:!ctx.owner&&a.owner_decision==='ACCEPT',roundingRule:b.roundingRule};
}
export type ClosedCreditState=Awaited<ReturnType<typeof view>>;
export async function getClosedCredit(actor:Actor,id:string){return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return view(c,await detailContext(c,actor,id));});}
export async function getClosedCredits(actor:Actor,id:string,input:unknown={}){const q=query.parse(input);return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const ctx=await financialContext(c,actor,id);
 const f=(await c.query('SELECT id,environment FROM booking_financial_close WHERE request_id=$1',[id])).rows[0];
 if(!f)return {requestVersion:ctx.r.version as number,closed:false,canPropose:false,sources:[],items:[],page:q.page,pageCount:1,sourcePage:q.sourcePage,sourcePageCount:1};
 const sources=(await c.query(`SELECT e.source_kind,e.source_id,min(l.public_snapshot->>'title') title,max(e.basis_centavos)::text basis,COALESCE((SELECT sum(a.amount_centavos) FROM booking_closed_credit a JOIN booking_closed_credit_post p ON p.credit_id=a.id WHERE a.close_id=e.close_id AND a.source_kind=e.source_kind AND a.source_id=e.source_id),0)::text credited,count(*) OVER()::int total FROM booking_revenue_entry e JOIN booking_quotation_line l ON l.quote_id=e.quote_id AND l.line_id=e.line_id WHERE e.close_id=$1 GROUP BY e.close_id,e.source_kind,e.source_id ORDER BY e.source_kind,e.source_id LIMIT 20 OFFSET $2`,[f.id,(q.sourcePage-1)*20])).rows;
 const list=(await c.query(`${rows} WHERE a.request_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET $2`,[id,(q.page-1)*20])).rows,items=[];
 for(const a of list)items.push(await view(c,{a,r:ctx.r,user:ctx.user,renter:ctx.owner,owner:false,operator:ctx.operator}));
 const total=Number((await c.query('SELECT count(*) n FROM booking_closed_credit WHERE request_id=$1',[id])).rows[0].n),active=(await c.query(`SELECT 1 FROM (${rows} WHERE a.request_id=$1) v WHERE ${live} LIMIT 1`,[id])).rowCount;
 const sourceTotal=Number(sources[0]?.total??(await c.query('SELECT count(*) n FROM (SELECT source_kind,source_id FROM booking_revenue_entry WHERE close_id=$1 GROUP BY source_kind,source_id) s',[f.id])).rows[0].n);
 return {requestVersion:ctx.r.version as number,closed:true,canPropose:ctx.operator&&!active,sources:sources.map(s=>({sourceId:s.source_id as string,sourceKind:s.source_kind as 'SERVICE'|'EXTRA',title:s.title as string,remainingCentavos:Number(s.basis)-Number(s.credited)})),items,page:q.page,pageCount:Math.max(1,Math.ceil(total/20)),sourcePage:q.sourcePage,sourcePageCount:Math.max(1,Math.ceil(sourceTotal/20))};
 });}
export type ClosedCreditsState=Awaited<ReturnType<typeof getClosedCredits>>;
async function lockAccounts(c:PoolClient,agencyId:string,environment:string,owners:string[]){
 for(const owner of [...new Set(owners)].sort()){
  await c.query('INSERT INTO owner_account(id,agency_id,owner_id,environment)VALUES($1,$2,$3,$4) ON CONFLICT(agency_id,owner_id,environment) DO NOTHING',[randomUUID(),agencyId,owner,environment]);
  await c.query('SELECT id FROM owner_account WHERE agency_id=$1 AND owner_id=$2 AND environment=$3 FOR UPDATE',[agencyId,owner,environment]);
 }
}
async function notify(c:PoolClient,requestId:string,agencyId:string,renterId:string,user:Actor,ownerId:string|null,environment:string,creditId:string,action:string){
 const message='A closed-booking credit was updated. Acceptance, recovery accounting and refund payment are separate records.';
 await c.query('UPDATE booking_request SET version=version+1 WHERE id=$1',[requestId]);
 await c.query('INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)',[randomUUID(),requestId,user.id,action,message]);
 await audit(c,user,action,requestId,{creditId});
 await c.query('INSERT INTO booking_notification(id,request_id,recipient_id,message) SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT owner_id FROM agency WHERE id=$4) OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active))',[requestId,message,renterId,agencyId]);
 if(ownerId){
  await c.query('UPDATE owner_account SET version=version+1 WHERE agency_id=$1 AND owner_id=$2 AND environment=$3',[agencyId,ownerId,environment]);
  await c.query('INSERT INTO finance_notification(id,recipient_id,account_id,message) SELECT gen_random_uuid(),$2,id,$4 FROM owner_account WHERE agency_id=$1 AND owner_id=$2 AND environment=$3',[agencyId,ownerId,environment,'A credit against your original earnings requires review or has been updated. Open your account to review the exact recovery consent and balance.']);
 }
}
export async function changeClosedCredit(actor:Actor,requestId:string,input:unknown){
 const command=closedCreditCommand.parse(input);uuid.parse(requestId);
 try{return await transaction(async c=>{
  const request=(await c.query('SELECT id,agency_id,renter_id,version FROM booking_request WHERE id=$1 FOR UPDATE',[requestId])).rows[0];if(!request)throw new DomainError('Request not found.',404);
  const user=await storedActor(actor,c),hash=digest(command);
  // Authenticate the exact viewer before replay lookup to preserve revocation/privacy.
  const detail=command.action==='PROPOSE_CREDIT'?null:await detailContext(c,user,command.creditId);
  const ctx=detail?null:await financialContext(c,user,requestId);
  if(detail&&detail.r.id!==requestId)throw new DomainError('Financial credit not found.',404);
  const operator=detail?.operator??ctx!.operator;
  if(command.action!=='DECIDE_CREDIT'&&!operator)throw new DomainError('Only an independent active agency operator may prepare or post credits.',403);
  const f=(await c.query('SELECT * FROM booking_financial_close WHERE request_id=$1',[requestId])).rows[0];if(!f)throw new DomainError('Only financially closed bookings use compensating credits.',409);
  const old=(await c.query('SELECT digest FROM booking_closed_credit_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[requestId,user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError('This retry key belongs to another credit action.',409);return {alreadyApplied:true};}
  if(request.version!==command.version)throw new DomainError('This financial record changed. Reload the exact credit before continuing.',409);
  let creditId:string,ownerId:string|null,affectedOwner:string|null=null;
  if(command.action==='PROPOSE_CREDIT'){
   const source=(await c.query('SELECT e.*,l.public_snapshot->>\'title\' title,l.public_snapshot->>\'startAt\' start_at,l.public_snapshot->>\'endAt\' end_at,(SELECT k.agency_name FROM booking_payment_collection k WHERE k.quote_id=e.quote_id ORDER BY k.recorded_at,k.id LIMIT 1) agency_name FROM booking_revenue_entry e JOIN booking_quotation_line l ON l.quote_id=e.quote_id AND l.line_id=e.line_id WHERE e.close_id=$1 AND e.source_kind=$2 AND e.source_id=$3 ORDER BY e.recipient',[f.id,command.sourceKind,command.sourceId])).rows;
   if(source.length!==4)throw new DomainError('Original revenue source not found.',404);
   ownerId=source.find(e=>e.recipient==='COSIGNER')!.beneficiary_actor_id;
   await lockAccounts(c,request.agency_id,f.environment,ownerId?[ownerId]:[]);
   const authority=await lockBookingAuthority(c,{r:request,user,owner:false},[request.renter_id,...(ownerId?[ownerId]:[])],true);if(!authority.active)throw new DomainError('This agency is unavailable.',409);
   if((await c.query(`SELECT 1 FROM (${rows} WHERE a.request_id=$1) v WHERE ${live} LIMIT 1`,[requestId])).rowCount)throw new DomainError('Resolve or withdraw the current credit before preparing another.',409);
   const previous=Number((await c.query('SELECT COALESCE(sum(a.amount_centavos),0)::text n FROM booking_closed_credit a JOIN booking_closed_credit_post p ON p.credit_id=a.id WHERE a.close_id=$1 AND a.source_kind=$2 AND a.source_id=$3',[f.id,command.sourceKind,command.sourceId])).rows[0].n);
   const original=Object.fromEntries(source.map(e=>[e.recipient,Number(e.amount_centavos)])) as Record<Recipient,number>,increment=creditIncrement(original,previous,command.amountCentavos);
   affectedOwner=increment.COSIGNER>0?ownerId:null;
   creditId=randomUUID();const identity={title:source[0].title,agencyName:source[0].agency_name as string,sourceKind:command.sourceKind,sourceReference:command.sourceId,startAt:source[0].start_at as string,endAt:source[0].end_at as string};const body:Body={...identity,amountCentavos:command.amountCentavos,alreadyCreditedCentavos:previous,originalBasisCentavos:Number(source[0].basis_centavos),roundingRule:creditRounding,allocations:source.map(e=>({entryId:e.id,recipient:e.recipient,originalCentavos:Number(e.amount_centavos),creditCentavos:increment[e.recipient as Recipient]})),owner:{...identity,previousReductionsCentavos:cumulativeCredit(original,previous).COSIGNER,originalShareBps:Number(source.find(e=>e.recipient==='COSIGNER')!.bps),originalEarningsCentavos:original.COSIGNER,reductionCentavos:increment.COSIGNER,consentText:recoveryConsent}};
   const ownerHash=digest({creditId,environment:f.environment,reason:command.reason,terms:body.owner});
   await c.query('INSERT INTO booking_closed_credit(id,close_id,request_id,quote_id,agency_id,environment,source_kind,source_id,line_id,actor_id,owner_id,amount_centavos,owner_centavos,baseline_centavos,reason,body,digest,owner_digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',[creditId,f.id,requestId,f.quote_id,request.agency_id,f.environment,command.sourceKind,command.sourceId,source[0].line_id,user.id,ownerId,command.amountCentavos,increment.COSIGNER,previous,command.reason,body,digest({creditId,closeDigest:f.digest,reason:command.reason,body}),ownerHash]);
  }else{
   const d=detail!,a=d.a;creditId=a.id;ownerId=a.owner_id;affectedOwner=Number(a.owner_centavos)>0?ownerId:null;
   await lockAccounts(c,request.agency_id,f.environment,ownerId?[ownerId]:[]);
   const authority=await lockBookingAuthority(c,{r:request,user,owner:d.renter||d.owner},[request.renter_id,...(ownerId?[ownerId]:[])],command.action!=='DECIDE_CREDIT');if(!authority.active)throw new DomainError('This agency is unavailable.',409);
   const record=await view(c,d),exactDigest=d.owner?a.owner_digest:a.digest;
   if(command.digest!==exactDigest)throw new DomainError('Review the exact saved credit terms.',409);
   if(command.action==='DECIDE_CREDIT'){
    if(!record.canDecide)throw new DomainError('This credit is not awaiting your decision.',409);
    await c.query('INSERT INTO booking_closed_credit_decision(id,credit_id,party,actor_id,decision,digest,consent,reason)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),a.id,d.owner?'OWNER':'RENTER',user.id,command.decision,command.digest,command.consent,command.reason]);
   }else if(command.action==='WITHDRAW_CREDIT'){
    if(!record.canWithdraw)throw new DomainError('Only an unposted active credit may be withdrawn.',409);
    await c.query('INSERT INTO booking_closed_credit_cancel(credit_id,actor_id,reason)VALUES($1,$2,$3)',[a.id,user.id,command.reason]);
   }else{
    if(!record.canPost)throw new DomainError('Exact renter and affected original owner acceptance is required before posting.',409);
    if(Number(a.owner_centavos)>0&&ownerId&&(await c.query(`SELECT 1 FROM owner_withdrawal w JOIN owner_account o ON o.id=w.account_id JOIN owner_withdrawal_decision d ON d.withdrawal_id=w.id AND d.decision='APPROVE' WHERE o.agency_id=$1 AND o.owner_id=$2 AND o.environment=$3 AND NOT EXISTS(SELECT 1 FROM owner_withdrawal_cancel x WHERE x.withdrawal_id=w.id) AND NOT EXISTS(SELECT 1 FROM owner_payout p WHERE p.withdrawal_id=w.id) LIMIT 1`,[request.agency_id,ownerId,f.environment])).rowCount)throw new DomainError('Resolve or revoke this owner account\'s approved unpaid payouts before posting the recovery.',409);
    const previous=Number((await c.query('SELECT COALESCE(sum(a.amount_centavos),0)::text n FROM booking_closed_credit a JOIN booking_closed_credit_post p ON p.credit_id=a.id WHERE a.close_id=$1 AND a.source_kind=$2 AND a.source_id=$3',[f.id,a.source_kind,a.source_id])).rows[0].n);
    if(previous!==Number(a.baseline_centavos))throw new DomainError('The original source balance changed. Prepare new credit terms.',409);
    await c.query('INSERT INTO booking_closed_credit_post(credit_id,actor_id)VALUES($1,$2)',[a.id,user.id]);
    for(const e of (a.body as Body).allocations)await c.query('INSERT INTO booking_revenue_credit(id,credit_id,entry_id,amount_centavos)VALUES($1,$2,$3,$4)',[randomUUID(),a.id,e.entryId,e.creditCentavos]);
   }
  }
  await c.query('INSERT INTO booking_closed_credit_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)',[randomUUID(),requestId,user.id,command.idempotencyKey,hash]);
  await notify(c,requestId,request.agency_id,request.renter_id,user,affectedOwner,f.environment,creditId,command.action);
  return {alreadyApplied:false,creditId};
 });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This credit decision or retry is already recorded. Reload the saved record.',409);throw e;}
}
/** Detail endpoint never needs a request ID supplied by a Cosigner. Authorization is repeated in the mutation transaction. */
export async function changeClosedCreditById(actor:Actor,id:string,input:unknown){
 const command=closedCreditCommand.parse(input);if(command.action==='PROPOSE_CREDIT'||command.creditId!==uuid.parse(id))throw new DomainError('Choose the exact saved credit.',422);
 const requestId=await transaction(async c=>(await detailContext(c,actor,id)).r.id as string);
 return changeClosedCredit(actor,requestId,command);
}
