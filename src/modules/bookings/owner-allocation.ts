import {assertFinancialOpen} from "./finance-guard";
import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {transaction} from "../../lib/db";
import {uuid} from "../../lib/http";
import {storedActor,audit} from "../partners/service";
import {DomainError,type Actor} from "../partners/workflow";
import {digest} from "../cart/pricing";
import {lockBookingAuthority} from "./quotation";
import {ownerAllocationPacket,type OwnerAllocationLine} from "./owner-allocation-packet";
import {ownerAllocationCommand,ownerAllocationQuery} from "./owner-allocation-schema";

const stages=['FULFILLMENT_RECONCILIATION_PENDING','CANCELLED_RECONCILIATION_PENDING','PAYMENT_RECONCILIATION_REQUIRED'];
async function ownerContext(c:PoolClient,actor:Actor,offerId:string){
 const user=await storedActor(actor,c);
 const offer=(await c.query("SELECT o.id,o.vehicle_id,o.agency_id FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id JOIN app_actor a ON a.id=v.owner_actor_id WHERE o.id=$1 AND v.ownership='CONSIGNED' AND v.owner_actor_id=$2 AND NOT a.suspended AND NOT a.is_test_fixture",[uuid.parse(offerId),user.id])).rows[0];
 if(!offer)throw new DomainError("Vehicle allocation reviews not found.",404);
 return {user,offer};
}
type Context=Awaited<ReturnType<typeof ownerContext>>;
const eligible=`SELECT a.id,a.request_id,a.quote_id,a.revision,a.environment,a.actor_id,a.body->'proposal' AS proposal,
 r.agency_id,r.agency_name,r.status,r.version,
 NOT EXISTS(SELECT 1 FROM booking_assessment newer WHERE newer.request_id=a.request_id AND newer.revision>a.revision) AS is_latest,
 EXISTS(SELECT 1 FROM agency g JOIN app_actor o ON o.id=g.owner_id WHERE g.id=r.agency_id AND g.active AND NOT o.suspended AND NOT o.is_test_fixture) AS agency_active,
 d.decision,d.reason,d.digest AS reviewed_digest,d.body AS reviewed_body,d.created_at AS reviewed_at
 FROM booking_assessment a JOIN booking_assessment_decision accepted ON accepted.assessment_id=a.id AND accepted.decision='ACCEPT'
 JOIN booking_request r ON r.id=a.request_id
 LEFT JOIN booking_owner_allocation_decision d ON d.assessment_id=a.id AND d.offer_id=$1
 WHERE EXISTS(SELECT 1 FROM booking_quotation_line q JOIN booking_request_line l ON l.id=q.line_id AND l.request_id=q.request_id
  WHERE q.quote_id=a.quote_id AND q.private_financial_snapshot->>'category'='CONSIGNED'
  AND q.private_financial_snapshot->>'cosignerId'=$2 AND q.private_financial_snapshot->>'vehicleId'=$3
  AND l.public_quote->'selection'->>'offerId'=$1::text
  AND EXISTS(SELECT 1 FROM jsonb_array_elements((a.body->'proposal'->'charges') || (a.body->'proposal'->'credits')) charge WHERE charge->>'lineId'=q.line_id::text))`;

