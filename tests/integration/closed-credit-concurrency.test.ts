import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {settlementFixture} from '../helpers/settlement-fixture';
import type {Actor} from '../../src/modules/partners/workflow';
import {getSettlement,changeSettlement} from '../../src/modules/bookings/settlement';
import {getClosedCredits,getClosedCredit,changeClosedCredit,changeClosedCreditById} from '../../src/modules/accounting/closed-credits';
import {getOwnerAccount,changeOwnerAccount} from '../../src/modules/accounting/owner-accounts';
const operator:Actor={id:randomUUID(),role:'RENTER'},renter:Actor={id:randomUUID(),role:'RENTER'},owner:Actor={id:randomUUID(),role:'COSIGNER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'};let agency:string,booking:string,creditId:string;
const scope=()=>({agencyId:agency,ownerId:owner.id,environment:'DEMO' as const}),exact=(v:{requestVersion:number})=>({version:v.requestVersion,idempotencyKey:randomUUID()});
beforeAll(async()=>{
 for(const a of [operator,renter,owner,admin])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic credit race participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(operator,admin,{acceptedMethods:['DEMO_CARD'],extraChargePolicies:[{type:'CANCELLATION',context:'CONSIGNED',explanation:'Original owner consent.',shares:{cosigner:7000,agency:1000,platform:1000,maintenance:1000}}]});await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);
 const h=settlementFixture(agency,operator,renter,owner),f=await h.fixture({demo:true,consigned:true,fee:30000});booking=f.id;await h.ownerAccept(f.offerId);await h.plan(booking);const close=await getSettlement(operator,booking);await changeSettlement(operator,booking,{action:'CLOSE_FINANCIAL_RECORD',...exact(close),settlementId:close.current!.id,digest:close.current!.digest,reason:'Synthetic race source'});
 const s=await getClosedCredits(operator,booking),source=s.sources.find(s=>s.sourceKind==='EXTRA')!;const p=await changeClosedCredit(operator,booking,{action:'PROPOSE_CREDIT',...exact(s),sourceId:source.sourceId,sourceKind:source.sourceKind,amountCentavos:10000,reason:'Synthetic closed-credit race'});creditId=p.creditId!;
 for(const who of [renter,owner]){const v=await getClosedCredit(who,creditId);await changeClosedCreditById(who,creditId,{action:'DECIDE_CREDIT',...exact(v),creditId,digest:v.digest,decision:'ACCEPT',consent:true,reason:'Exact synthetic recovery acceptance'});}
},180000);
afterAll(()=>db.end());
it('serializes credit posting with withdrawal approval so an approved payout cannot be stranded by recovery',async()=>{
 let a=await getOwnerAccount(owner,scope());a=await changeOwnerAccount(owner,scope(),{action:'REQUEST_WITHDRAWAL',...exact(a),amountCentavos:21000,method:'DEMO_GCASH',destination:{name:'Synthetic owner',account:'SAMPLE'},reason:'Synthetic concurrent approval'});const withdrawalId=a.open[0].id,credit=await getClosedCredit(operator,creditId),post={action:'POST_CREDIT',...exact(credit),creditId,digest:credit.digest,consent:true};
 const result=await Promise.allSettled([changeClosedCreditById(operator,creditId,post),changeOwnerAccount(operator,scope(),{action:'REVIEW_WITHDRAWAL',...exact(a),withdrawalId,decision:'APPROVE',reason:'Concurrent synthetic reservation'})]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 a=await getOwnerAccount(operator,scope());if(result[0].status==='rejected'){
  expect(a.balances.reservedCentavos).toBe(21000);await expect(changeClosedCreditById(operator,creditId,post)).rejects.toMatchObject({status:409});
  await changeOwnerAccount(operator,scope(),{action:'REVOKE_APPROVAL',...exact(a),withdrawalId,reason:'Release reservation before accepted recovery'});await changeClosedCreditById(operator,creditId,post);
 }
 const after=await getOwnerAccount(owner,scope());expect(after.balances).toMatchObject({earnedCentavos:21000,creditCentavos:7000,netEarnedCentavos:14000,reservedCentavos:0,paidCentavos:0,availableCentavos:14000,recoveryCentavos:0});
},120000);
