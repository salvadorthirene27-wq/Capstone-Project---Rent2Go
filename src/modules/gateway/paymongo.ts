import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {DomainError} from '../partners/workflow';
import {parseRefundResource,providerRefundId} from './refund-resource';

export type PayMongoMode='test'|'live';
// This allowlist validates operator configuration; checkout offers the configured
// subset, not locally invented approval/decline outcomes.
export const payMongoMethod=z.enum(['card','gcash','qrph','paymaya','grab_pay']);
export type PayMongoMethod=z.infer<typeof payMongoMethod>;
export type PayMongoConfig={mode:PayMongoMode;secretKey:string;webhookSecret:string;methods:PayMongoMethod[];notificationMode:'poll'|'webhook'};
type Environment=Record<string,string|undefined>;
const providerOrigin='https://api.paymongo.com';
const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identifier=(prefix:string)=>z.string().max(160).regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`));
export const checkoutId=identifier('cs');
const internalReference=z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);
const retryKey=z.uuid();
const maxResponseBytes=512*1024;

export class PayMongoError extends DomainError {
  constructor(message='Online payments are temporarily unavailable. Try again shortly.',public readonly providerStatus?:number,public readonly providerCode?:string){super(message,503);}
}

export function payMongoConfig(env:Environment=process.env):PayMongoConfig {
  if(env.PAYMONGO_ENABLED!=='true')throw new PayMongoError('Online payments are not configured yet.');
  const mode=env.PAYMONGO_MODE??'test';
  if(mode!=='test'&&mode!=='live')throw new PayMongoError('Online payment configuration needs review.');
  if(mode==='live'&&env.PAYMONGO_LIVE_ENABLED!=='true')throw new PayMongoError('Live online payments have not been enabled.');
  const secretKey=env.PAYMONGO_SECRET_KEY??'',webhookSecret=env.PAYMONGO_WEBHOOK_SECRET??'',notificationMode=env.PAYMONGO_NOTIFICATION_MODE??'poll';
  if(!['poll','webhook'].includes(notificationMode)||!new RegExp(`^sk_${mode}_[A-Za-z0-9]{12,}$`).test(secretKey)||(notificationMode==='webhook'&&!webhookSecret)||webhookSecret.length>512||/[\s\u0000-\u001f]/u.test(webhookSecret))throw new PayMongoError('Online payment credentials need configuration.');
  const configured=(env.PAYMONGO_PAYMENT_METHODS??'').split(',').map(s=>s.trim());
  const result=z.array(payMongoMethod).min(1).max(payMongoMethod.options.length).safeParse(configured);
  if(!result.success||new Set(result.data).size!==result.data.length)throw new PayMongoError('Online payment methods need configuration.');
  return {mode,secretKey,webhookSecret,methods:result.data,notificationMode:notificationMode as 'poll'|'webhook'};
}

export function hostedCheckoutUrl(value:unknown):string {
  if(typeof value!=='string')throw new PayMongoError('PayMongo returned an invalid checkout address.');
  let url:URL;
  try{url=new URL(value);}catch{throw new PayMongoError('PayMongo returned an invalid checkout address.');}
  if(url.protocol!=='https:'||url.hostname!=='checkout.paymongo.com'||url.port||url.username||url.password||url.pathname==='/')throw new PayMongoError('PayMongo returned an invalid checkout address.');
  return url.toString();
}

export function checkoutReturnUrl(origin:string,requestId:string,result:'success'|'cancel'):string {
  z.uuid().parse(requestId);
  const base=new URL(origin);
  if(base.username||base.password||base.pathname!=='/'||base.search||base.hash||!(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))throw new PayMongoError('The payment return address needs configuration.');
  return new URL(`/workspace/bookings/${requestId}?payment_return=${result}`,base).toString();
}

const paidAttributes=z.object({
  amount:cents,fee:cents,net_amount:cents,currency:z.literal('PHP'),status:z.string(),livemode:z.boolean(),
  source:z.object({type:z.string()}),foreign_fee:cents.nullish(),tax_amount:cents.nullish(),digital_withholding_vat_amount:cents.nullish(),
});
const paymentResource=z.object({id:identifier('pay'),attributes:z.object({status:z.string(),livemode:z.boolean()}).passthrough()});
const checkoutResource=z.object({id:checkoutId,type:z.literal('checkout_session'),attributes:z.object({
  livemode:z.boolean(),status:z.enum(['active','expired']),reference_number:internalReference,
  checkout_url:z.string(),metadata:z.record(z.string(),z.string()),
  line_items:z.array(z.object({amount:cents,quantity:z.number().int().positive().max(10000),currency:z.literal('PHP')})).min(1).max(50),
  payments:z.array(paymentResource).max(100),
})});
export type PayMongoCheckout={id:string;mode:PayMongoMode;status:'active'|'expired';checkoutUrl:string;reference:string;metadata:Record<string,string>;amountCentavos:number;paid:null|{id:string;amountCentavos:number;feeCentavos:number;netCentavos:number;method:string;deductions?:{processingFeeCentavos:number;foreignFeeCentavos:number;taxCreditCentavos:number;digitalVatCentavos:number}}};
export type PayMongoCreatedCheckout={id:string;mode:PayMongoMode;checkoutUrl:string};
export function parseCreatedCheckout(value:unknown,mode:PayMongoMode):PayMongoCreatedCheckout {
  const result=z.object({id:checkoutId,type:z.literal('checkout_session'),attributes:z.object({livemode:z.boolean(),checkout_url:z.string()})}).safeParse(value);
  if(!result.success||result.data.attributes.livemode!==(mode==='live'))throw new PayMongoError('PayMongo returned an invalid new checkout record.');
  return {id:result.data.id,mode,checkoutUrl:hostedCheckoutUrl(result.data.attributes.checkout_url)};
}

export function parseCheckout(value:unknown,mode:PayMongoMode):PayMongoCheckout {
  const parsed=checkoutResource.safeParse(value);
  if(!parsed.success)throw new PayMongoError('PayMongo returned an incomplete checkout record.');
  const {id,attributes:a}=parsed.data;
  if(a.livemode!==(mode==='live')||a.payments.some(p=>p.attributes.livemode!==a.livemode))throw new PayMongoError('The payment environment does not match this checkout.');
  const amount=a.line_items.reduce((sum,line)=>sum+line.amount*line.quantity,0);
  if(!Number.isSafeInteger(amount)||amount<=0)throw new PayMongoError('PayMongo returned invalid checkout totals.');
  const successful=a.payments.filter(p=>p.attributes.status==='paid');
  if(successful.length>1)throw new PayMongoError('The checkout needs independent payment reconciliation.');
  const p=successful[0],details=p?paidAttributes.safeParse(p.attributes):null;
  if(details&&!details.success)throw new PayMongoError('PayMongo returned incomplete payment amounts.');
  const aPaid=details?.success?details.data:null;
  const components=aPaid?{processingFeeCentavos:aPaid.fee,foreignFeeCentavos:aPaid.foreign_fee??0,taxCreditCentavos:aPaid.tax_amount??0,digitalVatCentavos:aPaid.digital_withholding_vat_amount??0}:null;
  const deducted=components?BigInt(components.processingFeeCentavos)+BigInt(components.foreignFeeCentavos)-BigInt(components.taxCreditCentavos)+BigInt(components.digitalVatCentavos):0n;
  if(deducted<0n||deducted>BigInt(Number.MAX_SAFE_INTEGER))throw new PayMongoError('Provider deductions require reconciliation.');
  const paid=p&&aPaid?{id:p.id,amountCentavos:aPaid.amount,feeCentavos:Number(deducted),netCentavos:aPaid.net_amount,method:aPaid.source.type,...(aPaid.foreign_fee!==undefined||aPaid.tax_amount!==undefined||aPaid.digital_withholding_vat_amount!==undefined?{deductions:components!}:{})}:null;
  // No pass-on fees are permitted before the fee policy is explicitly agreed.
  if(paid&&(paid.amountCentavos!==amount||!Number.isSafeInteger(paid.feeCentavos+paid.netCentavos)||paid.feeCentavos+paid.netCentavos!==paid.amountCentavos))throw new PayMongoError('The received payment totals need reconciliation.');
  return {id,mode,status:a.status,checkoutUrl:hostedCheckoutUrl(a.checkout_url),reference:a.reference_number,metadata:a.metadata,amountCentavos:amount,paid};
}

export type NewCheckout={reference:string;amountCentavos:number;requestId:string;origin:string;methods:PayMongoMethod[];idempotencyKey:string};
export function checkoutPayload(input:NewCheckout,config:PayMongoConfig){
  const reference=internalReference.parse(input.reference),amount=cents.positive().parse(input.amountCentavos),methods=z.array(payMongoMethod).min(1).safeParse(input.methods);
  z.uuid().parse(input.requestId);retryKey.parse(input.idempotencyKey);
  if(!methods.success||new Set(methods.data).size!==methods.data.length||methods.data.some(method=>!config.methods.includes(method)))throw new DomainError('Choose an available online payment method.',422);
  return {data:{attributes:{
    reference_number:reference,
    line_items:[{name:'Rent2Go agreed booking balance',amount,currency:'PHP',quantity:1}],
    payment_method_types:methods.data,
    success_url:checkoutReturnUrl(input.origin,input.requestId,'success'),
    cancel_url:checkoutReturnUrl(input.origin,input.requestId,'cancel'),
    metadata:{rent2go_checkout:reference},
    send_email_receipt:false,pass_on_fees:false,
  }}};
}

const preparedPayloadSchema=z.object({data:z.object({attributes:z.object({
  reference_number:z.uuid(),
  line_items:z.tuple([z.object({name:z.literal('Rent2Go agreed booking balance'),amount:cents.positive(),currency:z.literal('PHP'),quantity:z.literal(1)}).strict()]),
  payment_method_types:z.array(payMongoMethod).min(1).max(payMongoMethod.options.length),
  success_url:z.string(),cancel_url:z.string(),metadata:z.object({rent2go_checkout:z.uuid()}).strict(),
  send_email_receipt:z.literal(false),pass_on_fees:z.literal(false),
}).strict()}).strict()}).strict();
/** Validate the already-persisted request without substituting today's origin,
 * enabled-method list or amounts into a retry. */
export function preparedCheckoutPayload(value:unknown){
  const body=preparedPayloadSchema.parse(value),a=body.data.attributes;
  let success:URL;
  try{success=new URL(a.success_url);}catch{throw new DomainError('Invalid saved checkout return address.',409);}
  const match=/^\/workspace\/bookings\/([a-f0-9-]{36})$/i.exec(success.pathname);
  if(!match||a.metadata.rent2go_checkout!==a.reference_number||new Set(a.payment_method_types).size!==a.payment_method_types.length||checkoutReturnUrl(success.origin,match[1],'success')!==a.success_url||checkoutReturnUrl(success.origin,match[1],'cancel')!==a.cancel_url)throw new DomainError('Invalid saved checkout request.',409);
  return body;
}

async function boundedResponse(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new PayMongoError();
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxResponseBytes){await reader.cancel();throw new PayMongoError('PayMongo returned an oversized response.');}chunks.push(value);}
  const buffer=Buffer.concat(chunks,size);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new PayMongoError('PayMongo returned an unreadable response.');}
}

export function payMongoClient(config:PayMongoConfig,transport:typeof fetch=fetch){
  async function request(path:string,body?:unknown,key?:string):Promise<unknown>{
    let response:Response;
    try{
      response=await transport(providerOrigin+path,{
        method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
        headers:{Accept:'application/json',Authorization:`Basic ${Buffer.from(config.secretKey+':').toString('base64')}`,...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':retryKey.parse(key)})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
      });
    }catch{throw new PayMongoError();}
    // Provider responses can contain billing data, credentials or user-controlled
    // descriptions. Never include their raw body/error detail in logs or errors.
    if(!response.ok){let providerCode:string|undefined;try{const body=await boundedResponse(response),code=body?.errors?.[0]?.code;if(typeof code==='string'&&/^[a-z0-9_]{1,80}$/.test(code))providerCode=code;}catch{}throw new PayMongoError(response.status===401?'Online payment credentials need review.':response.status===409?'This provider record is still being processed. Refresh it before retrying.':'PayMongo could not complete this request. Refresh the payment record before retrying.',response.status,providerCode);}
    const envelope=await boundedResponse(response);
    return envelope?.data;
  }
  const createPrepared=async(body:unknown,key:string)=>parseCreatedCheckout(await request('/v2/checkout_sessions',preparedCheckoutPayload(body),retryKey.parse(key)),config.mode);
  return {
    // V2 creation returns only the id, hosted URL and mode. Persist that mapping
    // before retrieving the full record; a failed GET must not create a new order.
    create:async(input:NewCheckout)=>createPrepared(checkoutPayload(input,config),input.idempotencyKey),
    createPrepared,
    retrieve:async(id:string)=>parseCheckout(await request(`/v1/checkout_sessions/${checkoutId.parse(id)}`),config.mode),
    expire:async(id:string,key:string)=>parseCheckout(await request(`/v1/checkout_sessions/${checkoutId.parse(id)}/expire`,{},key),config.mode),
    // Provider mutation callers must first persist their exact approved intent.
    createRefund:async(input:{id:string;paymentId:string;amountCentavos:number;key:string})=>{
      const body=z.object({id:z.uuid(),paymentId:z.string().max(160).regex(/^pay_[A-Za-z0-9]+$/),amountCentavos:z.number().int().min(100).max(2147483647),key:z.uuid()}).strict().parse(input);
      const result=await request('/v1/refunds',{data:{attributes:{amount:body.amountCentavos,payment_id:body.paymentId,reason:'others',notes:'Rent2Go approved refund',metadata:{rent2go_refund:body.id}}}},body.key);
      const created=z.object({id:providerRefundId,type:z.literal('refund'),attributes:z.object({livemode:z.boolean()})}).safeParse(result);
      if(!created.success||created.data.attributes.livemode!==(config.mode==='live'))throw new PayMongoError('PayMongo returned an invalid new refund record.');
      return {id:created.data.id,mode:config.mode};
    },
    retrieveRefund:async(id:string)=>{
      const requested=providerRefundId.parse(id),refund=parseRefundResource(await request(`/v1/refunds/${requested}`),config.mode);
      if(refund.id!==requested)throw new PayMongoError('PayMongo returned a different refund record.');
      return refund;
    },
  };
}

/** Verify raw bytes before parsing JSON. `nowMs` must come from PostgreSQL time,
 * not the laptop clock, which is already known to differ from provider time. */
export function verifyPayMongoSignature(raw:Uint8Array,header:string|null,config:Pick<PayMongoConfig,'mode'|'webhookSecret'>,nowMs:number){
  const denied=()=>new DomainError('Invalid payment notification signature.',401);
  if(!config.webhookSecret||!raw.length||raw.length>maxResponseBytes||!header||header.length>1024||!Number.isFinite(nowMs))throw denied();
  const fields=new Map<string,string>();
  for(const part of header.split(',')){
    const item=/^\s*(t|te|li)=([^,]*)\s*$/.exec(part);
    if(!item||fields.has(item[1]))throw denied();fields.set(item[1],item[2].trim());
  }
  const timestamp=fields.get('t')??'',signature=fields.get(config.mode==='test'?'te':'li')??'';
  if(!/^\d{10,12}$/.test(timestamp)||!/^[a-f0-9]{64}$/i.test(signature)||Math.abs(nowMs/1000-Number(timestamp))>300)throw denied();
  const expected=createHmac('sha256',config.webhookSecret).update(timestamp+'.').update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw denied();
}

const notification=z.object({data:z.object({id:identifier('evt'),type:z.literal('event'),attributes:z.object({type:z.string().min(1).max(100),livemode:z.boolean(),data:z.unknown()})})});
export function payMongoNotificationEnvelope(raw:Uint8Array,mode:PayMongoMode){
  let value:unknown;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new DomainError('Invalid payment notification.',400);}
  const result=notification.safeParse(value);
  if(!result.success||result.data.data.attributes.livemode!==(mode==='live'))throw new DomainError('Payment notification environment or format mismatch.',400);
  return result.data.data;
}
export function parsePayMongoNotification(raw:Uint8Array,mode:PayMongoMode){
  const event=payMongoNotificationEnvelope(raw,mode);
  if(event.attributes.type!=='checkout_session.payment.paid')return {id:event.id,type:event.attributes.type,checkout:null};
  const checkout=parseCheckout(event.attributes.data,mode);
  if(!checkout.paid)throw new DomainError('The payment notification has no confirmed payment.',400);
  return {id:event.id,type:event.attributes.type,checkout};
}
