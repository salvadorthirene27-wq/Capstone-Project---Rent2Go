import type {PoolClient} from 'pg';
import {DomainError} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {centralPosition} from './central-position';
const amount=(n:unknown)=>{const v=BigInt(String(n));if(v<0n||v>BigInt(Number.MAX_SAFE_INTEGER))throw new DomainError('Central funding amounts need reconciliation.',409);return Number(v);};
export async function approvedCentralFunding(c:PoolClient,id:string){
 if(!(await c.query("SELECT to_regclass('central_agency_funding') present")).rows[0].present)return [] as {id:string;amountCentavos:number}[];
 return(await c.query("SELECT f.id,f.amount_centavos FROM central_agency_funding f JOIN central_funding_decision d ON d.funding_id=f.id AND d.decision='APPROVE' WHERE f.request_id=$1 ORDER BY f.id",[id])).rows.map(r=>({id:r.id as string,amountCentavos:amount(r.amount_centavos)}));
}
/** Forecast every already accepted closed credit, rather than treating money still owed to the renter as free cash. */
export async function centralFundingBasis(c:PoolClient,id:string){
 const close=(await c.query('SELECT id,quote_id,agency_id,environment,total_centavos FROM booking_financial_close WHERE request_id=$1',[id])).rows[0];if(!close)return preClosingFunding(c,id);
 const receipts=(await c.query("SELECT p.id,p.amount_centavos,p.fee_centavos,p.requires_reconciliation,b.outcome,x.mode,x.quote_id FROM paymongo_checkout_payment p JOIN paymongo_checkout x ON x.id=p.checkout_id LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id WHERE x.request_id=$1 ORDER BY p.id",[id])).rows;
 if(!receipts.length)return null;
 if(receipts.some(r=>r.requires_reconciliation||r.outcome!=='COLLECTED'||r.quote_id!==close.quote_id||(r.mode==='test'?'DEMO':'MANUAL')!==close.environment)||(await c.query("SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND method<>'PAYMONGO'",[id])).rowCount)throw new DomainError('Reconcile the original central collection channel before agency funding.',409);
 const entries=(await c.query('SELECT id,recipient,amount_centavos FROM booking_revenue_entry WHERE close_id=$1 ORDER BY id',[close.id])).rows;
 const credits=(await c.query('SELECT x.id,x.entry_id,x.amount_centavos,p.credit_id FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id JOIN booking_closed_credit_post p ON p.credit_id=x.credit_id WHERE e.close_id=$1 ORDER BY x.id',[close.id])).rows;
 const allocations={cosigner:0,agency:0,platform:0,maintenance:0};let credited=0n,original=0n;
 for(const e of entries){original+=BigInt(e.amount_centavos);const reduction=credits.filter(x=>x.entry_id===e.id).reduce((n,x)=>n+BigInt(x.amount_centavos),0n);credited+=reduction;allocations[e.recipient.toLowerCase() as keyof typeof allocations]+=amount(BigInt(e.amount_centavos)-reduction);}
 if(original!==BigInt(close.total_centavos))throw new DomainError('Original closed allocations do not conserve funds.',409);
 const gross:bigint=receipts.reduce((n,r)=>n+BigInt(r.amount_centavos),0n),fees:bigint=receipts.reduce((n,r)=>n+BigInt(r.fee_centavos),0n),forecastRefunds=gross-original+credited;
 const transfers=(await c.query('SELECT t.id,d.amount_centavos FROM central_disbursement_transfer t JOIN central_disbursement d ON d.id=t.disbursement_id WHERE t.request_id=$1 ORDER BY t.id',[id])).rows;
 const funding=await approvedCentralFunding(c,id),body={requestId:id,closeId:close.id,environment:close.environment as 'DEMO'|'MANUAL',receipts,entries,credits,transfers,funding};
 const position=centralPosition({collectedCentavos:amount(gross),refundedCentavos:amount(forecastRefunds),providerFeesCentavos:amount(fees),retainedDepositCentavos:0,allocations,agencyFundingCentavos:amount(funding.reduce((n,f)=>n+BigInt(f.amountCentavos),0n)),disbursedCentavos:amount(transfers.reduce((n,t)=>n+BigInt(t.amount_centavos),0n)),financiallyClosed:true});
 return {...body,sourceDigest:digest(body),position,neededCentavos:position.additionalAgencyFundingNeededCentavos,forecastRefundsCentavos:amount(forecastRefunds)};
}

async function preClosingFunding(c:PoolClient,id:string){
 const receipts=(await c.query("SELECT p.id,p.amount_centavos,p.fee_centavos,p.requires_reconciliation,b.outcome,x.mode,x.quote_id,x.agency_id FROM paymongo_checkout_payment p JOIN paymongo_checkout x ON x.id=p.checkout_id LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id WHERE x.request_id=$1 ORDER BY p.id",[id])).rows;if(!receipts.length)return null;
 if(receipts.some(r=>r.requires_reconciliation||r.outcome!=='COLLECTED'||r.quote_id!==receipts[0].quote_id||r.mode!==receipts[0].mode)||(await c.query("SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND method<>'PAYMONGO'",[id])).rowCount)throw new DomainError('Reconcile original central receipts before pre-closing refund funding.',409);
 const refunds=(await c.query("SELECT r.id,r.amount_centavos,p.id paid_id FROM booking_refund_request r LEFT JOIN booking_refund_decision d ON d.refund_id=r.id LEFT JOIN booking_refund_payment p ON p.refund_id=r.id WHERE r.request_id=$1 AND(p.id IS NOT NULL OR(d.decision='APPROVE' AND NOT EXISTS(SELECT 1 FROM booking_refund_cancel a WHERE a.refund_id=r.id))) ORDER BY r.id",[id])).rows,funding=await approvedCentralFunding(c,id);
 const gross:bigint=receipts.reduce((n,r)=>n+BigInt(r.amount_centavos),0n),fees:bigint=receipts.reduce((n,r)=>n+BigInt(r.fee_centavos),0n),forecast:bigint=refunds.reduce((n,r)=>n+BigInt(r.amount_centavos),0n),funded:bigint=funding.reduce((n,r)=>n+BigInt(r.amountCentavos),0n);if(forecast>gross)throw new DomainError('Approved refund reservations exceed original gross.',409);
 const needed=forecast+fees-gross-funded,neededCentavos=amount(needed>0n?needed:0n),body={requestId:id,closeId:null,environment:receipts[0].mode==='test'?'DEMO' as const:'MANUAL' as const,receipts,entries:[],credits:[],transfers:[],funding,refunds};
 return {...body,sourceDigest:digest(body),position:{agencyFeeShortfallCentavos:neededCentavos,proposedAgencyRecoveryCentavos:0,additionalAgencyFundingNeededCentavos:neededCentavos},neededCentavos,forecastRefundsCentavos:amount(forecast)};
}
