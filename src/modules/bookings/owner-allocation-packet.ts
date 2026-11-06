import type {AssessmentBody} from "./assessment";
import {digest} from "../cart/pricing";
import {validateVehicleShares} from "../vehicles/workflow";
import {DomainError} from "../partners/workflow";

export type OwnerAllocationLine={line_id:string;offer_id:string;public_snapshot:{title:string;startAt:string;endAt:string};private_financial_snapshot:{category:string;cosignerId?:string;vehicleId?:string;shares?:unknown}};

/** Explicit allowlist: a Cosigner never receives the renter, mixed-cart totals or evidence. */
export function ownerAllocationPacket(input:{ownerId:string;offerId:string;vehicleId:string;assessmentId:string;revision:number;agencyName:string;environment:"MANUAL"|"DEMO";proposal:AssessmentBody['proposal'];lines:OwnerAllocationLine[]}){
 const own=input.lines.filter(l=>l.offer_id===input.offerId&&l.private_financial_snapshot.category==='CONSIGNED'&&l.private_financial_snapshot.cosignerId===input.ownerId&&l.private_financial_snapshot.vehicleId===input.vehicleId);
 const ownIds=new Set(own.map(l=>l.line_id));
 const charges=input.proposal.charges.filter(i=>ownIds.has(i.lineId));
 if(!charges.length)return null;
 if(charges.some(i=>i.policy.policy.context!=='CONSIGNED'))throw new DomainError("The saved vehicle allocation requires financial review.",409);
 const lines=own.filter(l=>charges.some(i=>i.lineId===l.line_id)).map(l=>{
  const amounts=input.proposal.lines.find(i=>i.lineId===l.line_id);
  if(!amounts)throw new DomainError("The saved vehicle allocation is incomplete.",409);
  return {lineId:l.line_id,title:l.public_snapshot.title,startAt:l.public_snapshot.startAt,endAt:l.public_snapshot.endAt,
   netServiceCentavos:amounts.netServiceCentavos,originalServiceShares:validateVehicleShares('CONSIGNED',l.private_financial_snapshot.shares)};
 });
 const body={assessmentId:input.assessmentId,assessmentRevision:input.revision,agencyName:input.agencyName,environment:input.environment,lines,
  charges:charges.map(i=>({id:i.id,lineId:i.lineId,amountCentavos:i.amountCentavos,reason:i.reason,policy:{applicationId:i.policy.applicationId,revision:i.policy.revision,digest:i.policy.digest,type:i.policy.policy.type,explanation:i.policy.policy.explanation,shares:{cosigner:i.policy.policy.shares.cosigner,agency:i.policy.policy.shares.agency,platform:i.policy.policy.shares.platform,maintenance:i.policy.policy.shares.maintenance}}}))};
 return {body,digest:digest({ownerId:input.ownerId,offerId:input.offerId,vehicleId:input.vehicleId,body})};
}
export type OwnerAllocationPacket=NonNullable<ReturnType<typeof ownerAllocationPacket>>;
