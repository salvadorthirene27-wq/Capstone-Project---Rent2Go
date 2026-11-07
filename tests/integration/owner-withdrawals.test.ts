import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {settlementFixture} from '../helpers/settlement-fixture';
import type {Actor} from '../../src/modules/partners/workflow';
import type {AccountScope} from '../../src/modules/accounting/schema';
import {getSettlement,changeSettlement} from '../../src/modules/bookings/settlement';
import {getRefunds,changeRefund,attachRefundEvidence} from '../../src/modules/bookings/refund';
import {getOwnerAccount,getOwnerAccounts,changeOwnerAccount,authorizeOwnerPayout,attachOwnerPayout,getOwnerPayout,ownerPayoutFile} from '../../src/modules/accounting/owner-accounts';
const operator:Actor={id:randomUUID(),role:'RENTER'},renter:Actor={id:randomUUID(),role:'RENTER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'RENTER'};let agency:string;
beforeAll(async()=>{
 for(const a of [operator,renter,admin,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic withdrawal participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{acceptedMethods:['CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL'],gcashAccountName:'Synthetic receiver',gcashInstructions:'Human review only',extraChargePolicies:[{type:'CANCELLATION',context:'CONSIGNED',explanation:'Explicit original owner consent required.',shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]});
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);
},60000);
afterAll(()=>db.end());
async function account(environment:'MANUAL'|'DEMO'='DEMO'){
 const owner:Actor={id:randomUUID(),role:'COSIGNER'};await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic earnings owner','COSIGNER')",[owner.id,`${owner.id}@example.test`]);
 const h=settlementFixture(agency,operator,renter,owner),f=await h.fixture({demo:environment==='DEMO',consigned:true,fee:30000});await h.ownerAccept(f.offerId);await h.plan(f.id);const s=await getSettlement(operator,f.id);await changeSettlement(operator,f.id,{action:'CLOSE_FINANCIAL_RECORD',version:s.requestVersion,idempotencyKey:randomUUID(),settlementId:s.current!.id,digest:s.current!.digest,reason:'Synthetic conserved owner earnings basis'});
 const scope:AccountScope={agencyId:agency,ownerId:owner.id,environment};return {owner,scope,booking:f.id};
}
const exact=(s:{requestVersion:number})=>({version:s.requestVersion,idempotencyKey:randomUUID()});
async function request(f:Awaited<ReturnType<typeof account>>,amount=10000){const s=await getOwnerAccount(f.owner,f.scope);return changeOwnerAccount(f.owner,f.scope,{...exact(s),action:'REQUEST_WITHDRAWAL',amountCentavos:amount,method:f.scope.environment==='DEMO'?'DEMO_GCASH':'CASH',destination:{name:'Synthetic owner',account:f.scope.environment==='DEMO'?'SAMPLE-WALLET':''},reason:'Synthetic withdrawal request, no real transfer'});}
async function approve(f:Awaited<ReturnType<typeof account>>,id:string){const s=await getOwnerAccount(operator,f.scope);return changeOwnerAccount(operator,f.scope,{...exact(s),action:'REVIEW_WITHDRAWAL',withdrawalId:id,decision:'APPROVE',reason:'Independent synthetic earning and destination review'});}
it('shows only closed owner earnings, keeps queued requests unreserved and protects participant privacy',async()=>{
 const f=await account(),s=await request(f,20000);expect(s.balances).toMatchObject({earnedCentavos:21000,requestedCentavos:20000,reservedCentavos:0,paidCentavos:0,availableCentavos:21000});expect(JSON.stringify(s)).not.toContain(renter.id);expect(JSON.stringify(s)).not.toContain('contact');expect(s.ledger).toHaveLength(1);expect(s.ledger[0].amountCentavos).toBe(21000);
 for(const actor of [admin,renter,foreign])await expect(getOwnerAccount(actor,f.scope)).rejects.toMatchObject({status:404});
 await expect(changeOwnerAccount(f.owner,f.scope,{...exact(s),action:'REVIEW_WITHDRAWAL',withdrawalId:s.open[0].id,decision:'APPROVE',reason:'Cannot self-approve'})).rejects.toMatchObject({status:403});
 const rejected=await changeOwnerAccount(operator,f.scope,{...exact(s),action:'REVIEW_WITHDRAWAL',withdrawalId:s.open[0].id,decision:'REJECT',reason:'Correct the synthetic payout destination'});expect(rejected.history[0].stage).toBe('REJECTED');expect(rejected.balances.availableCentavos).toBe(21000);
 const queued=await request(f,4000),withdrawn=await changeOwnerAccount(f.owner,f.scope,{...exact(queued),action:'WITHDRAW_REQUEST',withdrawalId:queued.open[0].id,reason:'Owner withdrew the unreviewed request'});expect(withdrawn.history[0].stage).toBe('WITHDRAWN');expect(withdrawn.balances.requestedCentavos).toBe(0);
 expect((await getOwnerAccounts(f.owner,{environment:'DEMO'})).items.every(i=>i.ownerId===f.owner.id)).toBe(true);await expect(getOwnerAccounts(foreign,{agencyId:agency,environment:'DEMO'})).rejects.toMatchObject({status:403});
},180000);
it('serializes approval capacity, separates reservation from payout and releases revoked approval once',async()=>{
 const f=await account();await request(f,15000);const s=await request(f,15000),commands=s.open.map(w=>({...exact(s),action:'REVIEW_WITHDRAWAL',withdrawalId:w.id,decision:'APPROVE',reason:'Concurrent independent approval'}));
 const result=await Promise.allSettled(commands.map(c=>changeOwnerAccount(operator,f.scope,c)));expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);const current=await getOwnerAccount(operator,f.scope);expect(current.balances).toMatchObject({reservedCentavos:15000,paidCentavos:0,availableCentavos:6000});const remaining=current.open.find(w=>w.stage==='REQUESTED')!;
 await expect(changeOwnerAccount(operator,f.scope,{...exact(current),action:'REVIEW_WITHDRAWAL',withdrawalId:remaining.id,decision:'APPROVE',reason:'Capacity is already reserved'})).rejects.toMatchObject({status:409});
 const cmd={...exact(current),action:'REVOKE_APPROVAL',withdrawalId:current.open.find(w=>w.stage==='APPROVED')!.id,reason:'Release unpaid approval'};const released=await changeOwnerAccount(operator,f.scope,cmd);expect(released.balances).toMatchObject({reservedCentavos:0,paidCentavos:0,availableCentavos:21000});expect((await changeOwnerAccount(operator,f.scope,cmd)).requestVersion).toBe(released.requestVersion);await expect(changeOwnerAccount(operator,f.scope,{...cmd,reason:'Changed retry'})).rejects.toMatchObject({status:409});
},180000);
it('retains reservation through failed/pending simulations and creates exactly one conserved paid debit on success',async()=>{
 const f=await account(),queued=await request(f),id=queued.open[0].id;let s=await approve(f,id);s=await changeOwnerAccount(operator,f.scope,{...exact(s),action:'SIMULATE_PAYOUT',withdrawalId:id,outcome:'FAILED',reason:'Explicit failed simulation'});expect(s.balances.paidCentavos).toBe(0);expect(s.balances.reservedCentavos).toBe(10000);
 s=await changeOwnerAccount(operator,f.scope,{...exact(s),action:'SIMULATE_PAYOUT',withdrawalId:id,outcome:'PENDING',reason:'Explicit pending simulation'});const attempt=s.open[0].attempts.find(t=>t.outcome==='PENDING')!;await expect(changeOwnerAccount(operator,f.scope,{...exact(s),action:'REVOKE_APPROVAL',withdrawalId:id,reason:'Pending payout must be resolved'})).rejects.toMatchObject({status:409});
 const resolve={...exact(s),action:'RESOLVE_PAYOUT',withdrawalId:id,attemptId:attempt.id,outcome:'SUCCEEDED',reason:'Explicit successful simulation; no money moves'};await expect(changeOwnerAccount(f.owner,f.scope,resolve)).rejects.toMatchObject({status:403});s=await changeOwnerAccount(operator,f.scope,resolve);expect(s.balances).toMatchObject({paidCentavos:10000,reservedCentavos:0,availableCentavos:11000});const receipt=await getOwnerPayout(f.owner,s.history[0].payoutId!);expect(receipt.record.environment).toBe('DEMO');expect((await changeOwnerAccount(operator,f.scope,resolve)).history[0].payoutId).toBe(receipt.id);await expect(getOwnerPayout(renter,receipt.id)).rejects.toMatchObject({status:404});
 expect((await db.query('SELECT count(*) n,sum(amount_centavos)::text amount FROM owner_account_entry WHERE account_id=$1',[s.accountId])).rows[0]).toEqual({n:'1',amount:'-10000'});await expect(db.query('UPDATE owner_payout SET body=body WHERE id=$1',[receipt.id])).rejects.toThrow();
},180000);
it('requires actual manual evidence and unique outgoing references, including through the restricted runtime role',async()=>{
 const f=await account('MANUAL'),queued=await request(f,1000),id=queued.open[0].id;let s=await approve(f,id);const cmd={...exact(s),withdrawalId:id,reference:randomUUID(),reason:'Synthetic recorded execution, no actual transfer',externalPaid:true},file={id:randomUUID(),mime:'image/png',size:9,sha256:'e'.repeat(64),backend:'local'};
 const preflight=await authorizeOwnerPayout(operator,f.scope,cmd,file.sha256);expect(preflight.alreadyApplied).toBe(false);expect(preflight.state.balances.paidCentavos).toBe(0);await expect(changeOwnerAccount(operator,f.scope,{...exact(s),action:'SIMULATE_PAYOUT',withdrawalId:id,outcome:'SUCCEEDED',reason:'Wrong environment'})).rejects.toMatchObject({status:409});
 const pool=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),spy=vi.spyOn(db,'connect').mockImplementation(()=>pool.connect() as any);try{const paid=await attachOwnerPayout(operator,f.scope,cmd,file);s=paid.state;expect((await attachOwnerPayout(operator,f.scope,cmd,{...file,id:randomUUID()})).usedFile).toBe(false);await expect(pool.query('UPDATE owner_account SET owner_id=$2 WHERE id=$1',[s.accountId,foreign.id])).rejects.toMatchObject({code:'42501'});}finally{spy.mockRestore();await pool.end();}
 expect(s.balances).toMatchObject({paidCentavos:1000,reservedCentavos:0,availableCentavos:20000});const stored=await ownerPayoutFile(f.owner,file.id);expect(stored.objectKey).toBe(`${s.accountId}/${file.id}`);await expect(ownerPayoutFile(foreign,file.id)).rejects.toMatchObject({status:404});
 const next=await request(f,1000);s=await approve(f,next.open[0].id);await expect(attachOwnerPayout(operator,f.scope,{...cmd,...exact(s),withdrawalId:next.open[0].id},{...file,id:randomUUID()})).rejects.toMatchObject({status:409});expect((await getOwnerAccount(f.owner,f.scope)).balances.paidCentavos).toBe(1000);
 const h=settlementFixture(agency,operator,renter,f.owner),refundable=await h.fixture({demo:false});await h.refund(refundable.id,1,false);
 const originalRefund=(await db.query('SELECT x.normalized_reference FROM booking_refund_reference x JOIN booking_refund_attempt t ON t.id=x.attempt_id WHERE t.request_id=$1',[refundable.id])).rows[0];
 await expect(attachOwnerPayout(operator,f.scope,{...cmd,...exact(s),withdrawalId:next.open[0].id,reference:originalRefund.normalized_reference},{...file,id:randomUUID()})).rejects.toMatchObject({status:409});
 let r=await getRefunds(renter,refundable.id);r=await changeRefund(renter,refundable.id,{action:'REQUEST_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),collectionId:r.sources[0].id,amountCentavos:1,reason:'Synthetic shared-reference check'});const item=r.open[0];r=await changeRefund(operator,refundable.id,{action:'REVIEW_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),refundId:item.id,digest:item.digest,decision:'APPROVE',reason:'Synthetic original-source capacity reviewed'});
 await expect(attachRefundEvidence(operator,refundable.id,{action:'RECORD_MANUAL_REFUND',version:r.requestVersion,idempotencyKey:randomUUID(),refundId:item.id,digest:item.digest,method:'CASH',reference:cmd.reference,note:'Must not count the owner payout transfer again',externalPaid:true},{...file,id:randomUUID()})).rejects.toMatchObject({status:409});
},180000);
it('preserves old requests and permits owner withdrawal while an agency is unavailable',async()=>{
 const f=await account(),s=await request(f);await db.query('UPDATE agency SET active=false WHERE id=$1',[agency]);try{const blocked=await getOwnerAccount(f.owner,f.scope);expect(blocked.canRequest).toBe(false);await expect(changeOwnerAccount(f.owner,f.scope,{...exact(blocked),action:'REQUEST_WITHDRAWAL',amountCentavos:1,method:'DEMO_GCASH',destination:{name:'Owner',account:'SAMPLE'},reason:'Blocked agency'})).rejects.toMatchObject({status:409});const removed=await changeOwnerAccount(f.owner,f.scope,{...exact(blocked),action:'WITHDRAW_REQUEST',withdrawalId:s.open[0].id,reason:'Owner withdraws while agency unavailable'});expect(removed.history[0].stage).toBe('WITHDRAWN');}finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[agency]);}
},180000);
it('rechecks agency membership after a payout waits on authority and leaves its reservation intact',async()=>{
 const f=await account('MANUAL'),queued=await request(f,1000),s=await approve(f,queued.open[0].id),member:Actor={id:randomUUID(),role:'RENTER'};
 await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic independent payer','RENTER')",[member.id,`${member.id}@example.test`]);await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,member.id]);
 const blocker=await db.connect();let pending:Promise<any>|undefined;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM agency WHERE id=$1 FOR UPDATE',[agency]);const pid=(await blocker.query('SELECT pg_backend_pid() n')).rows[0].n;
  pending=attachOwnerPayout(member,f.scope,{...exact(s),withdrawalId:queued.open[0].id,reference:randomUUID(),reason:'Synthetic manual payout request',externalPaid:true},{id:randomUUID(),mime:'image/png',size:9,sha256:'a'.repeat(64),backend:'local'}).then(()=>({ok:true}),error=>({ok:false,error}));
  let blocked=false;for(let n=0;n<100;n++){if((await db.query('SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,30));}expect(blocked).toBe(true);
  await db.query('UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2',[agency,member.id]);await blocker.query('COMMIT');const result=await pending;expect(result.ok).toBe(false);expect(result.error.status).toBe(403);
 }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
 expect((await getOwnerAccount(f.owner,f.scope)).balances).toMatchObject({paidCentavos:0,reservedCentavos:1000});expect((await db.query('SELECT count(*) n FROM owner_payout_attempt WHERE account_id=$1',[s.accountId])).rows[0].n).toBe('0');
},180000);
it('rejects a payout without its exact debit at commit and preserves independently paginated history',async()=>{
 const f=await account(),queued=await request(f,1000),s=await approve(f,queued.open[0].id),attempt=randomUUID(),payout=randomUUID(),c=await db.connect();
 try{
  await c.query('BEGIN');await c.query("INSERT INTO owner_payout_attempt(id,withdrawal_id,account_id,actor_id,initial_outcome,reference,note)VALUES($1,$2,$3,$4,'SUCCEEDED',$5,'Synthetic unbalanced fixture')",[attempt,queued.open[0].id,s.accountId,operator.id,randomUUID()]);
  await c.query("INSERT INTO owner_payout(id,withdrawal_id,account_id,attempt_id,agency_id,environment,method,amount_centavos,reference,normalized_reference,body,digest)VALUES($1,$2,$3,$4,$5,'DEMO','DEMO_GCASH',1000,$6,$6,'{}',$7)",[payout,queued.open[0].id,s.accountId,attempt,agency,randomUUID(),'a'.repeat(64)]);await expect(c.query('COMMIT')).rejects.toThrow('does not conserve');
 }finally{await c.query('ROLLBACK');c.release();}
 expect((await getOwnerAccount(f.owner,f.scope)).balances.paidCentavos).toBe(0);
 await db.query(`WITH w AS (INSERT INTO owner_withdrawal(id,account_id,actor_id,amount_centavos,method,destination,reason) SELECT gen_random_uuid(),$1,$2,1,'DEMO_GCASH','{"name":"Synthetic owner","account":"SAMPLE"}','Synthetic paginated history' FROM generate_series(1,23) RETURNING id,account_id) INSERT INTO owner_withdrawal_decision(id,withdrawal_id,account_id,actor_id,decision,reason) SELECT gen_random_uuid(),id,account_id,$3,'REJECT','Synthetic preserved rejection' FROM w`,[s.accountId,f.owner.id,operator.id]);
 const first=await getOwnerAccount(f.owner,f.scope),second=await getOwnerAccount(f.owner,f.scope,{environment:'DEMO',page:2});expect(first.history).toHaveLength(20);expect(first.pageCount).toBe(2);expect(second.history).toHaveLength(3);expect(first.open).toHaveLength(1);expect(second.open).toHaveLength(1);expect(first.balances).toMatchObject({paidCentavos:0,reservedCentavos:1000,availableCentavos:20000});
},180000);
