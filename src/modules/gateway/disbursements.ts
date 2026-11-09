import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import type {PaymentEvidenceUpload} from '../bookings/payment';
import {normalizePaymentReference} from '../bookings/payment-schema';
import {centralCustodyInTransaction} from './custody';
import {disbursementCommand,disbursementTransferCommand} from './disbursement-schema';

export async function centralFinancialAuthority(c:PoolClient,actor:Actor,id:string,lock=false){
 z.uuid().parse(id);
 const r=(await c.query(`SELECT id,agency_id,renter_id FROM booking_request WHERE id=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
 if(!r)throw new DomainError('Disbursement account not found.',404);
 const g=(await c.query(`SELECT owner_id,active FROM agency WHERE id=$1${lock?' FOR UPDATE':''}`,[r.agency_id])).rows[0];
 if(!g)throw new DomainError('Disbursement account not found.',404);
 if(lock){
  await c.query('SELECT actor_id FROM agency_member WHERE agency_id=$1 ORDER BY actor_id FOR SHARE',[r.agency_id]);
  await c.query("SELECT id FROM app_actor WHERE id=ANY($1::text[]) OR id IN(SELECT beneficiary_actor_id FROM booking_revenue_entry WHERE request_id=$2 AND recipient='COSIGNER' UNION SELECT private_financial_snapshot->>'cosignerId' FROM booking_quotation_line WHERE request_id=$2 AND private_financial_snapshot->>'category'='CONSIGNED') ORDER BY id FOR SHARE",[[actor.id,g.owner_id,r.renter_id],id]);
 }
 const user=await storedActor(actor,c),owner=(await c.query('SELECT suspended,is_test_fixture FROM app_actor WHERE id=$1',[g.owner_id])).rows[0],members=(await c.query('SELECT actor_id,active FROM agency_member WHERE agency_id=$1',[r.agency_id])).rows;
 if(user.id===r.renter_id||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Disbursement account not found.',404);
 const active=Boolean(g.active&&!owner.suspended&&!owner.is_test_fixture),operator=active&&(g.owner_id===user.id||members.some(m=>m.actor_id===user.id&&m.active));
 const beneficiary=Boolean((await c.query("SELECT 1 WHERE EXISTS(SELECT 1 FROM booking_revenue_entry WHERE request_id=$1 AND beneficiary_actor_id=$2 AND recipient='COSIGNER') OR EXISTS(SELECT 1 FROM booking_quotation_line WHERE request_id=$1 AND private_financial_snapshot->>'category'='CONSIGNED' AND private_financial_snapshot->>'cosignerId'=$2)",[id,user.id])).rowCount);
 const reviewer=user.role==='SUPER_ADMIN'&&user.id!==g.owner_id&&!members.some(m=>m.actor_id===user.id)&&!beneficiary;
 if(!operator&&!reviewer)throw new DomainError('Disbursement account not found.',404);
 return {r,user,operator,reviewer,active};
}
type Context=Awaited<ReturnType<typeof centralFinancialAuthority>>;
async function rows(c:PoolClient,id:string,page=1){return(await c.query(`SELECT d.*,e.action stage,t.id transfer_id,t.actor_id executor,t.reference,t.simulated,t.file_id,t.created_at transferred_at,a.id confirmation_id,a.created_at confirmed_at
 FROM central_disbursement d LEFT JOIN LATERAL(SELECT action FROM central_disbursement_event WHERE disbursement_id=d.id ORDER BY sequence DESC LIMIT 1)e ON true
 LEFT JOIN central_disbursement_transfer t ON t.disbursement_id=d.id LEFT JOIN central_disbursement_confirmation a ON a.disbursement_id=d.id
 WHERE d.request_id=$1 ORDER BY d.revision DESC LIMIT 20 OFFSET $2`,[id,(page-1)*20])).rows;}
function stage(d:any){return d.confirmation_id?'RECEIVED':d.transfer_id?'TRANSFERRED':d.stage==='APPROVE'?'APPROVED':d.stage==='REJECT'?'REJECTED':d.stage==='WITHDRAW'?'WITHDRAWN':'REQUESTED';}
async function projection(c:PoolClient,ctx:Context,page=1){
 const custody=await centralCustodyInTransaction(c,ctx.user,ctx.r.id),items=await rows(c,ctx.r.id,page),account=(await c.query('SELECT version FROM central_disbursement_account WHERE request_id=$1',[ctx.r.id])).rows[0];
 const events=(await c.query('SELECT e.*,u.name FROM central_disbursement_event e JOIN app_actor u ON u.id=e.actor_id WHERE e.disbursement_id=ANY($1::uuid[]) ORDER BY e.sequence',[items.map(d=>d.id)])).rows;
 const latest=(await rows(c,ctx.r.id))[0],transferred=Boolean((await c.query('SELECT 1 FROM central_disbursement_transfer WHERE request_id=$1 LIMIT 1',[ctx.r.id])).rowCount),total=Number((await c.query('SELECT count(*) n FROM central_disbursement WHERE request_id=$1',[ctx.r.id])).rows[0].n);
 return {requestId:ctx.r.id as string,agencyId:ctx.r.agency_id as string,version:account?.version??1,requestVersion:account?.version??1,isOperator:ctx.operator,isReviewer:ctx.reviewer,environment:custody.statement?.environment??null,statement:custody.statement,blockedReason:custody.blockedReason,
  canRequest:ctx.operator&&!transferred&&!!custody.statement?.position.availableForDisbursementCentavos&&(!latest||['REJECTED','WITHDRAWN'].includes(stage(latest))),page,pageCount:Math.max(1,Math.ceil(total/20)),
  items:items.map(d=>{const current=stage(d),stale=!custody.statement||custody.statement.sourceDigest!==d.source_digest,latestItem=d.id===latest?.id;return {id:d.id as string,revision:d.revision as number,stage:current,environment:d.environment as 'DEMO'|'MANUAL',amountCentavos:Number(d.amount_centavos),requestReason:d.request_reason as string,destination:d.destination as {method:string;institution:string;name:string;account:string},sourceDigest:d.source_digest as string,sources:d.body.sources as {entryId:string;recipient:string;originalCentavos:number;agencyFeeCentavos:number;proposedDisbursementCentavos:number}[],createdAt:(d.created_at as Date).toISOString(),stale,
   canApprove:ctx.reviewer&&ctx.active&&d.created_by!==ctx.user.id&&latestItem&&current==='REQUESTED'&&!stale,
   canReject:ctx.reviewer&&d.created_by!==ctx.user.id&&current==='REQUESTED',canWithdraw:ctx.operator&&['REQUESTED','APPROVED'].includes(current),
   canTransfer:ctx.reviewer&&ctx.active&&latestItem&&current==='APPROVED'&&!stale&&!transferred,
   canConfirm:ctx.operator&&latestItem&&current==='TRANSFERRED'&&d.executor!==ctx.user.id&&!stale,
   transfer:d.transfer_id?{id:d.transfer_id as string,reference:d.reference as string,simulated:d.simulated as boolean,evidenceId:d.file_id as string|null,recordedAt:(d.transferred_at as Date).toISOString()}:null,
   history:events.filter(e=>e.disbursement_id===d.id).map(e=>({action:e.action as string,reason:e.reason as string,actorName:e.name as string,createdAt:(e.created_at as Date).toISOString()})),confirmedAt:d.confirmed_at?(d.confirmed_at as Date).toISOString():null};})};
}
export type CentralDisbursements=Awaited<ReturnType<typeof projection>>;
export async function getDisbursements(actor:Actor,id:string,page=1){z.number().int().min(1).max(10000).parse(page);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const ctx=await centralFinancialAuthority(c,actor,id);return projection(c,ctx,page);});}
async function notify(c:PoolClient,ctx:Context){await c.query(`INSERT INTO booking_notification(id,request_id,recipient_id,message)
 SELECT gen_random_uuid(),$1,u.id,'Agency disbursement activity was recorded. Approval, transfer evidence and agency receipt confirmation remain separate.' FROM app_actor u
 WHERE NOT u.suspended AND NOT u.is_test_fixture AND u.id<>$3 AND u.id<>$4 AND (u.id=(SELECT owner_id FROM agency WHERE id=$2) OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=$2 AND m.actor_id=u.id AND m.active))`,[ctx.r.id,ctx.r.agency_id,ctx.user.id,ctx.r.renter_id]);}

type TransferCommand=ReturnType<typeof disbursementTransferCommand.parse>;
async function change(actor:Actor,id:string,input:unknown,upload?:PaymentEvidenceUpload){
 const command=upload?disbursementTransferCommand.parse(input):disbursementCommand.parse(input),hash=digest({command,fileHash:upload?.sha256??null});
 return transaction(async c=>{
  const ctx=await centralFinancialAuthority(c,actor,id,true);await c.query('INSERT INTO central_disbursement_account(request_id)VALUES($1)ON CONFLICT DO NOTHING',[id]);
  const account=(await c.query('SELECT version FROM central_disbursement_account WHERE request_id=$1 FOR UPDATE',[id])).rows[0];
  const previous=(await c.query('SELECT digest FROM central_disbursement_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(previous){if(previous.digest!==hash)throw new DomainError('This retry key belongs to a different disbursement action.',409);return {state:await projection(c,ctx),usedFile:false};}
  if(account.version!==command.version)throw new DomainError('The disbursement account changed. Refresh before continuing.',409);
  const data=await projection(c,ctx),latest=(await rows(c,id))[0];let selected:string;
  if(command.action==='REQUEST'){
   if(!data.canRequest||!data.statement||data.statement.sourceDigest!==command.sourceDigest)throw new DomainError('The exact closed allocation is unavailable for a new request. Refresh the source statement.',409);
   selected=randomUUID();await c.query('INSERT INTO central_disbursement(id,request_id,agency_id,close_id,quote_id,environment,revision,created_by,destination,source_digest,body,amount_centavos,request_reason)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[selected,id,ctx.r.agency_id,data.statement.closeId,data.statement.quoteId,data.statement.environment,(latest?.revision??0)+1,ctx.user.id,command.destination,command.sourceDigest,data.statement,data.statement.position.availableForDisbursementCentavos,command.reason]);
  }else{
   const d=(await c.query('SELECT * FROM central_disbursement WHERE id=$1 AND request_id=$2',[command.disbursementId,id])).rows[0],view=data.items.find(d=>d.id===command.disbursementId);
   if(!d||!view)throw new DomainError('Disbursement request not found.',404);selected=d.id;
   if(command.action==='APPROVE'||command.action==='REJECT'||command.action==='WITHDRAW'){
    const allowed=command.action==='APPROVE'?view.canApprove:command.action==='REJECT'?view.canReject:view.canWithdraw;
    if(!allowed)throw new DomainError('This disbursement decision is unavailable for your account or its current source.',409);
    const next=(await c.query('SELECT COALESCE(max(sequence),0)+1 n FROM central_disbursement_event WHERE disbursement_id=$1',[d.id])).rows[0].n;
    await c.query('INSERT INTO central_disbursement_event(id,disbursement_id,request_id,sequence,actor_id,action,reason)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),d.id,id,next,ctx.user.id,command.action,command.reason]);
   }else if(command.action==='CONFIRM_RECEIPT'){
    if(!view.canConfirm||!view.transfer)throw new DomainError('Independent agency receipt confirmation is unavailable. Review the exact transfer and source first.',409);
    const confirmation=randomUUID();await c.query('INSERT INTO central_disbursement_confirmation(id,disbursement_id,transfer_id,actor_id,reason)VALUES($1,$2,$3,$4,$5)',[confirmation,d.id,view.transfer.id,ctx.user.id,command.reason]);
    for(const source of view.sources)if(source.recipient!=='PLATFORM')await c.query('INSERT INTO central_disbursement_release(entry_id,disbursement_id,confirmation_id,amount_centavos)VALUES($1,$2,$3,$4)',[source.entryId,d.id,confirmation,source.proposedDisbursementCentavos]);
   }else{
    if(!('reference' in command))throw new DomainError('Invalid transfer action.',422);
    if(!view.canTransfer)throw new DomainError('This approved transfer is stale, already recorded or unavailable for your account.',409);
    const simulated=command.action==='SIMULATE_TRANSFER';
    if(simulated!==(d.environment==='DEMO')||(!simulated&&!upload))throw new DomainError('Use the transfer workflow matching the original payment environment.',409);
    if(upload)await c.query('INSERT INTO central_disbursement_file(id,request_id,uploaded_by,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7)',[upload.id,id,ctx.user.id,upload.mime,upload.size,upload.sha256,upload.backend]);
    await c.query('INSERT INTO central_disbursement_transfer(id,disbursement_id,request_id,actor_id,simulated,reference,reference_normalized,reason,file_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),d.id,id,ctx.user.id,simulated,command.reference,normalizePaymentReference(command.reference),command.reason,upload?.id??null]);
   }
  }
  await c.query('INSERT INTO central_disbursement_command(request_id,actor_id,idempotency_key,digest,disbursement_id)VALUES($1,$2,$3,$4,$5)',[id,ctx.user.id,command.idempotencyKey,hash,selected]);
  await c.query('UPDATE central_disbursement_account SET version=version+1 WHERE request_id=$1',[id]);await notify(c,ctx);
  return {state:await projection(c,ctx),usedFile:Boolean(upload)};
 });
}
export async function changeDisbursement(actor:Actor,id:string,input:unknown){try{return(await change(actor,id,input)).state;}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This transfer reference or allocation is already recorded. Refresh the original record.',409);throw e;}}
export async function attachDisbursementTransfer(actor:Actor,id:string,command:TransferCommand,file:PaymentEvidenceUpload){z.object({id:z.uuid(),mime:z.enum(['image/png','image/jpeg','application/pdf']),size:z.number().int().min(1).max(5242880),sha256:z.string().regex(/^[a-f0-9]{64}$/),backend:z.enum(['local','s3'])}).strict().parse(file);return change(actor,id,command,file);}
export async function authorizeDisbursementUpload(actor:Actor,id:string,command:TransferCommand,sha256:string){return transaction(async c=>{const ctx=await centralFinancialAuthority(c,actor,id),s=await projection(c,ctx),old=(await c.query('SELECT digest FROM central_disbursement_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.digest!==digest({command,fileHash:sha256}))throw new DomainError('This retry key belongs to different transfer evidence.',409);return {alreadyApplied:true,state:s};}const d=s.items.find(d=>d.id===command.disbursementId);if(!d?.canTransfer||d.environment!=='MANUAL'||s.version!==command.version)throw new DomainError('Refresh the approved live transfer before attaching evidence.',409);return {alreadyApplied:false,state:s};});}
export async function disbursementFile(actor:Actor,fileId:string){return transaction(async c=>{const f=(await c.query('SELECT * FROM central_disbursement_file WHERE id=$1',[z.uuid().parse(fileId)])).rows[0];if(!f)throw new DomainError('Transfer evidence not found.',404);await centralFinancialAuthority(c,actor,f.request_id);return {objectKey:`${f.request_id}/${f.id}`,backend:f.backend as 'local'|'s3',mime:f.mime as string,name:`agency-transfer-${f.id}.${f.mime==='application/pdf'?'pdf':f.mime==='image/png'?'png':'jpg'}`};});}
export async function disbursementDirectory(actor:Actor,input:unknown={}){const q=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),view:z.enum(['CURRENT','ALL']).default('CURRENT')}).strict().parse(input);return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const u=await storedActor(actor,c);if(u.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[u.id])).rows[0]?.is_test_fixture)throw new DomainError('Independent platform review access is required.',403);
 const empty={...q,pageCount:1,total:0,items:[] as {requestId:string;id:string;agencyName:string;stage:string;amountCentavos:number;environment:string;createdAt:string}[]};if(!(await c.query("SELECT to_regclass('central_disbursement') present")).rows[0].present)return empty;
 const source=`WITH records AS(SELECT d.*,COALESCE(g.display_name,r.agency_name) agency_name,CASE WHEN a.id IS NOT NULL THEN 'RECEIVED' WHEN t.id IS NOT NULL THEN 'TRANSFERRED' WHEN e.action='APPROVE' THEN 'APPROVED' WHEN e.action='REJECT' THEN 'REJECTED' WHEN e.action='WITHDRAW' THEN 'WITHDRAWN' ELSE 'REQUESTED' END stage
 FROM central_disbursement d JOIN booking_request r ON r.id=d.request_id JOIN agency g ON g.id=d.agency_id LEFT JOIN LATERAL(SELECT action FROM central_disbursement_event WHERE disbursement_id=d.id ORDER BY sequence DESC LIMIT 1)e ON true LEFT JOIN central_disbursement_transfer t ON t.disbursement_id=d.id LEFT JOIN central_disbursement_confirmation a ON a.disbursement_id=d.id
 WHERE d.created_by<>$1 AND r.renter_id<>$1 AND g.owner_id<>$1 AND NOT EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$1) AND NOT EXISTS(SELECT 1 FROM booking_revenue_entry b WHERE b.request_id=r.id AND b.beneficiary_actor_id=$1))`;
 const where="($2::text='ALL' OR stage IN ('REQUESTED','APPROVED','TRANSFERRED'))",total=Number((await c.query(`${source} SELECT count(*) n FROM records WHERE ${where}`,[u.id,q.view])).rows[0].n),pageCount=Math.max(1,Math.ceil(total/20)),page=Math.min(q.page,pageCount),items=(await c.query(`${source} SELECT * FROM records WHERE ${where} ORDER BY created_at DESC,id LIMIT 20 OFFSET $3`,[u.id,q.view,(page-1)*20])).rows;
 return {...q,total,page,pageCount,items:items.map(d=>({requestId:d.request_id as string,id:d.id as string,agencyName:d.agency_name as string,stage:d.stage as string,amountCentavos:Number(d.amount_centavos),environment:d.environment as string,createdAt:(d.created_at as Date).toISOString()}))};
});}
