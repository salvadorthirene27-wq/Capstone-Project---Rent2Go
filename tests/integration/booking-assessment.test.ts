import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {db} from "../../src/lib/db";
import {approvedAgency} from "../helpers/agency";
import {cancellationFixture} from "../helpers/cancellation-fixture";
import type {Actor} from "../../src/modules/partners/workflow";
import {getCancellation,changeCancellation} from "../../src/modules/bookings/cancellation";
import {getAssessments,changeAssessment} from "../../src/modules/bookings/assessment";
import {getRefunds,changeRefund} from "../../src/modules/bookings/refund";
const operator:Actor={id:randomUUID(),role:"RENTER"},renter:Actor={id:randomUUID(),role:"RENTER"},admin:Actor={id:randomUUID(),role:"SUPER_ADMIN"},foreign:Actor={id:randomUUID(),role:"RENTER"};
let agency:string,build:ReturnType<typeof cancellationFixture>;
beforeAll(async()=>{
 for(const a of [operator,renter,admin,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic assessment participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{extraChargePolicies:[{type:"CANCELLATION",context:"AGENCY_OWNED",explanation:"Explicit synthetic cancellation allocation; renter must accept each proposed amount.",shares:{cosigner:0,agency:8000,platform:1000,maintenance:1000}}]});
 for(const a of [renter,operator])await db.query("INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)",[randomUUID(),a.id]);
 build=cancellationFixture(agency,operator,renter);
},60000);
afterAll(()=>db.end());
async function fixture(){const f=await build({future:true});let s=await getCancellation(renter,f.id);s=await changeCancellation(renter,f.id,{action:"REQUEST_CANCELLATION",version:s.requestVersion,idempotencyKey:randomUUID(),reason:"Synthetic cancelled trip"});await changeCancellation(operator,f.id,{action:"REVIEW_CANCELLATION",version:s.requestVersion,idempotencyKey:randomUUID(),cancellationId:s.pending!.id,digest:s.pending!.digest,decision:"APPROVE",reason:"Synthetic independent cancellation review"});return f;}
async function propose(f:{id:string;lineId:string},amount=5000){const s=await getAssessments(operator,f.id);return changeAssessment(operator,f.id,{action:"PROPOSE_ASSESSMENT",version:s.requestVersion,idempotencyKey:randomUUID(),reason:"Explicit proposed cancellation amount; no money moves",credits:[],charges:amount?[{id:randomUUID(),lineId:f.lineId,amountCentavos:amount,type:"CANCELLATION",reason:"Synthetic item under reviewed cancellation terms"}]:[]});}
const exact=(s:any)=>({assessmentId:s.current.id,digest:s.current.digest});
const decision=(s:any,value="ACCEPT")=>({action:"DECIDE_ASSESSMENT",version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),decision:value,reason:value==="DISPUTE"?"Amount requires correction":"Exact synthetic financial terms accepted",consent:value==="ACCEPT"});
it("preserves exact reviewed terms, obtains renter-only acceptance once and never completes service or pays money",async()=>{
 const f=await fixture();let s=await propose(f);expect(s.current!.body.proposal.obligationCentavos).toBe(5000);expect(s.current!.body.funds.refundDueCentavos).toBe(25000);expect(s.current!.body.proposal.charges[0].policy.revision).toBe(1);
 for(const a of [admin,foreign])await expect(getAssessments(a,f.id)).rejects.toMatchObject({status:404});
 await expect(changeAssessment(operator,f.id,decision(s))).rejects.toMatchObject({status:403});
 const cmd=decision(s);s=await changeAssessment(renter,f.id,cmd);expect(s.current!.decision).toBe("ACCEPT");expect(s.effective!.digest).toBe(s.current!.digest);expect((await changeAssessment(renter,f.id,cmd)).requestVersion).toBe(s.requestVersion);
 await expect(changeAssessment(renter,f.id,{...cmd,reason:"Changed retry"})).rejects.toMatchObject({status:409});
 expect(s.status).toBe("CANCELLED_RECONCILIATION_PENDING");expect((await db.query("SELECT sum(amount_centavos)::text n FROM booking_payment_collection WHERE request_id=$1",[f.id])).rows[0].n).toBe("30000");expect((await db.query("SELECT count(*) n FROM booking_refund_payment WHERE request_id=$1",[f.id])).rows[0].n).toBe("0");
 await expect(db.query("UPDATE booking_assessment SET reason='changed' WHERE request_id=$1",[f.id])).rejects.toThrow();await expect(db.query("DELETE FROM booking_assessment_decision WHERE request_id=$1",[f.id])).rejects.toThrow();
},120000);
it("keeps a disputed version immutable and independently issues a corrected revision",async()=>{
 const f=await fixture();let s=await propose(f),old=s.current!.digest;
 await expect(propose(f)).rejects.toMatchObject({status:409});s=await changeAssessment(renter,f.id,decision(s,"DISPUTE"));expect(s.current!.decision).toBe("DISPUTE");s=await propose(f,3000);expect(s.current!.revision).toBe(2);expect(s.history.find(h=>h.revision===1)!.digest).toBe(old);expect(s.effective).toBeNull();
 await expect(changeAssessment(renter,f.id,{...decision(s),digest:old})).rejects.toMatchObject({status:409});
},120000);
it("rejects stale consent after financial facts change, even when the renter reloads the new booking version",async()=>{
 const f=await fixture();await propose(f);let r=await getRefunds(renter,f.id);await changeRefund(renter,f.id,{action:"REQUEST_REFUND",version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos:1000,reason:"Synthetic changed financial facts"});
 const s=await getAssessments(renter,f.id);expect(s.current!.stale).toBe(true);expect(s.current!.canAccept).toBe(false);await expect(changeAssessment(renter,f.id,decision(s))).rejects.toMatchObject({status:409});
 const withdrawn=await changeAssessment(operator,f.id,{action:"WITHDRAW_ASSESSMENT",version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),reason:"Refresh changed financial facts"});expect(withdrawn.current!.decision).toBe("WITHDRAW");expect((await propose(f)).current!.stale).toBe(false);
},120000);
it("protects accepted retained charges when reviewing later source-bounded refunds",async()=>{
 const f=await fixture();let s=await propose(f);await changeAssessment(renter,f.id,decision(s));let r=await getRefunds(renter,f.id);
 const request=async(amountCentavos:number)=>{r=await getRefunds(renter,f.id);return changeRefund(renter,f.id,{action:"REQUEST_REFUND",version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos,reason:"Synthetic refund capacity review"});};
 const approve=async(r:any,item:any)=>changeRefund(operator,f.id,{action:"REVIEW_REFUND",version:r.requestVersion,idempotencyKey:randomUUID(),refundId:item.id,digest:item.digest,decision:"APPROVE",reason:"Synthetic original source and accepted obligation review"});
 r=await request(30000);await expect(approve(r,r.open[0])).rejects.toMatchObject({status:409});r=await request(25000);const target=r.open.find(x=>x.amountCentavos===25000)!;r=await approve(r,target);expect(r.sources[0].capacity.reservedCentavos).toBe(25000);
 r=await request(1000);await expect(approve(r,r.open.find(x=>x.amountCentavos===1000)!)).rejects.toMatchObject({status:409});
},120000);
it("does not let active, unreturned or self-operated bookings bypass assessment prerequisites",async()=>{
 const active=await build({future:true});expect((await getAssessments(operator,active.id)).canPropose).toBe(false);await expect(propose(active)).rejects.toMatchObject({status:409});
 const self=await cancellationFixture(agency,operator,operator)({future:true}),s=await getAssessments(operator,self.id);expect(s.isOperator).toBe(false);await expect(changeAssessment(operator,self.id,{action:"PROPOSE_ASSESSMENT",version:s.requestVersion,idempotencyKey:randomUUID(),reason:"Self review attempt",credits:[],charges:[]})).rejects.toMatchObject({status:403});
},120000);
it("serializes duplicate commands and runs through the actual restricted runtime role",async()=>{
 const f=await fixture(),s=await getAssessments(operator,f.id),cmd={action:"PROPOSE_ASSESSMENT",version:s.requestVersion,idempotencyKey:randomUUID(),reason:"Synthetic exact concurrent retry",credits:[],charges:[]};
 const results=await Promise.all([changeAssessment(operator,f.id,cmd),changeAssessment(operator,f.id,cmd)]);expect(results[0].current!.id).toBe(results[1].current!.id);expect((await db.query("SELECT count(*) n FROM booking_assessment WHERE request_id=$1",[f.id])).rows[0].n).toBe("1");
 const p=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),c=await p.connect(),release=c.release.bind(c),releaseSpy=vi.spyOn(c,"release").mockImplementation(()=>{}),connect=vi.spyOn(db as unknown as {connect:()=>Promise<typeof c>},"connect").mockResolvedValue(c);
 try{expect((await c.query("SELECT current_user u")).rows[0].u).toBe("rent2go_app");const live=await getAssessments(operator,f.id),result=await changeAssessment(operator,f.id,{action:"WITHDRAW_ASSESSMENT",version:live.requestVersion,idempotencyKey:randomUUID(),...exact(live),reason:"Synthetic restricted-role workflow"});expect(result.current!.decision).toBe("WITHDRAW");await expect(c.query("UPDATE booking_assessment SET reason=reason WHERE request_id=$1",[f.id])).rejects.toMatchObject({code:"42501"});}finally{connect.mockRestore();releaseSpy.mockRestore();release();await p.end();}
},120000);
it("refuses acceptance while previously approved refunds over-reserve the new retained obligation",async()=>{
 const f=await fixture();let r=await getRefunds(renter,f.id);r=await changeRefund(renter,f.id,{action:"REQUEST_REFUND",version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos:30000,reason:"Synthetic initial full refund proposal"});const item=r.open[0];await changeRefund(operator,f.id,{action:"REVIEW_REFUND",version:r.requestVersion,idempotencyKey:randomUUID(),refundId:item.id,digest:item.digest,decision:"APPROVE",reason:"Synthetic reviewed source capacity"});
 const s=await propose(f);expect(s.current!.body.funds.overReservedCentavos).toBe(5000);expect(s.current!.canAccept).toBe(false);await expect(changeAssessment(renter,f.id,decision(s))).rejects.toMatchObject({status:409});
},120000);
