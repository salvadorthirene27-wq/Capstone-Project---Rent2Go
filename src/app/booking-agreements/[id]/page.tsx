import Link from "next/link";
import {notFound} from "next/navigation";
import {pageActor} from "@/lib/page-actor";
import {getAgreementById} from "@/modules/bookings/agreement";
import {getBookingRequest} from "@/modules/bookings/service";
import {DomainError} from "@/modules/partners/workflow";
import {AgreementDocument} from "@/components/agreement-document";
import {PrintButton} from "@/components/print-button";
import "./print.css";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const actor=await pageActor();
 const record=await getAgreementById(actor,(await params).id).catch(error=>{
  if(error instanceof DomainError&&error.status===404)notFound();
  throw error;
 });
 const a=record.agreement;
 const booking=await getBookingRequest(actor,record.requestId);
 const back=booking.isOwnRequest?`/workspace/bookings/${record.requestId}`:`/agency/${booking.agencyId}/bookings/${record.requestId}`;
 return <main id="main-content" className="agreement-print-page">
  <nav className="agreement-print-controls" aria-label="Agreement actions">
   <Link className="button secondary" href={back}>Back to booking request</Link>
   <PrintButton/>
  </nav>
  <h1>Service agreement</h1>
  <p>Saved document version {a.revision} · {a.outcome.toLowerCase()}</p>
  <p>A recorded signature applies only to this saved document and its quotation. Check the booking request for the current hold, payment and fulfillment status.</p>
  <AgreementDocument revision={a.revision} issuedAt={a.issuedAt} expiresAt={a.expiresAt} body={a.body} signature={a.signature}/>
 </main>;
}
