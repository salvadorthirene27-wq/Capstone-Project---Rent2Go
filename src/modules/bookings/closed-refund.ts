import type {PoolClient} from 'pg';
import {DomainError} from '../partners/workflow';

/** All callers hold the booking request lock. Pending requests also consume credit capacity. */
export async function closedCreditCapacity(c:PoolClient,requestId:string,creditId:string){
 const a=(await c.query(`SELECT a.id,a.quote_id,a.environment,a.amount_centavos,
 COALESCE((SELECT sum(r.amount_centavos) FROM booking_closed_refund_link l JOIN booking_refund_request r ON r.id=l.refund_id LEFT JOIN booking_refund_decision d ON d.refund_id=r.id WHERE l.credit_id=a.id AND (d.decision IS NULL OR d.decision='APPROVE') AND NOT EXISTS(SELECT 1 FROM booking_refund_cancel x WHERE x.refund_id=r.id)),0)::text used
 FROM booking_closed_credit a JOIN booking_closed_credit_post p ON p.credit_id=a.id WHERE a.id=$1 AND a.request_id=$2`,[creditId,requestId])).rows[0];
 if(!a)throw new DomainError('Posted credit not found for this booking.',404);
 const available=BigInt(a.amount_centavos)-BigInt(a.used);
 if(available<0n)throw new DomainError('Closed credit refund capacity requires review.',409);
 return {id:a.id as string,quoteId:a.quote_id as string,environment:a.environment as string,availableCentavos:Number(available)};
}
export async function closedRefundGate(c:PoolClient,requestId:string,command:{action:string;creditId?:string;refundId?:string}){
 const closed=Boolean((await c.query('SELECT 1 FROM booking_financial_close WHERE request_id=$1',[requestId])).rowCount);
 if(!closed){if(command.creditId)throw new DomainError('Closed credits belong only to financially closed bookings.',409);return false;}
 if(command.action==='REQUEST_REFUND'){
  if(!command.creditId)throw new DomainError('Choose a posted, separately accepted closed-booking credit.',409);
  await closedCreditCapacity(c,requestId,command.creditId);
 }else if(!(await c.query('SELECT 1 FROM booking_closed_refund_link l JOIN booking_refund_request r ON r.id=l.refund_id JOIN booking_closed_credit a ON a.id=l.credit_id WHERE r.id=$1 AND r.request_id=$2 AND a.request_id=$2',[command.refundId,requestId])).rowCount)throw new DomainError('Original closed refunds remain immutable. Use a separately posted credit.',409);
 return true;
}
