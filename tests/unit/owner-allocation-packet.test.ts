import {it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {ownerAllocationPacket} from "../../src/modules/bookings/owner-allocation-packet";
import {ownerAllocationCommand} from "../../src/modules/bookings/owner-allocation-schema";
import {calculateAssessmentProposal} from "../../src/modules/bookings/assessment-calculation";
import {digest} from "../../src/modules/cart/pricing";
const lineId=randomUUID(),offerId=randomUUID(),vehicleId=randomUUID(),assessmentId=randomUUID(),shares={cosigner:7000,agency:1000,platform:1000,maintenance:1000};
const policy={applicationId:randomUUID(),revision:1,policy:{type:'CANCELLATION' as const,context:'CONSIGNED' as const,explanation:'Exact agreed cancellation allocation.',shares}};
function fixture(){
 const proposal=calculateAssessmentProposal({lines:[{lineId,title:'Own car',context:'CONSIGNED',delivered:false,serviceCentavos:10000,refundableDepositCentavos:20000}],credits:[],charges:[{id:randomUUID(),lineId,amountCentavos:1000,reason:'Itemized cancellation charge',policy:{...policy,digest:digest(policy)}}]});
 return {ownerId:'owner',offerId,vehicleId,assessmentId,revision:1,agencyName:'Agency',environment:'MANUAL' as const,proposal,lines:[{line_id:lineId,offer_id:offerId,public_snapshot:{title:'Own car',startAt:'2030-01-01T00:00:00Z',endAt:'2030-01-02T00:00:00Z'},private_financial_snapshot:{category:'CONSIGNED',cosignerId:'owner',vehicleId,shares}}]};
}
it('projects only explicit own-vehicle fields without the renter, other services, deposit or request finances',()=>{
 const f=fixture(),privateInput={...f,renter:'PRIVATE RENTER',contact:'PRIVATE CONTACT',funds:'PRIVATE FUNDS',conditions:'PRIVATE EVIDENCE'};
 f.proposal.lines.push({...f.proposal.lines[0],lineId:randomUUID(),title:'PRIVATE OTHER SERVICE'});
 const p=ownerAllocationPacket(privateInput)!;
 expect(p.body.charges[0].policy.shares).toEqual(shares);expect(p.body.lines).toHaveLength(1);
 const json=JSON.stringify(p);for(const text of ['PRIVATE RENTER','PRIVATE CONTACT','PRIVATE FUNDS','PRIVATE EVIDENCE','PRIVATE OTHER SERVICE','quotedDepositCentavos','refundableDepositCentavos','cosignerId'])expect(json).not.toContain(text);
});
it('binds the review digest to the owner, vehicle, exact assessment and allocation',()=>{
 const f=fixture(),p=ownerAllocationPacket(f)!;
 expect(ownerAllocationPacket({...f,assessmentId:randomUUID()})!.digest).not.toBe(p.digest);
 f.proposal.charges[0].amountCentavos++;expect(ownerAllocationPacket(f)!.digest).not.toBe(p.digest);
 expect(ownerAllocationPacket({...f,ownerId:'different-owner'})).toBeNull();
 expect(ownerAllocationPacket({...f,vehicleId:randomUUID()})).toBeNull();
});
it('keeps charge-only packets compatible and separately discloses reductions to owner service earnings',()=>{
 const f=fixture();expect(ownerAllocationPacket(f)!.body).not.toHaveProperty('credits');
 f.proposal=calculateAssessmentProposal({lines:[{lineId,title:'Own car',context:'CONSIGNED',delivered:true,serviceCentavos:10000,refundableDepositCentavos:20000}],credits:[{id:randomUUID(),lineId,amountCentavos:1,reason:'Separately agreed credit'}],charges:[]});
 const packet=ownerAllocationPacket(f)!;expect(packet.body.credits).toHaveLength(1);expect(packet.body.credits![0].amountCentavos).toBe(1);expect(packet.body.charges).toHaveLength(0);
});
it('fails closed for incomplete original owner shares',()=>{
 const f=fixture();f.lines[0].private_financial_snapshot.shares={...shares,cosigner:0};expect(()=>ownerAllocationPacket(f)).toThrow(/total|Cosigner/);
});
it('requires explicit acceptance, a reasoned non-consenting dispute and a strict command shape',()=>{
 const cmd={action:'REVIEW_OWNER_ALLOCATION',assessmentId,version:1,idempotencyKey:randomUUID(),digest:'a'.repeat(64),decision:'ACCEPT',consent:true,reason:''};
 expect(ownerAllocationCommand.safeParse(cmd).success).toBe(true);
 expect(ownerAllocationCommand.safeParse({...cmd,consent:false}).success).toBe(false);
 expect(ownerAllocationCommand.safeParse({...cmd,decision:'DISPUTE',consent:false,reason:'Please correct these percentages.'}).success).toBe(true);
 for(const patch of [{decision:'DISPUTE',consent:true,reason:'Reason'},{decision:'DISPUTE',consent:false,reason:''},{ownerId:'forged'}])expect(ownerAllocationCommand.safeParse({...cmd,...patch}).success).toBe(false);
});
