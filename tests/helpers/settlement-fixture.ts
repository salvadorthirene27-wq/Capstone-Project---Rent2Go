import {randomUUID} from 'node:crypto';
import {getCancellation,changeCancellation} from '../../src/modules/bookings/cancellation';
import {getAssessments,changeAssessment} from '../../src/modules/bookings/assessment';
import {getOwnerAllocations,reviewOwnerAllocation} from '../../src/modules/bookings/owner-allocation';
import {getSettlement,changeSettlement} from '../../src/modules/bookings/settlement';
import {getFulfillment,changeFulfillment,attachInspectionPhoto} from '../../src/modules/bookings/fulfillment';
import {getRefunds,changeRefund,attachRefundEvidence} from '../../src/modules/bookings/refund';
import type {Actor} from '../../src/modules/partners/workflow';
import {cancellationFixture} from './cancellation-fixture';
export function settlementFixture(agency:string,operator:Actor,renter:Actor,owner:Actor){
 const build=cancellationFixture(agency,operator,renter);
 async function fixture(options:{demo?:boolean;unpaid?:boolean;consigned?:boolean;delivered?:boolean;fee?:number;credit?:number;pendingAssessment?:boolean}={}){
  const f=await build({future:!options.delivered,demo:options.demo,unpaid:options.unpaid,cosigner:options.consigned?owner:undefined,acceptedMethods:options.demo?['DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL']:['CASH','GCASH']});
  if(options.delivered){
   let s=await getFulfillment(operator,f.id);const condition={odometerKm:100,fuelEighths:6,cleanliness:'CLEAN',damageNotes:'Synthetic unchanged condition',roadworthy:true,safetyChecked:true};
   for(const phase of ['PRE','POST']){
    const file=randomUUID();s=await attachInspectionPhoto(operator,f.id,f.lineId,phase,s.requestVersion,{id:file,mime:'image/png',size:9,sha256:'a'.repeat(64),backend:'local'});
    s=await changeFulfillment(operator,f.id,{action:'RECORD_INSPECTION',version:s.requestVersion,idempotencyKey:randomUUID(),lineId:f.lineId,phase,condition:{...condition,odometerKm:phase==='PRE'?100:150,photoIds:[file]}});
    const report=phase==='PRE'?s.lines[0].pre:s.lines[0].post;
    s=await changeFulfillment(renter,f.id,{action:'ACK_INSPECTION',version:s.requestVersion,idempotencyKey:randomUUID(),lineId:f.lineId,inspectionId:report!.id,digest:report!.digest,decision:'ACCEPT',reason:''});
    if(phase==='PRE')s=await changeFulfillment(operator,f.id,{action:'RELEASE_RENTAL',version:s.requestVersion,idempotencyKey:randomUUID(),lineId:f.lineId,inspectionId:report!.id,digest:report!.digest});
   }
  }else{let c=await getCancellation(renter,f.id);c=await changeCancellation(renter,f.id,{action:'REQUEST_CANCELLATION',version:c.requestVersion,idempotencyKey:randomUUID(),reason:'Synthetic cancellation'});await changeCancellation(operator,f.id,{action:'REVIEW_CANCELLATION',version:c.requestVersion,idempotencyKey:randomUUID(),cancellationId:c.pending!.id,digest:c.pending!.digest,decision:'APPROVE',reason:'Independent synthetic review'});}
  let a=await getAssessments(operator,f.id);a=await changeAssessment(operator,f.id,{action:'PROPOSE_ASSESSMENT',version:a.requestVersion,idempotencyKey:randomUUID(),reason:'Synthetic itemized settlement basis',credits:options.credit?[{id:randomUUID(),lineId:f.lineId,amountCentavos:options.credit,reason:'Explicit service credit'}]:[],charges:options.fee?[{id:randomUUID(),lineId:f.lineId,amountCentavos:options.fee,type:options.delivered?'DAMAGE':'CANCELLATION',reason:'Explicit accepted charge'}]:[]});
  if(!options.pendingAssessment)a=await changeAssessment(renter,f.id,{action:'DECIDE_ASSESSMENT',version:a.requestVersion,idempotencyKey:randomUUID(),assessmentId:a.current!.id,digest:a.current!.digest,decision:'ACCEPT',consent:true,reason:'Exact synthetic renter consent'});
  return {...f,assessmentId:a.current!.id};
 }
 async function ownerAccept(offerId:string){const s=await getOwnerAllocations(owner,offerId),i=s.items[0];return reviewOwnerAllocation(owner,offerId,{action:'REVIEW_OWNER_ALLOCATION',version:i.requestVersion,idempotencyKey:randomUUID(),assessmentId:i.assessmentId,digest:i.digest,decision:'ACCEPT',consent:true,reason:'Exact synthetic owner consent'});}
 async function plan(id:string,accept=true){let s=await getSettlement(operator,id);s=await changeSettlement(operator,id,{action:'PROPOSE_SETTLEMENT',version:s.requestVersion,idempotencyKey:randomUUID(),reason:'Exact fund application and return of all excess'});if(accept)s=await changeSettlement(renter,id,{action:'DECIDE_SETTLEMENT',version:s.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,decision:'ACCEPT',consent:true,reason:'Exact settlement consent'});return s;}
 async function refund(id:string,amount:number,demo=true){let r=await getRefunds(renter,id);r=await changeRefund(renter,id,{action:'REQUEST_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos:amount,reason:'Return remaining excess under accepted settlement'});const f=r.open[0];r=await changeRefund(operator,id,{action:'REVIEW_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),refundId:f.id,digest:f.digest,decision:'APPROVE',reason:'Original source capacity and accepted obligation reviewed'});
  if(demo)return changeRefund(operator,id,{action:'SIMULATE_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),refundId:f.id,digest:f.digest,outcome:'APPROVED'});
  return (await attachRefundEvidence(operator,id,{action:'RECORD_MANUAL_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),refundId:f.id,digest:f.digest,method:'CASH',reference:randomUUID(),note:'Synthetic manual execution evidence; no real transfer',externalPaid:true},{id:randomUUID(),mime:'image/png',size:9,sha256:'b'.repeat(64),backend:'local'})).state;
 }
 return {fixture,ownerAccept,plan,refund};
}
