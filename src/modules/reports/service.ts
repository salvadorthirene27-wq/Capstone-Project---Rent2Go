import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {agencyOperatingContext} from '../agencies/service';
import {reportScope,reportWindow,exportCommand,type ReportScope} from './schema';
import {csvDocument,phpDecimal,type CsvCell} from './csv';

type Context={user:Actor;scope:ReportScope;agencyId:string|null;ownerId:string|null};
export type ReportColumn={key:string;label:string;format:'text'|'money'|'count'|'date'|'percent'};
export type ReportRow={id:string;values:Record<string,string|number|null>;link:string|null};
export type ReportMetric={key:string;label:string;value:number;format:'money'|'count';period:'PERIOD'|'CURRENT'};
const money=(n:unknown)=>{const v=BigInt(String(n??0));if(v>BigInt(Number.MAX_SAFE_INTEGER)||v<0n)throw new DomainError('Report totals exceed supported bounds. Narrow the date range.',409);return Number(v);};
const date=(d:Date)=>d.toISOString();
function reportQueryDb(c:PoolClient,sql:string,params:unknown[]){
 const args='report_arguments AS(SELECT $1::uuid agency_id,$2::text owner_id,$3::text environment,$4::date from_date,$5::date to_date)';
 return c.query(sql.startsWith('WITH ')?'WITH '+args+','+sql.slice(5):'WITH '+args+' '+sql,params);
}
async function authorize(c:PoolClient,actor:Actor,input:unknown,lock=false):Promise<Context>{
 const scope=reportScope.parse(input);let user=await storedActor(actor,c);
 if(scope.type==='AGENCY'){
  if(lock){const authority=await agencyOperatingContext(c,user,scope.agencyId);if(!authority.operatesAgency)throw new DomainError('Active agency report access is required.',403);}
  else if(!(await c.query('SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=$2 AND m.active))',[scope.agencyId,user.id])).rowCount)throw new DomainError('Active agency report access is required.',403);
 }else if(lock){await c.query('SELECT id FROM app_actor WHERE id=$1 FOR SHARE',[user.id]);user=await storedActor(actor,c);}
 if((await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Report access denied.',403);
 if(scope.type==='PLATFORM'&&user.role!=='SUPER_ADMIN')throw new DomainError('Platform aggregate reports require Super Admin access.',403);
 return {user,scope,agencyId:scope.type==='AGENCY'?scope.agencyId:null,ownerId:scope.type==='OWNER'?user.id:null};
}
type Window=ReturnType<typeof reportWindow>;
function parameters(ctx:Context,w:Window){return [ctx.agencyId,ctx.ownerId,w.environment,w.from,w.to];}
const tenant=(alias:string)=>`($1::uuid IS NULL OR ${alias}.agency_id=$1)`;
const period=(column:string)=>`${column}>=($4::date::timestamp AT TIME ZONE 'Asia/Manila') AND ${column}<(($5::date+1)::timestamp AT TIME ZONE 'Asia/Manila')`;
async function financialMetrics(c:PoolClient,ctx:Context,w:Window){
 const params=parameters(ctx,w),metrics:ReportMetric[]=[],add=(key:string,label:string,value:unknown,format:'money'|'count'='money',scope:'PERIOD'|'CURRENT'='PERIOD')=>metrics.push({key,label,value:money(value),format,period:scope});
 if(ctx.scope.type==='OWNER'){
  const r=(await reportQueryDb(c,`SELECT (SELECT COALESCE(sum(e.amount_centavos),0)::text FROM booking_revenue_entry e JOIN booking_financial_close f ON f.id=e.close_id WHERE e.beneficiary_actor_id=$2 AND e.recipient='COSIGNER' AND e.environment=$3 AND ${period('f.created_at')}) earned,(SELECT COALESCE(sum(p.amount_centavos),0)::text FROM owner_payout p JOIN owner_account a ON a.id=p.account_id WHERE a.owner_id=$2 AND p.environment=$3 AND ${period('p.created_at')}) paid`,params)).rows[0];
  add('ownerEarned','Owner earnings posted in period',r.earned);add('ownerPaid','Owner payouts recorded in period',r.paid);
  const b=(await reportQueryDb(c,`WITH credits AS(SELECT e.agency_id,sum(x.amount_centavos) n FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id WHERE e.beneficiary_actor_id=$2 AND e.environment=$3 AND e.recipient='COSIGNER' GROUP BY e.agency_id),earned AS(SELECT agency_id,sum(amount_centavos) n FROM booking_revenue_entry WHERE beneficiary_actor_id=$2 AND environment=$3 AND recipient='COSIGNER' GROUP BY agency_id),queued AS(SELECT a.agency_id,COALESCE(sum(w.amount_centavos) FILTER(WHERE d.decision IS NULL),0) requested,COALESCE(sum(w.amount_centavos) FILTER(WHERE d.decision='APPROVE'),0) reserved FROM owner_account a JOIN owner_withdrawal w ON w.account_id=a.id LEFT JOIN owner_withdrawal_decision d ON d.withdrawal_id=w.id LEFT JOIN owner_withdrawal_cancel x ON x.withdrawal_id=w.id LEFT JOIN owner_payout p ON p.withdrawal_id=w.id WHERE a.owner_id=$2 AND a.environment=$3 AND x.id IS NULL AND p.id IS NULL AND (d.decision IS NULL OR d.decision='APPROVE') GROUP BY a.agency_id),paid AS(SELECT a.agency_id,-sum(e.amount_centavos) n FROM owner_account a JOIN owner_account_entry e ON e.account_id=a.id WHERE a.owner_id=$2 AND a.environment=$3 GROUP BY a.agency_id) SELECT COALESCE(sum(GREATEST(e.n-COALESCE(v.n,0)-COALESCE(p.n,0)-COALESCE(q.reserved,0),0)),0)::text available,COALESCE(sum(GREATEST(COALESCE(v.n,0)+COALESCE(p.n,0)+COALESCE(q.reserved,0)-e.n,0)),0)::text recovery,COALESCE(sum(q.requested),0)::text queued,COALESCE(sum(q.reserved),0)::text reserved FROM earned e LEFT JOIN credits v ON v.agency_id=e.agency_id LEFT JOIN queued q ON q.agency_id=e.agency_id LEFT JOIN paid p ON p.agency_id=e.agency_id`,params)).rows[0];
  add('ownerRecovery','Current accepted recovery balance',b.recovery,'money','CURRENT');add('ownerAvailable','Current available owner earnings',b.available,'money','CURRENT');add('ownerQueued','Current unreviewed requests',b.queued,'money','CURRENT');add('ownerReserved','Current approved reservations',b.reserved,'money','CURRENT');
  const credit=(await reportQueryDb(c,`SELECT COALESCE(sum(x.amount_centavos),0)::text amount FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN booking_closed_credit_post p ON p.credit_id=x.credit_id WHERE e.beneficiary_actor_id=$2 AND e.recipient='COSIGNER' AND e.environment=$3 AND ${period('p.created_at')}`,params)).rows[0];
  add('ownerCredits','Accepted owner earnings reductions posted in period',credit.amount);
  return {metrics,allocations:[{recipient:'COSIGNER',amountCentavos:money(r.earned)}]};
 }
 const r=(await reportQueryDb(c,`SELECT
 (SELECT COALESCE(sum(k.amount_centavos),0)::text FROM booking_payment_collection k WHERE ${tenant('k')} AND k.environment=$3 AND ${period('k.recorded_at')}) collections,
 (SELECT COALESCE(sum(p.amount_centavos),0)::text FROM booking_refund_payment p JOIN booking_request r ON r.id=p.request_id WHERE ${tenant('r')} AND p.environment=$3 AND ${period('p.recorded_at')}) refunds,
 (SELECT COALESCE(sum(f.total_centavos),0)::text FROM booking_financial_close f WHERE ${tenant('f')} AND f.environment=$3 AND ${period('f.created_at')}) earned,
 (SELECT count(*)::text FROM booking_financial_close f WHERE ${tenant('f')} AND f.environment=$3 AND ${period('f.created_at')}) closed,
 (SELECT COALESCE(sum(p.amount_centavos),0)::text FROM owner_payout p WHERE ${tenant('p')} AND p.environment=$3 AND ${period('p.created_at')}) payouts,
 (SELECT COALESCE(sum((s.body->'public'->>'quotedDepositCentavos')::numeric),0)::text FROM booking_financial_close f JOIN booking_settlement s ON s.id=f.settlement_id WHERE ${tenant('f')} AND f.environment=$3 AND ${period('f.created_at')}) deposits`,params)).rows[0];
 add('collections','Confirmed collections in period',r.collections);add('refunds','Paid refunds recorded in period',r.refunds);add('earned','Original revenue allocated on closing',r.earned);add('ownerPayouts','Owner payouts recorded in period',r.payouts);add('closed','Financial records closed',r.closed,'count');add('depositReference','Quoted deposits on closed records · reference only',r.deposits);
 const allocations=(await reportQueryDb(c,`SELECT e.recipient,COALESCE(sum(e.amount_centavos),0)::text amount FROM booking_revenue_entry e JOIN booking_financial_close f ON f.id=e.close_id WHERE ${tenant('f')} AND f.environment=$3 AND ${period('f.created_at')} GROUP BY e.recipient ORDER BY e.recipient`,params)).rows.map(e=>({recipient:e.recipient as string,amountCentavos:money(e.amount)}));
 if(allocations.reduce((n,e)=>n+BigInt(e.amountCentavos),0n)!==BigInt(r.earned))throw new DomainError('The report allocation totals require financial review.',409);
 const credit=(await reportQueryDb(c,`SELECT COALESCE(sum(x.amount_centavos),0)::text amount,COALESCE(sum(x.amount_centavos) FILTER(WHERE e.recipient='PLATFORM'),0)::text platform FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN booking_closed_credit_post p ON p.credit_id=x.credit_id WHERE ${tenant('e')} AND e.environment=$3 AND ${period('p.created_at')}`,params)).rows[0];
 add('credits','Accepted revenue reductions posted in period',credit.amount);add('platformCredits','Rent2Go allocation reductions posted in period',credit.platform);
 return {metrics,allocations};
}
async function operationalMetrics(c:PoolClient,ctx:Context,w:Window){
 if(ctx.scope.type==='OWNER')return null;
 const eligible=`${tenant('r')} AND EXISTS(SELECT 1 FROM app_actor u WHERE u.id=r.renter_id AND NOT u.is_test_fixture)`;
 const r=(await reportQueryDb(c,`SELECT (SELECT count(*)::text FROM booking_request r WHERE ${eligible} AND ${period('r.created_at')}) submitted,(SELECT count(*)::text FROM booking_hold_commitment h JOIN booking_request r ON r.id=h.request_id WHERE ${eligible} AND ${period('h.committed_at')}) committed,(SELECT count(*)::text FROM booking_fulfillment_event e JOIN booking_request r ON r.id=e.request_id WHERE ${eligible} AND e.action IN ('RECORD_RETURN','COMPLETE_TOUR') AND ${period('e.created_at')}) services`,parameters(ctx,w))).rows[0];
 const statuses=(await reportQueryDb(c,`SELECT r.status,count(*)::text n FROM booking_request r WHERE ${eligible} AND ${period('r.created_at')} GROUP BY r.status ORDER BY r.status`,parameters(ctx,w))).rows.map(r=>({status:r.status as string,count:money(r.n)}));
 return {submittedCount:money(r.submitted),committedCount:money(r.committed),serviceOutcomeCount:money(r.services),statuses};
}
function statement(ctx:Context,w:Window){
 const column=(key:string,label:string,format:ReportColumn['format']='text'):ReportColumn=>({key,label,format});
 if(w.record==='ALLOCATIONS')return {columns:[column('title','Vehicle or service'),column('date','Financial close','date'),column('source','Revenue source'),column('recipient','Recipient'),column('bps','Agreed share','percent'),column('amount','Allocated revenue (PHP)','money')],sql:`SELECT e.id AS row_key,f.created_at AS sort_at,l.public_snapshot->>'title' title,e.source_kind source,e.recipient,e.bps,e.amount_centavos,r.id request_id,r.agency_id FROM booking_revenue_entry e JOIN booking_financial_close f ON f.id=e.close_id JOIN booking_request r ON r.id=e.request_id JOIN booking_quotation_line l ON l.quote_id=e.quote_id AND l.line_id=e.line_id WHERE ${tenant('r')} AND ($2::text IS NULL OR (e.beneficiary_actor_id=$2 AND e.recipient='COSIGNER')) AND e.environment=$3 AND e.amount_centavos>0 AND ${period('f.created_at')}`};
 if(w.record==='CREDITS')return {columns:[column('title','Vehicle or service'),column('date','Credit posted','date'),column('recipient','Recipient'),column('amount','Earnings reduction (PHP)','money')],sql:`SELECT x.id AS row_key,p.created_at AS sort_at,l.public_snapshot->>'title' title,e.recipient,x.amount_centavos,a.id credit_id FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN booking_closed_credit a ON a.id=x.credit_id JOIN booking_closed_credit_post p ON p.credit_id=a.id JOIN booking_quotation_line l ON l.quote_id=e.quote_id AND l.line_id=e.line_id WHERE ${tenant('e')} AND ($2::text IS NULL OR (e.beneficiary_actor_id=$2 AND e.recipient='COSIGNER')) AND e.environment=$3 AND x.amount_centavos>0 AND ${period('p.created_at')}`};
 if(w.record==='COLLECTIONS')return {columns:[column('date','Collection recorded','date'),column('method','Method'),column('reference','Collection reference'),column('amount','Confirmed amount (PHP)','money')],sql:`SELECT k.id AS row_key,k.recorded_at AS sort_at,k.method,k.reference,k.amount_centavos FROM booking_payment_collection k WHERE ${tenant('k')} AND k.environment=$3 AND ${period('k.recorded_at')}`};
 if(w.record==='REFUNDS')return {columns:[column('date','Refund recorded','date'),column('method','Method'),column('reference','Outgoing refund reference'),column('amount','Paid refund (PHP)','money')],sql:`SELECT p.id AS row_key,p.recorded_at AS sort_at,t.method,t.reference,p.amount_centavos FROM booking_refund_payment p JOIN booking_refund_attempt t ON t.id=p.attempt_id JOIN booking_request r ON r.id=p.request_id WHERE ${tenant('r')} AND p.environment=$3 AND ${period('p.recorded_at')}`};
 if(w.record==='PAYOUTS')return {columns:[column('date','Payout recorded','date'),column('method','Method'),column('reference','Outgoing payout reference'),column('amount','Owner payout (PHP)','money')],sql:`SELECT p.id AS row_key,p.created_at AS sort_at,p.method,p.reference,p.amount_centavos FROM owner_payout p JOIN owner_account a ON a.id=p.account_id WHERE ${tenant('p')} AND ($2::text IS NULL OR a.owner_id=$2) AND p.environment=$3 AND ${period('p.created_at')}`};
 return {columns:[column('title','Agency'),column('closed','Financial records closed','count'),column('amount','Original allocated revenue (PHP)','money'),column('credits','Revenue reductions posted (PHP)','money'),column('platform','Original Rent2Go allocation (PHP)','money'),column('platformCredits','Rent2Go reductions posted (PHP)','money'),column('payouts','Owner payouts recorded (PHP)','money')],sql:`WITH closed AS(SELECT f.agency_id,count(*) n,sum(f.total_centavos) earned,max(f.created_at) last_at FROM booking_financial_close f WHERE f.environment=$3 AND ${period('f.created_at')} GROUP BY f.agency_id),platform AS(SELECT f.agency_id,sum(e.amount_centavos) n FROM booking_revenue_entry e JOIN booking_financial_close f ON f.id=e.close_id WHERE e.recipient='PLATFORM' AND f.environment=$3 AND ${period('f.created_at')} GROUP BY f.agency_id),credits AS(SELECT e.agency_id,sum(x.amount_centavos) n,sum(x.amount_centavos) FILTER(WHERE e.recipient='PLATFORM') platform,max(p.created_at) last_at FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN booking_closed_credit_post p ON p.credit_id=x.credit_id WHERE e.environment=$3 AND ${period('p.created_at')} GROUP BY e.agency_id),paid AS(SELECT p.agency_id,sum(p.amount_centavos) n,max(p.created_at) last_at FROM owner_payout p WHERE p.environment=$3 AND ${period('p.created_at')} GROUP BY p.agency_id),ids AS(SELECT agency_id FROM closed UNION SELECT agency_id FROM paid UNION SELECT agency_id FROM credits) SELECT i.agency_id AS row_key,GREATEST(c.last_at,p.last_at,z.last_at) AS sort_at,r.payload->>'businessName' title,COALESCE(c.n,0)::text closed,COALESCE(c.earned,0)::text amount_centavos,COALESCE(z.n,0)::text credits,COALESCE(x.n,0)::text platform,COALESCE(z.platform,0)::text AS "platformCredits",COALESCE(p.n,0)::text payouts FROM ids i JOIN agency a ON a.id=i.agency_id JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=a.approved_revision LEFT JOIN closed c ON c.agency_id=i.agency_id LEFT JOIN platform x ON x.agency_id=i.agency_id LEFT JOIN credits z ON z.agency_id=i.agency_id LEFT JOIN paid p ON p.agency_id=i.agency_id`};
}
function row(ctx:Context,w:Window,r:any):ReportRow{
 const values:ReportRow['values']={date:r.sort_at?date(r.sort_at):null,amount:money(r.amount_centavos)};
 for(const key of ['title','source','recipient','method','reference'])if(r[key]!==undefined)values[key]=r[key];
 if(r.bps!==undefined)values.bps=Number(r.bps);
 for(const key of ['closed','platform','payouts','credits','platformCredits'])if(r[key]!==undefined)values[key]=money(r[key]);
 const link=w.record==='CREDITS'?`/closed-credits/${r.credit_id}`:w.record==='PAYOUTS'?`/owner-payouts/${r.row_key}`:w.record==='COLLECTIONS'?`/booking-payments/${r.row_key}`:w.record==='REFUNDS'?`/booking-refunds/${r.row_key}`:w.record==='ALLOCATIONS'&&ctx.scope.type==='AGENCY'?`/agency/${ctx.agencyId}/bookings/${r.request_id}`:null;
 return {id:r.row_key as string,values,link};
}
async function records(c:PoolClient,ctx:Context,w:Window,all=false){
 const {sql,columns}=statement(ctx,w),params=parameters(ctx,w),total=Number((await reportQueryDb(c,`SELECT count(*) n FROM (${sql}) records`,params)).rows[0].n);
 if(all&&total>5000)throw new DomainError('This export exceeds 5000 records. Narrow the dates before downloading.',422);
 const rows=(await reportQueryDb(c,`SELECT * FROM (${sql}) records ORDER BY sort_at DESC,row_key LIMIT $6 OFFSET $7`,[...params,all?5000:20,all?0:(w.page-1)*20])).rows.map(r=>row(ctx,w,r));
 return {columns,rows,total,page:all?1:w.page,pageCount:Math.max(1,Math.ceil(total/20))};
}
async function window(c:PoolClient,input:unknown,ctx:Context){const now=(await c.query("SELECT current_timestamp AS stamp,(current_timestamp AT TIME ZONE 'Asia/Manila')::date::text today")).rows[0];return {filters:reportWindow(input,now.today,ctx.scope.type),asOf:date(now.stamp)};}
export async function getReport(actor:Actor,scope:ReportScope,input:unknown={}){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const ctx=await authorize(c,actor,scope),w=await window(c,input,ctx),finance=await financialMetrics(c,ctx,w.filters),operations=await operationalMetrics(c,ctx,w.filters),data=await records(c,ctx,w.filters);
 return {scope:ctx.scope,filters:w.filters,asOf:w.asOf,...finance,operations,...data};
});}
export type FinancialReport=Awaited<ReturnType<typeof getReport>>;
export async function exportReport(actor:Actor,input:unknown){
 const command=exportCommand.parse(input);
 try{return await transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const ctx=await authorize(c,actor,command.scope,true),w=await window(c,command.filters,ctx),data=await records(c,ctx,w.filters,true);
  const columns=data.columns.flatMap(col=>col.format==='money'?[{key:col.key,label:col.label,format:'php'},{key:col.key,label:col.label.replace('(PHP)','(centavos)'),format:'integer'}]:[{...col,format:col.format}]);
  const headers=['Financial records','From (Philippine date)','To (Philippine date)',...columns.map(col=>col.format==='date'?`${col.label} (UTC)`:col.label)],rows=data.rows.map(r=>[w.filters.environment,w.filters.from,w.filters.to,...columns.map(col=>{const v=r.values[col.key];if(v===null||v===undefined)return '';if(col.format==='php')return phpDecimal(v as number);if(col.format==='percent')return `${(v as number)/100}%`;return v;})] as CsvCell[]);
  await audit(c,ctx.user,'FINANCIAL_REPORT_EXPORTED',ctx.agencyId??ctx.user.id,{scope:ctx.scope.type,agencyId:ctx.agencyId,environment:w.filters.environment,from:w.filters.from,to:w.filters.to,record:w.filters.record,rowCount:data.total,purpose:command.purpose});
  return {filename:`rent2go-${ctx.scope.type.toLowerCase()}-${w.filters.record.toLowerCase()}-${w.filters.environment.toLowerCase()}-${w.filters.from}-${w.filters.to}.csv`,csv:csvDocument(headers,rows),rowCount:data.total,asOf:w.asOf};
 });}catch(e){if(['40001','40P01'].includes((e as {code?:string}).code??''))throw new DomainError('Reporting records or access changed. Refresh before exporting.',409);throw e;}
}
