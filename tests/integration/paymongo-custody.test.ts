import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,it,expect,vi} from 'vitest';
import {Pool} from 'pg';
import {db,transaction} from '../../src/lib/db';
import {gatewayAgency,gatewayBooking} from '../helpers/gateway';
import {processCheckout} from '../../src/modules/gateway/checkout-lifecycle';
import {postCheckoutPayment} from '../../src/modules/gateway/booking-posting';
import {getCentralCustody} from '../../src/modules/gateway/custody';
import {getOwnerAccount,getOwnerAccounts,changeOwnerAccount} from '../../src/modules/accounting/owner-accounts';
import {getRemittanceAccount} from '../../src/modules/accounting/remittances';
import {getReport} from '../../src/modules/reports/service';
import type {Actor} from '../../src/modules/partners/workflow';
let context:Awaited<ReturnType<typeof gatewayAgency>>;
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Use isolated database.');
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_custodyfixture123456');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');vi.stubEnv('APP_ORIGIN','http://localhost:3100');context=await gatewayAgency();
},60000);
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function paid(fee=500){
 const f=await gatewayBooking(context),x=(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[f.checkoutId])).rows[0],provider='cs_'+f.checkoutId.replaceAll('-','');
 const full={id:provider,type:'checkout_session',attributes:{livemode:false,status:'active',reference_number:f.checkoutId,checkout_url:'https://checkout.paymongo.com/'+provider,metadata:{rent2go_checkout:f.checkoutId},line_items:x.payload.data.attributes.line_items,payments:[{id:'pay_'+f.checkoutId.replaceAll('-',''),attributes:{amount:10000,fee,net_amount:10000-fee,currency:'PHP',status:'paid',livemode:false,source:{type:'card'},billing:{email:'PRIVATE-CUSTODY-DATA'}}}]}};
 await processCheckout(f.checkoutId,{transport:vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{id:provider,type:'checkout_session',attributes:{livemode:false,checkout_url:full.attributes.checkout_url}}})).mockResolvedValueOnce(Response.json({data:full}))});await postCheckoutPayment(f.checkoutId);return f;
}
// Explicit immutable accounting fixture, not a claim to exercise the entire
// renter/owner settlement acceptance workflow (covered by settlement tests).
async function close(f:Awaited<ReturnType<typeof paid>>){
 const owner:Actor={id:randomUUID(),role:'COSIGNER'},vehicle=randomUUID(),assessment=randomUUID(),settlement=randomUUID(),closeId=randomUUID(),hash='a'.repeat(64),line=(await db.query('SELECT id FROM booking_request_line WHERE request_id=$1',[f.id])).rows[0].id;
 await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic central owner','COSIGNER')",[owner.id,owner.id+'@example.test']);
 await db.query("INSERT INTO physical_vehicle(id,ownership,owner_actor_id,registration_normalized)VALUES($1,'CONSIGNED',$2,$3)",[vehicle,owner.id,randomUUID().replaceAll('-','').slice(0,12).toUpperCase()]);
 await transaction(async c=>{
 await c.query('INSERT INTO booking_quotation_line(quote_id,request_id,line_id,public_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5)',[f.q,f.id,line,{title:'Synthetic accepted car service',startAt:'2038-01-01T00:00:00Z',endAt:'2038-01-02T00:00:00Z'},{category:'CONSIGNED',vehicleId:vehicle,cosignerId:owner.id,shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]);
 await c.query("INSERT INTO booking_assessment(id,request_id,quote_id,revision,environment,actor_id,reason,body,digest)VALUES($1,$2,$3,1,'DEMO',$4,'Synthetic accepted accounting basis','{}',$5)",[assessment,f.id,f.q,context.operator.id,hash]);
 await c.query("INSERT INTO booking_settlement(id,request_id,quote_id,assessment_id,revision,environment,actor_id,reason,body,digest)VALUES($1,$2,$3,$4,1,'DEMO',$5,'Synthetic exact ledger fixture','{}',$6)",[settlement,f.id,f.q,assessment,context.operator.id,hash]);
 await c.query("INSERT INTO booking_financial_close(id,request_id,quote_id,settlement_id,agency_id,environment,actor_id,outcome,total_centavos,body,digest)VALUES($1,$2,$3,$4,$5,'DEMO',$6,'DELIVERED',10000,'{}',$7)",[closeId,f.id,f.q,settlement,context.agency,context.operator.id,hash]);
 for(const [recipient,bps] of [['COSIGNER',7000],['AGENCY',1000],['PLATFORM',1000],['MAINTENANCE',1000]] as const)await c.query("INSERT INTO booking_revenue_entry(id,close_id,request_id,quote_id,line_id,agency_id,environment,source_kind,source_id,recipient,beneficiary_actor_id,vehicle_id,basis_centavos,bps,amount_centavos,policy_snapshot)VALUES($1,$2,$3,$4,$5,$6,'DEMO','SERVICE',$5,$7,$8,$9,10000,$10::integer,$10::bigint,'{}')",[randomUUID(),closeId,f.id,f.q,line,context.agency,recipient,recipient==='COSIGNER'?owner.id:null,vehicle,bps]);
 });
 return {owner,scope:{agencyId:context.agency,ownerId:owner.id,environment:'DEMO' as const}};
}
it('keeps verified gross, fees and net distinct before closing without implying a bank settlement or transfer',async()=>{
 const f=await paid(),s=await getCentralCustody(context.operator,f.id);expect(s).toMatchObject({available:true,verifiedGrossCentavos:10000,providerFeesCentavos:500,providerNetReceiptsCentavos:9500,financiallyClosed:false,position:null,canDisburse:false,bankSettlementVerified:false});expect(s.receipts).toHaveLength(1);expect(s.receipts[0].postingOutcome).toBe('COLLECTED');expect(JSON.stringify(s)).not.toMatch(/PRIVATE-CUSTODY-DATA|merchant_fingerprint|checkout_url|billing/);
},60000);
it('loads accepted closed allocations and deducts provider fees solely from the agency share',async()=>{
 const f=await paid();await close(f);vi.stubEnv('PAYMONGO_ENABLED','false');try{const s=await getCentralCustody(context.reviewer,f.id);expect(s.position).toMatchObject({originalAllocations:{cosigner:7000,agency:1000,platform:1000,maintenance:1000},agencyNetShareCentavos:500,combinedAgencyEntitlementCentavos:8500,heldPlatformCommissionCentavos:1000,retainedDepositCentavos:0,platformRemittanceDueCentavos:0,alreadyDisbursedCentavos:0});expect(s.canDisburse).toBe(false);}finally{vi.stubEnv('PAYMONGO_ENABLED','true');}
},60000);
it('preserves owner and maintenance allocations when provider fees exceed the agency portion',async()=>{
 const f=await paid(1500);await close(f);const s=await getCentralCustody(context.operator,f.id);expect(s.position).toMatchObject({agencyNetShareCentavos:0,agencyFeeShortfallCentavos:500,additionalAgencyFundingNeededCentavos:500,availableForDisbursementCentavos:0,originalAllocations:{cosigner:7000,maintenance:1000,platform:1000,agency:1000}});
},60000);
it('shows centrally held owner earnings in account, directory and reports but blocks withdrawal and duplicate commission remittance',async()=>{
 const f=await paid(),{owner,scope}=await close(f),s=await getOwnerAccount(owner,scope);expect(s.balances).toMatchObject({earnedCentavos:7000,centrallyHeldCentavos:7000,availableCentavos:0,recoveryCentavos:0});expect(s.canRequest).toBe(false);
 const directory=await getOwnerAccounts(owner,{environment:'DEMO'});expect(directory.items.find(i=>i.ownerId===owner.id)?.balances).toMatchObject({centrallyHeldCentavos:7000,availableCentavos:0});
 await expect(changeOwnerAccount(owner,scope,{action:'REQUEST_WITHDRAWAL',version:s.requestVersion,idempotencyKey:randomUUID(),amountCentavos:1,method:'DEMO_GCASH',destination:{name:'Synthetic central owner',account:'SAMPLE'},reason:'Should be unavailable until actual agency receipt'})).rejects.toMatchObject({status:409});
 const remittance=await getRemittanceAccount(context.operator,{agencyId:context.agency,environment:'DEMO'});expect(remittance.sources.items).not.toContainEqual(expect.objectContaining({closeId:(await db.query('SELECT id FROM booking_financial_close WHERE request_id=$1',[f.id])).rows[0].id}));expect(remittance.balances).toMatchObject({dueCentavos:0});
 const today=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date::text n")).rows[0].n,report=await getReport(owner,{type:'OWNER'},{environment:'DEMO',from:today,to:today});expect(Object.fromEntries(report.metrics.map(m=>[m.key,m.value]))).toMatchObject({ownerAvailable:0,ownerCentrallyHeld:7000,ownerEarned:7000});
},60000);
it('refuses a spendable projection after a receipt is flagged for independent reconciliation',async()=>{
 const f=await paid();await close(f);await db.query('UPDATE paymongo_checkout_state SET review_required=true WHERE checkout_id=$1',[f.checkoutId]);const s=await getCentralCustody(context.operator,f.id);expect(s.position).toBeNull();expect(s.blockedReason).toMatch(/Reconcile/);expect(s.verifiedGrossCentavos).toBe(10000);
},60000);
it('limits provider fee access to actual agency operators and Super Admins and rechecks suspension/membership',async()=>{
 const f=await paid();for(const a of [context.renter,context.foreign])await expect(getCentralCustody(a,f.id)).rejects.toMatchObject({status:404});
 await db.query('UPDATE agency SET active=false WHERE id=$1',[context.agency]);try{await expect(getCentralCustody(context.operator,f.id)).rejects.toMatchObject({status:404});expect((await getCentralCustody(context.reviewer,f.id)).verifiedGrossCentavos).toBe(10000);}finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[context.agency]);}
 await db.query('UPDATE app_actor SET is_test_fixture=true WHERE id=$1',[context.reviewer.id]);try{await expect(getCentralCustody(context.reviewer,f.id)).rejects.toMatchObject({status:404});}finally{await db.query('UPDATE app_actor SET is_test_fixture=false WHERE id=$1',[context.reviewer.id]);}
},60000);
it('serves the same immutable receipt under restricted runtime privileges without modifying the original ledger',async()=>{
 const f=await paid();await close(f);const before=(await db.query('SELECT * FROM booking_revenue_entry WHERE request_id=$1 ORDER BY id',[f.id])).rows;
 const pool=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),spy=vi.spyOn(db,'connect').mockImplementation(()=>pool.connect() as any);try{expect((await getCentralCustody(context.operator,f.id)).position?.agencyNetShareCentavos).toBe(500);}finally{spy.mockRestore();await pool.end();}
 expect((await db.query('SELECT * FROM booking_revenue_entry WHERE request_id=$1 ORDER BY id',[f.id])).rows).toEqual(before);
},60000);

