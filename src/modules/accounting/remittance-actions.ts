import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {normalizePaymentReference} from '../bookings/payment-schema';
import type {PaymentEvidenceUpload} from '../bookings/payment';
import {remittanceCommand,remittanceEvidenceCommand,type RemittanceCommand,type RemittanceEvidenceCommand,type RemittanceScope} from './remittance-schema';
import {allocateRemittance} from './remittance-balances';
import {remittanceContext,remittanceSources,agencyCreditPacket,availableAgencyCredits,notifyRemittance,type RemittanceContext} from './remittance-source';
import {remittanceRows,remittanceProjection} from './remittances';
type Command=RemittanceCommand|RemittanceEvidenceCommand;
const platformAction=(action:Command['action'])=>['REVOKE_REMITTANCE','REVIEW_REMITTANCE','RESOLVE_REMITTANCE'].includes(action);
async function authorize(c:PoolClient,actor:Actor,scope:RemittanceScope,command:Command,fileHash?:string){
 const ctx=await remittanceContext(c,actor,scope,true);
 if(platformAction(command.action)?!ctx.platform:!ctx.operator)throw new DomainError(platformAction(command.action)?'Independent platform authority is required.':'Current agency authority is required.',403);
 const hash=digest({command,...(fileHash?{fileHash}:{})}),old=(await c.query('SELECT digest FROM platform_remittance_command WHERE account_id=$1 AND actor_id=$2 AND idempotency_key=$3',[ctx.account!.id,ctx.user.id,command.idempotencyKey])).rows[0];
 if(old){if(old.digest!==hash)throw new DomainError('This retry key belongs to another remittance action.',409);return {ctx,hash,replayed:true};}
 if(ctx.account!.version!==command.version)throw new DomainError('This remittance account changed. Reload the exact records before continuing.',409);
 return {ctx,hash,replayed:false};
}
async function exact(c:PoolClient,ctx:RemittanceContext,command:{remittanceId:string;digest:string}){
 const r=(await c.query(`${remittanceRows} WHERE r.id=$1 AND r.account_id=$2`,[command.remittanceId,ctx.account!.id])).rows[0];
 if(!r)throw new DomainError('Remittance request not found.',404);if(r.digest!==command.digest)throw new DomainError('Review the exact saved remittance amount and sources.',409);
 if(r.receipt_id||r.cancellation)throw new DomainError('This remittance is already paid or cancelled. Its saved record remains unchanged.',409);
 return r;
}
async function attemptCapacity(c:PoolClient,r:any){if(r.pending_attempt_id)throw new DomainError('Resolve the pending payment claim or result first.',409);if(Number((await c.query('SELECT count(*) n FROM platform_remittance_attempt WHERE remittance_id=$1',[r.id])).rows[0].n)>=30)throw new DomainError('This request reached its payment-attempt limit. Withdraw it or ask the platform to revoke the unpaid request.',409);}
async function receipt(c:PoolClient,ctx:RemittanceContext,r:any,attempt:{id:string;reference:string}){
 const id=randomUUID(),reference=normalizePaymentReference(attempt.reference),body={agencyName:ctx.agencyName,agencyId:ctx.scope.agencyId,environment:ctx.scope.environment,method:r.method,amountCentavos:Number(r.amount_centavos),reference:attempt.reference,remittanceId:r.id,attemptId:attempt.id,recordedBy:ctx.user.name,externalReceived:ctx.scope.environment==='MANUAL',sources:r.body.sources,kind:ctx.scope.environment==='DEMO'?'SIMULATED_RECEIPT':'CONFIRMED_EXTERNAL_RECEIPT'};
 await c.query('INSERT INTO platform_remittance_receipt(id,remittance_id,attempt_id,account_id,agency_id,environment,method,amount_centavos,actor_id,reference,normalized_reference,body,digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,r.id,attempt.id,ctx.account!.id,ctx.scope.agencyId,ctx.scope.environment,r.method,r.amount_centavos,ctx.user.id,attempt.reference,reference,body,digest(body)]);
 if(ctx.scope.environment==='MANUAL')await c.query('INSERT INTO platform_incoming_reference(method,normalized_reference,receipt_id)VALUES($1,$2,$3)',[r.method,reference,id]);
 return id;
}
async function manualGate(c:PoolClient,ctx:RemittanceContext,command:RemittanceEvidenceCommand){
 if(ctx.scope.environment!=='MANUAL')throw new DomainError('Only an unpaid manual remittance accepts external-payment evidence.',409);const r=await exact(c,ctx,command);await attemptCapacity(c,r);return r;
}
export async function authorizeRemittanceEvidence(actor:Actor,scope:RemittanceScope,input:unknown,fileHash:string){
 const command=remittanceEvidenceCommand.parse(input);if(!/^[a-f0-9]{64}$/.test(fileHash))throw new DomainError('Invalid payment evidence digest.',422);
 return transaction(async c=>{const v=await authorize(c,actor,scope,command,fileHash);if(v.replayed)return {alreadyApplied:true as const,state:await remittanceProjection(c,v.ctx)};await manualGate(c,v.ctx,command);return {alreadyApplied:false as const,accountId:v.ctx.account!.id};});
}
async function run(actor:Actor,scope:RemittanceScope,command:Command,file?:PaymentEvidenceUpload){
 try{return await transaction(async c=>{
  const v=await authorize(c,actor,scope,command,file?.sha256),{ctx}=v;if(v.replayed)return {state:await remittanceProjection(c,ctx),usedFile:false};
  const commandId=randomUUID();await c.query('INSERT INTO platform_remittance_command(id,account_id,actor_id,idempotency_key,action,digest)VALUES($1,$2,$3,$4,$5,$6)',[commandId,ctx.account!.id,ctx.user.id,command.idempotencyKey,command.action,v.hash]);let referenceId:string;
  if(command.action==='REQUEST_REMITTANCE'){
   if(command.method.startsWith('DEMO_')!==(ctx.scope.environment==='DEMO'))throw new DomainError('Choose a payment method matching these actual or simulated source records.',409);
   if(Number((await c.query('SELECT count(*) n FROM platform_remittance r WHERE r.account_id=$1 AND NOT EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=r.id) AND NOT EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=r.id)',[ctx.account!.id])).rows[0].n)>=20)throw new DomainError('Complete or withdraw existing remittances before opening more than twenty at once.',409);
   const sources=await remittanceSources(c,ctx.scope,command.sourcePage,'DUE');if(sources.digest!==command.sourceDigest)throw new DomainError('The disclosed original-source balances changed. Reload them first.',409);
   const allocated=allocateRemittance(BigInt(command.amountCentavos),sources.items.map(s=>({id:s.entryId,available:BigInt(s.dueCentavos)}))),body={agencyName:ctx.agencyName,agencyId:ctx.scope.agencyId,environment:ctx.scope.environment,method:command.method,amountCentavos:command.amountCentavos,sourceDigest:sources.digest,sources:allocated.map(a=>({...sources.items.find(s=>s.entryId===a.entryId)!,allocatedCentavos:a.amountCentavos})),reason:command.reason,requestedBy:ctx.user.name,consentText:'I checked this exact amount, payment method and disclosed original platform allocations. Reserving dues is not confirmation of payment.'};referenceId=randomUUID();
   await c.query('INSERT INTO platform_remittance(id,account_id,agency_id,environment,actor_id,method,amount_centavos,reason,body,digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[referenceId,ctx.account!.id,ctx.scope.agencyId,ctx.scope.environment,ctx.user.id,command.method,command.amountCentavos,command.reason,body,digest({id:referenceId,body})]);
   for(const allocation of allocated)await c.query('INSERT INTO platform_remittance_source(remittance_id,entry_id,amount_centavos)VALUES($1,$2,$3)',[referenceId,allocation.entryId,allocation.amountCentavos]);
  }else if(command.action==='ACCEPT_AGENCY_CREDIT'){
   const packet=await agencyCreditPacket(c,ctx.scope,command.entryId);if(packet.digest!==command.creditDigest)throw new DomainError('The exact agency credit terms changed. Review the current packet.',409);if(packet.body.amountCentavos<=0)throw new DomainError('This source has no excess awaiting agency acceptance.',409);
   referenceId=randomUUID();const body={terms:packet.body,acceptedTermsDigest:packet.digest,acceptedBy:ctx.user.name,agencyName:ctx.agencyName};
   await c.query('INSERT INTO platform_agency_credit(id,account_id,entry_id,amount_centavos,actor_id,consent,body,digest)VALUES($1,$2,$3,$4,$5,true,$6,$7)',[referenceId,ctx.account!.id,command.entryId,packet.body.amountCentavos,ctx.user.id,body,digest(body)]);
  }else if(command.action==='APPLY_AGENCY_CREDIT'){
   const sources=await remittanceSources(c,ctx.scope,command.sourcePage,'DUE'),credits=await availableAgencyCredits(c,ctx.account!.id);if(sources.digest!==command.sourceDigest||credits.digest!==command.creditDigest)throw new DomainError('Available agency credit or source dues changed. Reload the exact application.',409);
   const target=allocateRemittance(BigInt(command.amountCentavos),sources.items.map(s=>({id:s.entryId,available:BigInt(s.dueCentavos)}))),funding=allocateRemittance(BigInt(command.amountCentavos),credits.items.map(g=>({id:g.creditId,available:BigInt(g.availableCentavos)})));referenceId=randomUUID();const body={agencyName:ctx.agencyName,environment:ctx.scope.environment,amountCentavos:command.amountCentavos,appliedBy:ctx.user.name,sourceDigest:sources.digest,creditDigest:credits.digest,acceptedCredits:funding.map(g=>({creditId:g.entryId,amountCentavos:g.amountCentavos})),sources:target.map(a=>({...sources.items.find(s=>s.entryId===a.entryId)!,allocatedCentavos:a.amountCentavos})),statement:'Accepted agency credit applied to the disclosed original platform dues. No cash receipt or bank transfer is created.'};
   await c.query('INSERT INTO platform_credit_application(id,account_id,actor_id,amount_centavos,body,digest)VALUES($1,$2,$3,$4,$5,$6)',[referenceId,ctx.account!.id,ctx.user.id,command.amountCentavos,body,digest(body)]);
   for(const grant of funding)await c.query('INSERT INTO platform_credit_use(application_id,credit_id,amount_centavos)VALUES($1,$2,$3)',[referenceId,grant.entryId,grant.amountCentavos]);
   for(const source of target)await c.query('INSERT INTO platform_credit_allocation(application_id,entry_id,amount_centavos)VALUES($1,$2,$3)',[referenceId,source.entryId,source.amountCentavos]);
  }else{
   const r=await exact(c,ctx,command);referenceId=r.id;
   if(command.action==='WITHDRAW_REMITTANCE'||command.action==='REVOKE_REMITTANCE'){
    if(r.pending_attempt_id)throw new DomainError('Resolve the pending payment claim or result before cancelling this unpaid remittance.',409);
    await c.query('INSERT INTO platform_remittance_cancel(remittance_id,actor_id,action,reason)VALUES($1,$2,$3,$4)',[r.id,ctx.user.id,command.action==='WITHDRAW_REMITTANCE'?'WITHDRAW':'REVOKE',command.reason]);
   }else if(command.action==='SIMULATE_REMITTANCE'){
    if(ctx.scope.environment!=='DEMO')throw new DomainError('Only simulated remittances accept fixed gateway outcomes.',409);await attemptCapacity(c,r);const attempt={id:randomUUID(),reference:`DEMO-REMIT-${randomUUID()}`},outcome=command.outcome==='APPROVED'?'CONFIRMED':command.outcome;
    await c.query("INSERT INTO platform_remittance_attempt(id,remittance_id,account_id,actor_id,command_id,initial_outcome,reference,note)VALUES($1,$2,$3,$4,$5,$6,$7,'Simulated remittance result; no money moves.')",[attempt.id,r.id,ctx.account!.id,ctx.user.id,commandId,outcome,attempt.reference]);if(outcome==='CONFIRMED')await receipt(c,ctx,r,attempt);
   }else if(command.action==='SUBMIT_REMITTANCE_PROOF'){
    if(!file)throw new DomainError('Upload private proof of the completed external payment.',415);await manualGate(c,ctx,command);
    await c.query("INSERT INTO platform_remittance_attempt(id,remittance_id,account_id,actor_id,command_id,initial_outcome,reference,note,file_id,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,'SUBMITTED',$6,$7,$8,$9,$10,$11,$12)",[randomUUID(),r.id,ctx.account!.id,ctx.user.id,commandId,command.reference,command.note,file.id,file.mime,file.size,file.sha256,file.backend]);
   }else{
    if(r.pending_attempt_id!==command.attemptId)throw new DomainError('Review only the exact unresolved payment claim or result.',409);
    const attempt=(await c.query('SELECT id,reference,initial_outcome FROM platform_remittance_attempt WHERE id=$1 AND remittance_id=$2',[command.attemptId,r.id])).rows[0];if(!attempt)throw new DomainError('Payment attempt not found.',404);
    if(command.action==='REVIEW_REMITTANCE'){
     if(ctx.scope.environment!=='MANUAL'||attempt.initial_outcome!=='SUBMITTED')throw new DomainError('Independent receipt review applies only to submitted manual payment evidence.',409);
     await c.query('INSERT INTO platform_remittance_review(id,attempt_id,remittance_id,account_id,actor_id,decision,external_received,reason)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),attempt.id,r.id,ctx.account!.id,ctx.user.id,command.decision,command.externalReceived,command.reason]);if(command.decision==='ACCEPT')await receipt(c,ctx,r,attempt);
    }else{
     if(ctx.scope.environment!=='DEMO'||attempt.initial_outcome!=='PENDING')throw new DomainError('Resolve only an exact pending simulated result.',409);const outcome=command.outcome==='APPROVED'?'CONFIRMED':command.outcome;
     await c.query('INSERT INTO platform_remittance_resolution(id,attempt_id,remittance_id,account_id,actor_id,outcome,reason)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),attempt.id,r.id,ctx.account!.id,ctx.user.id,outcome,command.reason]);if(outcome==='CONFIRMED')await receipt(c,ctx,r,attempt);
    }
   }
  }
  await notifyRemittance(c,ctx,command.action,referenceId);return {state:await remittanceProjection(c,ctx),usedFile:Boolean(file&&command.action==='SUBMIT_REMITTANCE_PROOF')};
 });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('This action or incoming payment reference is already recorded. Reload before retrying.',409);throw e;}
}
export async function changeRemittance(actor:Actor,scope:RemittanceScope,input:unknown){return (await run(actor,scope,remittanceCommand.parse(input))).state;}
export async function attachRemittanceEvidence(actor:Actor,scope:RemittanceScope,input:unknown,file:PaymentEvidenceUpload){
 const command=remittanceEvidenceCommand.parse(input);uuid.parse(file.id);if(!['image/png','image/jpeg','application/pdf'].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>5242880||!/^[a-f0-9]{64}$/.test(file.sha256)||!['s3','local'].includes(file.backend))throw new DomainError('Invalid private remittance evidence.',422);
 return run(actor,scope,command,file);
}
