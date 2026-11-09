import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {centralPosition} from './central-position';
import {buildDisbursementStatement} from './disbursement-statement';
import {gatewayBookingWork} from './booking-guard';

function cents(value:unknown){const n=BigInt(String(value??0));if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new DomainError('Central custody amounts require financial review.',409);return Number(n);}
async function authority(c:PoolClient,actor:Actor,id:string){
 const user=await storedActor(actor,c),r=(await c.query('SELECT id,agency_id,renter_id FROM booking_request WHERE id=$1',[uuid.parse(id)])).rows[0];
 if(!r||user.id===r.renter_id||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Central collection account not found.',404);
 const agency=(await c.query('SELECT g.active AND NOT o.suspended AND NOT o.is_test_fixture active,(g.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$2 AND m.active)) operator FROM agency g JOIN app_actor o ON o.id=g.owner_id WHERE g.id=$1',[r.agency_id,user.id])).rows[0];
 if(user.role!=='SUPER_ADMIN'&&!(agency?.active&&agency.operator))throw new DomainError('Central collection account not found.',404);
 return r;
}
/** Read-only accounting projection from immutable provider receipts and closed
 * allocations. Provider net receipts are not a bank balance or a transfer. */
export async function getCentralCustody(actor:Actor,id:string){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const r=await authority(c,actor,id),schema=(await c.query("SELECT to_regclass('paymongo_checkout_payment') receipts,to_regclass('paymongo_booking_posting') posting")).rows[0];
 const base={requestId:r.id as string,agencyId:r.agency_id as string,custodian:'RENT2GO' as const,feeBearer:'AGENCY' as const,canDisburse:false as const,bankSettlementVerified:false as const};
 const empty={...base,available:false,receipts:[] as {checkoutId:string;receiptId:string;providerPaymentId:string;mode:'test'|'live';grossCentavos:number;feeCentavos:number;netCentavos:number;verifiedAt:string;postingOutcome:string|null}[],verifiedGrossCentavos:0,providerFeesCentavos:0,providerNetReceiptsCentavos:0,financiallyClosed:false,statement:null as ReturnType<typeof buildDisbursementStatement>|null,position:null as ReturnType<typeof centralPosition>|null,blockedReason:'Central payment records are not available.'};
 if(!schema.receipts||!schema.posting)return empty;
 const rows=(await c.query('SELECT p.*,x.quote_id,x.agency_id,b.collection_id,b.outcome FROM paymongo_checkout_payment p JOIN paymongo_checkout x ON x.id=p.checkout_id LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id WHERE x.request_id=$1 ORDER BY p.verified_at,p.id LIMIT 1001',[id])).rows;
 if(rows.length>1000)throw new DomainError('Central payment history requires a dedicated financial review.',409);
 const sum=(key:string)=>cents(rows.reduce((n,p)=>n+BigInt(p[key]),0n));
 const gross=sum('amount_centavos'),fees=sum('fee_centavos'),net=sum('net_centavos');
 if(BigInt(fees)+BigInt(net)!==BigInt(gross))throw new DomainError('Provider receipt totals do not conserve funds.',409);
 const close=(await c.query('SELECT id,request_id,agency_id,quote_id,environment,total_centavos FROM booking_financial_close WHERE request_id=$1',[id])).rows[0];
 let blockedReason:string|null=!rows.length?'No provider-confirmed funds are recorded.':!close?'Financial closing is required before agency disbursement.':null,position:ReturnType<typeof centralPosition>|null=null,statement:ReturnType<typeof buildDisbursementStatement>|null=null;
 if(close&&rows.length){
  const work=await gatewayBookingWork(c,id);
  const facts=(await c.query(`SELECT
   EXISTS(SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND method<>'PAYMONGO') mixed,
   EXISTS(SELECT 1 FROM booking_refund_payment WHERE request_id=$1) legacy_refund,
   EXISTS(SELECT 1 FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id WHERE e.request_id=$1) credit`,[id])).rows[0];
  if(work.unresolved||rows.some(p=>p.outcome!=='COLLECTED'||p.requires_reconciliation||p.quote_id!==close.quote_id))blockedReason='Reconcile every original provider receipt and booking source before allocating funds.';
  else if(facts.mixed||facts.legacy_refund||facts.credit)blockedReason='Collections, refunds or later revenue credits require a separately verified central adjustment.';
  else{
   const entries=(await c.query('SELECT id,close_id,request_id,quote_id,agency_id,environment,recipient,beneficiary_actor_id,amount_centavos FROM booking_revenue_entry WHERE close_id=$1',[close.id])).rows;
   const allocated=entries.reduce((n,e)=>n+BigInt(e.amount_centavos),0n);
   if(allocated!==BigInt(close.total_centavos)||allocated!==BigInt(gross))blockedReason='Reconcile retained deposits, provider refunds and the exact accepted revenue allocations first.';
   else{
    try{
     statement=buildDisbursementStatement({requestId:r.id,agencyId:r.agency_id,quoteId:close.quote_id,closeId:close.id,environment:close.environment,closedRevenueCentavos:cents(close.total_centavos),unresolvedGatewayCount:work.unresolved,refundReservationsCentavos:0,verifiedRefundedCentavos:0,revenueCreditCount:0,
      receipts:rows.map(p=>({id:p.id,checkoutId:p.checkout_id,paymentId:p.payment_id,collectionId:p.collection_id,requestId:r.id,quoteId:p.quote_id,agencyId:p.agency_id,mode:p.mode,grossCentavos:cents(p.amount_centavos),feeCentavos:cents(p.fee_centavos),netCentavos:cents(p.net_centavos),postingOutcome:p.outcome,requiresReconciliation:p.requires_reconciliation})),
      entries:entries.map(e=>({id:e.id,closeId:e.close_id,requestId:e.request_id,quoteId:e.quote_id,agencyId:e.agency_id,environment:e.environment,recipient:e.recipient,beneficiaryActorId:e.beneficiary_actor_id,amountCentavos:cents(e.amount_centavos)}))});
     position=statement.position;blockedReason=position.blockedReason??'Agency disbursement requires its own reviewed execution record.';
    }catch(error){if(!(error instanceof DomainError)||error.status!==409)throw error;blockedReason=error.message;}
   }
  }
 }
 return {...base,available:true,receipts:rows.map(p=>({checkoutId:p.checkout_id as string,receiptId:p.id as string,providerPaymentId:p.payment_id as string,mode:p.mode as 'test'|'live',grossCentavos:cents(p.amount_centavos),feeCentavos:cents(p.fee_centavos),netCentavos:cents(p.net_centavos),verifiedAt:(p.verified_at as Date).toISOString(),postingOutcome:p.outcome as string|null})),verifiedGrossCentavos:gross,providerFeesCentavos:fees,providerNetReceiptsCentavos:net,financiallyClosed:Boolean(close),statement,position,blockedReason};
});}