it('cannot pay or resolve an earlier approval using centrally held funds',async()=>{
 const f=await paid(),{owner,scope}=await close(f),account=randomUUID(),withdrawal=randomUUID(),attempt=randomUUID();
 await db.query('INSERT INTO owner_account(id,agency_id,owner_id,environment)VALUES($1,$2,$3,$4)',[account,scope.agencyId,owner.id,scope.environment]);
 await db.query("INSERT INTO owner_withdrawal(id,account_id,actor_id,amount_centavos,method,destination,reason)VALUES($1,$2,$3,1000,'DEMO_GCASH',$4,'Synthetic prior approval fixture')",[withdrawal,account,owner.id,{name:'Synthetic central owner',account:'SAMPLE'}]);
 await db.query("INSERT INTO owner_withdrawal_decision(id,withdrawal_id,account_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,'APPROVE','Synthetic prior reservation')",[randomUUID(),withdrawal,account,context.operator.id]);
 let state=await getOwnerAccount(context.operator,scope);expect(state.open[0].canPay).toBe(false);expect(state.balances).toMatchObject({centrallyHeldCentavos:7000,reservedCentavos:1000,availableCentavos:0,recoveryCentavos:0});
 await expect(changeOwnerAccount(context.operator,scope,{action:'SIMULATE_PAYOUT',version:state.requestVersion,idempotencyKey:randomUUID(),withdrawalId:withdrawal,outcome:'SUCCEEDED',reason:'Should not debit held funds'})).rejects.toMatchObject({status:409});
 await db.query("INSERT INTO owner_payout_attempt(id,withdrawal_id,account_id,actor_id,initial_outcome,reference,note)VALUES($1,$2,$3,$4,'PENDING',$5,'Synthetic earlier unresolved attempt')",[attempt,withdrawal,account,context.operator.id,randomUUID()]);
 state=await getOwnerAccount(context.operator,scope);expect(state.open[0].attempts[0]).toMatchObject({canResolve:true,canResolveSuccess:false});
 await expect(changeOwnerAccount(context.operator,scope,{action:'RESOLVE_PAYOUT',version:state.requestVersion,idempotencyKey:randomUUID(),withdrawalId:withdrawal,attemptId:attempt,outcome:'SUCCEEDED',reason:'Should not resolve into a false debit'})).rejects.toMatchObject({status:409});
 state=await changeOwnerAccount(context.operator,scope,{action:'RESOLVE_PAYOUT',version:state.requestVersion,idempotencyKey:randomUUID(),withdrawalId:withdrawal,attemptId:attempt,outcome:'FAILED',reason:'Record failure without debiting any earnings'});expect(state.open[0].canRevoke).toBe(true);
 expect((await db.query('SELECT count(*)::int n FROM owner_account_entry WHERE account_id=$1',[account])).rows[0].n).toBe(0);
},60000);