async function quoteLines(c:PoolClient,quoteIds:string[]){
 return (await c.query("SELECT q.quote_id,q.line_id,q.public_snapshot,q.private_financial_snapshot,l.public_quote->'selection'->>'offerId' AS offer_id FROM booking_quotation_line q JOIN booking_request_line l ON l.id=q.line_id AND l.request_id=q.request_id WHERE q.quote_id=ANY($1::uuid[]) ORDER BY q.line_id",[quoteIds])).rows;
}
function packet(ctx:Context,row:any,lines:OwnerAllocationLine[]){
 const p=ownerAllocationPacket({ownerId:ctx.user.id,offerId:ctx.offer.id,vehicleId:ctx.offer.vehicle_id,assessmentId:row.id,revision:row.revision,agencyName:row.agency_name,environment:row.environment,proposal:row.proposal,lines});
 if(!p)throw new DomainError("The saved vehicle allocation requires review.",409);
 if(row.reviewed_digest&&row.reviewed_digest!==p.digest)throw new DomainError("The preserved owner review does not match its saved allocation.",409);
 return p;
}
function view(ctx:Context,row:any,lines:OwnerAllocationLine[]){
 const p=packet(ctx,row,lines),available=Boolean(row.is_latest&&!row.decision);
 const blockedReason=!row.is_latest?'A newer assessment supersedes this review.':row.decision?null:!row.agency_active?'The agency must be active before allocation acceptance.':!stages.includes(row.status)?'Allocation acceptance requires financial reconciliation.':row.actor_id===ctx.user.id?'An independent agency operator must issue this assessment.':null;
 return {assessmentId:row.id as string,assessmentRevision:row.revision as number,requestVersion:row.version as number,packet:p.body,digest:p.digest,isCurrent:row.is_latest as boolean,
  decision:row.decision as 'ACCEPT'|'DISPUTE'|null,reason:row.reason as string|null,reviewedAt:row.reviewed_at?(row.reviewed_at as Date).toISOString():null,
  blockedReason,canAccept:available&&!blockedReason,canDispute:available};
}
async function projection(c:PoolClient,ctx:Context,query:unknown){
 const q=ownerAllocationQuery.parse(query),filter=q.scope==='OPEN'?" AND NOT EXISTS(SELECT 1 FROM booking_assessment newer WHERE newer.request_id=a.request_id AND newer.revision>a.revision) AND d.id IS NULL":" AND (EXISTS(SELECT 1 FROM booking_assessment newer WHERE newer.request_id=a.request_id AND newer.revision>a.revision) OR d.id IS NOT NULL)";
 const params=[ctx.offer.id,ctx.user.id,ctx.offer.vehicle_id],total=Number((await c.query(`SELECT count(*) n FROM (${eligible}${filter}) scoped`,params)).rows[0].n);
 const rows=(await c.query(`${eligible}${filter} ORDER BY a.created_at DESC,a.id LIMIT 20 OFFSET $4`,[...params,(q.page-1)*20])).rows;
 const lines=await quoteLines(c,[...new Set(rows.map(r=>r.quote_id))]);
 return {offerId:ctx.offer.id as string,scope:q.scope,page:q.page,pageCount:Math.max(1,Math.ceil(total/20)),total,items:rows.map(r=>view(ctx,r,lines.filter(l=>l.quote_id===r.quote_id)))};
}
export type OwnerAllocationState=Awaited<ReturnType<typeof projection>>;
export async function getOwnerAllocations(actor:Actor,offerId:string,query:unknown={}){
 const q=ownerAllocationQuery.parse(query);
 return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await ownerContext(c,actor,offerId),q);});
}
export async function reviewOwnerAllocation(actor:Actor,offerId:string,input:unknown){
 const command=ownerAllocationCommand.parse(input),hash=digest(command);
 return transaction(async c=>{
  const ctx=await ownerContext(c,actor,offerId);
  // Resolve the request exclusively through this owner's immutable vehicle snapshot.
  const first=(await c.query(`${eligible} AND a.id=$4`,[ctx.offer.id,ctx.user.id,ctx.offer.vehicle_id,command.assessmentId])).rows[0];
  if(!first)throw new DomainError("Vehicle allocation review not found.",404);
  const r=(await c.query("SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1 FOR UPDATE",[first.request_id])).rows[0];
  const authority=await lockBookingAuthority(c,{r,user:ctx.user,owner:false},[ctx.user.id],false);
  const row=(await c.query(`${eligible} AND a.id=$4`,[ctx.offer.id,ctx.user.id,ctx.offer.vehicle_id,command.assessmentId])).rows[0];
  if(!row)throw new DomainError("Vehicle allocation review not found.",404);
  const lines=await quoteLines(c,[row.quote_id]);
  const old=(await c.query("SELECT digest FROM booking_owner_allocation_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3",[r.id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError("This retry key belongs to a different owner review.",409);return view(ctx,row,lines);}
  await assertFinancialOpen(c,r.id);
  if(r.version!==command.version)throw new DomainError("This booking changed. Refresh the owner review before continuing.",409);
  const current=view(ctx,row,lines),p=packet(ctx,row,lines);
  if(command.digest!==p.digest||row.decision||!row.is_latest)throw new DomainError("Review the exact current owner allocation.",409);
  if(command.decision==='ACCEPT'&&(!current.canAccept||!authority.active))throw new DomainError(current.blockedReason??"The agency must be active before acceptance.",409);
  await c.query("INSERT INTO booking_owner_allocation_decision(id,assessment_id,request_id,offer_id,actor_id,decision,consent,reason,body,digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[randomUUID(),row.id,r.id,offerId,ctx.user.id,command.decision,command.consent,command.reason,p.body,p.digest]);
  await c.query("INSERT INTO booking_owner_allocation_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)",[randomUUID(),r.id,ctx.user.id,command.idempotencyKey,hash]);
  await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[r.id]);
  const message="Vehicle-owner allocation review recorded. This does not collect money, deduct a deposit, create earnings or complete the booking.";
  await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),r.id,ctx.user.id,`OWNER_ALLOCATION_${command.decision}`,message]);
  await audit(c,ctx.user,`OWNER_ALLOCATION_${command.decision}`,r.id,{assessmentId:row.id,offerId});
  await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))",[r.id,message,r.renter_id,r.agency_id]);
  const saved=(await c.query(`${eligible} AND a.id=$4`,[ctx.offer.id,ctx.user.id,ctx.offer.vehicle_id,command.assessmentId])).rows[0];
  return view(ctx,saved,lines);
 });
}

