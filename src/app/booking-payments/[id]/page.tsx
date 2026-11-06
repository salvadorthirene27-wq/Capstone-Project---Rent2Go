import Link from "next/link";
import {notFound} from "next/navigation";
import {pageActor} from "@/lib/page-actor";
import {uuid} from "@/lib/http";
import {getPaymentReceipt} from "@/modules/bookings/payment";
import {DomainError} from "@/modules/partners/workflow";
import {PaymentReceiptDocument} from "@/components/payment-receipt-document";
import {PrintButton} from "@/components/print-button";
import "../../booking-agreements/[id]/print.css";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor(),id=uuid.safeParse((await params).id);
 if(!id.success)notFound();
 const record=await getPaymentReceipt(actor,id.data).catch(error=>{
  if(error instanceof DomainError&&error.status===404)notFound();
  throw error;
 });
 const back=record.isOwner?`/workspace/bookings/${record.requestId}`:`/agency/${record.agencyId}/bookings/${record.requestId}`;
 return <main id="main-content" className="agreement-print-page">
  <nav className="agreement-print-controls" aria-label="Collection record actions">
   <Link className="button secondary" href={back}>Back to booking request</Link>
   <PrintButton/>
  </nav>
  <h1>{record.receipt.environment==="DEMO"?"Simulated payment record":"Payment collection record"}</h1>
  <PaymentReceiptDocument receipt={record.receipt}/>
 </main>;
}
