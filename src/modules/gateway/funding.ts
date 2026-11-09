import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import type {PaymentEvidenceUpload} from '../bookings/payment';
import {normalizePaymentReference} from '../bookings/payment-schema';
import {centralFinancialAuthority} from './disbursements';
import {centralFundingBasis} from './funding-source';
const base={version:z.number().int().positive(),idempotencyKey:z.uuid()},note=z.string().trim().min(1).max(2000),ref=z.string().trim().min(1).max(160).refine(s=>!/[\u0000-\u001f\u007f]/u.test(s));
export const fundingCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('SUBMIT_TEST'),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),reference:ref,reason:note,accepted:z.literal(true)}).strict(),
 z.object({...base,action:z.literal('DECIDE'),fundingId:z.uuid(),decision:z.enum(['APPROVE','REJECT']),reason:note}).strict()
]);
export const fundingEvidenceCommand=z.object({...base,action:z.literal('SUBMIT_FUNDING'),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),reference:ref,reason:note,accepted:z.literal(true)}).strict();
type Context=Awaited<ReturnType<typeof centralFinancialAuthority>>;
async function projection(c:PoolClient,ctx:Context,page=1){
 const basis=await centralFundingBasis(c,ctx.r.id),account=(await c.query('SELECT version FROM central_disbursement_account WHERE request_id=$1',[ctx.r.id])).rows[0];
 const records=(await c.query(`SELECT f.*,d.decision,d.reason decision_reason,d.created_at decided_at FROM central_agency_funding f LEFT JOIN central_funding_decision d ON d.funding_id=f.id WHERE f.request_id=$1 ORDER BY f.created_at DESC,f.id LIMIT 21 OFFSET $2`,[ctx.r.id,(page-1)*20])).rows;
 return {requestId:ctx.r.id as string,requestVersion:account?.version??1,isOperator:ctx.operator,isReviewer:ctx.reviewer,basis,canSubmit:ctx.operator&&!!basis?.neededCentavos,page,hasNext:records.length>20,items:records.slice(0,20).map(f=>({id:f.id as string,amountCentavos:Number(f.amount_centavos),environment:f.environment as 'DEMO'|'MANUAL',reference:f.reference as string,reason:f.reason as string,evidenceId:f.file_id as string|null,createdAt:(f.created_at as Date).toISOString(),decision:f.decision as 'APPROVE'|'REJECT'|null,decisionReason:f.decision_reason as string|null,stale:!basis||f.source_digest!==basis.sourceDigest,canApprove:ctx.reviewer&&ctx.user.id!==f.created_by&&!f.decision&&!!basis&&f.source_digest===basis.sourceDigest&&Number(f.amount_centavos)===basis.neededCentavos,canReject:ctx.reviewer&&ctx.user.id!==f.created_by&&!f.decision}))};
}
export async function getCentralFunding(actor:Actor,id:string,page=1){z.number().int().min(1).max(10000).parse(page);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return projection(c,await centralFinancialAuthority(c,actor,id),page);});}
export type CentralFundingState=Awaited<ReturnType<typeof getCentralFunding>>;
async function change(actor:Actor,id:string,input:unknown,file?:PaymentEvidenceUpload){
 const command=file?fundingEvidenceCommand.parse(input):fundingCommand.parse(input),hash=digest({command,fileHash:file?.sha256??null});
 return transaction(async c=>{
 const ctx=await centralFinancialAuthority(c,actor,id,true);await c.query('INSERT INTO central_disbursement_account(request_id)VALUES($1)ON CONFLICT DO NOTHING',[id]);
 const old=(await c.query('SELECT digest FROM central_funding_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.digest!==hash)throw new DomainError('Retry key belongs to different funding evidence or review.',409);return {state:await projection(c,ctx),usedFile:false};}
 const data=await projection(c,ctx);if(data.requestVersion!==command.version)throw new DomainError('The financial account changed. Refresh the funding source.',409);let fundingId:string;
 if(command.action==='DECIDE'){
 const f=(await c.query('SELECT * FROM central_agency_funding WHERE id=$1 AND request_id=$2',[command.fundingId,id])).rows[0],decision=(await c.query('SELECT 1 FROM central_funding_decision WHERE funding_id=$1',[command.fundingId])).rowCount;
 if(!ctx.reviewer||!f||f.created_by===ctx.user.id||decision)throw new DomainError('Independent platform funding review is required.',403);
 if(command.decision==='APPROVE'&&(!data.basis||f.source_digest!==data.basis.sourceDigest||Number(f.amount_centavos)!==data.basis.neededCentavos))throw new DomainError('Funding source changed. Reject this stale submission and review the current obligation.',409);
 fundingId=f.id;if(command.decision==='APPROVE')await c.query('INSERT INTO central_funding_reference(environment,normalized_reference,funding_id)VALUES($1,$2,$3)',[f.environment,f.normalized_reference,f.id]);await c.query('INSERT INTO central_funding_decision(funding_id,actor_id,decision,reason)VALUES($1,$2,$3,$4)',[fundingId,ctx.user.id,command.decision,command.reason]);
 }else{
 if(!data.canSubmit||!data.basis||data.basis.sourceDigest!==command.sourceDigest)throw new DomainError('No exact current agency funding obligation is available.',409);
 if((command.action==='SUBMIT_TEST')!==(data.basis.environment==='DEMO'))throw new DomainError('Use the evidence workflow matching the original financial environment.',409);
 fundingId=randomUUID();if(file)await c.query('INSERT INTO central_funding_file(id,request_id,uploaded_by,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7)',[file.id,id,ctx.user.id,file.mime,file.size,file.sha256,file.backend]);
 await c.query('INSERT INTO central_agency_funding(id,request_id,agency_id,environment,amount_centavos,source_digest,body,created_by,reference,normalized_reference,reason,file_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[fundingId,id,ctx.r.agency_id,data.basis.environment,data.basis.neededCentavos,data.basis.sourceDigest,data.basis,ctx.user.id,command.reference,normalizePaymentReference(command.reference),command.reason,file?.id??null]);
 }
 await c.query('INSERT INTO central_funding_command(request_id,actor_id,idempotency_key,digest,funding_id)VALUES($1,$2,$3,$4,$5)',[id,ctx.user.id,command.idempotencyKey,hash,fundingId]);await c.query('UPDATE central_disbursement_account SET version=version+1 WHERE request_id=$1',[id]);
 await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,u.id,'Agency funding evidence or its independent review was recorded. Only approved funding changes the central cash balance.' FROM app_actor u WHERE NOT u.suspended AND NOT u.is_test_fixture AND u.id<>$2 AND (u.id=(SELECT owner_id FROM agency WHERE id=$3) OR(u.role='SUPER_ADMIN' AND NOT EXISTS(SELECT 1 FROM agency_member m WHERE m.actor_id=u.id AND m.agency_id=$3)))",[id,ctx.user.id,ctx.r.agency_id]);
 return {state:await projection(c,ctx),usedFile:Boolean(file)};
 });
}
export async function changeCentralFunding(actor:Actor,id:string,input:unknown){try{return(await change(actor,id,input)).state;}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This funding reference or review is already recorded.',409);throw e;}}
export async function attachCentralFunding(actor:Actor,id:string,input:unknown,file:PaymentEvidenceUpload){z.object({id:z.uuid(),mime:z.enum(['image/png','image/jpeg','application/pdf']),size:z.number().int().min(1).max(5242880),sha256:z.string().regex(/^[a-f0-9]{64}$/),backend:z.enum(['local','s3'])}).strict().parse(file);return change(actor,id,input,file);}
export async function authorizeFundingUpload(actor:Actor,id:string,input:unknown,sha256:string){const command=fundingEvidenceCommand.parse(input);return transaction(async c=>{const ctx=await centralFinancialAuthority(c,actor,id),d=await projection(c,ctx),old=(await c.query('SELECT digest FROM central_funding_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.digest!==digest({command,fileHash:sha256}))throw new DomainError('Retry key belongs to another funding submission.',409);return {alreadyApplied:true,state:d};}if(!d.canSubmit||d.basis?.environment!=='MANUAL'||d.basis.sourceDigest!==command.sourceDigest||d.requestVersion!==command.version)throw new DomainError('Refresh the exact agency obligation before attaching proof.',409);return {alreadyApplied:false,state:d};});}
export async function fundingFile(actor:Actor,id:string){return transaction(async c=>{const f=(await c.query('SELECT * FROM central_funding_file WHERE id=$1',[z.uuid().parse(id)])).rows[0];if(!f)throw new DomainError('Funding evidence not found.',404);await centralFinancialAuthority(c,actor,f.request_id);return {objectKey:`${f.request_id}/${f.id}`,backend:f.backend as 'local'|'s3',mime:f.mime as string,name:`agency-funding-${f.id}.${f.mime==='application/pdf'?'pdf':f.mime==='image/png'?'png':'jpg'}`};});}

export async function centralFundingDirectory(actor:Actor,page=1){z.number().int().min(1).max(10000).parse(page);return transaction(async c=>{
 const u=await(await import('../partners/service')).storedActor(actor,c);if(u.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[u.id])).rows[0]?.is_test_fixture)throw new DomainError('Independent platform review is required.',403);
 const rows=(await c.query(`SELECT f.request_id,f.id,f.amount_centavos,f.environment,g.display_name FROM central_agency_funding f JOIN agency g ON g.id=f.agency_id JOIN booking_request b ON b.id=f.request_id LEFT JOIN central_funding_decision d ON d.funding_id=f.id WHERE d.funding_id IS NULL AND f.created_by<>$1 AND g.owner_id<>$1 AND b.renter_id<>$1 AND NOT EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$1) AND NOT EXISTS(SELECT 1 FROM booking_revenue_entry e WHERE e.request_id=b.id AND e.beneficiary_actor_id=$1) ORDER BY f.created_at,f.id LIMIT 21 OFFSET $2`,[u.id,(page-1)*20])).rows;
 return {page,hasNext:rows.length>20,items:rows.slice(0,20).map(r=>({id:r.id as string,requestId:r.request_id as string,agencyName:r.display_name as string,environment:r.environment as string,amountCentavos:Number(r.amount_centavos)}))};
});}
