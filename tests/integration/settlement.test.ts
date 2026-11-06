import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {settlementFixture} from '../helpers/settlement-fixture';
import type {Actor} from '../../src/modules/partners/workflow';
import {getSettlement,changeSettlement} from '../../src/modules/bookings/settlement';
import {getSettlementPayments,changeSettlementPayment,attachBalanceEvidence} from '../../src/modules/bookings/settlement-payment';
import {getPayments,changePayment,getPaymentReceipt} from '../../src/modules/bookings/payment';
import {getRefunds,changeRefund} from '../../src/modules/bookings/refund';
import {getAssessments,changeAssessment} from '../../src/modules/bookings/assessment';
import {authorizeInspectionUpload} from '../../src/modules/bookings/fulfillment';
const operator:Actor={id:randomUUID(),role:'RENTER'},renter:Actor={id:randomUUID(),role:'RENTER'},owner:Actor={id:randomUUID(),role:'COSIGNER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'RENTER'};
let agency:string,helpers:ReturnType<typeof settlementFixture>;
beforeAll(async()=>{
 for(const a of [operator,renter,owner,admin,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic settlement participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{acceptedMethods:['CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL'],gcashAccountName:'Synthetic receiver',gcashInstructions:'Synthetic reference and manual verification only.',extraChargePolicies:[{type:'CANCELLATION',context:'AGENCY_OWNED',explanation:'Cancellation amount requires exact consent.',shares:{cosigner:0,agency:8000,platform:1000,maintenance:1000}},{type:'CANCELLATION',context:'CONSIGNED',explanation:'Original owner must separately accept the allocation.',shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]});
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);helpers=settlementFixture(agency,operator,renter,owner);
},60000);
afterAll(()=>db.end());
const exact=(s:any)=>({settlementId:s.current.id,digest:s.current.digest});
async function close(id:string){const s=await getSettlement(operator,id);return changeSettlement(operator,id,{action:'CLOSE_FINANCIAL_RECORD',version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),reason:'Exact reconciled funds and allocation review'});}
it('requires separate settlement consent and actual refund execution, conserves allocations and preserves cancellation',async()=>{
 const f=await helpers.fixture({demo:true,fee:1000});let s=await helpers.plan(f.id,false);expect(s.current!.terms.refundDueCentavos).toBe(29000);expect((await getSettlement(renter,f.id)).current!.allocations).toBeUndefined();
 for(const a of [owner,admin,foreign])await expect(getSettlement(a,f.id)).rejects.toMatchObject({status:404});
 await expect(close(f.id)).rejects.toMatchObject({status:409});await expect(changeSettlement(operator,f.id,{action:'DECIDE_SETTLEMENT',version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),decision:'ACCEPT',consent:true,reason:''})).rejects.toMatchObject({status:403});
 s=await changeSettlement(renter,f.id,{action:'DECIDE_SETTLEMENT',version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),decision:'ACCEPT',consent:true,reason:'Exact disposition consent'});await expect(close(f.id)).rejects.toMatchObject({status:409});
 await helpers.refund(f.id,29000);s=await close(f.id);expect(s.status).toBe('CANCELLED');expect(s.close!.outcome).toBe('CANCELLED');expect(s.close!.totalCentavos).toBe(1000);
 const rows=(await db.query('SELECT recipient,bps,amount_centavos FROM booking_revenue_entry WHERE request_id=$1',[f.id])).rows;expect(rows).toHaveLength(4);expect(rows.reduce((n,e)=>n+Number(e.amount_centavos),0)).toBe(1000);expect(rows.find(e=>e.recipient==='AGENCY')!.amount_centavos).toBe('800');
 expect((await db.query('SELECT sum(amount_centavos)::text n FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].n).toBe('30000');
 await expect(db.query('DELETE FROM booking_revenue_entry WHERE request_id=$1',[f.id])).rejects.toThrow();await expect(changeRefund(renter,f.id,{action:'REQUEST_REFUND',version:s.requestVersion,idempotencyKey:randomUUID(),collectionId:(await getRefunds(renter,f.id)).sources[0].id,amountCentavos:1,reason:'Cannot silently alter closed accounting'})).rejects.toMatchObject({status:409});
},120000);
it('records a manual additional balance separately, rejects duplicate references and closes once through the restricted runtime role',async()=>{
 const f=await helpers.fixture({unpaid:true,fee:1000});const plan=await helpers.plan(f.id),p=await getSettlementPayments(operator,f.id);expect(p.balanceCentavos).toBe(999);const original=await getPayments(operator,f.id),reference=(await getRefunds(renter,f.id)).sources[0].reference;
 const cmd={action:'RECORD_CASH',version:p.requestVersion,idempotencyKey:randomUUID(),settlementId:plan.current!.id,digest:plan.current!.digest,amountCentavos:999,reference,note:'Synthetic received cash'};
 await expect(changeSettlementPayment(operator,f.id,cmd)).rejects.toMatchObject({status:409});const paid=await changeSettlementPayment(operator,f.id,{...cmd,reference:randomUUID()});expect(paid.balanceCentavos).toBe(0);expect((await getPayments(operator,f.id)).totals.confirmedCentavos).toBe(original.totals.confirmedCentavos);const receipt=await getPaymentReceipt(renter,paid.history[0].collectionId!);expect(receipt.receipt.settlement!.id).toBe(plan.current!.id);
 const s=await getSettlement(operator,f.id),closeCmd={action:'CLOSE_FINANCIAL_RECORD',version:s.requestVersion,idempotencyKey:randomUUID(),...exact(s),reason:'Restricted-role concurrent close'};
 const pool=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2});expect((await pool.query('SELECT current_user n')).rows[0].n).toBe('rent2go_app');const spy=vi.spyOn(db,'connect').mockImplementation(()=>pool.connect() as any);
 try{const result=await Promise.all([changeSettlement(operator,f.id,closeCmd),changeSettlement(operator,f.id,closeCmd)]);expect(result[0].close!.id).toBe(result[1].close!.id);await expect(pool.query('UPDATE booking_financial_close SET body=body WHERE request_id=$1',[f.id])).rejects.toMatchObject({code:'42501'});}finally{spy.mockRestore();await pool.end();}
 expect((await db.query('SELECT count(*) n FROM booking_financial_close WHERE request_id=$1',[f.id])).rows[0].n).toBe('1');const historical=await getSettlementPayments(renter,f.id);expect(historical.balanceCentavos).toBe(0);expect(historical.canSubmitGcash).toBe(false);expect(historical.history[0].collectionId).toBe(receipt.receipt.id);
},120000);
it('preserves stale manual balance evidence as a reconciliation liability instead of dropping received funds or reclaiming stock',async()=>{
 const f=await helpers.fixture({unpaid:true,fee:1000}),s=await helpers.plan(f.id),p=await getSettlementPayments(renter,f.id),file={id:randomUUID(),mime:'image/png',size:9,sha256:'c'.repeat(64),backend:'local'};
 const uploaded=await attachBalanceEvidence(renter,f.id,{version:p.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,amountCentavos:1000,reference:randomUUID()},file),attempt=uploaded.state.open[0];
 await expect(changePayment(operator,f.id,{action:'REVIEW_GCASH',version:uploaded.state.requestVersion,idempotencyKey:randomUUID(),attemptId:attempt.id,decision:'CONFIRM',reason:'Wrong workflow'})).rejects.toMatchObject({status:409});
 const a=await getAssessments(operator,f.id);await changeAssessment(operator,f.id,{action:'PROPOSE_ASSESSMENT',version:a.requestVersion,idempotencyKey:randomUUID(),reason:'A corrected assessment needs review',credits:[],charges:[]});
 const current=await getSettlementPayments(operator,f.id),reviewed=await changeSettlementPayment(operator,f.id,{action:'REVIEW_GCASH',version:current.requestVersion,idempotencyKey:randomUUID(),attemptId:attempt.id,decision:'CONFIRM',reason:'Synthetic actual receipt verified despite changed terms'});expect(reviewed.balanceCentavos).toBeNull();expect((await db.query('SELECT amount_centavos,requires_reconciliation FROM booking_payment_collection WHERE attempt_id=$1',[attempt.id])).rows[0]).toMatchObject({amount_centavos:'1000',requires_reconciliation:true});
 expect((await db.query('SELECT release_reason FROM booking_hold WHERE request_id=$1',[f.id])).rows[0].release_reason).toBe('CANCELLED');expect((await getSettlement(operator,f.id)).canClose).toBe(false);
},120000);
it('returns additional-payment overpayment as credit before allowing final closing',async()=>{
 const f=await helpers.fixture({unpaid:true,fee:1000}),s=await helpers.plan(f.id),p=await getSettlementPayments(renter,f.id),upload=await attachBalanceEvidence(renter,f.id,{version:p.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,amountCentavos:1000,reference:randomUUID()},{id:randomUUID(),mime:'image/png',size:9,sha256:'d'.repeat(64),backend:'local'});
 await changeSettlementPayment(operator,f.id,{action:'REVIEW_GCASH',version:upload.state.requestVersion,idempotencyKey:randomUUID(),attemptId:upload.state.open[0].id,decision:'CONFIRM',reason:'Synthetic overpayment retained as refundable credit'});
 expect((await getSettlement(operator,f.id)).funds!.refundDueCentavos).toBe(1);await expect(close(f.id)).rejects.toMatchObject({status:409});await helpers.refund(f.id,1,false);expect((await close(f.id)).close!.totalCentavos).toBe(1000);
},120000);
it('requires Cosigner consent for service credits and posts only net earned revenue after a real fulfillment path',async()=>{
 const f=await helpers.fixture({demo:true,delivered:true,consigned:true,credit:1000});expect((await getSettlement(operator,f.id)).canPropose).toBe(false);await expect(helpers.plan(f.id)).rejects.toMatchObject({status:409});await helpers.ownerAccept(f.offerId);const s=await helpers.plan(f.id);expect(s.current!.terms.serviceCentavos).toBe(9000);expect(s.current!.terms.quotedDepositCentavos).toBe(20000);await helpers.refund(f.id,21000);const closed=await close(f.id);expect(closed.status).toBe('COMPLETED');const entries=(await db.query('SELECT recipient,beneficiary_actor_id,amount_centavos FROM booking_revenue_entry WHERE request_id=$1',[f.id])).rows;expect(entries.find(e=>e.recipient==='COSIGNER')).toMatchObject({beneficiary_actor_id:owner.id,amount_centavos:'6300'});await expect(authorizeInspectionUpload(operator,f.id,f.lineId,'POST',closed.requestVersion)).rejects.toMatchObject({status:409});
},120000);
it('keeps disputed settlement terms immutable and rejects acceptance after a new refund changes the source facts',async()=>{
 const f=await helpers.fixture({demo:true,fee:1000}),s=await helpers.plan(f.id,false);let r=await getRefunds(renter,f.id);await changeRefund(renter,f.id,{action:'REQUEST_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos:100,reason:'Changed refund facts'});
 let current=await getSettlement(renter,f.id);expect(current.current!.canAccept).toBe(false);await expect(changeSettlement(renter,f.id,{action:'DECIDE_SETTLEMENT',version:current.requestVersion,idempotencyKey:randomUUID(),...exact(current),decision:'ACCEPT',consent:true,reason:''})).rejects.toMatchObject({status:409});
 current=await changeSettlement(renter,f.id,{action:'DECIDE_SETTLEMENT',version:current.requestVersion,idempotencyKey:randomUUID(),...exact(current),decision:'DISPUTE',consent:false,reason:'Refresh the refund and disposition terms'});expect(current.current!.digest).toBe(s.current!.digest);expect(current.current!.decision).toBe('DISPUTE');await expect(db.query("UPDATE booking_settlement_decision SET decision='ACCEPT' WHERE request_id=$1",[f.id])).rejects.toThrow();
},120000);
it('rejects an unbalanced direct ledger close at commit and never mixes manual and simulated balance collections',async()=>{
 const f=await helpers.fixture({demo:true,unpaid:true,fee:1000}),s=await helpers.plan(f.id);
 await expect(db.query("INSERT INTO booking_financial_close(id,request_id,quote_id,settlement_id,agency_id,environment,actor_id,outcome,total_centavos,body,digest)VALUES($1,$2,$3,$4,$5,'DEMO',$6,'CANCELLED',1000,'{}',$7)",[randomUUID(),f.id,f.quoteId,s.current!.id,agency,operator.id,'e'.repeat(64)])).rejects.toThrow(/conserve/);
 const p=await getSettlementPayments(operator,f.id);await expect(changeSettlementPayment(operator,f.id,{action:'RECORD_CASH',version:p.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,amountCentavos:999,reference:randomUUID(),note:'Wrong environment'})).rejects.toMatchObject({status:409});
 const pending=await changeSettlementPayment(renter,f.id,{action:'SIMULATE_PAYMENT',version:p.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,method:'DEMO_CARD',outcome:'PENDING'});expect((await getSettlement(operator,f.id)).canClose).toBe(false);const paid=await changeSettlementPayment(renter,f.id,{action:'RESOLVE_DEMO',version:pending.requestVersion,idempotencyKey:randomUUID(),attemptId:pending.open[0].id,outcome:'APPROVED'});expect(paid.balanceCentavos).toBe(0);expect((await close(f.id)).close!.totalCentavos).toBe(1000);
},120000);
