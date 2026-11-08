import {notificationWorkSql} from './notification-work';
import type {PoolClient} from 'pg';
import {DomainError} from '../partners/workflow';

/** Also supports the accepted baseline schema while gateway migrations remain
 * deliberately unapplied there. A partial gateway schema fails closed. */
export async function gatewayBookingWork(c:PoolClient,id:string){
  const schema=(await c.query("SELECT to_regclass('public.paymongo_checkout') prepared,to_regclass('public.paymongo_booking_posting') posting,to_regclass('public.paymongo_notification') notifications")).rows[0];
  if(!schema.prepared)return {hasCheckout:false,unresolved:0,hasPayment:false};
  if(!schema.posting){
    const n=Number((await c.query('SELECT count(*) n FROM paymongo_checkout WHERE request_id=$1',[id])).rows[0].n);
    return {hasCheckout:n>0,unresolved:n,hasPayment:n>0};
  }
  const r=(await c.query(`SELECT count(*)::int total,
    count(*) FILTER(WHERE ${schema.notifications?notificationWorkSql('x'):'false'} OR s.review_required OR (p.id IS NULL AND e.checkout_id IS NULL) OR (p.id IS NOT NULL AND (b.checkout_id IS NULL OR b.outcome<>'COLLECTED')))::int unresolved,
    bool_or(p.id IS NOT NULL) paid
    FROM paymongo_checkout x LEFT JOIN paymongo_checkout_state s ON s.checkout_id=x.id LEFT JOIN paymongo_checkout_end e ON e.checkout_id=x.id
    LEFT JOIN paymongo_checkout_payment p ON p.checkout_id=x.id
    LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id WHERE x.request_id=$1`,[id])).rows[0];
  return {hasCheckout:r.total>0,unresolved:r.unresolved as number,hasPayment:Boolean(r.paid)};
}
/** Call under the parent request lock, independently of the gateway enable flag. */
export async function assertNoLegacyGatewayMix(c:PoolClient,id:string){
  if((await gatewayBookingWork(c,id)).hasCheckout)throw new DomainError('This booking uses PayMongo. Continue through its original payment and reconciliation records.',409);
}
export async function assertGatewaySourceReplaceable(c:PoolClient,id:string){
  const work=await gatewayBookingWork(c,id);
  if(work.unresolved||work.hasPayment)throw new DomainError('Reconcile the original PayMongo checkout and any received funds before replacing this booking source.',409);
}
export async function assertGatewayResolved(c:PoolClient,id:string){
  if((await gatewayBookingWork(c,id)).unresolved)throw new DomainError('Reconcile or confirm expiry of the original PayMongo checkout before continuing.',409);
}
