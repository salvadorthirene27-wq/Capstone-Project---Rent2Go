import Link from "next/link";
import {notFound} from "next/navigation";
import {pageActor} from "@/lib/page-actor";
import {uuid} from "@/lib/http";
import {getRefundReceipt} from "@/modules/bookings/refund";
import {DomainError} from "@/modules/partners/workflow";
import {RefundReceiptDocument} from "@/components/refund-receipt-document";
import {PrintButton} from "@/components/print-button";
import "../../booking-agreements/[id]/print.css";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor(),id=uuid.safeParse((await params).id);if(!id.success)notFound();const record=await getRefundReceipt(actor,id.data).catch(error=>{if(error instanceof DomainError&&error.status===404)notFound();throw error;});
 const back=record.isOwner?`/workspace/bookings/${record.requestId}`:`/agency/${record.agencyId}/bookings/${record.requestId}`;
 return <main id="main-content" className="agreement-print-page"><nav className="agreement-print-controls" aria-label="Refund record actions"><Link className="button secondary" href={back}>Back to booking request</Link><PrintButton/></nav><h1>{record.receipt.environment==="DEMO"?"Demo refund record":"Refund payment record"}</h1><RefundReceiptDocument receipt={record.receipt}/></main>;
}
