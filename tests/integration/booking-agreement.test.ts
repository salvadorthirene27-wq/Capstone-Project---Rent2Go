import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import { createVehicleOffer, transitionVehicleOffer } from "../../src/modules/vehicles/service";
import { quoteCartSelection, addToCart, readCart } from "../../src/modules/cart/service";
import { submitBookingRequests } from "../../src/modules/bookings/service";
import { getQuotation, changeQuotation, expireBookingHolds } from "../../src/modules/bookings/quotation";
import { getAgreement, changeAgreement, authorizeAgreementSignature, attachAgreementSignature, bookingSignatureForRead, getAgreementById } from "../../src/modules/bookings/agreement";
import { agreementBody, AGREEMENT_TEMPLATE_VERSION } from "../../src/modules/bookings/agreement-schema";
import type { Actor } from "../../src/modules/partners/workflow";
const operator:Actor={id:randomUUID(),role:"RENTER"},admin:Actor={id:randomUUID(),role:"SUPER_ADMIN"},renter:Actor={id:randomUUID(),role:"RENTER"},foreign:Actor={id:randomUUID(),role:"RENTER"};
let agency:string,car:any,day=1;
beforeAll(async()=>{
 for(const a of [operator,admin,renter,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic renter',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin);
 let v=await createVehicleOffer(operator,{ownership:"AGENCY_OWNED",agencyId:agency,registration:`AG${randomUUID().replaceAll("-","").slice(0,10)}`,facts:{make:"Synthetic",model:"Agreement",year:2024,seats:5,transmission:"AUTOMATIC",fuel:"GASOLINE",bodyType:"SEDAN",description:"Synthetic agreement test car.",features:[],pickupInstructions:"Saved pickup"}});
 for(const purpose of ["OWNERSHIP","PHOTO"])await db.query("INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",[randomUUID(),v.vehicleId,operator.id,purpose,`${v.vehicleId}/${randomUUID()}`]);
 for(const [actor,action] of [[operator,"SUBMIT"],[admin,"APPROVE"],[operator,"PUBLISH"]] as const)v=await transitionVehicleOffer(actor,v.id,{action,version:v.version,revision:v.revision,reason:"Synthetic independent fixture review."});
 car=v;
},60000);
afterAll(()=>db.end());
async function accepted(){
 const date=`2032-09-${String(day++).padStart(2,"0")}`,selection={kind:"RENTAL",offerId:car.id,mode:"SELF_DRIVE",partySize:2,startAt:`${date}T00:00:00Z`,endAt:`${date}T04:00:00Z`};
 const q=await quoteCartSelection(renter,selection);await addToCart(renter,{selection,quoteDigest:q.digest});const cart=await readCart(renter);
 const result=await submitBookingRequests(renter,{idempotencyKey:randomUUID(),cartVersion:cart.version,items:cart.groups.flatMap(g=>g.items).map(i=>({id:i.id,version:i.version,quoteDigest:i.savedQuote.digest})),contact:{name:"Synthetic renter",phone:"+639171234567",notes:"Synthetic agreement tests"}});
 const id=result.requests[0].id;await db.query("UPDATE booking_request SET status='READY_FOR_APPROVAL' WHERE id=$1",[id]);
 let s=await getQuotation(operator,id);s=await changeQuotation(operator,id,{action:"ISSUE_QUOTE",version:s.requestVersion,drivers:[]});
 await changeQuotation(renter,id,{action:"ACCEPT_QUOTE",version:s.requestVersion,quoteId:s.quote!.id,digest:s.quote!.digest});return getAgreement(operator,id);
}
const issue=(s:any)=>changeAgreement(operator,s.requestId,{action:"ISSUE_AGREEMENT",version:s.requestVersion,quoteId:s.acceptedQuote.id,digest:s.acceptedQuote.digest});
const sign=(s:any)=>({version:s.requestVersion,agreementId:s.agreement.id,digest:s.agreement.digest,signerName:"  SYNTHETIC   RENTER ",consent:true as const});
const file=()=>({id:randomUUID(),mime:"image/png",size:9,sha256:"b".repeat(64),backend:"local"});
it("issues from the exact accepted snapshot with DB issuance time and no hold/financial changes",async()=>{
 const s=await accepted(),before=(await db.query("SELECT * FROM booking_hold WHERE request_id=$1",[s.requestId])).rows[0];
 await expect(changeAgreement(operator,s.requestId,{action:"ISSUE_AGREEMENT",version:s.requestVersion,quoteId:s.acceptedQuote!.id,digest:"0".repeat(64)})).rejects.toMatchObject({status:409});
 const issued=await issue(s),q=await getQuotation(renter,s.requestId);
 expect(issued.status).toBe("AGREEMENT_PENDING");expect(issued.agreement!.body.services).toEqual(q.quote!.lines);expect(issued.agreement!.body.policies).toEqual(q.quote!.policies);expect(issued.agreement!.body.totals).toEqual(q.quote!.totals);
 expect(issued.agreement!.expiresAt).toBe(q.quote!.expiresAt);expect(Math.abs(Date.parse(issued.serverNow)-Date.parse(issued.agreement!.issuedAt))).toBeLessThan(2000);
 const savedTerms=(await db.query("SELECT public_snapshot->'platformTerms' AS terms FROM booking_quotation WHERE id=$1",[s.acceptedQuote!.id])).rows[0].terms;
 expect(issued.agreement!.body.platformTerms).toEqual(savedTerms);expect(savedTerms.revision).toBeGreaterThan(0);
 expect((await db.query("SELECT * FROM booking_hold WHERE request_id=$1",[s.requestId])).rows[0]).toEqual(before);
 expect(JSON.stringify(issued)).not.toMatch(/private_contact|agreementTerms|allocationBasis|shares|sha256|backend/);
 await expect(getAgreement(foreign,s.requestId)).rejects.toMatchObject({status:404});await expect(getAgreement(admin,s.requestId)).rejects.toMatchObject({status:404});
});
it("requires renter consent/name and exact version before and after storage and commits immutable signature evidence",async()=>{
 const s=await issue(await accepted()),input=sign(s);
 for(const bad of [{...input,consent:false},{...input,signerName:"Another person"},{...input,version:input.version+1},{...input,digest:"0".repeat(64)}])await expect(authorizeAgreementSignature(renter,s.requestId,bad)).rejects.toThrow();
 await expect(authorizeAgreementSignature(operator,s.requestId,input)).rejects.toMatchObject({status:403});
 await authorizeAgreementSignature(renter,s.requestId,input);const evidence=file(),signed=await attachAgreementSignature(renter,s.requestId,input,evidence);
 expect(signed.status).toBe("AGREEMENT_SIGNED");expect(signed.agreement!.signature!.signerName).toBe("SYNTHETIC   RENTER");expect(signed.agreement!.outcome).toBe("SIGNED");
 expect(await bookingSignatureForRead(renter,evidence.id)).toMatchObject({objectKey:`${s.requestId}/${evidence.id}`,mime:"image/png",backend:"local"});
 await expect(bookingSignatureForRead(foreign,evidence.id)).rejects.toMatchObject({status:404});await expect(bookingSignatureForRead(admin,evidence.id)).rejects.toMatchObject({status:404});
 await expect(attachAgreementSignature(renter,s.requestId,input,file())).rejects.toMatchObject({status:409});
 await expect(changeAgreement(operator,s.requestId,{action:"WITHDRAW_AGREEMENT",version:signed.requestVersion,agreementId:signed.agreement!.id,digest:signed.agreement!.digest,reason:"Cannot erase recorded consent"})).rejects.toMatchObject({status:409});
 for(const table of ["booking_agreement","booking_agreement_signature","booking_agreement_event"]){
  await expect(db.query(`UPDATE ${table} SET id=id WHERE request_id=$1`,[s.requestId])).rejects.toThrow();
  const grants=(await db.query("SELECT has_table_privilege('rent2go_app',$1,'SELECT') AS read,has_table_privilege('rent2go_app',$1,'INSERT') AS append,has_table_privilege('rent2go_app',$1,'UPDATE') AS update,has_table_privilege('rent2go_app',$1,'DELETE') AS delete",[table])).rows[0];expect(grants).toEqual({read:true,append:true,update:false,delete:false});
 }
},60000); // Multiple real network transactions plus append-only grant checks.
it("withdraws pending documents without extending holds and preserves the exact historical print version",async()=>{
 const first=await issue(await accepted()),input=sign(first);
 await authorizeAgreementSignature(renter,first.requestId,input);
 const withdrawn=await changeAgreement(operator,first.requestId,{action:"WITHDRAW_AGREEMENT",version:first.requestVersion,agreementId:first.agreement!.id,digest:first.agreement!.digest,reason:"Correct timing"});
 await expect(attachAgreementSignature(renter,first.requestId,input,file())).rejects.toMatchObject({status:409});
 const second=await issue(withdrawn);expect(second.agreement!.revision).toBe(2);expect(second.agreement!.expiresAt).toBe(first.agreement!.expiresAt);
 const old=await getAgreementById(renter,first.agreement!.id);expect(old.agreement.id).toBe(first.agreement!.id);expect(old.agreement.outcome).toBe("WITHDRAWN");expect(second.history).toHaveLength(2);
 await expect(getAgreementById(foreign,first.agreement!.id)).rejects.toMatchObject({status:404});
},60000); // Full booking/quote/withdraw/reissue flow uses many native database round trips.

it("rechecks current actor and agency after storage without creating signature evidence",async()=>{
 const s=await issue(await accepted()),input=sign(s);await authorizeAgreementSignature(renter,s.requestId,input);
 try{await db.query("UPDATE app_actor SET suspended=true WHERE id=$1",[renter.id]);await expect(attachAgreementSignature(renter,s.requestId,input,file())).rejects.toMatchObject({status:403});}finally{await db.query("UPDATE app_actor SET suspended=false WHERE id=$1",[renter.id]);}
 try{await db.query("UPDATE agency SET active=false WHERE id=$1",[agency]);await expect(attachAgreementSignature(renter,s.requestId,input,file())).rejects.toMatchObject({status:409});}finally{await db.query("UPDATE agency SET active=true WHERE id=$1",[agency]);}
 expect((await db.query("SELECT count(*) FROM booking_agreement_signature WHERE request_id=$1",[s.requestId])).rows[0].count).toBe("0");
});
async function shortHold(status="AGREEMENT_PENDING",milliseconds=4000){
 const requestId=randomUUID(),quoteId=randomUUID(),agreementId=randomUUID(),lineId=randomUUID(),quoteDigest="c".repeat(64),digest="d".repeat(64);
 const now=(await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date,issuedAt=new Date(now.getTime()-3600000),expiresAt=new Date(now.getTime()+milliseconds);
 const snapshot={lines:[{lineId,title:"Synthetic bounded hold",kind:"RENTAL",startAt:"2033-01-01T00:00:00Z",endAt:"2033-01-02T00:00:00Z",partySize:1,serviceCentavos:100,refundableDepositCentavos:200,driverName:null}],totals:{serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},policies:[{lineId,terms:"Accepted synthetic terms",cancellationPolicy:"Saved cancellation",refundPolicy:"Saved refund",damagePolicy:"Saved damage",latePolicy:"Saved late"}]};
 await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Synthetic agency',$4,$5)",[requestId,agency,renter.id,status,{name:"Synthetic renter",phone:"+639171234567",email:"synthetic@example.test",notes:""}]);
 await db.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,$5,$6,$7)",[quoteId,requestId,quoteDigest,operator.id,issuedAt,expiresAt,snapshot]);
 await db.query("INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)",[randomUUID(),requestId,quoteId,expiresAt]);
 await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Synthetic exact acceptance')",[randomUUID(),quoteId,renter.id]);
 if(status==="AGREEMENT_PENDING")await db.query("INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,'{}')",[agreementId,requestId,quoteId,digest,quoteDigest,AGREEMENT_TEMPLATE_VERSION,operator.id,issuedAt,expiresAt,agreementBody("Synthetic agency","Synthetic renter",snapshot)]);
 return {state:await getAgreement(renter,requestId),expiresAt};
}
async function awaitExpiry(expiresAt:Date){await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[expiresAt]);}
it("rejects issue/sign at DB expiry and rechecks expiry after private storage",async()=>{
 const expired=await shortHold("QUOTE_ACCEPTED",-10);expect(expired.state.canIssue).toBe(false);await expect(issue(expired.state)).rejects.toMatchObject({status:409});
 const pending=await shortHold(),input=sign(pending.state);await authorizeAgreementSignature(renter,pending.state.requestId,input);await awaitExpiry(pending.expiresAt);
 expect((await getAgreement(renter,pending.state.requestId)).canSign).toBe(false);await expect(attachAgreementSignature(renter,pending.state.requestId,input,file())).rejects.toMatchObject({status:409});
 expect((await db.query("SELECT count(*) FROM booking_agreement_signature WHERE request_id=$1",[pending.state.requestId])).rows[0].count).toBe("0");
});
it("expires pending and signed holds once while preserving signed historical facts and preventing quote reuse",async()=>{
 for(const signed of [false,true]){
  const f=await shortHold(),input=sign(f.state);if(signed)await attachAgreementSignature(renter,f.state.requestId,input,file());await awaitExpiry(f.expiresAt);
  await expireBookingHolds(100);await expireBookingHolds(100);
  const state=await getAgreement(renter,f.state.requestId);expect(state.status).toBe("HOLD_EXPIRED");expect(state.holdActive).toBe(false);expect(state.agreement!.outcome).toBe(signed?"SIGNED":"EXPIRED");
  expect((await db.query("SELECT count(*) FROM booking_quotation_decision WHERE quote_id=$1 AND action='EXPIRED'",[f.state.acceptedQuote!.id])).rows[0].count).toBe("1");
  // A replacement accepted quotation cannot inherit this agreement/signature.
  const quoteId=randomUUID(),now=(await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  const old=(await db.query("SELECT public_snapshot FROM booking_quotation WHERE id=$1",[f.state.acceptedQuote!.id])).rows[0];
  await db.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,2,$3,$4,$5,$6,$7)",[quoteId,state.requestId,"e".repeat(64),operator.id,now,new Date(now.getTime()+3600000),old.public_snapshot]);
  await db.query("INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)",[randomUUID(),state.requestId,quoteId,new Date(now.getTime()+3600000)]);
  await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Replacement synthetic quotation')",[randomUUID(),quoteId,renter.id]);
  await db.query("UPDATE booking_request SET status='QUOTE_ACCEPTED',version=version+1 WHERE id=$1",[state.requestId]);
  const next=await getAgreement(renter,state.requestId);expect(next.canSign).toBe(false);expect(next.acceptedQuote!.id).toBe(quoteId);expect(next.agreement!.quoteId).not.toBe(quoteId);
  await expect(authorizeAgreementSignature(renter,state.requestId,{...input,version:next.requestVersion})).rejects.toMatchObject({status:409});
 }
},30000);
async function waitForLock(pid:number){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){if((await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount)return;await new Promise(resolve=>setTimeout(resolve,30));}
 throw new Error("Agreement action did not reach its lock barrier.");
}
it("rechecks a renter suspended while signing waits for the agency lock",async()=>{
 const s=await issue(await accepted()),blocker=await db.connect();let pending:Promise<any>|undefined;
 try{
  await blocker.query("BEGIN");await blocker.query("SELECT id FROM agency WHERE id=$1 FOR UPDATE",[agency]);const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
  pending=authorizeAgreementSignature(renter,s.requestId,sign(s)).then(()=>({ok:true}),error=>({ok:false,error}));await waitForLock(pid);
  await db.query("UPDATE app_actor SET suspended=true WHERE id=$1",[renter.id]);await blocker.query("COMMIT");const result=await pending;expect(result.ok).toBe(false);expect(result.error.status).toBe(403);
 }finally{await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;await db.query("UPDATE app_actor SET suspended=false WHERE id=$1",[renter.id]);}
},30000);
it("rechecks membership revoked while issue waits for the agency lock and denies self issuance",async()=>{
 const member:Actor={id:randomUUID(),role:"RENTER"};await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic member','RENTER')",[member.id,`${member.id}@example.test`]);await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,member.id]);
 const s=await accepted(),command={action:"ISSUE_AGREEMENT",version:s.requestVersion,quoteId:s.acceptedQuote!.id,digest:s.acceptedQuote!.digest},blocker=await db.connect();let pending:Promise<any>|undefined;
 try{
  await blocker.query("BEGIN");await blocker.query("SELECT id FROM agency WHERE id=$1 FOR UPDATE",[agency]);const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
  pending=changeAgreement(member,s.requestId,command).then(()=>({ok:true}),error=>({ok:false,error}));await waitForLock(pid);await db.query("UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2",[agency,member.id]);await blocker.query("COMMIT");const result=await pending;expect(result.ok).toBe(false);expect(result.error.status).toBe(403);
 }finally{await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;}
 await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,renter.id]);
 try{await expect(changeAgreement(renter,s.requestId,command)).rejects.toMatchObject({status:403});}finally{await db.query("UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2",[agency,renter.id]);}
},30000);
