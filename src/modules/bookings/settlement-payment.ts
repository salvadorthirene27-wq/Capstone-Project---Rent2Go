import {assertNoLegacyGatewayMix,gatewayBookingWork} from '../gateway/booking-guard';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid,versionSchema} from '../../lib/http';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {financialContext,financialLines,lockFinancialAuthority,type FinancialContext} from './finance-context';
import {assertFinancialOpen} from './finance-guard';
import {acceptedSettlement,settlementEvent} from './settlement';
import {savedPolicy,type PaymentEvidenceUpload} from './payment';
import {normalizePaymentReference} from './payment-schema';
import {safeCents} from './settlement-calculation';
const base={version:versionSchema,idempotencyKey:uuid},exact={settlementId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)},amount=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),reason=z.string().trim().min(1).max(2000),reference=z.string().trim().min(1).max(160).refine(s=>!/[\u0000-\u001f\u007f]/u.test(s)&&normalizePaymentReference(s).length<=160);
export const balanceCommand=z.discriminatedUnion('action',[
 z.object({...base,...exact,action:z.literal('RECORD_CASH'),amountCentavos:amount,reference,note:reason}).strict(),
 z.object({...base,...exact,action:z.literal('SIMULATE_PAYMENT'),method:z.enum(['DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL']),outcome:z.enum(['APPROVED','DECLINED','PENDING','CANCELLED'])}).strict(),
 z.object({...base,action:z.literal('REVIEW_GCASH'),attemptId:uuid,decision:z.enum(['CONFIRM','REJECT']),reason}).strict(),
 z.object({...base,action:z.literal('RESOLVE_DEMO'),attemptId:uuid,outcome:z.enum(['APPROVED','DECLINED','CANCELLED'])}).strict(),
]);
export const balanceEvidenceCommand=z.object({...base,...exact,amountCentavos:amount,reference}).strict();
export const balanceQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
const rowSql=`SELECT t.*,p.environment,d.outcome AS decision_outcome,d.reason AS decision_reason,k.id AS collection_id,sp.settlement_id,s.revision AS settlement_revision
 FROM booking_settlement_payment_attempt sp JOIN booking_payment_attempt t ON t.id=sp.attempt_id
 JOIN booking_payment_account p ON p.id=t.account_id JOIN booking_settlement s ON s.id=sp.settlement_id
 LEFT JOIN booking_payment_decision d ON d.attempt_id=t.id LEFT JOIN booking_payment_collection k ON k.attempt_id=t.id`;
