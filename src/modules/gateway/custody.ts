import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {centralPosition} from './central-position';
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
 const empty={...base,available:false,receipts:[] as {checkoutId:string;receiptId:string;providerPaymentId:string;mode:'test'|'live';grossCentavos:number;feeCentavos:number;netCentavos:number;verifiedAt:string;postingOutcome:string|null}[],verifiedGrossCentavos:0,providerFeesCentavos:0,providerNetReceiptsCentavos:0,financiallyClosed:false,position:null as ReturnType<typeof centralPosition>|null,blockedReason:'Central payment records are not available.'};
 if(!schema.receipts||!schema.posting)return empty;
 const rows=(await c.query('SELECT p.*,x.quote_id,b.outcome FROM paymongo_checkout_payment p JOIN paymongo_checkout x ON x.id=p.checkout_id LEFT JOIN paymongo_booking_posting b ON b.checkout_id=x.id WHERE x.request_id=$1 ORDER BY p.verified_at,p.id LIMIT 1001',[id])).rows;
 if(rows.length>1000)throw new DomainError('Central payment history requires a dedicated financial review.',409);
 const sum=(key:string)=>cents(rows.reduce((n,p)=>n+BigInt(p[key]),0n));
 const gross=sum('amount_centavos'),fees=sum('fee_centavos'),net=sum('net_centavos');
 if(BigInt(fees)+BigInt(net)!==BigInt(gross))throw new DomainError('Provider receipt totals do not conserve funds.',409);
 const close=(await c.query('SELECT id,quote_id,total_centavos FROM booking_financial_close WHERE request_id=$1',[id])).rows[0];
 let blockedReason:string|null=!rows.length?'No provider-confirmed funds are recorded.':!close?'Financial closing is required before agency disbursement.':null,position:ReturnType<typeof centralPosition>|null=null;
 if(close&&rows.length){
  const work=await gatewayBookingWork(c,id);
  const facts=(await c.query(`SELECT
   EXISTS(SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND method<>'PAYMONGO') mixed,
   EXISTS(SELECT 1 FROM booking_refund_payment WHERE request_id=$1) legacy_refund,
   EXISTS(SELECT 1 FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id WHERE e.request_id=$1) credit`,[id])).rows[0];
  if(work.unresolved||rows.some(p=>p.outcome!=='COLLECTED'||p.requires_reconciliation||p.quote_id!==close.quote_id))blockedReason='Reconcile every original provider receipt and booking source before allocating funds.';
  else if(facts.mixed||facts.legacy_refund||facts.credit)blockedReason='Collections, refunds or later revenue credits require a separately verified central adjustment.';
  else{
   const entries=(await c.query('SELECT recipient,sum(amount_centavos)::text n FROM booking_revenue_entry WHERE close_id=$1 GROUP BY recipient',[close.id])).rows;
   const allocations={cosigner:0,agency:0,platform:0,maintenance:0};
   for(const e of entries)allocations[e.recipient.toLowerCase() as keyof typeof allocations]=cents(e.n);
   const allocated=Object.values(allocations).reduce((n,v)=>n+BigInt(v),0n);
   if(allocated!==BigInt(close.total_centavos)||allocated!==BigInt(gross))blockedReason='Reconcile retained deposits, provider refunds and the exact accepted revenue allocations first.';
   else{position=centralPosition({collectedCentavos:gross,refundedCentavos:0,providerFeesCentavos:fees,retainedDepositCentavos:0,allocations,agencyFundingCentavos:0,disbursedCentavos:0,financiallyClosed:true});blockedReason=position.blockedReason??'Agency disbursement requires its own reviewed execution record.';}
  }
 }
 return {...base,available:true,receipts:rows.map(p=>({checkoutId:p.checkout_id as string,receiptId:p.id as string,providerPaymentId:p.payment_id as string,mode:p.mode as 'test'|'live',grossCentavos:cents(p.amount_centavos),feeCentavos:cents(p.fee_centavos),netCentavos:cents(p.net_centavos),verifiedAt:(p.verified_at as Date).toISOString(),postingOutcome:p.outcome as string|null})),verifiedGrossCentavos:gross,providerFeesCentavos:fees,providerNetReceiptsCentavos:net,financiallyClosed:Boolean(close),position,blockedReason};
});}
