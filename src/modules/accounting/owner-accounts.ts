import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {lockBookingAuthority} from '../bookings/quotation';
import {normalizePaymentReference} from '../bookings/payment-schema';
import {z} from 'zod';
import type {PaymentEvidenceUpload} from '../bookings/payment';
import {accountScope,accountQuery,withdrawalCommand,payoutEvidenceCommand,type AccountScope} from './schema';
import {ownerBalances} from './balances';

async function context(c:PoolClient,actor:Actor,input:AccountScope){
 const scope=accountScope.parse(input),user=await storedActor(actor,c);
 const a=(await c.query(`SELECT a.owner_id,a.active AND NOT o.suspended AND NOT o.is_test_fixture AS active,r.payload->>'businessName' AS name,(a.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=$2 AND m.active)) AS operator FROM agency a JOIN app_actor o ON o.id=a.owner_id JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=a.approved_revision WHERE a.id=$1`,[scope.agencyId,user.id])).rows[0];
 const owner=scope.ownerId===user.id,operator=!owner&&Boolean(a?.active&&a?.operator);
 if(!a||(!owner&&!operator))throw new DomainError('Owner account not found.',404);
 const beneficiary=(await c.query('SELECT id,name,suspended,is_test_fixture FROM app_actor WHERE id=$1',[scope.ownerId])).rows[0];
 if(!beneficiary||beneficiary.is_test_fixture||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Owner account not found.',404);
 const account=(await c.query('SELECT id,version FROM owner_account WHERE agency_id=$1 AND owner_id=$2 AND environment=$3',[scope.agencyId,scope.ownerId,scope.environment])).rows[0];
 if(!owner&&!account&&!(await c.query("SELECT 1 FROM booking_revenue_entry WHERE agency_id=$1 AND beneficiary_actor_id=$2 AND environment=$3 AND recipient='COSIGNER' AND amount_centavos>0 LIMIT 1",[scope.agencyId,scope.ownerId,scope.environment])).rowCount)throw new DomainError('Owner account not found.',404);
 return {scope,user,owner,operator,agencyActive:Boolean(a.active),agencyName:a.name as string,ownerName:beneficiary.name as string,beneficiaryActive:!beneficiary.suspended,account:account as {id:string;version:number}|undefined};
}
type Context=Awaited<ReturnType<typeof context>>;
const withdrawalRows=`SELECT w.*,d.decision,d.reason AS review_reason,x.action AS cancellation,x.reason AS cancellation_reason,p.id AS payout_id FROM owner_withdrawal w LEFT JOIN owner_withdrawal_decision d ON d.withdrawal_id=w.id LEFT JOIN owner_withdrawal_cancel x ON x.withdrawal_id=w.id LEFT JOIN owner_payout p ON p.withdrawal_id=w.id`;
const openPredicate="payout_id IS NULL AND cancellation IS NULL AND (decision IS NULL OR decision='APPROVE')";
async function balances(c:PoolClient,ctx:Context){
 const {agencyId,ownerId,environment}=ctx.scope;
 const earned=(await c.query("SELECT COALESCE(sum(amount_centavos),0)::text n FROM booking_revenue_entry WHERE agency_id=$1 AND beneficiary_actor_id=$2 AND environment=$3 AND recipient='COSIGNER'",[agencyId,ownerId,environment])).rows[0].n;
 const totals=ctx.account?(await c.query(`SELECT COALESCE(sum(amount_centavos) FILTER(WHERE decision IS NULL),0)::text requested,COALESCE(sum(amount_centavos) FILTER(WHERE decision='APPROVE'),0)::text reserved FROM (${withdrawalRows} WHERE w.account_id=$1) v WHERE ${openPredicate}`,[ctx.account.id])).rows[0]:{requested:'0',reserved:'0'};
 const paid=ctx.account?(await c.query('SELECT COALESCE(-sum(amount_centavos),0)::text n FROM owner_account_entry WHERE account_id=$1',[ctx.account.id])).rows[0].n:'0';
 const credits=(await c.query("SELECT COALESCE(sum(x.amount_centavos),0)::text n FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id WHERE e.agency_id=$1 AND e.beneficiary_actor_id=$2 AND e.environment=$3 AND e.recipient='COSIGNER'",[agencyId,ownerId,environment])).rows[0].n;
 return ownerBalances(BigInt(earned),BigInt(paid),BigInt(totals.reserved),BigInt(totals.requested),BigInt(credits));
}
async function attemptRows(c:PoolClient,withdrawalIds:string[]){return(await c.query('SELECT t.*,r.outcome AS resolved_outcome,r.reason AS resolution_reason FROM owner_payout_attempt t LEFT JOIN owner_payout_resolution r ON r.attempt_id=t.id WHERE t.withdrawal_id=ANY($1::uuid[]) ORDER BY t.created_at,t.id',[withdrawalIds])).rows;}
function withdrawalView(ctx:Context,w:any,attempts:any[],available:number){
 const items=attempts.filter(t=>t.withdrawal_id===w.id),pending=items.some(t=>t.initial_outcome==='PENDING'&&!t.resolved_outcome),stage=w.payout_id?'PAID':w.cancellation==='WITHDRAW'?'WITHDRAWN':w.cancellation==='REVOKE'?'REVOKED':w.decision==='REJECT'?'REJECTED':w.decision==='APPROVE'?'APPROVED':'REQUESTED',active=ctx.agencyActive&&ctx.beneficiaryActive;
 return {id:w.id as string,amountCentavos:Number(w.amount_centavos),method:w.method as string,destination:w.destination as {name:string;account:string},reason:w.reason as string,createdAt:(w.created_at as Date).toISOString(),stage,reviewReason:w.review_reason as string|null,cancellationReason:w.cancellation_reason as string|null,payoutId:w.payout_id as string|null,
  canApprove:ctx.operator&&active&&stage==='REQUESTED'&&Number(w.amount_centavos)<=available,canReject:ctx.operator&&active&&stage==='REQUESTED',canWithdraw:ctx.owner&&stage==='REQUESTED',canRevoke:ctx.operator&&active&&stage==='APPROVED'&&!pending,canPay:ctx.operator&&active&&stage==='APPROVED'&&!pending&&items.length<30,
  attempts:items.map(t=>({id:t.id as string,outcome:(t.resolved_outcome??t.initial_outcome) as string,reference:t.reference as string,reason:(t.resolution_reason??t.note) as string,createdAt:(t.created_at as Date).toISOString(),evidenceId:t.file_id as string|null,canResolve:ctx.operator&&active&&stage==='APPROVED'&&t.initial_outcome==='PENDING'&&!t.resolved_outcome}))};
}
async function projection(c:PoolClient,ctx:Context,page=1,ledgerPage=1){
 const b=await balances(c,ctx),id=ctx.account?.id??null;
 const open=(await c.query(`SELECT * FROM (${withdrawalRows} WHERE w.account_id=$1) v WHERE ${openPredicate} ORDER BY created_at,id LIMIT 20`,[id])).rows;
 const history=(await c.query(`SELECT * FROM (${withdrawalRows} WHERE w.account_id=$1) v WHERE NOT(${openPredicate}) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[id,(page-1)*20])).rows;
 const total=Number((await c.query(`SELECT count(*) n FROM (${withdrawalRows} WHERE w.account_id=$1) v WHERE NOT(${openPredicate})`,[id])).rows[0].n),attempts=await attemptRows(c,[...open,...history].map(w=>w.id));
 const ledger=(await c.query(`SELECT e.id,e.vehicle_id,e.source_kind,e.bps,e.amount_centavos,e.created_at,l.public_snapshot->>'title' title,l.public_snapshot->>'startAt' start_at,l.public_snapshot->>'endAt' end_at FROM booking_revenue_entry e JOIN booking_quotation_line l ON l.quote_id=e.quote_id AND l.line_id=e.line_id WHERE e.agency_id=$1 AND e.beneficiary_actor_id=$2 AND e.environment=$3 AND e.recipient='COSIGNER' AND e.amount_centavos>0 ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET $4`,[ctx.scope.agencyId,ctx.scope.ownerId,ctx.scope.environment,(ledgerPage-1)*20])).rows;
 const ledgerTotal=Number((await c.query("SELECT count(*) n FROM booking_revenue_entry WHERE agency_id=$1 AND beneficiary_actor_id=$2 AND environment=$3 AND recipient='COSIGNER' AND amount_centavos>0",[ctx.scope.agencyId,ctx.scope.ownerId,ctx.scope.environment])).rows[0].n);
 return {scope:ctx.scope,accountId:ctx.account?.id??null,requestVersion:ctx.account?.version??1,agencyName:ctx.agencyName,ownerName:ctx.ownerName,isOwner:ctx.owner,isOperator:ctx.operator,agencyActive:ctx.agencyActive,balances:b,canRequest:ctx.owner&&ctx.agencyActive&&ctx.beneficiaryActive&&b.availableCentavos>0&&open.length<20,open:open.map(w=>withdrawalView(ctx,w,attempts,b.availableCentavos)),history:history.map(w=>withdrawalView(ctx,w,attempts,b.availableCentavos)),page,pageCount:Math.max(1,Math.ceil(total/20)),ledgerPage,ledgerPageCount:Math.max(1,Math.ceil(ledgerTotal/20)),ledger:ledger.map(e=>({id:e.id as string,title:e.title as string,vehicleId:e.vehicle_id as string,source:e.source_kind as string,bps:e.bps as number,amountCentavos:Number(e.amount_centavos),createdAt:(e.created_at as Date).toISOString(),startAt:e.start_at as string|null,endAt:e.end_at as string|null}))};
}
export type OwnerAccountState=Awaited<ReturnType<typeof projection>>;
export async function authorizeOwnerAccountView(actor:Actor,scope:AccountScope){return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await context(c,actor,scope);});}
export async function getOwnerCredits(actor:Actor,scope:AccountScope,page=1){
 z.number().int().min(1).max(10000).parse(page);
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await context(c,actor,scope);
  const params=[scope.agencyId,scope.ownerId,scope.environment],where="a.agency_id=$1 AND a.owner_id=$2 AND a.environment=$3 AND a.owner_centavos>0";
  const rows=(await c.query(`SELECT a.id,a.body->>'title' title,a.owner_centavos,a.reason,a.created_at,p.created_at posted_at,x.reason withdrawn_reason,(SELECT d.decision FROM booking_closed_credit_decision d WHERE d.credit_id=a.id AND d.party='OWNER') decision,(SELECT d.decision FROM booking_closed_credit_decision d WHERE d.credit_id=a.id AND d.party='RENTER') renter_decision FROM booking_closed_credit a LEFT JOIN booking_closed_credit_post p ON p.credit_id=a.id LEFT JOIN booking_closed_credit_cancel x ON x.credit_id=a.id WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET $4`,[...params,(page-1)*20])).rows;
  const total=Number((await c.query(`SELECT count(*) n FROM booking_closed_credit a WHERE ${where}`,params)).rows[0].n);
  return {page,pageCount:Math.max(1,Math.ceil(total/20)),items:rows.map(a=>({id:a.id as string,title:a.title as string,amountCentavos:Number(a.owner_centavos),reason:a.reason as string,createdAt:(a.created_at as Date).toISOString(),stage:a.posted_at?'POSTED':a.withdrawn_reason?'WITHDRAWN':a.decision==='DISPUTE'||a.renter_decision==='DISPUTE'?'DISPUTED':a.decision==='ACCEPT'?'ACCEPTED':a.renter_decision==='ACCEPT'?'AWAITING YOUR REVIEW':'AWAITING RENTER'}))};
 });
}
export async function getOwnerAccount(actor:Actor,scope:AccountScope,input:unknown={environment:scope.environment}){const q=accountQuery.parse(input);if(q.environment!==scope.environment)throw new DomainError('Account environment does not match.',422);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return projection(c,await context(c,actor,scope),q.page,q.ledgerPage);});}

async function lockAccount(c:PoolClient,ctx:Context){
 await c.query('INSERT INTO owner_account(id,agency_id,owner_id,environment)VALUES($1,$2,$3,$4) ON CONFLICT(agency_id,owner_id,environment) DO NOTHING',[randomUUID(),ctx.scope.agencyId,ctx.scope.ownerId,ctx.scope.environment]);
 ctx.account=(await c.query('SELECT id,version FROM owner_account WHERE agency_id=$1 AND owner_id=$2 AND environment=$3 FOR UPDATE',[ctx.scope.agencyId,ctx.scope.ownerId,ctx.scope.environment])).rows[0];
 const authority=await lockBookingAuthority(c,{r:{agency_id:ctx.scope.agencyId},user:ctx.user,owner:ctx.owner},[ctx.scope.ownerId],!ctx.owner);ctx.agencyActive=authority.active;
 // Withdrawal of an unreviewed request remains possible when an agency is inactive.
 return authority;
}
async function notify(c:PoolClient,ctx:Context,action:string){
 await c.query('UPDATE owner_account SET version=version+1 WHERE id=$1',[ctx.account!.id]);ctx.account!.version++;
 await audit(c,ctx.user,action,ctx.account!.id,{agencyId:ctx.scope.agencyId,environment:ctx.scope.environment});
 await c.query(`INSERT INTO finance_notification(id,recipient_id,account_id,message) SELECT gen_random_uuid(),a.id,$1,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))`,[ctx.account!.id,'Owner withdrawal activity was recorded. Review the account; approval is separate from payout.',ctx.scope.ownerId,ctx.scope.agencyId]);
}
async function payout(c:PoolClient,ctx:Context,w:any,t:any){
 const id=randomUUID(),body={agencyName:ctx.agencyName,ownerName:ctx.ownerName,destination:w.destination,amountCentavos:Number(w.amount_centavos),method:w.method,environment:ctx.scope.environment,externalPaid:ctx.scope.environment==='MANUAL',reference:t.reference,recordedBy:ctx.user.name,withdrawalId:w.id,attemptId:t.id};
 await c.query('INSERT INTO owner_payout(id,withdrawal_id,account_id,attempt_id,agency_id,environment,method,amount_centavos,reference,normalized_reference,body,digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,w.id,ctx.account!.id,t.id,ctx.scope.agencyId,ctx.scope.environment,w.method,w.amount_centavos,t.reference,normalizePaymentReference(t.reference),body,digest(body)]);
 await c.query('INSERT INTO owner_account_entry(id,account_id,withdrawal_id,payout_id,amount_centavos)VALUES($1,$2,$3,$4,$5)',[randomUUID(),ctx.account!.id,w.id,id,-BigInt(w.amount_centavos)]);
}
function validateFile(file:PaymentEvidenceUpload){uuid.parse(file.id);if(!['image/png','image/jpeg','application/pdf'].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>5242880||!/^[a-f0-9]{64}$/.test(file.sha256)||!['local','s3'].includes(file.backend))throw new DomainError('Invalid private payout evidence.',422);}
async function run(actor:Actor,scope:AccountScope,command:any,file?:PaymentEvidenceUpload,preflight=false){
 try{return await transaction(async c=>{
  const ctx=await context(c,actor,scope),ownAction=['REQUEST_WITHDRAWAL','WITHDRAW_REQUEST'].includes(command.action);
  if(ownAction?!ctx.owner:!ctx.operator)throw new DomainError(ownAction?'Only the account owner may request or withdraw earnings.':'Independent active agency access is required.',403);
  const authority=await lockAccount(c,ctx),hash=digest({command,...(file?{fileHash:file.sha256}:{})}),old=(await c.query('SELECT digest FROM owner_withdrawal_command WHERE account_id=$1 AND actor_id=$2 AND idempotency_key=$3',[ctx.account!.id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError('This retry key belongs to different withdrawal content.',409);return {state:await projection(c,ctx),usedFile:false,alreadyApplied:true};}
  if(ctx.account!.version!==command.version)throw new DomainError('This owner account changed. Refresh before continuing.',409);
  if(command.action!=='WITHDRAW_REQUEST'&&!authority.active)throw new DomainError('The agency is currently unavailable.',409);
  const b=await balances(c,ctx);
  if(command.action==='REQUEST_WITHDRAWAL'){
   if(command.method.startsWith('DEMO_')!==(scope.environment==='DEMO'))throw new DomainError('Use the payment method for this account environment.',409);
   if(command.amountCentavos>b.availableCentavos)throw new DomainError('The requested amount exceeds available owner earnings.',409);
   if(Number((await c.query(`SELECT count(*) n FROM (${withdrawalRows} WHERE w.account_id=$1) v WHERE ${openPredicate}`,[ctx.account!.id])).rows[0].n)>=20)throw new DomainError('Resolve existing owner requests before creating another.',409);
   await c.query('INSERT INTO owner_withdrawal(id,account_id,actor_id,amount_centavos,method,destination,reason)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),ctx.account!.id,ctx.user.id,command.amountCentavos,command.method,command.destination,command.reason]);
  }else{
   const w=(await c.query(`${withdrawalRows} WHERE w.account_id=$1 AND w.id=$2`,[ctx.account!.id,command.withdrawalId])).rows[0];if(!w||w.payout_id||w.cancellation)throw new DomainError('An unpaid current withdrawal is required.',409);
   const attempts=await attemptRows(c,[w.id]),pending=attempts.find(t=>t.initial_outcome==='PENDING'&&!t.resolved_outcome);
   if(command.action==='REVIEW_WITHDRAWAL'){
    if(w.decision)throw new DomainError('This request already has a review.',409);
    if(command.decision==='APPROVE'&&Number(w.amount_centavos)>b.availableCentavos)throw new DomainError('Another approved request already reserved the available earnings.',409);
    await c.query('INSERT INTO owner_withdrawal_decision(id,withdrawal_id,account_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),w.id,ctx.account!.id,ctx.user.id,command.decision,command.reason]);
   }else if(command.action==='WITHDRAW_REQUEST'||command.action==='REVOKE_APPROVAL'){
    if(command.action==='WITHDRAW_REQUEST'?Boolean(w.decision):w.decision!=='APPROVE'||Boolean(pending))throw new DomainError('Only an unreviewed request may be withdrawn; an unpaid approval without pending payout may be revoked.',409);
    await c.query('INSERT INTO owner_withdrawal_cancel(id,withdrawal_id,account_id,actor_id,action,reason)VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),w.id,ctx.account!.id,ctx.user.id,command.action==='WITHDRAW_REQUEST'?'WITHDRAW':'REVOKE',command.reason]);
   }else{
    if(w.decision!=='APPROVE')throw new DomainError('Independent approval and reserved earnings are required before payout.',409);
    if(b.recoveryCentavos>0)throw new DomainError('Resolve the owner account recovery balance before payout.',409);
    if(command.action==='RESOLVE_PAYOUT'){
     if(scope.environment!=='DEMO'||!pending||pending.id!==command.attemptId)throw new DomainError('Review the current pending simulated payout.',409);
     await c.query('INSERT INTO owner_payout_resolution(id,attempt_id,withdrawal_id,account_id,actor_id,outcome,reason)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),pending.id,w.id,ctx.account!.id,ctx.user.id,command.outcome,command.reason]);
     if(command.outcome==='SUCCEEDED')await payout(c,ctx,w,pending);
    }else{
     if(pending)throw new DomainError('Resolve the pending simulated payout first.',409);
     if(attempts.length>=30)throw new DomainError('This approval reached its payout-attempt limit. Revoke it and request a new reviewed withdrawal.',409);
     if(command.action==='PAY_MANUAL'?(scope.environment!=='MANUAL'||!file):scope.environment!=='DEMO')throw new DomainError('Manual payout requires private execution evidence; simulations stay separate.',409);
     if(preflight)return {state:await projection(c,ctx),usedFile:false,alreadyApplied:false};
     const id=randomUUID(),reference=command.action==='PAY_MANUAL'?command.reference:`SIMULATED-PAYOUT-${randomUUID()}`,outcome=command.action==='PAY_MANUAL'?'SUCCEEDED':command.outcome;
     await c.query('INSERT INTO owner_payout_attempt(id,withdrawal_id,account_id,actor_id,initial_outcome,reference,note,file_id,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,w.id,ctx.account!.id,ctx.user.id,outcome,reference,command.reason,file?.id??null,file?.mime??null,file?.size??null,file?.sha256??null,file?.backend??null]);
     if(outcome==='SUCCEEDED')await payout(c,ctx,w,{id,reference});
    }
   }
  }
  await c.query('INSERT INTO owner_withdrawal_command(id,account_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)',[randomUUID(),ctx.account!.id,ctx.user.id,command.idempotencyKey,hash]);await notify(c,ctx,command.action);
  return {state:await projection(c,ctx),usedFile:Boolean(file),alreadyApplied:false};
 });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This outgoing reference or withdrawal action is already recorded.',409);throw e;}
}
export async function changeOwnerAccount(actor:Actor,scope:AccountScope,input:unknown){return(await run(actor,scope,withdrawalCommand.parse(input))).state;}
export async function authorizeOwnerPayout(actor:Actor,scope:AccountScope,input:unknown,sha256:string){if(!/^[a-f0-9]{64}$/.test(sha256))throw new DomainError('Invalid payout evidence digest.',422);return run(actor,scope,{...payoutEvidenceCommand.parse(input),action:'PAY_MANUAL'},{id:randomUUID(),mime:'image/png',size:1,backend:'local',sha256},true);}
export async function attachOwnerPayout(actor:Actor,scope:AccountScope,input:unknown,file:PaymentEvidenceUpload){validateFile(file);return run(actor,scope,{...payoutEvidenceCommand.parse(input),action:'PAY_MANUAL'},file);}

export const accountsQuery=z.object({agencyId:uuid.optional(),environment:z.enum(['MANUAL','DEMO']).default('MANUAL'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export async function getOwnerAccounts(actor:Actor,input:unknown={}){
 const q=accountsQuery.parse(input);
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const user=await storedActor(actor,c);
  if((await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Access denied.',403);
  if(q.agencyId&&!(await c.query('SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=$2 AND m.active))',[q.agencyId,user.id])).rowCount)throw new DomainError('Active agency access is required.',403);
  const where="e.recipient='COSIGNER' AND e.beneficiary_actor_id IS NOT NULL AND e.environment=$1 AND (($2::uuid IS NOT NULL AND e.agency_id=$2) OR ($2::uuid IS NULL AND e.beneficiary_actor_id=$3))",params=[q.environment,q.agencyId??null,user.id];
  const rows=(await c.query(`SELECT e.agency_id,e.beneficiary_actor_id AS owner_id,e.environment,COALESCE(sum(e.amount_centavos),0)::text earned,a.id AS account_id,o.name AS owner_name,r.payload->>'businessName' AS agency_name FROM booking_revenue_entry e JOIN app_actor o ON o.id=e.beneficiary_actor_id JOIN agency g ON g.id=e.agency_id JOIN partner_revision r ON r.application_id=g.application_id AND r.revision=g.approved_revision LEFT JOIN owner_account a ON a.agency_id=e.agency_id AND a.owner_id=e.beneficiary_actor_id AND a.environment=e.environment WHERE ${where} GROUP BY e.agency_id,e.beneficiary_actor_id,e.environment,a.id,o.name,r.payload HAVING sum(e.amount_centavos)>0 ORDER BY e.agency_id,e.beneficiary_actor_id LIMIT 20 OFFSET $4`,[...params,(q.page-1)*20])).rows;
  const count=Number((await c.query(`SELECT count(*) n FROM (SELECT e.agency_id,e.beneficiary_actor_id FROM booking_revenue_entry e WHERE ${where} GROUP BY e.agency_id,e.beneficiary_actor_id HAVING sum(e.amount_centavos)>0) v`,params)).rows[0].n),ids=rows.filter(r=>r.account_id).map(r=>r.account_id);
  const pending=(await c.query(`SELECT account_id,COALESCE(sum(amount_centavos) FILTER(WHERE decision IS NULL),0)::text requested,COALESCE(sum(amount_centavos) FILTER(WHERE decision='APPROVE'),0)::text reserved FROM (${withdrawalRows} WHERE w.account_id=ANY($1::uuid[])) v WHERE ${openPredicate} GROUP BY account_id`,[ids])).rows;
  const paid=(await c.query('SELECT account_id,(-sum(amount_centavos))::text paid FROM owner_account_entry WHERE account_id=ANY($1::uuid[]) GROUP BY account_id',[ids])).rows;
  const credits=(await c.query("SELECT a.id account_id,sum(x.amount_centavos)::text amount FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN owner_account a ON a.agency_id=e.agency_id AND a.owner_id=e.beneficiary_actor_id AND a.environment=e.environment WHERE e.recipient='COSIGNER' AND a.id=ANY($1::uuid[]) GROUP BY a.id",[ids])).rows;
  return {environment:q.environment,agencyId:q.agencyId??null,page:q.page,pageCount:Math.max(1,Math.ceil(count/20)),total:count,items:rows.map(r=>{const p=pending.find(x=>x.account_id===r.account_id);return {agencyId:r.agency_id as string,ownerId:r.owner_id as string,environment:r.environment as 'MANUAL'|'DEMO',agencyName:r.agency_name as string,ownerName:r.owner_name as string,balances:ownerBalances(BigInt(r.earned),BigInt(paid.find(x=>x.account_id===r.account_id)?.paid??0),BigInt(p?.reserved??0),BigInt(p?.requested??0),BigInt(credits.find(x=>x.account_id===r.account_id)?.amount??0))};})};
 });
}
export async function ownerPayoutFile(actor:Actor,id:string){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const f=(await c.query('SELECT t.file_id,t.mime,t.backend,a.agency_id,a.owner_id,a.environment,a.id AS account_id FROM owner_payout_attempt t JOIN owner_account a ON a.id=t.account_id WHERE t.file_id=$1',[uuid.parse(id)])).rows[0];
 if(!f)throw new DomainError('Payout evidence not found.',404);await context(c,actor,{agencyId:f.agency_id,ownerId:f.owner_id,environment:f.environment});
 return {objectKey:`${f.account_id}/${f.file_id}`,backend:f.backend as string,mime:f.mime as string,name:`owner-payout-${f.file_id}.${f.mime==='image/png'?'png':f.mime==='image/jpeg'?'jpg':'pdf'}`};
});}
export async function getOwnerPayout(actor:Actor,id:string){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const p=(await c.query('SELECT p.id,p.body,p.digest,p.created_at,a.agency_id,a.owner_id,a.environment,t.file_id FROM owner_payout p JOIN owner_account a ON a.id=p.account_id JOIN owner_payout_attempt t ON t.id=p.attempt_id WHERE p.id=$1',[uuid.parse(id)])).rows[0];
 if(!p)throw new DomainError('Owner payout not found.',404);const ctx=await context(c,actor,{agencyId:p.agency_id,ownerId:p.owner_id,environment:p.environment});
 return {id:p.id as string,scope:ctx.scope,isOwner:ctx.owner,record:p.body as {agencyName:string;ownerName:string;destination:{name:string;account:string};amountCentavos:number;method:string;environment:'MANUAL'|'DEMO';reference:string;recordedBy:string;withdrawalId:string;attemptId:string},createdAt:(p.created_at as Date).toISOString(),evidenceId:p.file_id as string|null,digest:p.digest as string};
});}
