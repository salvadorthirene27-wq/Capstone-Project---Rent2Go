import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getBookingContacts,saveBookingContact} from '@/modules/bookings/contacts';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:booking-contacts-read`,100);
 const query=new URL(req.url).searchParams;
 if(new Set(query.keys()).size!==Array.from(query.keys()).length)return json({error:'Use each contact filter once.'},422);
 return json(await getBookingContacts(actor,(await ctx.params).id,Object.fromEntries(query)));
}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{
 requireOrigin(req);if(new URL(req.url).search)return json({error:'Contact saves do not accept query parameters.'},422);const actor=await requireActor();await rateLimit(`${actor.id}:booking-contacts-save`,40);
 return json(await saveBookingContact(actor,(await ctx.params).id,await readJson(req)));
}catch(e){return apiError(e);}}
