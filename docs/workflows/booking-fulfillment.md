# Rental and tour delivery

Authority: approved refined manuscript pages31–34, approved design section7, and the user's instruction to include driver fees in the accepted rental revenue basis. Physical service records never settle customer deposits or post earnings.

## Entry and permissions

The current accepted quotation must have its exact signed agreement, a committed unreleased allocation, and confirmed collections covering services plus refundable deposits. Historical or partially funded quotations do not authorize delivery. Only the booking's active renter and independent active operators of its agency can read private fulfillment records. Super Admin and Cosigner roles do not bypass this boundary. All commands validate current version and exact retry key/body, lock the request and recheck participant authority before the service operation.

## Rentals

1. The operator uploads private PNG/JPEG condition photos and saves a versioned pre-inspection containing mileage, fuel in eighths, cleanliness, condition/damage notes, roadworthiness and a safety checklist. Each report preserves1–8 exact photo references. Upload authorization is checked before storage and again before attaching metadata; stale writes clean up their orphan object.
2. The renter accepts or disputes the exact report ID and digest. A dispute preserves its reason; a correction creates a new report version requiring a new response. Draft photos remain agency-only until referenced by a saved report.
3. The agency records actual handover during the purchased pickup/service window. Current accepted pre-inspection, reviewed unexpired renter documents, published vehicle, active owner/resources and any assigned driver's valid license are rechecked. Resource locks serialize handovers; open actual occupancy, return turnaround and unresolved unsafe-return holds prevent another release. Actual vehicle and driver occupancy remains open until physical return, including after scheduled end.
4. The first return inspection records physical return, closes actual occupancy once and applies the accepted turnaround buffer. Return mileage cannot precede the saved pre-inspection. Renter acceptance/dispute follows separately; a dispute does not make a physically returned car remain out. Corrected reports retain earlier reports and responses.
5. An unsafe return keeps the vehicle unavailable beyond turnaround until a later safe, checked return report is accepted. Maintenance can still be recorded for repair outside physical occupation/buffer conflicts. A vehicle safety hold does not indefinitely occupy its driver.

Private participant-only saved-report pages preserve exact historical condition and renter responses and offer browser printing. They warn that historical reports may have corrections and do not authorize financial deductions. Private photo downloads retain authorization and no-store/protective headers.

## Tours and mixed requests

The agency records guests present (at least1 and no more than the booked party), attendance note and explicit tour start within the scheduled window. It then records explicit completion. Both group seats and private party slots use their allocated departure; no rental inspection or vehicle handover is inferred. Consumed departure capacity remains historical and is not reopened by service completion.

Each line progresses independently. Any started service makes the aggregate SERVICE_ACTIVE. Only after every rental is physically returned and every tour completed does the request reach FULFILLMENT_RECONCILIATION_PENDING. Return disputes remain visible. Neither state implies financial completion, deposit refund or earnings.

## Availability and evidence

Search, driver choices, locked allocation, manual blocks and resource availability consider actual occupation and return buffer. Overdue resources block fresh use and the resource page reports upcoming conflict counts without exposing renter identity. Resource activity is rechecked from the row acquired after lock waits.

Synthetic development checks cover exact responses/retries, mixed lines, private files, scheduled/document/funding gates, overdue/buffer/safety behavior, restricted runtime privileges and concurrent membership/resource updates. Production HTTP uses managed Auth and private S3 with clearly labeled synthetic records. These checks are not human usability results. Deposit/refund/charge reconciliation and earnings remain separate following modules.
