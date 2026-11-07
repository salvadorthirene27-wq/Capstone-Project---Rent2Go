import type {getOperations} from '@/modules/operations/service';
import {date} from '@/modules/partners/presentation';
const labels:Record<string,string>={NOT_STARTED:'Not started',STOPPED:'Stopped',STALE:'No recent worker contact',NEEDS_ATTENTION:'Recent batch needs attention',RUNNING:'Running',STARTING:'Starting'};
export function OperationsOverview({data}:{data:Awaited<ReturnType<typeof getOperations>>}){
 const h=data.holdExpiry;
 return <section aria-label="Platform service health"><p>Checked {date(data.preparedAt)}. Refresh to request a new observation.</p><dl className="finance-summary"><div><dt>Database</dt><dd>Reachable</dd></div><div><dt>Quotation expiry service</dt><dd>{labels[h.state]}</dd></div><div><dt>Expired uncommitted holds awaiting release</dt><dd>{h.awaitingExpiry}</dd></div><div><dt>Notification email sending</dt><dd>{data.emailDispatchEnabled?'Enabled':'Off'}</dd></div></dl>
  <p>Expiry releases unpaid quotation reservations after their saved deadline. Confirmed commitments and recorded funds remain protected. A recent worker contact is separate from a successful completed batch.</p>
  {h.state!=='RUNNING'&&<p className="notice">Review the expiry service before the next demonstration. Stop any older unmanaged worker, then use the documented local launcher. The website does not start duplicate background processes.</p>}
  <dl className="assessment-totals"><div><dt>Last worker contact</dt><dd>{h.lastSeenAt?date(h.lastSeenAt):'Not recorded'}</dd></div><div><dt>Last successful batch</dt><dd>{h.lastSuccessAt?date(h.lastSuccessAt):'Not recorded'}</dd></div><div><dt>Last failed batch</dt><dd>{h.lastFailureAt?date(h.lastFailureAt):'None recorded'}</dd></div><div><dt>Latest completed batch result</dt><dd>{h.lastProcessed===null?'Release count unavailable':`${h.lastProcessed} holds released`}</dd></div></dl>
  <h2>Recent expiry batches</h2>{data.history.length===0?<p>No managed expiry batches have been recorded.</p>:<ol className="notification-list">{data.history.map((r,i)=><li key={`${r.startedAt}:${i}`} className="assessment-record"><h3>{r.outcome==='SUCCEEDED'?'Batch completed':'Batch failed'}</h3><p>{date(r.completedAt)} · {r.outcome==='FAILED'?'Release count unavailable; inspect and retry safely.':`${r.processed} holds released.`}</p>{r.errorType&&<p>Error category: {r.errorType}</p>}</li>)}</ol>}
  <p>Email configuration does not establish delivery. Enabling or dispatching email remains a separate authorized operator action. This screen sends no email and changes no bookings.</p>
 </section>;
}
