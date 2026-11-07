import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {settlementFixture} from '../helpers/settlement-fixture';
import type {Actor} from '../../src/modules/partners/workflow';
import {getSettlement,changeSettlement} from '../../src/modules/bookings/settlement';
import {getClosedCredits,getClosedCredit,changeClosedCredit,changeClosedCreditById} from '../../src/modules/accounting/closed-credits';
import {getOwnerAccount,getOwnerAccounts,getOwnerCredits,changeOwnerAccount} from '../../src/modules/accounting/owner-accounts';
import {getRefunds,changeRefund} from '../../src/modules/bookings/refund';
import {getReport,exportReport} from '../../src/modules/reports/service';
const operator:Actor={id:randomUUID(),role:'RENTER'},renter:Actor={id:randomUUID(),role:'RENTER'},owner:Actor={id:randomUUID(),role:'COSIGNER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'COSIGNER'};
let agency:string,booking:string,creditId:string,payoutId:string;
const scope=()=>({agencyId:agency,ownerId:owner.id,environment:'DEMO' as const});
const exact=(v:{requestVersion:number})=>({version:v.requestVersion,idempotencyKey:randomUUID()});
async function close(fee:number){const h=settlementFixture(agency,operator,renter,owner),f=await h.fixture({demo:true,consigned:true,fee});await h.ownerAccept(f.offerId);await h.plan(f.id);let s=await getSettlement(operator,f.id);if(s.funds?.unreservedRefundDueCentavos){await h.refund(f.id,s.funds.unreservedRefundDueCentavos);s=await getSettlement(operator,f.id);}await changeSettlement(operator,f.id,{action:'CLOSE_FINANCIAL_RECORD',...exact(s),settlementId:s.current!.id,digest:s.current!.digest,reason:'Synthetic closed-credit source'});return f.id;}
beforeAll(async()=>{
 for(const a of [operator,renter,owner,admin,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic credit participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{acceptedMethods:['CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL'],gcashAccountName:'Synthetic receiver',gcashInstructions:'Human receipt review only',extraChargePolicies:[{type:'CANCELLATION',context:'CONSIGNED',explanation:'Explicit original owner consent required.',shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]});
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);booking=await close(30000);
 let a=await getOwnerAccount(owner,scope());a=await changeOwnerAccount(owner,scope(),{action:'REQUEST_WITHDRAWAL',...exact(a),amountCentavos:20000,method:'DEMO_GCASH',destination:{name:'Synthetic owner',account:'SAMPLE'},reason:'Synthetic previously paid earnings'});const id=a.open[0].id;
 a=await changeOwnerAccount(operator,scope(),{action:'REVIEW_WITHDRAWAL',...exact(a),withdrawalId:id,decision:'APPROVE',reason:'Independent synthetic reservation'});
 a=await changeOwnerAccount(operator,scope(),{action:'SIMULATE_PAYOUT',...exact(a),withdrawalId:id,outcome:'SUCCEEDED',reason:'Synthetic payout only; no money moves'});payoutId=a.history[0].payoutId!;
},180000);
afterAll(()=>db.end());
it('requires exact renter then original-owner recovery consent, with minimized role packets and immutable paid history',async()=>{
 const before=(await db.query('SELECT body,digest,amount_centavos FROM owner_payout WHERE id=$1',[payoutId])).rows[0];let s=await getClosedCredits(operator,booking);const source=s.sources.find(s=>s.sourceKind==='EXTRA')!;
 await expect(changeClosedCredit(renter,booking,{action:'PROPOSE_CREDIT',...exact(s),sourceId:source.sourceId,sourceKind:source.sourceKind,amountCentavos:20000,reason:'Synthetic service correction'})).rejects.toMatchObject({status:403});
 const p=await changeClosedCredit(operator,booking,{action:'PROPOSE_CREDIT',...exact(s),sourceId:source.sourceId,sourceKind:source.sourceKind,amountCentavos:20000,reason:'Synthetic accepted post-close correction'});creditId=p.creditId!;
 const packet=await getClosedCredit(owner,creditId);expect(packet.isOwner).toBe(true);expect(packet.requestId).toBeNull();expect(packet.allocations).toBeNull();expect(packet.canDecide).toBe(false);expect(JSON.stringify(packet)).not.toContain(renter.id);expect(packet.terms).toMatchObject({reductionCentavos:14000});
 await expect(getClosedCredit(foreign,creditId)).rejects.toMatchObject({status:404});await expect(getClosedCredits(owner,booking)).rejects.toMatchObject({status:404});
 let d=await getClosedCredit(operator,creditId);await expect(changeClosedCreditById(operator,creditId,{action:'POST_CREDIT',...exact(d),creditId,digest:d.digest,consent:true})).rejects.toMatchObject({status:409});
 d=await getClosedCredit(renter,creditId);await changeClosedCreditById(renter,creditId,{action:'DECIDE_CREDIT',...exact(d),creditId,digest:d.digest,decision:'ACCEPT',consent:true,reason:'Synthetic exact renter acceptance'});
 const current=await getClosedCredit(owner,creditId);expect(current.canDecide).toBe(true);expect(current.digest).not.toBe(d.digest);
 await expect(changeClosedCreditById(owner,creditId,{action:'DECIDE_CREDIT',...exact(current),creditId,digest:d.digest,decision:'ACCEPT',consent:true,reason:'Wrong party digest'})).rejects.toMatchObject({status:409});
 const pool=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),spy=vi.spyOn(db,'connect').mockImplementation(()=>pool.connect() as any);
 try{await changeClosedCreditById(owner,creditId,{action:'DECIDE_CREDIT',...exact(current),creditId,digest:current.digest,decision:'ACCEPT',consent:true,reason:'Explicit future earnings recovery acceptance'});}finally{spy.mockRestore();await pool.end();}
 expect((await getOwnerAccount(owner,scope())).balances).toMatchObject({creditCentavos:0,recoveryCentavos:0,availableCentavos:1000});
 const tx=await db.connect();try{await tx.query('BEGIN');await tx.query('INSERT INTO booking_closed_credit_post(credit_id,actor_id)VALUES($1,$2)',[creditId,operator.id]);await expect(tx.query('COMMIT')).rejects.toThrow('does not conserve');}finally{await tx.query('ROLLBACK');tx.release();}
 d=await getClosedCredit(operator,creditId);const command={action:'POST_CREDIT',...exact(d),creditId,digest:d.digest,consent:true};
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),postSpy=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);
 try{await changeClosedCreditById(operator,creditId,command);expect((await changeClosedCreditById(operator,creditId,command)).alreadyApplied).toBe(true);}finally{postSpy.mockRestore();await runtime.end();}
 const remaining=await getClosedCredits(operator,booking);await expect(changeClosedCredit(operator,booking,{action:'PROPOSE_CREDIT',...exact(remaining),sourceId:source.sourceId,sourceKind:source.sourceKind,amountCentavos:10001,reason:'Cannot exceed the cumulative original source'})).rejects.toMatchObject({status:409});
 const account=await getOwnerAccount(owner,scope());expect(account.balances).toMatchObject({earnedCentavos:21000,creditCentavos:14000,netEarnedCentavos:7000,paidCentavos:20000,availableCentavos:0,recoveryCentavos:13000});
 expect((await getOwnerAccounts(owner,{environment:'DEMO'})).items.find(a=>a.agencyId===agency)?.balances.recoveryCentavos).toBe(13000);
 expect((await db.query('SELECT body,digest,amount_centavos FROM owner_payout WHERE id=$1',[payoutId])).rows[0]).toEqual(before);
 expect((await db.query('SELECT count(*) n,sum(amount_centavos)::text amount FROM booking_revenue_credit WHERE credit_id=$1',[creditId])).rows[0]).toEqual({n:'4',amount:'20000'});
 await expect(db.query('UPDATE booking_revenue_credit SET amount_centavos=0 WHERE credit_id=$1',[creditId])).rejects.toThrow();
},180000);
it('requires a posted credit for closed refunds and independently conserves credit and original-collection capacities',async()=>{
 let s=await getRefunds(renter,booking);expect(s.canRequest).toBe(true);expect(s.credits[0].availableCentavos).toBe(20000);
 const base={action:'REQUEST_REFUND',...exact(s),collectionId:s.sources[0].id,amountCentavos:20000,reason:'Synthetic separately paid credit refund'};
 await expect(changeRefund(renter,booking,base)).rejects.toMatchObject({status:409});await expect(changeRefund(renter,booking,{...base,creditId,amountCentavos:20001})).rejects.toMatchObject({status:409});
 s=await changeRefund(renter,booking,{...base,creditId});const item=s.open[0];expect(item.creditId).toBe(creditId);expect(s.credits).toHaveLength(0);
 await expect(changeRefund(renter,booking,{...base,...exact(s),creditId,amountCentavos:1})).rejects.toMatchObject({status:409});
 s=await changeRefund(operator,booking,{action:'REVIEW_REFUND',...exact(s),refundId:item.id,digest:item.digest,decision:'APPROVE',reason:'Exact accepted credit and collection checked'});
 s=await changeRefund(operator,booking,{action:'SIMULATE_REFUND',...exact(s),refundId:item.id,digest:item.digest,outcome:'APPROVED'});expect(s.history[0].stage).toBe('PAID');expect(s.credits).toHaveLength(0);
 expect((await db.query('SELECT status FROM booking_request WHERE id=$1',[booking])).rows[0].status).toBe('CANCELLED');
 expect((await getOwnerAccount(owner,scope())).balances).toMatchObject({paidCentavos:20000,creditCentavos:14000,recoveryCentavos:13000});
},120000);
it('reports gross earnings, period-dated reductions, cash movements and current recovery separately without private owner data in platform reports',async()=>{
 const today=(await db.query("SELECT (current_timestamp AT TIME ZONE 'Asia/Manila')::date::text d")).rows[0].d,filters={environment:'DEMO',from:today,to:today,record:'CREDITS'};
 const report=await getReport(owner,{type:'OWNER'},filters),metrics=Object.fromEntries(report.metrics.map(m=>[m.key,m.value]));expect(metrics).toMatchObject({ownerEarned:21000,ownerPaid:20000,ownerCredits:14000,ownerRecovery:13000,ownerAvailable:0});expect(report.rows).toHaveLength(1);expect(report.rows[0].values.amount).toBe(14000);
 const csv=await exportReport(owner,{scope:{type:'OWNER'},filters,purpose:'Synthetic accepted recovery reconciliation',acknowledged:true});expect(csv.rowCount).toBe(1);expect(csv.csv).toContain('140.00');
 const platform=await getReport(admin,{type:'PLATFORM'},{environment:'DEMO',from:today,to:today});expect(JSON.stringify(platform)).not.toContain(owner.id);
 await expect(getOwnerCredits(foreign,scope())).rejects.toMatchObject({status:404});expect((await getOwnerCredits(owner,scope())).items[0].stage).toBe('POSTED');
},120000);
it('offsets recovery from later closed earnings before allowing a new withdrawal and does not mix payment environments',async()=>{
 await close(10000);expect((await getOwnerAccount(owner,scope())).balances).toMatchObject({earnedCentavos:28000,paidCentavos:20000,creditCentavos:14000,availableCentavos:0,recoveryCentavos:6000});
 expect((await getOwnerAccount(owner,{...scope(),environment:'MANUAL'})).balances).toMatchObject({earnedCentavos:0,recoveryCentavos:0,availableCentavos:0});
 await close(10000);const a=await getOwnerAccount(owner,scope());expect(a.balances).toMatchObject({earnedCentavos:35000,paidCentavos:20000,creditCentavos:14000,availableCentavos:1000,recoveryCentavos:0});
 await expect(changeOwnerAccount(owner,scope(),{action:'REQUEST_WITHDRAWAL',...exact(a),amountCentavos:1001,method:'DEMO_GCASH',destination:{name:'Synthetic owner',account:'SAMPLE'},reason:'Must not withdraw recovered earnings'})).rejects.toMatchObject({status:409});
},180000);
