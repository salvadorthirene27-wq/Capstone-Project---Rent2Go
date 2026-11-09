import {cache} from 'react';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import type {Actor} from '../partners/workflow';
import type {CartQuote} from '../cart/pricing';
const query=z.object({activePage:z.coerce.number().int().min(1).max(10000).default(1),historyPage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
const terminal=['COMPLETED','CANCELLED','REJECTED','QUOTE_DECLINED','HOLD_EXPIRED'];
// A legacy renter may already own vehicles or operate an agency. Navigation
// follows those saved relationships; it never grants authority to an API.
export const hasVehicleWorkspace=cache(async(id:string,role:Actor['role'])=>{
 if(role!=='RENTER')return true;
 return transaction(async c=>{await storedActor({id},c);return Boolean((await c.query(`SELECT EXISTS(SELECT 1 FROM physical_vehicle WHERE owner_actor_id=$1) OR EXISTS(SELECT 1 FROM agency WHERE owner_id=$1) OR EXISTS(SELECT 1 FROM agency_member WHERE actor_id=$1 AND active) permitted`,[id])).rows[0].permitted);});
});
export async function bookingOverview(actor:Actor,input:unknown={}){
 const q=query.parse(input);
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const user=await storedActor(actor,c);
  const counts=(await c.query('SELECT count(*) FILTER(WHERE status<>ALL($2::text[]))::int active,count(*) FILTER(WHERE status=ANY($2::text[]))::int history FROM booking_request WHERE renter_id=$1',[user.id,terminal])).rows[0] as {active:number;history:number};
  async function group(history:boolean){
   const total=history?counts.history:counts.active,pageCount=Math.max(1,Math.ceil(total/5)),page=Math.min(history?q.historyPage:q.activePage,pageCount);
   const rows=(await c.query(`SELECT r.id,r.agency_name,r.status,r.created_at,
    (SELECT jsonb_agg(jsonb_build_object('id',l.id,'quote',l.public_quote) ORDER BY l.created_at,l.id) FROM booking_request_line l WHERE l.request_id=r.id) lines,
    (SELECT (b.public_snapshot->'totals'->>'totalCentavos')::bigint FROM booking_quotation b WHERE b.request_id=r.id AND EXISTS(SELECT 1 FROM booking_quotation_decision d WHERE d.quote_id=b.id AND d.action='ACCEPTED') ORDER BY b.revision DESC LIMIT 1) accepted_total
    FROM booking_request r WHERE r.renter_id=$1 AND (r.status=ANY($2::text[]))=$3 ORDER BY r.created_at DESC,r.id DESC LIMIT 5 OFFSET $4`,[user.id,terminal,history,(page-1)*5])).rows;
   return {total,page,pageCount,items:rows.map(r=>({id:r.id as string,agencyName:r.agency_name as string,status:r.status as string,createdAt:(r.created_at as Date).toISOString(),lines:(r.lines??[]) as {id:string;quote:CartQuote}[],acceptedTotal:r.accepted_total===null?null:Number(r.accepted_total)}))};
  }
  return {active:await group(false),history:await group(true)};
 });
}
export type WorkspaceLabels={services:Record<string,string>;agencies:Record<string,string>};
/** Current display metadata is separate from the original ordered quotation. */
export async function workspaceLabels(actor:Actor,quotes:CartQuote[]):Promise<WorkspaceLabels>{
 const vehicles=[...new Set(quotes.flatMap(q=>q.selection.kind==='RENTAL'?[q.selection.offerId]:[]))],tours=[...new Set(quotes.flatMap(q=>q.selection.kind==='TOUR'?[q.selection.tourId]:[]))],agencies=[...new Set(quotes.map(q=>q.agencyId))];
 return transaction(async c=>{
  const user=await storedActor(actor,c);
  const owned=`EXISTS(SELECT 1 FROM booking_request_line l JOIN booking_request r ON r.id=l.request_id WHERE r.renter_id=$1 AND l.public_quote->'selection'->>$4=s.id::text) OR EXISTS(SELECT 1 FROM cart_item i JOIN booking_cart b ON b.id=i.cart_id WHERE b.owner_id=$1 AND i.removed_at IS NULL AND i.selection->>$4=s.id::text)`;
  const cars=(await c.query(`SELECT s.id,NULLIF(trim(concat_ws(' ',s.display_make,s.display_model)),'') title FROM vehicle_offer s WHERE s.id=ANY($2::uuid[]) AND ($3::text='RENTAL') AND (${owned})`,[user.id,vehicles,'RENTAL','offerId'])).rows;
  const packages=(await c.query(`SELECT s.id,s.display_title title FROM tour_package s WHERE s.id=ANY($2::uuid[]) AND ($3::text='TOUR') AND (${owned})`,[user.id,tours,'TOUR','tourId'])).rows;
  const partners=(await c.query(`SELECT g.id,g.display_name name FROM agency g WHERE g.id=ANY($2::uuid[]) AND (EXISTS(SELECT 1 FROM booking_request r WHERE r.renter_id=$1 AND r.agency_id=g.id) OR EXISTS(SELECT 1 FROM cart_item i JOIN booking_cart b ON b.id=i.cart_id WHERE b.owner_id=$1 AND i.removed_at IS NULL AND i.saved_quote->>'agencyId'=g.id::text))`,[user.id,agencies])).rows;
  return {services:Object.fromEntries([...cars.filter(r=>r.title).map(r=>['RENTAL:'+r.id,r.title]),...packages.filter(r=>r.title).map(r=>['TOUR:'+r.id,r.title])]),agencies:Object.fromEntries(partners.filter(r=>r.name).map(r=>[r.id,r.name]))};
 });
}
