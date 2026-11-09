import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {prepareBookingCheckout,prepareCheckoutCommand} from '@/modules/gateway/booking-checkout';
import {bookingCheckoutStatus} from '@/modules/gateway/checkout-lifecycle';
import {payMongoConfig} from '@/modules/gateway/paymongo';
import {custodyNotice} from '@/modules/gateway/custody-notice';
import {DomainError} from '@/modules/partners/workflow';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{const actor=await requireActor();await rateLimit(`${actor.id}:hosted-checkout-reads`,60);if(new URL(req.url).search)throw new DomainError('Checkout status does not accept client payment results.',422);const state=await bookingCheckoutStatus(actor,uuid.parse((await ctx.params).id));let enabled=false,mode:'test'|'live'|null=null;try{const config=payMongoConfig();mode=config.mode;enabled=process.env.PAYMONGO_CUSTOMER_CHECKOUT_ENABLED==='true';}catch{}return json({...state,enabled,mode,custodyNotice});}catch(e){return apiError(e);}}
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:hosted-checkout-create`,6);if(process.env.PAYMONGO_CUSTOMER_CHECKOUT_ENABLED!=='true')throw new DomainError('Online checkout is not available yet.',503);const body=prepareCheckoutCommand.required({custodyConsent:true}).parse(await readJson(req));const id=uuid.parse((await ctx.params).id);await prepareBookingCheckout(actor,id,body);return json({...await bookingCheckoutStatus(actor,id),enabled:true,mode:payMongoConfig().mode,custodyNotice},202);}catch(e){return apiError(e);}}
