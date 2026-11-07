import Link from 'next/link';
import {notFound} from 'next/navigation';
import {pageActor} from '@/lib/page-actor';
import {uuid} from '@/lib/http';
import {getOwnerPayout} from '@/modules/accounting/owner-accounts';
import {DomainError} from '@/modules/partners/workflow';
import {money,date} from '@/modules/partners/presentation';
import {payoutMethodLabels as methodLabels} from '@/modules/accounting/presentation';
import {PrintButton} from '@/components/print-button';
import '../../booking-agreements/[id]/print.css';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor(),id=uuid.safeParse((await params).id);if(!id.success)notFound();const p=await getOwnerPayout(actor,id.data).catch(e=>{if(e instanceof DomainError&&e.status===404)notFound();throw e;}),r=p.record,back=p.isOwner?`/workspace/earnings/${p.scope.agencyId}`:`/agency/${p.scope.agencyId}/accounting/${encodeURIComponent(p.scope.ownerId)}`;
 return <main id="main-content" className="agreement-print-page"><nav className="agreement-print-controls" aria-label="Owner payout record actions"><Link className="button secondary" href={`${back}?environment=${p.scope.environment}`}>Back to owner account</Link><PrintButton/></nav><h1>{r.environment==='DEMO'?'Simulated owner payout record':'Owner payout record'}</h1><article className="agreement-document">{r.environment==='DEMO'&&<p className="notice">Simulated payout · no money moves.</p>}<h2>{r.agencyName}</h2><p>Vehicle owner: {r.ownerName}</p><p>Recorded {date(p.createdAt)} · recorded by {r.recordedBy}</p><dl className="assessment-totals"><div><dt>Owner payout amount</dt><dd>{money(r.amountCentavos)}</dd></div><div><dt>Method</dt><dd>{methodLabels[r.method as keyof typeof methodLabels]??r.method}</dd></div><div><dt>Outgoing reference</dt><dd>{r.reference}</dd></div><div><dt>Recipient</dt><dd>{r.destination.name}{r.destination.account&&<> · {r.destination.account}</>}</dd></div></dl><p>This record debits the exact approved owner withdrawal once. Approval alone is not payout. Original vehicle earnings and their allocation snapshots remain preserved.</p>{p.evidenceId&&<a href={`/api/owner-payout-files/${p.evidenceId}`} target="_blank" rel="noreferrer">View private execution evidence</a>}<p>Record: {p.id}<br/>Withdrawal: {r.withdrawalId}</p></article></main>;
}