it('prepares a deterministic exact-source statement without approving or releasing the allocation',async()=>{
 const f=await paid();await close(f);const before=(await db.query('SELECT * FROM booking_revenue_entry WHERE request_id=$1 ORDER BY id',[f.id])).rows,s=await getCentralCustody(context.operator,f.id),again=await getCentralCustody(context.reviewer,f.id);expect(s.statement).not.toBeNull();expect(s.statement?.sourceDigest).toBe(again.statement?.sourceDigest);expect(s.statement).toMatchObject({requestId:f.id,agencyId:context.agency,canExecute:false,bankSettlementVerified:false,ownerFundsReleasedCentavos:0});expect(s.statement?.sources.map(e=>e.entryId).sort()).toEqual(before.map(e=>e.id).sort());expect(s.statement?.sources.find(e=>e.recipient==='COSIGNER')?.proposedDisbursementCentavos).toBe(7000);expect(s.statement?.sources.find(e=>e.recipient==='AGENCY')?.agencyFeeCentavos).toBe(500);expect((await db.query('SELECT * FROM booking_revenue_entry WHERE request_id=$1 ORDER BY id',[f.id])).rows).toEqual(before);
},60000);
it('keeps the statement nonexecutable when fees exceed the agency allocation',async()=>{
 const f=await paid(1500);await close(f);const s=await getCentralCustody(context.operator,f.id);expect(s.statement?.position).toMatchObject({agencyFeeShortfallCentavos:500,availableForDisbursementCentavos:0});expect(s.statement?.ownerFundsReleasedCentavos).toBe(0);expect(s.canDisburse).toBe(false);
},60000);
