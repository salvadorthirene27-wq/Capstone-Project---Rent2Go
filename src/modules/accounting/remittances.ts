import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import type {Actor} from '../partners/workflow';
import {DomainError} from '../partners/workflow';
import {remittanceQuery,type RemittanceScope} from './remittance-schema';
import {remittanceContext,remittanceTotals,remittanceSources,availableAgencyCredits,creditPacketFromSource,type RemittanceContext} from './remittance-source';

export const remittanceRows=`SELECT r.*,x.action AS cancellation,x.reason AS cancellation_reason,p.id AS receipt_id,p.created_at AS paid_at,
 (SELECT t.id FROM platform_remittance_attempt t WHERE t.remittance_id=r.id AND ((t.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM platform_remittance_review d WHERE d.attempt_id=t.id)) OR (t.initial_outcome='PENDING' AND NOT EXISTS(SELECT 1 FROM platform_remittance_resolution z WHERE z.attempt_id=t.id))) ORDER BY t.created_at DESC,t.id DESC LIMIT 1) AS pending_attempt_id
 FROM platform_remittance r LEFT JOIN platform_remittance_cancel x ON x.remittance_id=r.id LEFT JOIN platform_remittance_receipt p ON p.remittance_id=r.id`;
const open='receipt_id IS NULL AND cancellation IS NULL';
async function attempts(c:PoolClient,ids:string[]){
 return (await c.query(`SELECT * FROM(SELECT t.*,d.decision,d.reason AS review_reason,z.outcome AS resolution,z.reason AS resolution_reason,row_number() OVER(PARTITION BY t.remittance_id ORDER BY t.created_at DESC,t.id DESC) position FROM platform_remittance_attempt t LEFT JOIN platform_remittance_review d ON d.attempt_id=t.id LEFT JOIN platform_remittance_resolution z ON z.attempt_id=t.id WHERE t.remittance_id=ANY($1::uuid[])) v WHERE position<=5 ORDER BY created_at DESC,id DESC`,[ids])).rows;
}
function view(ctx:RemittanceContext,r:any,items:any[],count:number){
 const pending=Boolean(r.pending_attempt_id),stage=r.receipt_id?'PAID':r.cancellation==='WITHDRAW'?'WITHDRAWN':r.cancellation==='REVOKE'?'REVOKED':pending?'PENDING':'AWAITING_PAYMENT',payable=stage==='AWAITING_PAYMENT'&&count<30;
 return {id:r.id as string,amountCentavos:Number(r.amount_centavos),method:r.method as string,environment:r.environment as 'MANUAL'|'DEMO',reason:r.reason as string,digest:r.digest as string,createdAt:(r.created_at as Date).toISOString(),stage,receiptId:r.receipt_id as string|null,paidAt:r.paid_at?(r.paid_at as Date).toISOString():null,cancellationReason:r.cancellation_reason as string|null,pendingAttemptId:r.pending_attempt_id as string|null,terms:r.body as Record<string,unknown>,
  canWithdraw:ctx.operator&&stage==='AWAITING_PAYMENT',canRevoke:ctx.platform&&stage==='AWAITING_PAYMENT',canSubmitProof:ctx.operator&&payable&&r.environment==='MANUAL',canSimulate:ctx.operator&&payable&&r.environment==='DEMO',attemptCount:count,
  attempts:items.filter(t=>t.remittance_id===r.id).map(t=>({id:t.id as string,outcome:(t.resolution??(t.decision==='ACCEPT'?'CONFIRMED':t.decision==='REJECT'?'REJECTED':t.initial_outcome)) as string,reference:t.reference as string,note:t.note as string,reviewReason:(t.review_reason??t.resolution_reason) as string|null,createdAt:(t.created_at as Date).toISOString(),evidenceId:t.file_id as string|null,
   canReview:ctx.platform&&stage==='PENDING'&&r.environment==='MANUAL'&&r.pending_attempt_id===t.id&&!t.decision,canResolve:ctx.platform&&stage==='PENDING'&&r.environment==='DEMO'&&r.pending_attempt_id===t.id&&!t.resolution}))};
}
export async function remittanceProjection(c:PoolClient,ctx:RemittanceContext,input:unknown={environment:ctx.scope.environment}){
 const q=remittanceQuery.parse(input);if(q.environment!==ctx.scope.environment)throw new DomainError('Choose one remittance payment environment.',422);
 const balances=await remittanceTotals(c,ctx.scope),sources=await remittanceSources(c,ctx.scope,q.sourcePage,'DUE'),creditSources=await remittanceSources(c,ctx.scope,q.creditPage,'CREDIT'),availableCredits=await availableAgencyCredits(c,ctx.account?.id??null);
 const active=(await c.query(`SELECT * FROM (${remittanceRows} WHERE r.account_id=$1) v WHERE ${open} ORDER BY created_at,id LIMIT 20`,[ctx.account?.id??null])).rows;
 const history=(await c.query(`SELECT *,count(*) OVER()::int total FROM (${remittanceRows} WHERE r.account_id=$1) v WHERE NOT(${open}) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[ctx.account?.id??null,(q.historyPage-1)*20])).rows;
 const historyTotal=Number(history[0]?.total??(await c.query(`SELECT count(*) n FROM (${remittanceRows} WHERE r.account_id=$1) v WHERE NOT(${open})`,[ctx.account?.id??null])).rows[0].n),ids=[...active,...history].map(r=>r.id),attemptRows=await attempts(c,ids),counts=(await c.query('SELECT remittance_id,count(*)::int n FROM platform_remittance_attempt WHERE remittance_id=ANY($1::uuid[]) GROUP BY remittance_id',[ids])).rows;
 const creditHistorySql=`SELECT id,amount_centavos,created_at,'AGENCY_CREDIT'::text kind FROM platform_agency_credit WHERE account_id=$1 UNION ALL SELECT id,amount_centavos,created_at,'CREDIT_APPLICATION' FROM platform_credit_application WHERE account_id=$1`;
 const creditHistory=(await c.query(`SELECT *,count(*) OVER()::int total FROM(${creditHistorySql}) v ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[ctx.account?.id??null,(q.creditHistoryPage-1)*20])).rows,creditHistoryTotal=Number(creditHistory[0]?.total??(await c.query(`SELECT count(*) n FROM(${creditHistorySql}) v`,[ctx.account?.id??null])).rows[0].n);
 const map=(r:any)=>view(ctx,r,attemptRows,counts.find(n=>n.remittance_id===r.id)?.n??0),sourceCapacity=sources.items.reduce((n,s)=>n+BigInt(s.dueCentavos),0n),carryCapacity=availableCredits.items.reduce((n,g)=>n+BigInt(g.availableCentavos),0n);
 return {scope:ctx.scope,accountId:ctx.account?.id??null,requestVersion:ctx.account?.version??1,agencyName:ctx.agencyName,agencyActive:ctx.agencyActive,isAgency:ctx.operator,isPlatform:ctx.platform,balances,sources,creditSources:{...creditSources,items:creditSources.items.map(source=>({...creditPacketFromSource(ctx.scope,source),canAccept:ctx.operator&&source.pendingCreditCentavos>0}))},availableCredits,
  maxRequestCentavos:Number(sourceCapacity),maxApplyCentavos:Number(sourceCapacity<carryCapacity?sourceCapacity:carryCapacity),canRequest:ctx.operator&&sourceCapacity>0n&&active.length<20,canApplyCredit:ctx.operator&&sourceCapacity>0n&&carryCapacity>0n,
  open:active.map(map),history:history.map(map),historyPage:q.historyPage,historyPageCount:Math.max(1,Math.ceil(historyTotal/20)),creditHistory:creditHistory.map(r=>({id:r.id as string,kind:r.kind as 'AGENCY_CREDIT'|'CREDIT_APPLICATION',amountCentavos:Number(r.amount_centavos),createdAt:(r.created_at as Date).toISOString()})),creditHistoryPage:q.creditHistoryPage,creditHistoryPageCount:Math.max(1,Math.ceil(creditHistoryTotal/20))};
}
export type RemittanceState=Awaited<ReturnType<typeof remittanceProjection>>;
export async function getRemittanceAccount(actor:Actor,scope:RemittanceScope,input:unknown={environment:scope.environment}){
 return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return remittanceProjection(c,await remittanceContext(c,actor,scope),input);});
}
