import { beforeAll,afterAll,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import { getPayments,changePayment,authorizePaymentEvidence,attachPaymentEvidence,paymentEvidenceForRead,getPaymentReceipt,paymentGcashQrForRead } from "../../src/modules/bookings/payment";
import { agreementBody } from "../../src/modules/bookings/agreement-schema";
import { expireBookingHolds,getQuotation,changeQuotation } from "../../src/modules/bookings/quotation";
import { getAgreement } from "../../src/modules/bookings/agreement";
import type { Actor } from "../../src/modules/partners/workflow";
const operator:Actor={id:randomUUID(),role:"RENTER"},admin:Actor={id:randomUUID(),role:"SUPER_ADMIN"},renter:Actor={id:randomUUID(),role:"RENTER"},foreign:Actor={id:randomUUID(),role:"RENTER"};let agency:string,application:string,revision:number;
beforeAll(async()=>{
 for(const a of [operator,admin,renter,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic payment participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{acceptedMethods:["CASH","GCASH","DEMO_CARD","DEMO_GCASH","DEMO_PAYPAL"],gcashAccountName:"Saved wallet name",gcashInstructions:"Saved receipt review instructions"});const a=(await db.query("SELECT application_id,approved_revision FROM agency WHERE id=$1",[agency])).rows[0];application=a.application_id;revision=a.approved_revision;
 await db.query("INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)",[randomUUID(),renter.id]);
},60000);
afterAll(()=>db.end());
async function fixture(milliseconds=3600000,signed=true){
 const id=randomUUID(),quoteId=randomUUID(),agreementId=randomUUID(),holdId=randomUUID(),lineId=randomUUID(),now=(await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date,expiry=new Date(now.getTime()+milliseconds),issued=new Date(now.getTime()-3600000),digest="a".repeat(64),quoteDigest="b".repeat(64);
 const snapshot={lines:[{lineId,title:"Synthetic payment service",kind:"RENTAL",startAt:"2038-01-01T00:00:00Z",endAt:"2038-01-02T00:00:00Z",partySize:1,serviceCentavos:100,refundableDepositCentavos:200,driverName:null}],totals:{serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},policies:[{lineId,terms:"Saved",cancellationPolicy:"Saved",refundPolicy:"Saved",damagePolicy:"Saved",latePolicy:"Saved"}]};
 await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Saved payment agency',$4,$5)",[id,agency,renter.id,signed?"AGREEMENT_SIGNED":"AGREEMENT_PENDING",{name:"Saved payment renter",phone:"synthetic",email:"synthetic@example.test",notes:""}]);
 // Payment policies are request snapshots, never mutable current agency settings.
 const cartItemId=randomUUID();await db.query("INSERT INTO cart_item(id,cart_id,kind,selection,saved_quote,fingerprint,removed_at)SELECT $1::uuid,id,'RENTAL','{}','{}',$1::text,clock_timestamp() FROM booking_cart WHERE owner_id=$2",[cartItemId,renter.id]);
 await db.query("INSERT INTO booking_request_line(id,request_id,agency_id,cart_item_id,public_quote,policy_snapshot,service_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5,$6,'{}','{}')",[lineId,id,agency,cartItemId,{policyRevision:revision,selection:{kind:"RENTAL",offerId:randomUUID(),mode:"SELF_DRIVE",partySize:1,startAt:"2038-01-01T00:00:00Z",endAt:"2038-01-02T00:00:00Z"}},{acceptedMethods:["CASH","GCASH","DEMO_CARD","DEMO_GCASH","DEMO_PAYPAL"]}]);
 await db.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,$5,$6,$7)",[quoteId,id,quoteDigest,operator.id,issued,expiry,snapshot]);
 await db.query("INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)",[holdId,id,quoteId,expiry]);
 await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Synthetic')",[randomUUID(),quoteId,renter.id]);
 await db.query("INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)VALUES($1,$2,$3,1,$4,$5,'test',$6,$7,$8,$9,'{}')",[agreementId,id,quoteId,digest,quoteDigest,operator.id,issued,expiry,agreementBody("Saved payment agency","Saved payment renter",snapshot)]);
 if(signed)await db.query("INSERT INTO booking_agreement_signature(id,agreement_id,request_id,quote_id,agreement_digest,signer_id,signer_name,consent,signed_at,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,'Saved payment renter',true,$7,'image/png',9,$8,'local')",[randomUUID(),agreementId,id,quoteId,digest,renter.id,issued,"c".repeat(64)]);
 return {id,quoteId,agreementId,holdId,lineId,digest,expiry,state:await getPayments(renter,id)};
}
async function heldStock(f:Awaited<ReturnType<typeof fixture>>){
 const driver=randomUUID(),occupation=randomUUID(),tour=randomUUID(),schedule=randomUUID();
 await db.query("INSERT INTO agency_driver(id,agency_id,name,phone,license_number,license_expiry)VALUES($1::uuid,$2,'Synthetic allocation driver','synthetic',$1::text,'2040-01-01')",[driver,agency]);
 await db.query("INSERT INTO resource(id,agency_id,kind,driver_id)VALUES($1,$2,'DRIVER',$1)",[driver,agency]);
 await db.query("INSERT INTO booking_quotation_line(quote_id,request_id,line_id,public_snapshot,private_financial_snapshot)VALUES($1,$2,$3,'{}','{}')",[f.quoteId,f.id,f.lineId]);
 await db.query("INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by)VALUES($1,$2,'BOOKING','2038-01-01','2038-01-02','Synthetic committed stock fixture',$3)",[occupation,driver,operator.id]);
 await db.query("INSERT INTO booking_hold_resource(hold_id,quote_id,occupation_id,line_id)VALUES($1,$2,$3,$4)",[f.holdId,f.quoteId,occupation,f.lineId]);
 await db.query("INSERT INTO tour_package(id,agency_id,payload)VALUES($1,$2,'{}')",[tour,agency]);
 await db.query("INSERT INTO tour_revision(tour_id,revision,mode,payload,agency_policy_revision,platform_bps,agency_bps,digest,created_by)VALUES($1,1,'GROUP','{\"mode\":\"GROUP\"}',$2,1000,9000,'synthetic',$3)",[tour,revision,operator.id]);
 await db.query("INSERT INTO tour_schedule(id,tour_id,revision,mode,start_at,end_at,cutoff_at,capacity,reserved_units)VALUES($1,$2,1,'GROUP','2038-01-01','2038-01-02','2037-12-31',5,2)",[schedule,tour]);
 await db.query("INSERT INTO booking_hold_seat(hold_id,quote_id,line_id,schedule_id,units)VALUES($1,$2,$3,$4,2)",[f.holdId,f.quoteId,f.lineId,schedule]);
 return {occupation,schedule};
}
const exact=(f:Awaited<ReturnType<typeof fixture>>,state=f.state)=>({version:state.requestVersion,idempotencyKey:randomUUID(),agreementId:f.agreementId,digest:f.digest});
const cash=(f:Awaited<ReturnType<typeof fixture>>,amount=100,state=f.state)=>({...exact(f,state),action:"RECORD_CASH",amountCentavos:amount,reference:`SYNTHETIC-${randomUUID()}`,note:"Agency desk received synthetic funds"});
const evidence=(f:Awaited<ReturnType<typeof fixture>>)=>({...exact(f),amountCentavos:100,reference:`SYNTHETIC-${randomUUID()}`});
const file=()=>({id:randomUUID(),mime:"image/png",size:9,sha256:"d".repeat(64),backend:"local"});
it("rejects unsigned, foreign and self review and preserves empty pre-agreement projection",async()=>{
 const f=await fixture(3600000,false);expect(f.state.canSimulate).toBe(false);await expect(changePayment(operator,f.id,cash(f))).rejects.toMatchObject({status:409});
 await expect(getPayments(foreign,f.id)).rejects.toMatchObject({status:404});await expect(getPayments(admin,f.id)).rejects.toMatchObject({status:404});
 await expect(changePayment(renter,f.id,cash(f))).rejects.toMatchObject({status:403});
});
it("returns only saved GCash instructions/QR to current participants despite newer agency destination",async()=>{
 const f=await fixture(),old=await paymentGcashQrForRead(renter,f.id);expect(f.state.instructions).toEqual({gcashAccountName:"Saved wallet name",gcashInstructions:"Saved receipt review instructions",gcashQrAvailable:true});
 await expect(paymentGcashQrForRead(foreign,f.id)).rejects.toMatchObject({status:404});await expect(paymentGcashQrForRead(admin,f.id)).rejects.toMatchObject({status:404});
 const newRevision=revision+1;await db.query("INSERT INTO partner_revision(application_id,revision,payload)SELECT application_id,$2,payload||$3::jsonb FROM partner_revision WHERE application_id=$1 AND revision=$4",[application,newRevision,{gcashAccountName:"New destination",gcashInstructions:"New instructions",acceptedMethods:["CASH"]},revision]);
 try{await db.query("UPDATE agency SET approved_revision=$2 WHERE id=$1",[agency,newRevision]);const s=await getPayments(renter,f.id);expect(s.methods).toContain("GCASH");expect(s.instructions).toEqual(f.state.instructions);expect(await paymentGcashQrForRead(operator,f.id)).toEqual(old);}finally{await db.query("UPDATE agency SET approved_revision=$2 WHERE id=$1",[agency,revision]);}
});
it("records partial/full/overpayment exactly once, separates deposit and snapshots printable receiver facts",async()=>{
 const f=await fixture(),command=cash(f),s=await changePayment(operator,f.id,command);
 expect(s.status).toBe("PAYMENT_PARTIAL");expect(s.allocationCommitted).toBe(true);expect(s.totals).toMatchObject({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300,confirmedCentavos:100,balanceCentavos:200});
 expect((await changePayment(operator,f.id,command)).collections).toHaveLength(1);
 await expect(changePayment(operator,f.id,{...command,amountCentavos:101})).rejects.toMatchObject({status:409});
 const paid=await changePayment(operator,f.id,cash(f,250,s));expect(paid.status).toBe("READY_FOR_SERVICE");expect(paid.totals).toMatchObject({confirmedCentavos:350,balanceCentavos:0,creditCentavos:50});expect(paid.environment).toBe("MANUAL");
 const receipt=await getPaymentReceipt(renter,paid.collections[0].id);expect(receipt.receipt).toMatchObject({agencyName:"Saved payment agency",renterName:"Saved payment renter",serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300});
 await expect(getPaymentReceipt(foreign,paid.collections[0].id)).rejects.toMatchObject({status:404});
 await expect(changePayment(renter,f.id,{...exact(f,paid),action:"SIMULATE_PAYMENT",method:"DEMO_CARD",outcome:"APPROVED"})).rejects.toMatchObject({status:409});
});
it("stores submitted evidence separately from funds, rejects/replaces it and protects private reads",async()=>{
 const f=await fixture(),command=evidence(f),upload=file();await authorizePaymentEvidence(renter,f.id,command,upload.sha256);
 const attached=await attachPaymentEvidence(renter,f.id,command,upload);expect(attached.usedFile).toBe(true);expect(attached.state.totals.confirmedCentavos).toBe(0);expect(attached.state.allocationCommitted).toBe(false);
 expect((await attachPaymentEvidence(renter,f.id,command,file())).usedFile).toBe(false);
 expect(await paymentEvidenceForRead(operator,upload.id)).toMatchObject({objectKey:`${f.id}/${upload.id}`,mime:"image/png"});await expect(paymentEvidenceForRead(foreign,upload.id)).rejects.toMatchObject({status:404});
 const review={version:attached.state.requestVersion,idempotencyKey:randomUUID(),action:"REVIEW_GCASH",attemptId:attached.state.attempts[0].id,decision:"REJECT",reason:"Synthetic mismatch"};
 await expect(changePayment(renter,f.id,review)).rejects.toMatchObject({status:403});const rejected=await changePayment(operator,f.id,review);expect(rejected.attempts[0].reason).toBe("Synthetic mismatch");expect(rejected.totals.confirmedCentavos).toBe(0);
 const next={...command,version:rejected.requestVersion,idempotencyKey:randomUUID(),reference:`REPLACED-${randomUUID()}`};expect((await attachPaymentEvidence(renter,f.id,next,file())).state.attempts).toHaveLength(2);
});
it("locks demo environment on declined/pending attempts and resolves a pending attempt once without moving money",async()=>{
 const f=await fixture(),input={...exact(f),action:"SIMULATE_PAYMENT",method:"DEMO_PAYPAL",outcome:"PENDING"};const pending=await changePayment(renter,f.id,input);expect(pending.environment).toBe("DEMO");expect(pending.totals.confirmedCentavos).toBe(0);
 await expect(changePayment(operator,f.id,cash(f,100,pending))).rejects.toMatchObject({status:409});
 const resolve={version:pending.requestVersion,idempotencyKey:randomUUID(),action:"RESOLVE_DEMO",attemptId:pending.attempts[0].id,outcome:"APPROVED"};const paid=await changePayment(renter,f.id,resolve);expect(paid.totals.confirmedCentavos).toBe(300);expect(paid.status).toBe("READY_FOR_SERVICE");expect(paid.collections[0].environment).toBe("DEMO");
 expect((await changePayment(renter,f.id,resolve)).collections).toHaveLength(1);await expect(changePayment(renter,f.id,{...resolve,idempotencyKey:randomUUID(),version:paid.requestVersion})).rejects.toMatchObject({status:409});
});
it("committed partial allocations survive original PG deadline while late uncommitted manual confirmations become liabilities",async()=>{
 const f=await fixture(12000),stock=await heldStock(f),partial=await changePayment(operator,f.id,cash(f));await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[f.expiry]);await expireBookingHolds(100);
 const current=await getPayments(renter,f.id);expect(current.holdActive).toBe(true);expect(current.allocationCommitted).toBe(true);expect((await getQuotation(renter,f.id)).quote!.outcome).toBe("ACCEPTED");expect((await getAgreement(renter,f.id)).holdActive).toBe(true);
 expect((await db.query("SELECT cancelled_at FROM resource_occupation WHERE id=$1",[stock.occupation])).rows[0].cancelled_at).toBeNull();expect((await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1",[stock.schedule])).rows[0].reserved_units).toBe(2);
 expect((await changePayment(operator,f.id,cash(f,200,current))).status).toBe("READY_FOR_SERVICE");
 const late=await fixture(12000),attached=await attachPaymentEvidence(renter,late.id,evidence(late),file());await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[late.expiry]);await expireBookingHolds(100);
 const expired=await getPayments(operator,late.id);expect(expired.canReview).toBe(true);expect(expired.holdActive).toBe(false);
 await expect(changeQuotation(operator,late.id,{action:"ISSUE_QUOTE",version:expired.requestVersion,drivers:[]})).rejects.toMatchObject({status:409});
 const liability=await changePayment(operator,late.id,{version:expired.requestVersion,idempotencyKey:randomUUID(),action:"REVIEW_GCASH",attemptId:attached.state.attempts[0].id,decision:"CONFIRM",reason:"Historical transfer verified"});expect(liability.status).toBe("PAYMENT_RECONCILIATION_REQUIRED");expect(liability.requiresReconciliation).toBe(true);expect(liability.allocationCommitted).toBe(false);expect(liability.holdActive).toBe(false);
},60000);
it("serializes concurrent reference confirmation and same-key commands",async()=>{
 const a=await fixture(),b=await fixture(),reference=`DUPLICATE-${randomUUID()}`;
 const results=await Promise.allSettled([changePayment(operator,a.id,{...cash(a),reference}),changePayment(operator,b.id,{...cash(b),reference})]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.find(r=>r.status==="rejected")).toMatchObject({reason:{status:409}});
 const f=await fixture(),command=cash(f);const repeated=await Promise.all([changePayment(operator,f.id,command),changePayment(operator,f.id,command)]);expect(repeated[0].collections).toHaveLength(1);expect(repeated[1].collections).toHaveLength(1);
});
it("releases expired uncommitted stock after late confirmation before worker without erasing liability",async()=>{
 const f=await fixture(12000),stock=await heldStock(f),attached=await attachPaymentEvidence(renter,f.id,evidence(f),file());await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.02)",[f.expiry]);
 const liability=await changePayment(operator,f.id,{version:attached.state.requestVersion,idempotencyKey:randomUUID(),action:"REVIEW_GCASH",attemptId:attached.state.attempts[0].id,decision:"CONFIRM",reason:"Late synthetic transfer verified before worker"});expect(liability.status).toBe("PAYMENT_RECONCILIATION_REQUIRED");
 await expireBookingHolds(100);const after=await getPayments(operator,f.id);expect(after.status).toBe("PAYMENT_RECONCILIATION_REQUIRED");expect(after.allocationCommitted).toBe(false);expect((await db.query("SELECT released_at FROM booking_hold WHERE id=$1",[f.holdId])).rows[0].released_at).not.toBeNull();expect(after.requestVersion).toBeGreaterThan(liability.requestVersion);
 expect((await db.query("SELECT cancelled_at FROM resource_occupation WHERE id=$1",[stock.occupation])).rows[0].cancelled_at).not.toBeNull();expect((await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1",[stock.schedule])).rows[0].reserved_units).toBe(0);
},30000);
it("rechecks suspension/version after storage and grants only immutable appends",async()=>{
 const f=await fixture(),command=evidence(f),upload=file();await authorizePaymentEvidence(renter,f.id,command,upload.sha256);
 try{await db.query("UPDATE app_actor SET suspended=true WHERE id=$1",[renter.id]);await expect(attachPaymentEvidence(renter,f.id,command,upload)).rejects.toMatchObject({status:403});}finally{await db.query("UPDATE app_actor SET suspended=false WHERE id=$1",[renter.id]);}
 await db.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[f.id]);await expect(attachPaymentEvidence(renter,f.id,command,upload)).rejects.toMatchObject({status:409});
 for(const table of ["booking_payment_account","booking_payment_command","booking_payment_attempt","booking_payment_decision","booking_payment_collection","booking_hold_commitment"]){const grants=(await db.query("SELECT has_table_privilege('rent2go_app',$1,'SELECT') AS read,has_table_privilege('rent2go_app',$1,'INSERT') AS append,has_table_privilege('rent2go_app',$1,'UPDATE') AS update,has_table_privilege('rent2go_app',$1,'DELETE') AS delete",[table])).rows[0];expect(grants).toEqual({read:true,append:true,update:false,delete:false});}
});
it("keeps an older unreviewed receipt actionable when twenty newer terminal attempts fill bounded history",async()=>{
 const f=await fixture(),attached=await attachPaymentEvidence(renter,f.id,evidence(f),file()),pending=attached.state.attempts[0],accountId=(await db.query("SELECT account_id FROM booking_payment_attempt WHERE id=$1",[pending.id])).rows[0].account_id;
 await db.query(`WITH data AS MATERIALIZED (SELECT gen_random_uuid() AS attempt_id,gen_random_uuid() AS submit_id,gen_random_uuid() AS review_id,gen_random_uuid() AS file_id,n FROM generate_series(1,20) AS n),
 commands AS (INSERT INTO booking_payment_command(id,request_id,actor_id,idempotency_key,digest,action) SELECT submit_id,$1::uuid,$5::text,submit_id,repeat('a',64),'SUBMIT_GCASH' FROM data UNION ALL SELECT review_id,$1::uuid,$6::text,review_id,repeat('b',64),'REVIEW_GCASH' FROM data RETURNING id),
 attempts AS (INSERT INTO booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id,command_id,actor_id,method,amount_centavos,reference,normalized_reference,initial_outcome,file_id,mime,size_bytes,sha256,backend) SELECT d.attempt_id,$2::uuid,$1::uuid,$3::uuid,$4::uuid,d.submit_id,$5::text,'GCASH',1,'SYNTHETIC-NEWER-'||d.n,'SYNTHETIC-NEWER-'||d.n,'SUBMITTED',d.file_id,'image/png',9,repeat('c',64),'local' FROM data d JOIN commands c ON c.id=d.submit_id RETURNING id)
 INSERT INTO booking_payment_decision(id,attempt_id,account_id,request_id,quote_id,agreement_id,command_id,actor_id,outcome,reason) SELECT gen_random_uuid(),d.attempt_id,$2::uuid,$1::uuid,$3::uuid,$4::uuid,d.review_id,$6::text,'REJECTED','Synthetic newer evidence rejected' FROM data d JOIN attempts t ON t.id=d.attempt_id JOIN commands c ON c.id=d.review_id`,[f.id,accountId,f.quoteId,f.agreementId,renter.id,operator.id]);
 const s=await getPayments(operator,f.id);expect(s.attempts).toHaveLength(20);expect(s.attempts.find(t=>t.id===pending.id)?.outcome).toBe("SUBMITTED");
 const reviewed=await changePayment(operator,f.id,{version:s.requestVersion,idempotencyKey:randomUUID(),action:"REVIEW_GCASH",attemptId:pending.id,decision:"CONFIRM",reason:"Old synthetic receipt verified"});expect(reviewed.totals.confirmedCentavos).toBe(100);
},60000);
async function waitForPaymentLock(pid:number){const deadline=Date.now()+10000;while(Date.now()<deadline){if((await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount)return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error("Payment did not reach its authority lock barrier.");}
it("fails closed when renter suspension changes while payment waits for agency authority",async()=>{
 const f=await fixture(),blocker=await db.connect();let pending:Promise<any>|undefined;
 try{await blocker.query("BEGIN");await blocker.query("SELECT id FROM agency WHERE id=$1 FOR UPDATE",[agency]);const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
  pending=authorizePaymentEvidence(renter,f.id,evidence(f),"d".repeat(64)).then(()=>({ok:true}),error=>({ok:false,error}));await waitForPaymentLock(pid);await db.query("UPDATE app_actor SET suspended=true WHERE id=$1",[renter.id]);await blocker.query("COMMIT");const result=await pending;expect(result.ok).toBe(false);expect(result.error.status).toBe(403);
 }finally{await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;await db.query("UPDATE app_actor SET suspended=false WHERE id=$1",[renter.id]);}
 expect((await getPayments(renter,f.id)).attempts).toHaveLength(0);
},30000);
it("rechecks revoked operator membership under authority locks before cash can be recorded",async()=>{
 const member:Actor={id:randomUUID(),role:"RENTER"};await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic payment member','RENTER')",[member.id,`${member.id}@example.test`]);await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,member.id]);
 const f=await fixture(),blocker=await db.connect();let pending:Promise<any>|undefined;
 try{await blocker.query("BEGIN");await blocker.query("SELECT id FROM agency WHERE id=$1 FOR UPDATE",[agency]);const pid=(await blocker.query("SELECT pg_backend_pid() AS id")).rows[0].id;
  pending=changePayment(member,f.id,cash(f)).then(()=>({ok:true}),error=>({ok:false,error}));await waitForPaymentLock(pid);await db.query("UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2",[agency,member.id]);await blocker.query("COMMIT");const result=await pending;expect(result.ok).toBe(false);expect(result.error.status).toBe(403);
 }finally{await blocker.query("ROLLBACK");blocker.release();if(pending)await pending;}
 expect((await getPayments(renter,f.id)).collections).toHaveLength(0);
},30000);
it("executes payment mutations with the restricted append-only runtime role",async()=>{
 const runtimeUrl=process.env.TEST_RUNTIME_DATABASE_URL;if(!runtimeUrl)throw new Error("TEST_RUNTIME_DATABASE_URL is required for restricted runtime payment verification.");
 try{const target=new URL(runtimeUrl);if(!["postgres:","postgresql:"].includes(target.protocol)||decodeURIComponent(target.pathname)!=="/rent2go_test"||decodeURIComponent(target.username)!=="rent2go_app")throw new Error("Unexpected runtime test target.");}catch{throw new Error("Restricted payment verification requires rent2go_app on rent2go_test.");}
 const manual=await fixture(),demo=await fixture(),runtime=new Pool({connectionString:runtimeUrl,max:1,connectionTimeoutMillis:10000}),client=await runtime.connect(),release=client.release.bind(client);let connectSpy:ReturnType<typeof vi.spyOn>|undefined,releaseSpy:ReturnType<typeof vi.spyOn>|undefined;
 try{
  const privileges=(await client.query("SELECT current_database() AS database,current_user AS role,has_any_column_privilege(current_user,'booking_quotation','UPDATE') AS quote_update,has_any_column_privilege(current_user,'booking_payment_account','UPDATE') AS account_update,has_any_column_privilege(current_user,'booking_payment_attempt','UPDATE') AS attempt_update")).rows[0];expect(privileges).toEqual({database:"rent2go_test",role:"rent2go_app",quote_update:false,account_update:false,attempt_update:false});
  releaseSpy=vi.spyOn(client,"release").mockImplementation(()=>{});connectSpy=vi.spyOn(db as unknown as {connect:()=>Promise<typeof client>},"connect").mockResolvedValue(client);
  await expect(changePayment(operator,manual.id,{...cash(manual),digest:"f".repeat(64)})).rejects.toMatchObject({status:409});
  const cashCommand=cash(manual),partial=await changePayment(operator,manual.id,cashCommand);expect(partial.status).toBe("PAYMENT_PARTIAL");expect((await changePayment(operator,manual.id,cashCommand)).collections).toHaveLength(1);
  const command={...evidence(manual),version:partial.requestVersion,amountCentavos:200},upload=file();await authorizePaymentEvidence(renter,manual.id,command,upload.sha256);const attached=await attachPaymentEvidence(renter,manual.id,command,upload);
  const paid=await changePayment(operator,manual.id,{version:attached.state.requestVersion,idempotencyKey:randomUUID(),action:"REVIEW_GCASH",attemptId:attached.state.attempts.find(t=>t.outcome==="SUBMITTED")!.id,decision:"CONFIRM",reason:"Synthetic restricted runtime review"});expect(paid.status).toBe("READY_FOR_SERVICE");
  const pending=await changePayment(renter,demo.id,{...exact(demo),action:"SIMULATE_PAYMENT",method:"DEMO_CARD",outcome:"PENDING"});const resolved=await changePayment(renter,demo.id,{version:pending.requestVersion,idempotencyKey:randomUUID(),action:"RESOLVE_DEMO",attemptId:pending.attempts[0].id,outcome:"APPROVED"});expect(resolved.status).toBe("READY_FOR_SERVICE");
 }finally{connectSpy?.mockRestore();releaseSpy?.mockRestore();release();await runtime.end();}
},240000); // Covers all mutation paths over real restricted network transactions.
