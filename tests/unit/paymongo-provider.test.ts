import {createHmac,randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {checkoutPayload,checkoutReturnUrl,hostedCheckoutUrl,parseCheckout,parseCreatedCheckout,parsePayMongoNotification,payMongoClient,payMongoConfig,verifyPayMongoSignature,type PayMongoConfig} from '../../src/modules/gateway/paymongo';

const config:PayMongoConfig={mode:'test',secretKey:'sk_test_fixture1234567890',webhookSecret:'fixture-signing-secret',methods:['card','gcash'],notificationMode:'poll'};
const input=()=>({reference:randomUUID(),amountCentavos:12500,requestId:randomUUID(),origin:'http://localhost:3100',methods:['card'] as ['card'],idempotencyKey:randomUUID()});
function session(paid=false):any{return {id:'cs_fixture123',type:'checkout_session',attributes:{livemode:false,status:'active',reference_number:'internal-reference',checkout_url:'https://checkout.paymongo.com/cs_fixture123',metadata:{rent2go_checkout:'internal-reference'},line_items:[{amount:12500,quantity:1,currency:'PHP'}],payments:paid?[{id:'pay_fixture123',attributes:{status:'paid',amount:12500,fee:500,net_amount:12000,currency:'PHP',livemode:false,source:{type:'card'},billing:{email:'not-to-return@example.test'}}}]:[]}};}
const now=1800000000000;
function signed(raw:Uint8Array,mode:'test'|'live'='test',seconds=Math.floor(now/1000)){
 const digest=createHmac('sha256',config.webhookSecret).update(seconds+'.').update(raw).digest('hex');
 return `t=${seconds},te=${mode==='test'?digest:''},li=${mode==='live'?digest:''}`;
}
describe('PayMongo configuration and checkout boundaries',()=>{
 it('requires an explicit enabled configuration, matching environment keys and separate live activation',()=>{
  const env={PAYMONGO_ENABLED:'true',PAYMONGO_MODE:'test',PAYMONGO_SECRET_KEY:config.secretKey,PAYMONGO_WEBHOOK_SECRET:config.webhookSecret,PAYMONGO_PAYMENT_METHODS:'card,gcash'};
  expect(payMongoConfig(env)).toEqual(config);
  expect(()=>payMongoConfig({...env,PAYMONGO_ENABLED:'false'})).toThrow();
  expect(()=>payMongoConfig({...env,PAYMONGO_SECRET_KEY:'sk_live_fixture1234567890'})).toThrow();
  expect(()=>payMongoConfig({...env,PAYMONGO_MODE:'live',PAYMONGO_SECRET_KEY:'sk_live_fixture1234567890'})).toThrow();
  expect(payMongoConfig({...env,PAYMONGO_MODE:'live',PAYMONGO_SECRET_KEY:'sk_live_fixture1234567890',PAYMONGO_LIVE_ENABLED:'true'}).mode).toBe('live');
 });
 it('rejects invalid methods and requires a real signing secret when webhooks are selected',()=>{
  const env={PAYMONGO_ENABLED:'true',PAYMONGO_SECRET_KEY:config.secretKey,PAYMONGO_WEBHOOK_SECRET:config.webhookSecret,PAYMONGO_PAYMENT_METHODS:'card'};
  for(const methods of ['', 'paypal','card,card','card,'])expect(()=>payMongoConfig({...env,PAYMONGO_PAYMENT_METHODS:methods})).toThrow();
  expect(payMongoConfig({...env,PAYMONGO_WEBHOOK_SECRET:''}).notificationMode).toBe('poll');
  expect(()=>payMongoConfig({...env,PAYMONGO_NOTIFICATION_MODE:'webhook',PAYMONGO_WEBHOOK_SECRET:''})).toThrow();
  expect(()=>verifyPayMongoSignature(Buffer.from('{}'),null,{mode:'test',webhookSecret:''},now)).toThrow();
 });
 it('uses only the exact secure provider checkout host',()=>{
  expect(hostedCheckoutUrl('https://checkout.paymongo.com/cs_123')).toBe('https://checkout.paymongo.com/cs_123');
  for(const url of ['https://checkout.paymongo.com.evil.test/cs_123','https://evil.test/cs_123','http://checkout.paymongo.com/cs_123','https://user:secret@checkout.paymongo.com/cs_123','javascript:alert(1)','https://checkout.paymongo.com:444/cs_123'])expect(()=>hostedCheckoutUrl(url)).toThrow();
 });
 it('builds local return paths from the configured origin without accepting arbitrary redirects',()=>{
  const id=randomUUID();expect(checkoutReturnUrl('http://127.0.0.1:3100',id,'success')).toBe(`http://127.0.0.1:3100/workspace/bookings/${id}?payment_return=success`);
  for(const origin of ['http://public.test','https://user:secret@public.test','https://public.test/path','https://public.test/?return=evil'])expect(()=>checkoutReturnUrl(origin,id,'cancel')).toThrow();
 });
 it('sends the exact server amount and opaque reference, without contacts, email receipts or undisclosed fees',()=>{
  const i=input(),body=checkoutPayload(i,config).data.attributes;
  expect(body.line_items).toEqual([{name:'Rent2Go agreed booking balance',amount:12500,currency:'PHP',quantity:1}]);
  expect(body).toMatchObject({send_email_receipt:false,pass_on_fees:false,metadata:{rent2go_checkout:i.reference}});
  expect(body).not.toHaveProperty('billing');expect(body).not.toHaveProperty('outcome');
  expect(()=>checkoutPayload({...i,amountCentavos:0},config)).toThrow();
  expect(()=>checkoutPayload({...i,amountCentavos:1.5},config)).toThrow();
  expect(()=>checkoutPayload({...i,methods:['qrph']},config)).toThrow();
 });
 it('accepts the actual minimal V2 create response without inventing a paid outcome',()=>{
  const result=parseCreatedCheckout({id:'cs_fixture123',type:'checkout_session',attributes:{livemode:false,checkout_url:'https://checkout.paymongo.com/cs_fixture123'}},'test');
  expect(result).toEqual({id:'cs_fixture123',mode:'test',checkoutUrl:'https://checkout.paymongo.com/cs_fixture123'});
  expect(result).not.toHaveProperty('paid');
 });
});
describe('Provider payment evidence',()=>{
 it('accepts only one paid payment with exact PHP gross/fee/net conservation and strips private billing',()=>{
  const parsed=parseCheckout(session(true),'test');
  expect(parsed.paid).toEqual({id:'pay_fixture123',amountCentavos:12500,feeCentavos:500,netCentavos:12000,method:'card'});
  expect(JSON.stringify(parsed)).not.toContain('not-to-return');
  for(const changes of [{amount:12499},{fee:501},{net_amount:12001},{currency:'USD'},{livemode:true}]){
   const value=session(true);Object.assign(value.attributes.payments[0].attributes,changes);expect(()=>parseCheckout(value,'test')).toThrow();
  }
 });
 it('does not count pending or failed attempts as paid, including nullable failed-fee fields',()=>{
  const value=session(true);value.attributes.payments[0].attributes.status='failed';value.attributes.payments[0].attributes.fee=null;
  expect(parseCheckout(value,'test').paid).toBeNull();
  value.attributes.payments[0].attributes.status='pending';expect(parseCheckout(value,'test').paid).toBeNull();
 });
 it('refuses duplicate successful payments, unsafe totals and mismatched mode',()=>{
  const duplicate=session(true);duplicate.attributes.payments.push({...duplicate.attributes.payments[0],id:'pay_another123'});expect(()=>parseCheckout(duplicate,'test')).toThrow();
  const big=session();big.attributes.line_items[0].amount=Number.MAX_SAFE_INTEGER;big.attributes.line_items[0].quantity=2;expect(()=>parseCheckout(big,'test')).toThrow();
  expect(()=>parseCheckout(session(),'live')).toThrow();
 });
});
describe('Signed notifications',()=>{
 it('verifies exact bytes against PostgreSQL time rather than the host clock',()=>{
  const raw=Buffer.from('{"exact": "spacing"}');
  expect(()=>verifyPayMongoSignature(raw,signed(raw),config,now)).not.toThrow();
  expect(()=>verifyPayMongoSignature(Buffer.from('{"exact":"spacing"}'),signed(raw),config,now)).toThrow();
  expect(()=>verifyPayMongoSignature(raw,signed(raw),config,now+301000)).toThrow();
 });
 it('refuses mode substitution, duplicate header fields, bad hex, stale/future timestamps and oversized bodies',()=>{
  const raw=Buffer.from('{}');
  for(const header of [null,signed(raw,'live'),signed(raw)+',te='+'a'.repeat(64),signed(raw)+',t=1800000000',signed(raw).replace(/te=[a-f0-9]+/,'te=xyz'),signed(raw,'test',1800000400),signed(raw,'test',1799999600)])expect(()=>verifyPayMongoSignature(raw,header,config,now)).toThrow();
  expect(()=>verifyPayMongoSignature(new Uint8Array(512*1024+1),signed(raw),config,now)).toThrow();
 });
 it('parses a verified canonical paid event without returning raw billing details',()=>{
  const raw=Buffer.from(JSON.stringify({data:{id:'evt_fixture123',type:'event',attributes:{type:'checkout_session.payment.paid',livemode:false,data:session(true)}}}));
  verifyPayMongoSignature(raw,signed(raw),config,now);
  const event=parsePayMongoNotification(raw,'test');expect(event.id).toBe('evt_fixture123');expect(event.checkout?.paid?.id).toBe('pay_fixture123');expect(JSON.stringify(event)).not.toContain('not-to-return');
 });
 it('refuses a paid event without payment and a wrong-mode event; unrelated signed events carry no checkout',()=>{
  const data={data:{id:'evt_fixture123',type:'event',attributes:{type:'checkout_session.payment.paid',livemode:false,data:session()}}};
  expect(()=>parsePayMongoNotification(Buffer.from(JSON.stringify(data)),'test')).toThrow();
  data.data.attributes.type='payment.failed';expect(parsePayMongoNotification(Buffer.from(JSON.stringify(data)),'test').checkout).toBeNull();
  expect(()=>parsePayMongoNotification(Buffer.from(JSON.stringify(data)),'live')).toThrow();
 });
});
describe('Outbound transport',()=>{
 it('uses V2 creation, exact retry identity and server-only basic credentials, then V1 retrieval',async()=>{
  const s=session(),transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{id:s.id,type:s.type,attributes:{livemode:false,checkout_url:s.attributes.checkout_url}}})).mockResolvedValueOnce(Response.json({data:s}));
  const client=payMongoClient(config,transport),i=input(),created=await client.create(i);
  expect(created.id).toBe(s.id);expect(transport.mock.calls[0][0]).toBe('https://api.paymongo.com/v2/checkout_sessions');
  const init=transport.mock.calls[0][1]!;expect(init).toMatchObject({method:'POST',redirect:'error',cache:'no-store'});
  expect(init.headers).toMatchObject({'Idempotency-Key':i.idempotencyKey,Authorization:'Basic '+Buffer.from(config.secretKey+':').toString('base64')});
  expect((await client.retrieve(created.id)).paid).toBeNull();expect(transport.mock.calls[1][0]).toBe('https://api.paymongo.com/v1/checkout_sessions/cs_fixture123');expect(transport.mock.calls[1][1]?.headers).not.toHaveProperty('Idempotency-Key');
 });
 it('does not retry an ambiguous create automatically or expose provider error bodies/secrets',async()=>{
  const network=vi.fn<typeof fetch>().mockRejectedValue(new Error('SENSITIVE '+config.secretKey));
  await expect(payMongoClient(config,network).create(input())).rejects.toThrow('temporarily unavailable');expect(network).toHaveBeenCalledTimes(1);
  const bad=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:'SENSITIVE '+config.secretKey},{status:401}));
  try{await payMongoClient(config,bad).retrieve('cs_fixture123');throw Error('Expected refusal');}catch(error){expect(JSON.stringify(error)).not.toContain(config.secretKey);expect((error as Error).message).not.toContain('SENSITIVE');}
 });
 it('rejects attacker-controlled resource paths before any outbound request',async()=>{
  const transport=vi.fn<typeof fetch>();await expect(payMongoClient(config,transport).retrieve('../webhooks')).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 });
 it('refuses malformed and oversized successful provider responses',async()=>{
  const malformed=vi.fn<typeof fetch>().mockResolvedValue(new Response('{not json'));
  await expect(payMongoClient(config,malformed).retrieve('cs_fixture123')).rejects.toThrow('unreadable');
  const huge=vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(512*1024+1)));
  await expect(payMongoClient(config,huge).retrieve('cs_fixture123')).rejects.toThrow('oversized');
 });
});
