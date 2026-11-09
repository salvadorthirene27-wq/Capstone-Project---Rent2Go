export function PartnershipGuide({open=false}:{open?:boolean}){
 return <details className="partnership-guide" open={open}><summary>Agency application guide</summary>
  <p>Follow the same six sections in your application. Save a draft and return when you have the remaining details. Creating a draft does not submit it for approval.</p>
  <ol>
   <li><strong>Business details</strong>Prepare your registered name, representative, business contacts, service areas and registration evidence.</li>
   <li><strong>Services</strong>Choose self-drive rentals, rentals with a driver, scheduled group tours or private tours offered by your agency.</li>
   <li><strong>Terms & policies</strong>Explain eligibility, required documents, cancellations, refunds, damage and late-return rules so renters can review them before booking.</li>
   <li><strong>Pricing</strong>Set rates, refundable deposits, additional charges and driver-fee units. Individual vehicles and packages have their own listing details.</li>
   <li><strong>Payments & shares</strong>Choose renter payment options and how your agency settles with Rent2Go. Consigned defaults are 70% Cosigner, 10% agency, 10% Rent2Go and 10% maintenance; agreed shares can change but must total 100%.</li>
   <li><strong>Review & submit</strong>Check required fields and evidence, then submit the exact version. Super Admin can approve it or request specific changes. Approval opens your agency workspace; policy revisions receive their own review.</li>
  </ol>
  <p>After approval, manage your staff, fleet, calendars, drivers, tours and booking requests from the agency workspace. Agencies review renter requirements before quotation, agreement and payment.</p>
 </details>;
}