/** Participant-only status; it never exposes the owner's identity or another vehicle's review packet. */
export async function ownerAllocationSummary(c:PoolClient,requestId:string,assessmentId:string,operator=false){
 const rows=(await c.query(`SELECT l.public_quote->'selection'->>'offerId' AS offer_id,string_agg(DISTINCT q.public_snapshot->>'title',' · ') AS title,d.decision,d.reason,d.created_at
  FROM booking_assessment a JOIN booking_quotation_line q ON q.quote_id=a.quote_id
  JOIN booking_request_line l ON l.id=q.line_id AND l.request_id=q.request_id
  LEFT JOIN booking_owner_allocation_decision d ON d.assessment_id=a.id AND d.offer_id=(l.public_quote->'selection'->>'offerId')::uuid
  WHERE a.id=$1 AND a.request_id=$2 AND q.private_financial_snapshot->>'category'='CONSIGNED'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements((a.body->'proposal'->'charges') || (a.body->'proposal'->'credits')) charge WHERE charge->>'lineId'=q.line_id::text) GROUP BY l.public_quote->'selection'->>'offerId',d.decision,d.reason,d.created_at ORDER BY offer_id`,[assessmentId,requestId])).rows;
 return rows.map(r=>({offerId:r.offer_id as string,title:r.title as string,decision:r.decision as 'ACCEPT'|'DISPUTE'|null,reason:operator?r.reason as string|null:null,reviewedAt:r.created_at?(r.created_at as Date).toISOString():null}));
}

/** Future settlement callers must also check funds, current assessment sources and delivery.
 * This gate only establishes exact, active vehicle-owner allocation consent. */
export async function assertOwnerAllocationsAccepted(c:PoolClient,requestId:string,assessmentId:string){
 const a=(await c.query("SELECT a.id,a.quote_id,a.revision,a.environment,a.actor_id,a.body->'proposal' AS proposal,r.agency_id,r.agency_name,r.status FROM booking_assessment a JOIN booking_request r ON r.id=a.request_id JOIN agency g ON g.id=r.agency_id AND g.active JOIN app_actor agency_owner ON agency_owner.id=g.owner_id AND NOT agency_owner.suspended AND NOT agency_owner.is_test_fixture JOIN booking_assessment_decision d ON d.assessment_id=a.id AND d.decision='ACCEPT' WHERE a.request_id=$1 AND a.id=$2 AND NOT EXISTS(SELECT 1 FROM booking_assessment newer WHERE newer.request_id=a.request_id AND newer.revision>a.revision)",[requestId,assessmentId])).rows[0];
 if(!a)throw new DomainError("The exact current renter-accepted assessment is required.",409);
 if(!stages.includes(a.status))throw new DomainError("Financial reconciliation is required before allocation settlement.",409);
 const lines=await quoteLines(c,[a.quote_id]);
 for(const charge of a.proposal.charges.filter((i:any)=>i.policy.policy.context==='CONSIGNED')){
  const line=lines.find(l=>l.line_id===charge.lineId);
  if(!line||line.private_financial_snapshot.category!=='CONSIGNED'||!line.offer_id||!line.private_financial_snapshot.cosignerId||!line.private_financial_snapshot.vehicleId)throw new DomainError("The saved vehicle ownership terms require review.",409);
 }
 const required=lines.filter(l=>l.private_financial_snapshot.category==='CONSIGNED'&&[...a.proposal.charges,...a.proposal.credits].some((i:any)=>i.lineId===l.line_id));
 const offers=[...new Set(required.map(l=>l.offer_id))];
 for(const offerId of offers){
  const source=required.find(l=>l.offer_id===offerId)!,ownerId=source.private_financial_snapshot.cosignerId;
  if(source.private_financial_snapshot.category!=='CONSIGNED'||!ownerId||!source.private_financial_snapshot.vehicleId)throw new DomainError("The saved vehicle ownership terms require review.",409);
  if(required.some(l=>l.offer_id===offerId&&(l.private_financial_snapshot.cosignerId!==ownerId||l.private_financial_snapshot.vehicleId!==source.private_financial_snapshot.vehicleId)))throw new DomainError("Saved vehicle ownership is inconsistent.",409);
  const owner={id:ownerId,role:'COSIGNER' as const},ctx=await ownerContext(c,owner,offerId);
  const p=packet(ctx,a,lines),d=(await c.query("SELECT actor_id,decision,digest FROM booking_owner_allocation_decision WHERE assessment_id=$1 AND offer_id=$2",[assessmentId,offerId])).rows[0];
  if(a.actor_id===ownerId||!d||d.decision!=='ACCEPT'||d.actor_id!==ownerId||d.digest!==p.digest)throw new DomainError("Every applicable vehicle owner must accept this exact allocation before settlement.",409);
 }
}
