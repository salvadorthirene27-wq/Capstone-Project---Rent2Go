import Link from "next/link";
import {ArrowRight,FileText,CalendarDays,Wallet,ClipboardCheck} from "lucide-react";
const next:Record<string,{label:string;detail:string;href:string}>={
 REQUIREMENTS_PENDING:{label:"Review booking requirements",detail:"Submit the requested documents and follow the agency's review.",href:"#requirements-heading"},
 UNDER_REVIEW:{label:"Check the document review",detail:"Read the review status and any notes from the agency.",href:"#requirements-heading"},
 CHANGES_REQUESTED:{label:"Update the requested information",detail:"Review the agency's reasons and submit the required corrections.",href:"#requirements-heading"},
 READY_FOR_APPROVAL:{label:"Review the quotation step",detail:"The agency can prepare a quotation after accepting the requirements.",href:"#quotation-heading"},
 QUOTE_PENDING:{label:"Review your quotation",detail:"Check the price, dates and expiry before responding.",href:"#quotation-heading"},
 QUOTE_ACCEPTED:{label:"Continue to the agreement",detail:"Review the agreement prepared from the accepted quotation.",href:"#agreement-heading"},
 AGREEMENT_PENDING:{label:"Review and sign the agreement",detail:"Read the terms before recording your consent.",href:"#agreement-heading"},
 AGREEMENT_SIGNED:{label:"Review payment options",detail:"Follow the agency's instructions for the signed agreement.",href:"#payments-heading"},
 PAYMENT_PARTIAL:{label:"Check the remaining payment",detail:"Review confirmed collections and any amount still due.",href:"#payments-heading"},
 READY_FOR_SERVICE:{label:"Prepare for your service",detail:"Check the handover, inspection or tour attendance details.",href:"#fulfillment-heading"},
 SERVICE_ACTIVE:{label:"Follow service delivery",detail:"Review return details, inspections and tour progress.",href:"#fulfillment-heading"},
 FULFILLMENT_RECONCILIATION_PENDING:{label:"Review the financial assessment",detail:"Check service credits, extra charges and the amount to reconcile.",href:"#assessment-title"},
 CANCELLED_RECONCILIATION_PENDING:{label:"Review cancellation finances",detail:"Check the assessment and any refund still requiring review or payment.",href:"#assessment-title"},
 PAYMENT_RECONCILIATION_REQUIRED:{label:"Review payment records",detail:"The agency needs to reconcile the recorded collections.",href:"#payments-heading"},
 CANCELLED:{label:"View the cancellation record",detail:"Your saved booking history and cancellation decision remain available.",href:"#cancellation-heading"},
 REJECTED:{label:"Read the agency's decision",detail:"Check the saved reason before making another request.",href:"#booking-history"},
 QUOTE_DECLINED:{label:"Review the declined quotation",detail:"Your response and the saved quotation remain available.",href:"#quotation-heading"},
 HOLD_EXPIRED:{label:"Review the expired quotation",detail:"The reservation window has ended. Check the saved details before requesting new dates.",href:"#quotation-heading"},
};
export function BookingJourney({status}:{status:string}){
 const action=next[status];
 return <section className="booking-journey" aria-label="Booking steps">
  {action&&<div className="booking-next"><div><span>Next step</span><h2>{action.label}</h2><p>{action.detail}</p></div><Link className="button" href={action.href}>Go to this step<ArrowRight size={17} aria-hidden="true"/></Link></div>}
  <nav aria-label="Booking sections">
   <Link href="#requirements-heading"><FileText size={17} aria-hidden="true"/>Documents</Link>
   <Link href="#quotation-heading">Quotation</Link><Link href="#agreement-heading">Agreement</Link>
   <Link href="#payments-heading"><Wallet size={17} aria-hidden="true"/>Payments</Link>
   <Link href="#fulfillment-heading"><CalendarDays size={17} aria-hidden="true"/>Service</Link>
   <Link href="#assessment-title"><ClipboardCheck size={17} aria-hidden="true"/>Assessment</Link>
   <Link href="#refunds-heading">Refunds</Link><Link href="#cancellation-heading">Cancellation</Link>
  </nav>
 </section>;
}
