import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {agreementBody} from '../../src/modules/bookings/agreement-schema';
import {prepareBookingCheckout} from '../../src/modules/gateway/booking-checkout';
import type {Actor} from '../../src/modules/partners/workflow';
const owner:Actor={id:randomUUID(),role:'RENTER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'},renter:Actor={id:randomUUID(),role:'RENTER'},foreign:Actor={id:randomUUID(),role:'RENTER'};
let agency:string,revision:number;
beforeAll(async()=>{
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_nativefixture123456');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card,gcash');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');vi.stubEnv('APP_ORIGIN','http://localhost:3100');
 for(const a of [owner,admin,renter,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic gateway participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 agency=await approvedAgency(owner,admin,{acceptedMethods:['PAYMONGO']});revision=(await db.query('SELECT approved_revision FROM agency WHERE id=$1',[agency])).rows[0].approved_revision;
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);
},60000);
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function fixture({signed=true,milliseconds=3600000,methods=['PAYMONGO']}:{signed?:boolean;milliseconds?:number;methods?:string[]}={}){
 const id=randomUUID(),q=randomUUID(),g=randomUUID(),h=randomUUID(),line=randomUUID(),cartItem=randomUUID(),now=(await db.query('SELECT clock_timestamp() n')).rows[0].n as Date,issued=new Date(now.getTime()-3600000),expiry=new Date(now.getTime()+milliseconds),digest='a'.repeat(64),quoteDigest='b'.repeat(64);
 const snapshot={lines:[{lineId:line,title:'Synthetic gateway service',kind:'RENTAL',startAt:'2038-01-01T00:00:00Z',endAt:'2038-01-02T00:00:00Z',partySize:1,serviceCentavos:8000,refundableDepositCentavos:2000,driverName:null}],totals:{serviceCentavos:8000,refundableDepositCentavos:2000,totalCentavos:10000},policies:[{lineId:line,terms:'Saved',cancellationPolicy:'Saved',refundPolicy:'Saved',damagePolicy:'Saved',latePolicy:'Saved'}]};
 await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Synthetic gateway agency',$4,$5)",[id,agency,renter.id,signed?'AGREEMENT_SIGNED':'AGREEMENT_PENDING',{name:'Private synthetic renter',email:'private@example.test',phone:'private',notes:'Never send these contacts to checkout'}]);
 await db.query("INSERT INTO cart_item(id,cart_id,kind,selection,saved_quote,fingerprint,removed_at)SELECT $1::uuid,id,'RENTAL','{}','{}',$1::text,clock_timestamp() FROM booking_cart WHERE owner_id=$2",[cartItem,renter.id]);
 await db.query("INSERT INTO booking_request_line(id,request_id,agency_id,cart_item_id,public_quote,policy_snapshot,service_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5,$6,'{}','{}')",[line,id,agency,cartItem,{policyRevision:revision},{acceptedMethods:methods}]);
 await db.query('INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,$5,$6,$7)',[q,id,quoteDigest,owner.id,issued,expiry,snapshot]);
 await db.query('INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)',[h,id,q,expiry]);
 await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Synthetic')",[randomUUID(),q,renter.id]);
 await db.query("INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)VALUES($1,$2,$3,1,$4,$5,'test',$6,$7,$8,$9,'{}')",[g,id,q,digest,quoteDigest,owner.id,issued,expiry,agreementBody('Synthetic gateway agency','Private synthetic renter',snapshot)]);
 if(signed)await db.query("INSERT INTO booking_agreement_signature(id,agreement_id,request_id,quote_id,agreement_digest,signer_id,signer_name,consent,signed_at,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,'Private synthetic renter',true,$7,'image/png',9,$8,'local')",[randomUUID(),g,id,q,digest,renter.id,issued,'c'.repeat(64)]);
 return {id,q,g,h,digest,command:{version:1,idempotencyKey:randomUUID(),agreementId:g,digest}};
}
it('binds an exact signed booking and stores one private retry payload without collecting or committing inventory',async()=>{
 const f=await fixture(),prepared=await prepareBookingCheckout(renter,f.id,f.command);
 expect(prepared).toMatchObject({requestId:f.id,quoteId:f.q,agreementId:f.g,mode:'test',amountCentavos:10000,status:'PREPARED'});
 const saved=(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[prepared.id])).rows[0];
 expect(saved.payload.data.attributes).toMatchObject({reference_number:prepared.id,send_email_receipt:false,pass_on_fees:false,line_items:[{name:'Rent2Go agreed booking balance',amount:10000,currency:'PHP',quantity:1}]});
 expect(JSON.stringify(saved.payload)).not.toContain('private@example.test');expect(JSON.stringify(saved.payload)).not.toContain('Private synthetic renter');
 expect(saved).not.toHaveProperty('secret_key');
 expect((await db.query('SELECT 1 FROM booking_payment_collection WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await db.query('SELECT status,version FROM booking_request WHERE id=$1',[f.id])).rows[0]).toEqual({status:'AGREEMENT_SIGNED',version:1});
},30000);
it('serializes concurrent retries and rejects a second provider preparation or changed command',async()=>{
 const f=await fixture(),[a,b]=await Promise.all([prepareBookingCheckout(renter,f.id,f.command),prepareBookingCheckout(renter,f.id,f.command)]);expect(a.id).toBe(b.id);
 expect((await db.query('SELECT count(*) n FROM paymongo_checkout WHERE request_id=$1',[f.id])).rows[0].n).toBe('1');
 await expect(prepareBookingCheckout(renter,f.id,{...f.command,digest:'d'.repeat(64)})).rejects.toMatchObject({status:409});
 await expect(prepareBookingCheckout(renter,f.id,{...f.command,idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});
},30000);
it('denies foreign and operator initiation, stale/unsigned/expired agreements, and old simulation-only policies',async()=>{
 const f=await fixture();await expect(prepareBookingCheckout(foreign,f.id,f.command)).rejects.toMatchObject({status:404});await expect(prepareBookingCheckout(admin,f.id,f.command)).rejects.toMatchObject({status:404});await expect(prepareBookingCheckout(owner,f.id,f.command)).rejects.toMatchObject({status:403});
 await expect(prepareBookingCheckout(renter,f.id,{...f.command,version:2})).rejects.toMatchObject({status:409});
 for(const options of [{signed:false},{milliseconds:-1000},{methods:['DEMO_CARD']}]){const other=await fixture(options);await expect(prepareBookingCheckout(renter,other.id,other.command)).rejects.toMatchObject({status:409});}
},60000);
it('rechecks current agency access on replay and cannot rewrite an immutable checkout',async()=>{
 const f=await fixture(),p=await prepareBookingCheckout(renter,f.id,f.command);
 await expect(db.query('UPDATE paymongo_checkout SET amount_centavos=9999 WHERE id=$1',[p.id])).rejects.toThrow();
 await db.query('UPDATE agency SET active=false WHERE id=$1',[agency]);
 try{await expect(prepareBookingCheckout(renter,f.id,f.command)).rejects.toMatchObject({status:409});}finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[agency]);}
},30000);
it('uses the restricted runtime with insert-only provider preparation grants',async()=>{
 const f=await fixture(),runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),connect=vi.spyOn(db,'connect').mockImplementation((()=>runtime.connect()) as typeof db.connect);
 try{
  const p=await prepareBookingCheckout(renter,f.id,f.command);expect(p.amountCentavos).toBe(10000);
  expect((await runtime.query('SELECT id FROM paymongo_checkout WHERE id=$1',[p.id])).rowCount).toBe(1);
  await expect(runtime.query('UPDATE paymongo_checkout SET amount_centavos=9999 WHERE id=$1',[p.id])).rejects.toMatchObject({code:'42501'});
 }finally{connect.mockRestore();await runtime.end();}
},30000);
