/** Fixed server-owned SQL fragments. Classification follows the immutable
 * collection channel, not today's gateway flag, merchant key or agency policy. */
export function centrallyCollectedRevenueSql(alias='e'){
 if(!/^[a-z]+$/.test(alias))throw Error('Invalid revenue alias.');
 return `EXISTS(SELECT 1 FROM booking_payment_collection central WHERE central.request_id=${alias}.request_id AND central.quote_id=${alias}.quote_id AND central.environment=${alias}.environment AND central.method='PAYMONGO')`;
}
export function heldOwnerRevenueSql(alias='e'){
 const central=centrallyCollectedRevenueSql(alias);
 // A later agency-disbursement module must consume documented allocations.
 // Until then no centrally held owner amount is spendable at the agency.
 return `CASE WHEN ${central} THEN GREATEST(${alias}.amount_centavos-COALESCE((SELECT sum(credit.amount_centavos) FROM booking_revenue_credit credit WHERE credit.entry_id=${alias}.id),0),0) ELSE 0 END`;
}
