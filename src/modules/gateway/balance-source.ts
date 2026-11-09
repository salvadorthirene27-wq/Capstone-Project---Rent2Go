import type {PoolClient} from 'pg';
import {DomainError} from '../partners/workflow';
import {financialContext,financialLines,lockFinancialAuthority} from '../bookings/finance-context';
import {acceptedSettlement} from '../bookings/settlement';
import {savedPolicy} from '../bookings/payment';
export async function settlementCheckoutLink(c:PoolClient,id:string){if(!(await c.query("SELECT to_regclass('paymongo_settlement_checkout') present")).rows[0].present)return null;return(await c.query('SELECT * FROM paymongo_settlement_checkout WHERE checkout_id=$1',[id])).rows[0]??null;}
export async function balanceSource(c:PoolClient,row:{request_id:string;renter_id:string;quote_id:string;agreement_id:string;amount_centavos:string},link:{settlement_id:string;settlement_digest:string}){
 const ctx=await financialContext(c,{id:row.renter_id,role:'RENTER'},row.request_id);await lockFinancialAuthority(c,ctx,false,await financialLines(c,row.quote_id));
 const s=await acceptedSettlement(c,ctx,link.settlement_id,link.settlement_digest),account=(await c.query('SELECT id,environment,agreement_id FROM booking_payment_account WHERE quote_id=$1',[row.quote_id])).rows[0];
 if(!account||account.agreement_id!==row.agreement_id||account.environment!==s.row.environment||s.row.quote_id!==row.quote_id||!s.b.funds||s.b.funds.additionalBalanceCentavos!==Number(row.amount_centavos)||!(await savedPolicy(c,ctx)).methods.includes('PAYMONGO'))throw new DomainError('Review the exact current accepted settlement balance.',409);
 if((await c.query("SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND method<>'PAYMONGO'",[row.request_id])).rowCount)throw new DomainError('Reconcile the original collection channel.',409);
 return {ctx,settlement:s,account};
}