const pending="decision_outcome IS NULL AND initial_outcome IN ('SUBMITTED','PENDING')";
function attemptView(ctx:FinancialContext,t:any){const waiting=!t.decision_outcome&&['SUBMITTED','PENDING'].includes(t.initial_outcome);return {id:t.id as string,settlementId:t.settlement_id as string,settlementRevision:t.settlement_revision as number,environment:t.environment as 'MANUAL'|'DEMO',method:t.method as string,amountCentavos:Number(t.amount_centavos),reference:t.reference as string,outcome:(t.decision_outcome??t.initial_outcome) as string,reason:t.decision_reason as string|null,recordedAt:(t.submitted_at as Date).toISOString(),evidenceId:t.file_id as string|null,collectionId:t.collection_id as string|null,canReview:ctx.operator&&waiting&&t.environment==='MANUAL',canResolve:ctx.owner&&waiting&&t.environment==='DEMO'&&t.actor_id===ctx.user.id};}
async function projection(c:PoolClient,ctx:FinancialContext,page=1){
 const s=(await c.query("SELECT s.id,s.digest,s.revision,s.body,s.environment,d.decision FROM booking_settlement s LEFT JOIN booking_settlement_decision d ON d.settlement_id=s.id WHERE s.request_id=$1 ORDER BY s.revision DESC LIMIT 1",[ctx.r.id])).rows[0],policy=await savedPolicy(c,ctx);
 const closed=Boolean((await c.query('SELECT 1 FROM booking_financial_close WHERE request_id=$1',[ctx.r.id])).rowCount);
 let balance:number|null=closed?0:null,blockedReason:string|null=closed?'This financial record is closed. Saved additional collections remain available; no new payment is due.':null;
 if(!closed&&s?.decision==='ACCEPT'){try{balance=(await acceptedSettlement(c,ctx,s.id,s.digest)).b.funds!.additionalBalanceCentavos;}catch(e){if(!(e instanceof DomainError))throw e;blockedReason=e.message;}}
 const open=(await c.query(`SELECT * FROM (${rowSql} WHERE t.request_id=$1) v WHERE ${pending} ORDER BY submitted_at,id LIMIT 20`,[ctx.r.id])).rows;
 const history=(await c.query(`SELECT * FROM (${rowSql} WHERE t.request_id=$1) v WHERE NOT(${pending}) ORDER BY submitted_at DESC,id DESC LIMIT 20 OFFSET $2`,[ctx.r.id,(page-1)*20])).rows;
 const count=Number((await c.query(`SELECT count(*) n FROM (${rowSql} WHERE t.request_id=$1) v WHERE NOT(${pending})`,[ctx.r.id])).rows[0].n),payable=!(await gatewayBookingWork(c,ctx.r.id)).hasCheckout&&balance!==null&&balance>0&&open.length<20;
 return {requestId:ctx.r.id as string,requestVersion:ctx.r.version as number,isOwner:ctx.owner,isOperator:ctx.operator,settlement:s?{id:s.id as string,digest:s.digest as string,revision:s.revision as number,environment:s.environment as 'MANUAL'|'DEMO'}:null,balanceCentavos:balance,blockedReason,methods:policy.methods,instructions:policy.instructions,
  canRecordCash:ctx.operator&&payable&&s.environment==='MANUAL'&&policy.methods.includes('CASH'),canSubmitGcash:ctx.owner&&payable&&s.environment==='MANUAL'&&policy.methods.includes('GCASH'),canSimulate:ctx.owner&&payable&&s.environment==='DEMO'&&policy.methods.some(m=>m.startsWith('DEMO_'))&&!open.some(t=>t.environment==='DEMO'),open:open.map(t=>attemptView(ctx,t)),history:history.map(t=>attemptView(ctx,t)),page,pageCount:Math.max(1,Math.ceil(count/20))};
}
export type SettlementPaymentsState=Awaited<ReturnType<typeof projection>>;
export async function getSettlementPayments(actor:Actor,id:string,query:unknown={}){const q=balanceQuery.parse(query);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return projection(c,await financialContext(c,actor,id),q.page);});}
async function authorize(c:PoolClient,actor:Actor,id:string,command:any,fileHash?:string){
 const ctx=await financialContext(c,actor,id,true),operator=['RECORD_CASH','REVIEW_GCASH'].includes(command.action);
 if(operator?!ctx.operator:!ctx.owner)throw new DomainError(operator?'An independent agency operator is required.':'Only the renter may submit or simulate a balance payment.',403);
 const q=(await c.query('SELECT id FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];await lockFinancialAuthority(c,ctx,operator,q?await financialLines(c,q.id):[]);
 const hash=digest({channel:'SETTLEMENT',command,...(fileHash?{fileHash}:{})}),old=(await c.query('SELECT digest FROM booking_payment_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];
 if(old){if(old.digest!==hash)throw new DomainError('This retry key belongs to a different payment action.',409);return {ctx,hash,replayed:true};}
 await assertNoLegacyGatewayMix(c,id);await assertFinancialOpen(c,id);if(ctx.r.version!==command.version)throw new DomainError('This booking changed. Refresh balance payments before continuing.',409);
 return {ctx,hash,replayed:false};
}
async function collection(c:PoolClient,ctx:FinancialContext,t:any,stale=false){
 const sum=(await c.query('SELECT COALESCE(sum(amount_centavos),0)::text n FROM booking_payment_collection WHERE quote_id=$1',[t.quote_id])).rows[0].n;safeCents(BigInt(sum)+BigInt(t.amount_centavos));
 const names=(await c.query("SELECT g.body->>'agencyName' AS agency,g.body->>'renterName' AS renter,a.name AS receiver FROM booking_agreement g CROSS JOIN app_actor a WHERE g.id=$1 AND a.id=$2",[t.agreement_id,ctx.user.id])).rows[0];
 await c.query('INSERT INTO booking_payment_collection(id,attempt_id,account_id,request_id,quote_id,agreement_id,agency_id,environment,method,amount_centavos,reference,normalized_reference,recorded_by,receiver_name,agency_name,renter_name,requires_reconciliation)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',[randomUUID(),t.id,t.account_id,ctx.r.id,t.quote_id,t.agreement_id,ctx.r.agency_id,t.environment,t.method,t.amount_centavos,t.reference,t.normalized_reference,ctx.user.id,names.receiver,names.agency,names.renter,stale]);
}
async function newAttempt(c:PoolClient,ctx:FinancialContext,command:any,commandId:string,method:string,outcome:string,file?:PaymentEvidenceUpload){
 const {row,b}=await acceptedSettlement(c,ctx,command.settlementId,command.digest);
 if(!b.funds||b.funds.additionalBalanceCentavos<=0)throw new DomainError('No additional balance is due.',409);
 const policy=await savedPolicy(c,ctx),environment=method.startsWith('DEMO_')?'DEMO':'MANUAL';if(!policy.methods.includes(method as any)||row.environment!==environment)throw new DomainError('Use the original accepted payment methods and environment.',409);
 const pendingCount=Number((await c.query(`SELECT count(*) n FROM (${rowSql} WHERE t.request_id=$1) v WHERE ${pending}`,[ctx.r.id])).rows[0].n);if(pendingCount>=20)throw new DomainError('Resolve pending balance submissions first.',409);
 if(environment==='DEMO'&&(await c.query(`SELECT 1 FROM (${rowSql} WHERE t.request_id=$1) v WHERE ${pending} AND environment='DEMO' LIMIT 1`,[ctx.r.id])).rowCount)throw new DomainError('Resolve the pending simulated balance payment first.',409);
 const account=(await c.query('SELECT id,quote_id,agreement_id,environment FROM booking_payment_account WHERE quote_id=$1',[row.quote_id])).rows[0];if(!account||account.environment!==environment)throw new DomainError('The original payment account requires review.',409);
 const id=randomUUID(),amount=command.action==='SIMULATE_PAYMENT'?b.funds.additionalBalanceCentavos:command.amountCentavos,ref=command.action==='SIMULATE_PAYMENT'?`SIMULATED-BALANCE-${randomUUID()}`:command.reference;
 await c.query('INSERT INTO booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id,command_id,actor_id,method,amount_centavos,reference,normalized_reference,initial_outcome,note,file_id,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',[id,account.id,ctx.r.id,row.quote_id,account.agreement_id,commandId,ctx.user.id,method,amount,ref,normalizePaymentReference(ref),outcome,command.note??'',file?.id??null,file?.mime??null,file?.size??null,file?.sha256??null,file?.backend??null]);
 await c.query('INSERT INTO booking_settlement_payment_attempt(attempt_id,settlement_id,request_id,quote_id,agreement_id,account_id)VALUES($1,$2,$3,$4,$5,$6)',[id,row.id,ctx.r.id,row.quote_id,account.agreement_id,account.id]);
 return {id,account_id:account.id,quote_id:row.quote_id,agreement_id:account.agreement_id,environment,method,amount_centavos:amount,reference:ref,normalized_reference:normalizePaymentReference(ref)};
}
async function run(actor:Actor,id:string,command:any,file?:PaymentEvidenceUpload){
 try{return await transaction(async c=>{
  const v=await authorize(c,actor,id,command,file?.sha256),{ctx}=v;if(v.replayed)return {state:await projection(c,ctx),usedFile:false};
  const commandId=randomUUID();await c.query('INSERT INTO booking_payment_command(id,request_id,actor_id,idempotency_key,digest,action)VALUES($1,$2,$3,$4,$5,$6)',[commandId,id,ctx.user.id,command.idempotencyKey,v.hash,command.action]);
  if(['RECORD_CASH','SIMULATE_PAYMENT','SUBMIT_GCASH'].includes(command.action)){
   const method=command.action==='RECORD_CASH'?'CASH':command.action==='SUBMIT_GCASH'?'GCASH':command.method,outcome=command.action==='RECORD_CASH'?'CONFIRMED':command.action==='SUBMIT_GCASH'?'SUBMITTED':command.outcome==='APPROVED'?'CONFIRMED':command.outcome;
   const t=await newAttempt(c,ctx,command,commandId,method,outcome,file);if(outcome==='CONFIRMED')await collection(c,ctx,t);
  }else{
   const t=(await c.query(`${rowSql} WHERE t.id=$1 AND t.request_id=$2`,[command.attemptId,id])).rows[0];if(!t||t.decision_outcome)throw new DomainError('A pending balance payment is required.',409);
   let outcome:string,decisionReason:string,stale=false;
   if(command.action==='REVIEW_GCASH'){
    if(t.environment!=='MANUAL'||t.method!=='GCASH'||t.initial_outcome!=='SUBMITTED'||t.actor_id===ctx.user.id)throw new DomainError('Submitted GCash evidence requires independent review.',403);
    outcome=command.decision==='CONFIRM'?'CONFIRMED':'REJECTED';decisionReason=command.reason;
    if(outcome==='CONFIRMED'){try{const s=(await c.query('SELECT digest FROM booking_settlement WHERE id=$1',[t.settlement_id])).rows[0];await acceptedSettlement(c,ctx,t.settlement_id,s.digest);}catch(e){if(!(e instanceof DomainError))throw e;stale=true;}}
   }else{
    if(t.environment!=='DEMO'||t.initial_outcome!=='PENDING'||t.actor_id!==ctx.user.id)throw new DomainError('Only your own pending simulated balance payment may be resolved.',409);
    outcome=command.outcome==='APPROVED'?'CONFIRMED':command.outcome;decisionReason='Simulated balance payment result; no real charge.';
    if(outcome==='CONFIRMED'){const s=(await c.query('SELECT digest FROM booking_settlement WHERE id=$1',[t.settlement_id])).rows[0];await acceptedSettlement(c,ctx,t.settlement_id,s.digest);}
   }
   await c.query('INSERT INTO booking_payment_decision(id,attempt_id,account_id,request_id,quote_id,agreement_id,command_id,actor_id,outcome,reason)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),t.id,t.account_id,id,t.quote_id,t.agreement_id,commandId,ctx.user.id,outcome,decisionReason]);
   if(outcome==='CONFIRMED')await collection(c,ctx,t,stale);
  }
  await settlementEvent(c,ctx,`SETTLEMENT_${command.action}`,'Additional-balance payment activity recorded separately from the original quotation. Evidence and pending results do not establish collection; no inventory is reclaimed.');
  return {state:await projection(c,ctx),usedFile:Boolean(file)};
 });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This reference or payment action is already recorded. Refresh before continuing.',409);throw e;}
}
export async function changeSettlementPayment(actor:Actor,id:string,input:unknown){return(await run(actor,id,balanceCommand.parse(input))).state;}
export async function authorizeBalanceEvidence(actor:Actor,id:string,input:unknown,sha256:string){
 const command={...balanceEvidenceCommand.parse(input),action:'SUBMIT_GCASH'};if(!/^[a-f0-9]{64}$/.test(sha256))throw new DomainError('Invalid evidence digest.',422);
 return transaction(async c=>{const v=await authorize(c,actor,id,command,sha256);if(v.replayed)return {alreadyApplied:true as const,state:await projection(c,v.ctx)};const s=await acceptedSettlement(c,v.ctx,command.settlementId,command.digest);if(!s.b.funds?.additionalBalanceCentavos||s.row.environment!=='MANUAL'||!(await savedPolicy(c,v.ctx)).methods.includes('GCASH'))throw new DomainError('No manual GCash balance is payable.',409);return {alreadyApplied:false as const};});
}
export async function attachBalanceEvidence(actor:Actor,id:string,input:unknown,file:PaymentEvidenceUpload){
 uuid.parse(file.id);if(!['image/png','image/jpeg','application/pdf'].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>5242880||!/^[a-f0-9]{64}$/.test(file.sha256)||!['local','s3'].includes(file.backend))throw new DomainError('Invalid private balance evidence.',422);
 return run(actor,id,{...balanceEvidenceCommand.parse(input),action:'SUBMIT_GCASH'},file);
}
