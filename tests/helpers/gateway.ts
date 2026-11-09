import {custodyNotice} from '../../src/modules/gateway/custody-notice';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/lib/db';
import {approvedAgency} from './agency';
import {agreementBody} from '../../src/modules/bookings/agreement-schema';
import {prepareBookingCheckout} from '../../src/modules/gateway/booking-checkout';
import type {Actor} from '../../src/modules/partners/workflow';
export async function gatewayAgency(){
 const renter:Actor={id:randomUUID(),role:'RENTER'},operator:Actor={id:randomUUID(),role:'RENTER'},reviewer:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'RENTER'};
 for(const a of [renter,operator,reviewer,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic gateway lifecycle participant',$3)",[a.id,`${a.id}@example.test`,a.role]);
 const agency=await approvedAgency(operator,reviewer,{acceptedMethods:['PAYMONGO']}),revision=(await db.query('SELECT approved_revision FROM agency WHERE id=$1',[agency])).rows[0].approved_revision;
 await db.query('INSERT INTO booking_cart(id,owner_id)VALUES($1,$2)',[randomUUID(),renter.id]);
 return {renter,operator,reviewer,foreign,agency,revision};
}
export async function gatewayBooking(context:Awaited<ReturnType<typeof gatewayAgency>>,holdMilliseconds=3600000){
 const {renter,operator,agency,revision}=context,id=randomUUID(),q=randomUUID(),g=randomUUID(),hold=randomUUID(),line=randomUUID(),item=randomUUID(),now=(await db.query('SELECT clock_timestamp() n')).rows[0].n as Date,issued=new Date(now.getTime()-3600000),expiry=new Date(now.getTime()+holdMilliseconds),digest='a'.repeat(64),quoteDigest='b'.repeat(64);
 const snapshot={lines:[{lineId:line,title:'Synthetic gateway service',kind:'RENTAL',startAt:'2038-01-01T00:00:00Z',endAt:'2038-01-02T00:00:00Z',partySize:1,serviceCentavos:8000,refundableDepositCentavos:2000,driverName:null}],totals:{serviceCentavos:8000,refundableDepositCentavos:2000,totalCentavos:10000},policies:[{lineId:line,terms:'Saved',cancellationPolicy:'Saved',refundPolicy:'Saved',damagePolicy:'Saved',latePolicy:'Saved'}]};
 await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Synthetic gateway agency','AGREEMENT_SIGNED',$4)",[id,agency,renter.id,{name:'Private synthetic participant',email:'private@example.test',phone:'private',notes:'Do not transmit contacts'}]);
 await db.query("INSERT INTO cart_item(id,cart_id,kind,selection,saved_quote,fingerprint,removed_at)SELECT $1::uuid,id,'RENTAL','{}','{}',$1::text,clock_timestamp() FROM booking_cart WHERE owner_id=$2",[item,renter.id]);
 await db.query("INSERT INTO booking_request_line(id,request_id,agency_id,cart_item_id,public_quote,policy_snapshot,service_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5,$6,'{}','{}')",[line,id,agency,item,{policyRevision:revision},{acceptedMethods:['PAYMONGO']}]);
 await db.query('INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,$5,$6,$7)',[q,id,quoteDigest,operator.id,issued,expiry,snapshot]);
 await db.query('INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)',[hold,id,q,expiry]);
 await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Synthetic')",[randomUUID(),q,renter.id]);
 await db.query("INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)VALUES($1,$2,$3,1,$4,$5,'test',$6,$7,$8,$9,'{}')",[g,id,q,digest,quoteDigest,operator.id,issued,expiry,agreementBody('Synthetic gateway agency','Private synthetic participant',snapshot)]);
 await db.query("INSERT INTO booking_agreement_signature(id,agreement_id,request_id,quote_id,agreement_digest,signer_id,signer_name,consent,signed_at,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,'Private synthetic participant',true,$7,'image/png',9,$8,'local')",[randomUUID(),g,id,q,digest,renter.id,issued,'c'.repeat(64)]);
 const preparation=await prepareBookingCheckout(renter,id,{version:1,idempotencyKey:randomUUID(),agreementId:g,digest,custodyConsent:{revision:custodyNotice.revision,digest:custodyNotice.digest,accepted:true}});
 return {id,q,g,hold,checkoutId:preparation.id};
}
