# Payments and agency funds

## Customer checkout

1. The agency publishes an approved policy that explicitly accepts PayMongo. Existing quotations retain their saved methods.
2. The renter sends a request. The agency reviews availability, requirements and any optional callback history, then issues the quotation and agreement.
3. The renter accepts the quotation and signs its agreement while the allocation is valid.
4. In the booking payment section, the renter reviews the central collection/deposit notice and prepares secure checkout. The payment worker creates one durable hosted checkout and retrieves its verified result.
5. The renter continues to PayMongo. Returning to Rent2Go is not payment confirmation. Only the provider-verified payment creates the collection record and updates the booking.

Rent2Go centrally holds online collections and refundable deposits. Provider fees are an agency expense. Owner, maintenance and platform percentages remain unchanged. Test keys produce test payments only; live activation has a separate explicit gate.

## Approved refunds

1. The renter requests an amount against an original collection and its accepted service policies.
2. The agency approves or rejects that exact request with a reason.
3. A separate platform reviewer opens Payment reconciliation → Provider refunds, reviews the saved amount, original collection, policies and agency decision, then authorizes execution.
4. The worker sends the original amount and original payment ID with a durable retry key. Pending/processing results remain unpaid. A successful, matching provider resource creates exactly one refund payment record.
5. An interrupted or mismatched request remains reserved for reconciliation. An existing provider refund ID can be retrieved and matched; this action does not create a new refund. The API retry window is bounded below the provider's 24-hour idempotency expiry.

Refund execution after a recorded agency disbursement is currently withheld for a separate agency funding/recovery review. Fee shortfalls and later revenue credits also withhold disbursement rather than reducing protected allocations.

## Agency disbursements

1. Complete the booking's financial closing. Resolve all retained deposits and approved refunds first. Exact original provider receipts and original closed allocation entries must conserve the remaining gross.
2. The agency opens its booking → Agency disbursement, reviews the available allocation, and submits its receiving account and request notes.
3. A platform reviewer who is not the agency owner, member, renter or affected Cosigner approves or rejects the request. Approval does not move money.
4. After completing the external transfer, the platform records the exact reference and private transfer proof. Live records require proof; test records never imply a real transfer.
5. A separate agency operator confirms receipt of that exact transfer. Only this confirmation releases the corresponding Cosigner earnings from central custody into the agency's owner account.
6. Owner withdrawals continue through the existing reviewed payout workflow. Original transfer, confirmation and source allocation records remain immutable.

Bank transfers are recorded separately from PayMongo collections. There is no automatic bank disbursement API in this workflow.

## Operation and acceptance

Run the web app and exactly one `npm run payment:process` worker. The managed lease prevents duplicate workers. Service health reports successful and failed batches. Local polling supports localhost without a public webhook. A deployed installation needs a continuously running worker or a reviewed managed equivalent; public webhook activation is a separate configuration choice.

Before live activation, complete an actual hosted PayMongo test payment and refund round trip, check the provider dashboard, review fee-shortfall and post-disbursement refund recovery cases, and configure production secrets, storage, HTTPS and worker supervision. Never put credentials in this file or version control.
