import {createHash,randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {checkoutPayload,payMongoClient,preparedCheckoutPayload,type PayMongoConfig,type PayMongoCheckout} from '../../src/modules/gateway/paymongo';
import {savedCheckoutPayload,matchCheckout,type StoredCheckout} from '../../src/modules/gateway/checkout-lifecycle';
vi.mock('../../src/lib/db',()=>({transaction:vi.fn(),db:{}}));
const config:PayMongoConfig={mode:'test',secretKey:'sk_test_fixture1234567890',webhookSecret:'',methods:['card'],notificationMode:'poll'};
function fixture(){
 const id=randomUUID(),request=randomUUID(),key=randomUUID();
 const payload=checkoutPayload({reference:id,requestId:request,amountCentavos:10000,origin:'http://localhost:3100',methods:['card'],idempotencyKey:key},config);
 const row:StoredCheckout={id,request_id:request,quote_id:randomUUID(),agreement_id:randomUUID(),agency_id:randomUUID(),renter_id:randomUUID(),agreement_digest:'a'.repeat(64),mode:'test',merchant_fingerprint:createHash('sha256').update(config.secretKey).digest('hex'),amount_centavos:'10000',provider_idempotency_key:key,payload};
 return {row,payload};
}
it('replays the saved payload unchanged after current origin/method configuration changes',async()=>{
 const {row,payload}=fixture(),changed={...config,methods:['qrph'] as ['qrph']};
 expect(savedCheckoutPayload(row,changed)).toEqual(payload);
 const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:{id:'cs_fixture',type:'checkout_session',attributes:{livemode:false,checkout_url:'https://checkout.paymongo.com/cs_fixture'}}}));
 await payMongoClient(changed,transport).createPrepared(payload,row.provider_idempotency_key);
 expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toEqual(payload);
 expect(transport.mock.calls[0][1]!.headers).toMatchObject({'Idempotency-Key':row.provider_idempotency_key});
});
it('refuses a different merchant, environment, amount, reference or booking before dispatch',()=>{
 const {row}=fixture();
 for(const changed of [{...row,mode:'live' as const},{...row,amount_centavos:'9999'},{...row,id:randomUUID()},{...row,request_id:randomUUID()}])expect(()=>savedCheckoutPayload(changed,config)).toThrow();
 expect(()=>savedCheckoutPayload(row,{...config,secretKey:'sk_test_othermerchant123456'})).toThrow();
});
it('rejects added contact data, pass-on fees and cross-booking or external return paths',()=>{
 const {payload}=fixture();
 for(const change of [
  (x:any)=>x.data.attributes.billing={email:'private@example.test'},
  (x:any)=>x.data.attributes.pass_on_fees=true,
  (x:any)=>x.data.attributes.cancel_url='https://other.test/cancel',
  (x:any)=>x.data.attributes.success_url='https://example.test/elsewhere',
  (x:any)=>x.data.attributes.metadata.rent2go_checkout=randomUUID(),
 ]){const copy=structuredClone(payload);change(copy);expect(()=>preparedCheckoutPayload(copy)).toThrow();}
});
it('requires all provider identifiers, mode, immutable amount and saved payment method to match',()=>{
 const {row}=fixture(),link={provider_id:'cs_fixture',checkout_url:'https://checkout.paymongo.com/cs_fixture'};
 const value:PayMongoCheckout={id:link.provider_id,mode:'test',status:'active',checkoutUrl:link.checkout_url,reference:row.id,metadata:{rent2go_checkout:row.id},amountCentavos:10000,paid:{id:'pay_fixture',amountCentavos:10000,feeCentavos:500,netCentavos:9500,method:'card'}};
 expect(()=>matchCheckout(row,link,value,config)).not.toThrow();
 for(const patch of [{id:'cs_other'},{reference:randomUUID()},{mode:'live' as const},{amountCentavos:9999},{metadata:{rent2go_checkout:randomUUID()}},{checkoutUrl:'https://checkout.paymongo.com/cs_other'},{paid:{...value.paid!,method:'gcash'}}])expect(()=>matchCheckout(row,link,{...value,...patch},config)).toThrow();
});
