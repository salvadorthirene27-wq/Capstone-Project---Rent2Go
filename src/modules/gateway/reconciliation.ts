import {z} from 'zod';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {notificationWorkSql} from './notification-work';
export const reconciliationQuery=z.object({kind:z.enum(['ALL','CHECKOUT','NOTIFICATION']).default('ALL'),mode:z.enum(['ALL','test','live']).default('ALL'),reference:z.string().trim().max(160).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const reconciliationReasons={CLOSED_BOOKING_FUNDS:'Funds recorded after financial closing',CHANNEL_CONFLICT:'Payment channel conflict',FUNDS_REVIEW:'Verified funds need reconciliation',CHECKOUT_REVIEW:'Checkout needs independent review',NOTIFICATION_REVIEW:'Notification facts need review',NOTIFICATION_PENDING:'Notification awaiting validation',POSTING_PENDING:'Verified receipt awaiting booking posting',MISMATCH:'Notification differs from the saved checkout',UNMATCHED:'Notification has no matching checkout',INVALID_PAYLOAD:'Authenticated notification could not be validated',CONFLICT:'Conflicting facts for one provider event'} as const;
const pending=notificationWorkSql('x',true),open=notificationWorkSql('x');
const cases=`WITH related AS(
 SELECT n.*,nr.outcome,COALESCE(n.checkout_id,nr.checkout_id,l.checkout_id) associated_id,
 EXISTS(SELECT 1 FROM paymongo_notification_conflict nc WHERE nc.notification_id=n.id) conflict
 FROM paymongo_notification n LEFT JOIN paymongo_notification_result nr ON nr.notification_id=n.id
 LEFT JOIN paymongo_checkout_link l ON l.provider_id=n.provider_id AND l.mode=n.mode AND l.merchant_fingerprint=n.merchant_fingerprint
),cases AS(
 SELECT 'CHECKOUT'::text kind,x.id,x.id checkout_id,x.request_id,COALESCE(a.display_name,ar.payload->>'businessName') agency_name,
 x.mode,l.provider_id,NULL::text provider_event_id,COALESCE(p.amount_centavos,x.amount_centavos) amount_centavos,
 CASE WHEN p.id IS NOT NULL THEN 'VERIFIED' ELSE 'EXPECTED' END amount_kind,
 CASE WHEN b.outcome='CLOSED_LIABILITY' THEN 'CLOSED_BOOKING_FUNDS' WHEN b.outcome='CHANNEL_CONFLICT' THEN 'CHANNEL_CONFLICT'
 WHEN p.requires_reconciliation OR k.requires_reconciliation THEN 'FUNDS_REVIEW' WHEN s.review_required THEN 'CHECKOUT_REVIEW'
 WHEN ${open} AND NOT ${pending} THEN 'NOTIFICATION_REVIEW' WHEN ${pending} THEN 'NOTIFICATION_PENDING'
 WHEN p.id IS NOT NULL AND b.checkout_id IS NULL THEN 'POSTING_PENDING' ELSE 'CHECKOUT_REVIEW' END reason,
 COALESCE(p.verified_at,x.created_at) recorded_at
 FROM paymongo_checkout x JOIN agency a ON a.id=x.agency_id JOIN partner_revision ar ON ar.application_id=a.application_id AND ar.revision=a.approved_revision
 LEFT JOIN paymongo_checkout_link l ON l.checkout_id=x.id LEFT JOIN paymongo_checkout_state s ON s.checkout_id=x.id
 LEFT JOIN paymongo_checkout_payment p ON p.checkout_id=x.id LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id
 LEFT JOIN booking_payment_collection k ON k.id=b.collection_id
 WHERE s.review_required OR p.requires_reconciliation OR k.requires_reconciliation OR b.outcome<>'COLLECTED' OR (p.id IS NOT NULL AND b.checkout_id IS NULL) OR ${open}
 UNION ALL
 SELECT 'NOTIFICATION',n.id,NULL::uuid,NULL::uuid,NULL::text,n.mode,n.provider_id,n.provider_event_id,
 (n.projection->'paid'->>'amountCentavos')::bigint,'DECLARED',
 CASE WHEN n.conflict THEN 'CONFLICT' WHEN n.outcome IS NULL THEN 'NOTIFICATION_PENDING' ELSE n.outcome END,n.received_at
 FROM related n WHERE n.associated_id IS NULL AND n.kind<>'IGNORED' AND (n.outcome IS NULL OR n.outcome NOT IN('RECORDED','IGNORED') OR n.conflict)
)`;
export async function getPaymentReconciliation(actor:Actor,input:unknown={}){
 return transaction(async c=>{
  const user=await storedActor(actor,c);
  if(user.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Platform payment-review access is required.',403);
  const q=reconciliationQuery.parse(input),schema=(await c.query("SELECT to_regclass('paymongo_notification') inbox,to_regclass('paymongo_booking_posting') posting")).rows[0];
  const base={query:q,page:q.page,pageCount:1,total:0,checkoutTotal:0,notificationTotal:0};
  type Item={kind:'CHECKOUT'|'NOTIFICATION';id:string;checkoutId:string|null;requestId:string|null;agencyName:string|null;mode:'test'|'live';providerId:string|null;providerEventId:string|null;amountCentavos:number|null;amountKind:'VERIFIED'|'EXPECTED'|'DECLARED';reason:keyof typeof reconciliationReasons;recordedAt:string};
  if(!schema.inbox||!schema.posting)return {...base,available:false,items:[] as Item[]};
  const filter="($1::text='ALL' OR kind=$1) AND ($2::text='ALL' OR mode=$2) AND ($3::text='' OR request_id::text=$3 OR checkout_id::text=$3 OR id::text=$3 OR provider_id=$3 OR provider_event_id=$3)",values=[q.kind,q.mode,q.reference];
  const count=(await c.query(`${cases} SELECT count(*)::int total,count(*) FILTER(WHERE kind='CHECKOUT')::int checkouts,count(*) FILTER(WHERE kind='NOTIFICATION')::int notifications FROM cases WHERE ${filter}`,values)).rows[0];
  const rows=(await c.query(`${cases} SELECT * FROM cases WHERE ${filter} ORDER BY recorded_at,kind,id LIMIT 10 OFFSET $4`,[...values,(q.page-1)*10])).rows;
  return {...base,available:true,total:count.total as number,checkoutTotal:count.checkouts as number,notificationTotal:count.notifications as number,pageCount:Math.max(1,Math.ceil(count.total/10)),
   items:rows.map(r=>({kind:r.kind,id:r.id,checkoutId:r.checkout_id,requestId:r.request_id,agencyName:r.agency_name,mode:r.mode,providerId:r.provider_id,providerEventId:r.provider_event_id,amountCentavos:r.amount_centavos===null?null:Number(r.amount_centavos),amountKind:r.amount_kind,reason:r.reason,recordedAt:(r.recorded_at as Date).toISOString()} as Item))};
 });
}
export type PaymentReconciliation=Awaited<ReturnType<typeof getPaymentReconciliation>>;
