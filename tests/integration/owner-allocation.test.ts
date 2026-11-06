import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db,transaction} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {cancellationFixture} from '../helpers/cancellation-fixture';
import type {Actor} from '../../src/modules/partners/workflow';
import {getCancellation,changeCancellation} from '../../src/modules/bookings/cancellation';
import {getAssessments,changeAssessment} from '../../src/modules/bookings/assessment';
import {getOwnerAllocations,reviewOwnerAllocation,assertOwnerAllocationsAccepted} from '../../src/modules/bookings/owner-allocation';
const operator:Actor={id:randomUUID(),role:'RENTER'},renter:Actor={id:randomUUID(),role:'RENTER'},owner:Actor={id:randomUUID(),role:'COSIGNER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'COSIGNER'};
let agency:string,build:ReturnType<typeof cancellationFixture>;
beforeAll(async()=>{
 for(const a of [operator,renter,owner,admin,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic owner-review participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{extraChargePolicies:[{type:'CANCELLATION',context:'CONSIGNED',explanation:'Exact consigned cancellation allocation; individual amount requires renter and owner consent.',shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]});
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);build=cancellationFixture(agency,operator,renter);
},60000);
afterAll(()=>db.end());
async function fixture(proposer=operator,accepted=true){
 const f=await build({future:true,mixed:true,cosigner:owner});let c=await getCancellation(renter,f.id);
 c=await changeCancellation(renter,f.id,{action:'REQUEST_CANCELLATION',version:c.requestVersion,idempotencyKey:randomUUID(),reason:'Synthetic cancellation'});
 await changeCancellation(operator,f.id,{action:'REVIEW_CANCELLATION',version:c.requestVersion,idempotencyKey:randomUUID(),cancellationId:c.pending!.id,digest:c.pending!.digest,decision:'APPROVE',reason:'Independent synthetic cancellation review'});
 const s=await proposal(f,proposer);if(accepted)await accept(s,f.id);return {...f,assessmentId:s.current!.id};
}
async function proposal(f:{id:string;lineId:string},proposer=operator){const s=await getAssessments(proposer,f.id);return changeAssessment(proposer,f.id,{action:'PROPOSE_ASSESSMENT',version:s.requestVersion,idempotencyKey:randomUUID(),reason:'Synthetic allocation proposal',credits:[],charges:[{id:randomUUID(),lineId:f.lineId,amountCentavos:1000,type:'CANCELLATION',reason:'Explicit synthetic fee'}]});}
async function accept(s:any,id:string){return changeAssessment(renter,id,{action:'DECIDE_ASSESSMENT',version:s.requestVersion,idempotencyKey:randomUUID(),assessmentId:s.current.id,digest:s.current.digest,decision:'ACCEPT',consent:true,reason:'Exact renter consent'});}
const command=(i:any,decision='ACCEPT')=>({action:'REVIEW_OWNER_ALLOCATION',version:i.requestVersion,idempotencyKey:randomUUID(),assessmentId:i.assessmentId,digest:i.digest,decision,consent:decision==='ACCEPT',reason:decision==='DISPUTE'?'Correct the allocation percentages.':'Exact synthetic owner allocation consent'});
const gate=(f:{id:string;assessmentId:string})=>transaction(c=>assertOwnerAllocationsAccepted(c,f.id,f.assessmentId));
it('keeps mixed-cart privacy and requires independent exact owner consent without financial side effects',async()=>{
 const f=await fixture(),s=await getOwnerAllocations(owner,f.offerId),i=s.items[0];expect(s.total).toBe(1);expect(i.canAccept).toBe(true);expect(i.packet.lines).toHaveLength(1);expect(i.packet.charges[0].policy.shares.cosigner).toBe(7000);
 const json=JSON.stringify(s);for(const field of ['renter_id','contact','Synthetic tour','private_financial_snapshot','refundableDepositCentavos','conditions','public_snapshot','quoteDigest'])expect(json).not.toContain(field);
 await expect(getAssessments(owner,f.id)).rejects.toMatchObject({status:404});await expect(gate(f)).rejects.toMatchObject({status:409});
 const cmd=command(i),result=await reviewOwnerAllocation(owner,f.offerId,cmd);expect(result.decision).toBe('ACCEPT');expect((await reviewOwnerAllocation(owner,f.offerId,cmd)).digest).toBe(result.digest);await expect(gate(f)).resolves.toBeUndefined();
 expect((await getOwnerAllocations(owner,f.offerId)).total).toBe(0);const history=await getOwnerAllocations(owner,f.offerId,{scope:'HISTORY'});expect(history.items[0].decision).toBe('ACCEPT');
 const agencyView=await getAssessments(operator,f.id);expect(agencyView.ownerAllocationReviews[0].decision).toBe('ACCEPT');expect((await getAssessments(renter,f.id)).ownerAllocationReviews[0].reason).toBeNull();
 expect((await db.query('SELECT status FROM booking_request WHERE id=$1',[f.id])).rows[0].status).toBe('CANCELLED_RECONCILIATION_PENDING');expect((await db.query('SELECT sum(amount_centavos)::text n FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].n).toBe('40000');expect((await db.query('SELECT count(*) n FROM booking_refund_payment WHERE request_id=$1',[f.id])).rows[0].n).toBe('0');
 await expect(db.query("UPDATE booking_owner_allocation_decision SET reason='Changed' WHERE request_id=$1",[f.id])).rejects.toThrow();await expect(db.query('DELETE FROM booking_owner_allocation_command WHERE request_id=$1',[f.id])).rejects.toThrow();
},120000);
it('rejects foreign/renter/platform identities, forged digests, changed retries and stale booking versions',async()=>{
 const f=await fixture(),s=await getOwnerAllocations(owner,f.offerId),cmd=command(s.items[0]);
 for(const a of [operator,renter,admin,foreign]){await expect(getOwnerAllocations(a,f.offerId)).rejects.toMatchObject({status:404});await expect(reviewOwnerAllocation(a,f.offerId,cmd)).rejects.toMatchObject({status:404});}
 await expect(reviewOwnerAllocation(owner,f.offerId,{...cmd,digest:'f'.repeat(64)})).rejects.toMatchObject({status:409});await expect(reviewOwnerAllocation(owner,f.offerId,{...cmd,version:1})).rejects.toMatchObject({status:409});
 await reviewOwnerAllocation(owner,f.offerId,cmd);await expect(reviewOwnerAllocation(owner,f.offerId,{...cmd,reason:'Changed retry content'})).rejects.toMatchObject({status:409});
},120000);
it('withholds owner review until renter acceptance and requires a new owner decision for corrected versions',async()=>{
 const f=await fixture(operator,false);expect((await getOwnerAllocations(owner,f.offerId)).total).toBe(0);await expect(gate(f)).rejects.toMatchObject({status:409});await accept(await getAssessments(renter,f.id),f.id);
 const old=(await getOwnerAllocations(owner,f.offerId)).items[0];await reviewOwnerAllocation(owner,f.offerId,command(old,'DISPUTE'));await expect(gate(f)).rejects.toMatchObject({status:409});
 const pending=await proposal(f);await expect(reviewOwnerAllocation(owner,f.offerId,command(old))).rejects.toMatchObject({status:409});await accept(pending,f.id);const next=(await getOwnerAllocations(owner,f.offerId)).items[0];expect(next.assessmentRevision).toBe(2);expect(next.digest).not.toBe(old.digest);expect(next.decision).toBeNull();await expect(gate({...f,assessmentId:next.assessmentId})).rejects.toMatchObject({status:409});await reviewOwnerAllocation(owner,f.offerId,command(next));await expect(gate({...f,assessmentId:next.assessmentId})).resolves.toBeUndefined();
 const history=await getOwnerAllocations(owner,f.offerId,{scope:'HISTORY'});expect(history.items.find(i=>i.assessmentId===old.assessmentId)!.decision).toBe('DISPUTE');
},120000);
it('serializes concurrent exact retries and writes through the real restricted runtime role',async()=>{
 const f=await fixture(),i=(await getOwnerAllocations(owner,f.offerId)).items[0],cmd=command(i);
 const p=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),connect=vi.spyOn(db,'connect').mockImplementation(()=>p.connect() as any);
 try{const [a,b]=await Promise.all([reviewOwnerAllocation(owner,f.offerId,cmd),reviewOwnerAllocation(owner,f.offerId,cmd)]);expect(a.digest).toBe(b.digest);expect(a.decision).toBe('ACCEPT');expect((await getOwnerAllocations(owner,f.offerId,{scope:'HISTORY'})).total).toBe(1);await expect(p.query('UPDATE booking_owner_allocation_decision SET reason=reason WHERE request_id=$1',[f.id])).rejects.toMatchObject({code:'42501'});await expect(p.query('DELETE FROM booking_owner_allocation_command WHERE request_id=$1',[f.id])).rejects.toMatchObject({code:'42501'});}finally{connect.mockRestore();await p.end();}
 expect((await db.query('SELECT count(*) n FROM booking_owner_allocation_decision WHERE request_id=$1',[f.id])).rows[0].n).toBe('1');
},120000);
it('blocks acceptance for inactive parties and self-issued assessments without preventing a reasoned dispute',async()=>{
 const f=await fixture();await db.query('UPDATE agency SET active=false WHERE id=$1',[agency]);try{const i=(await getOwnerAllocations(owner,f.offerId)).items[0];expect(i.canAccept).toBe(false);await expect(reviewOwnerAllocation(owner,f.offerId,command(i))).rejects.toMatchObject({status:409});}finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[agency]);}
 await db.query("INSERT INTO agency_member(agency_id,actor_id,role,created_by)VALUES($1,$2,'ADMIN',$3)",[agency,owner.id,operator.id]);
 const self=await fixture(owner),i=(await getOwnerAllocations(owner,self.offerId)).items[0];expect(i.canAccept).toBe(false);expect(i.canDispute).toBe(true);await expect(reviewOwnerAllocation(owner,self.offerId,command(i))).rejects.toMatchObject({status:409});await reviewOwnerAllocation(owner,self.offerId,command(i,'DISPUTE'));
 await db.query('UPDATE app_actor SET suspended=true WHERE id=$1',[owner.id]);try{await expect(getOwnerAllocations(owner,f.offerId)).rejects.toMatchObject({status:403});}finally{await db.query('UPDATE app_actor SET suspended=false WHERE id=$1',[owner.id]);}
},120000);
it('keeps older owner decisions accessible across paginated immutable assessment history',async()=>{
 const f=await fixture(),i=(await getOwnerAllocations(owner,f.offerId)).items[0];await reviewOwnerAllocation(owner,f.offerId,command(i,'DISPUTE'));
 for(let revision=2;revision<=22;revision++){const id=randomUUID();await db.query("INSERT INTO booking_assessment(id,request_id,quote_id,revision,environment,actor_id,reason,body,digest) SELECT $1,request_id,quote_id,$2,environment,actor_id,'Synthetic history fixture',body,$3 FROM booking_assessment WHERE id=$4",[id,revision,'a'.repeat(64),f.assessmentId]);await db.query("INSERT INTO booking_assessment_decision(id,assessment_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,'ACCEPT','Synthetic history arrangement')",[randomUUID(),id,f.id,renter.id]);}
 const first=await getOwnerAllocations(owner,f.offerId,{scope:'HISTORY'}),second=await getOwnerAllocations(owner,f.offerId,{scope:'HISTORY',page:2});expect(first.total).toBe(21);expect(first.pageCount).toBe(2);expect(first.items).toHaveLength(20);expect(second.items).toHaveLength(1);expect(second.items[0].decision).toBe('DISPUTE');expect((await getOwnerAllocations(owner,f.offerId)).items[0].assessmentRevision).toBe(22);
},120000);
