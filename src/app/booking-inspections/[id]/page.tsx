import Link from "next/link";
import {notFound} from "next/navigation";
import {pageActor} from "@/lib/page-actor";
import {uuid} from "@/lib/http";
import {getInspectionById} from "@/modules/bookings/fulfillment";
import {DomainError} from "@/modules/partners/workflow";
import {InspectionDocument} from "@/components/inspection-document";
import {PrintButton} from "@/components/print-button";
import "../../booking-agreements/[id]/print.css";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor(),id=uuid.safeParse((await params).id);
 if(!id.success)notFound();
 const record=await getInspectionById(actor,id.data).catch(error=>{
  if(error instanceof DomainError&&error.status===404)notFound();
  throw error;
 });
 const back=record.isOwner?`/workspace/bookings/${record.requestId}`:`/agency/${record.agencyId}/bookings/${record.requestId}`;
 return <main id="main-content" className="agreement-print-page">
  <nav className="agreement-print-controls" aria-label="Inspection actions"><Link className="button secondary" href={back}>Back to booking request</Link><PrintButton/></nav>
  <h1>Saved vehicle condition report</h1>
  {record.environment==="DEMO"&&<p className="notice"><strong>Simulated booking · no charge</strong></p>}
  <p>This is an exact historical inspection version. Check the booking request for corrections, current service status and financial reconciliation. A condition response does not authorize deposit deductions or additional charges.</p>
  <InspectionDocument report={record.inspection}/>
  <p>Report reference: {record.inspection.id}</p>
 </main>;
}
