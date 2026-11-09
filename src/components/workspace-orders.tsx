import Link from 'next/link';
import {WorkspaceServicePhoto} from './workspace-service-photo';
import {ArrowRight,ShoppingCart} from 'lucide-react';
import type {readCart} from '@/modules/cart/service';
import type {WorkspaceLabels} from '@/modules/workspace/service';
import type {bookingOverview} from '@/modules/workspace/service';
import type {CartQuote} from '@/modules/cart/pricing';
import {date,money} from '@/modules/partners/presentation';
import {statusLabels} from './booking-list';

function Service({quote,labels}:{quote:CartQuote;labels:WorkspaceLabels}){
 const title=labels.services[quote.selection.kind+':'+(quote.selection.kind==='RENTAL'?quote.selection.offerId:quote.selection.tourId)]??quote.title;
 return <div className="workspace-service"><WorkspaceServicePhoto src={quote.photoId?(quote.selection.kind==='RENTAL'?`/api/vehicle-files/${quote.photoId}`:`/api/tour-photos/${quote.photoId}`):null} title={title}/><div><strong>{title}</strong><small>{date(quote.startAt)} – {date(quote.endAt)}</small><small>{quote.selection.kind==='RENTAL'?(quote.selection.mode==='WITH_DRIVER'?'With driver':'Self-drive'):'Tour / package'} · {quote.selection.partySize} {quote.selection.partySize===1?'traveler':'travelers'}</small></div></div>;
}
export function WorkspaceOrders({cart,bookings,labels={services:{},agencies:{}}}:{labels?:WorkspaceLabels;cart:Awaited<ReturnType<typeof readCart>>;bookings:Awaited<ReturnType<typeof bookingOverview>>}){
 return <div className="workspace-orders">
  <section className="workspace-order-section"><div className="workspace-section-heading"><h2><ShoppingCart size={21} aria-hidden="true"/>Your cart <span>{cart.totalItems}</span></h2>{cart.totalItems>0&&<Link href="/cart">Review cart <ArrowRight size={16} aria-hidden="true"/></Link>}</div>
   {!cart.totalItems?<p className="workspace-order-empty">Your cart is empty. <Link href="/rentals">Find a car</Link> or <Link href="/tours">explore tours</Link> for your next trip.</p>:<><div className="workspace-cart-groups">{cart.groups.map(g=><article key={g.agencyId} className="workspace-order-card"><p className="eyebrow">{labels.agencies[g.agencyId]??g.name}</p>{g.items.map(item=><div key={item.id}><Service quote={item.savedQuote} labels={labels}/>{item.status!=='CURRENT'&&<p className="workspace-cart-warning">{item.reason}</p>}</div>)}</article>)}</div><div className="workspace-cart-total"><span>Saved estimate, including refundable deposits</span><strong>{money(cart.totals.estimatedDueCentavos)}</strong></div><p className="workspace-order-hint">Your cart does not reserve availability. Review current prices and terms before sending a request.</p></>}
  </section>
  {(['active','history'] as const).map(kind=>{const group=bookings[kind];return <section key={kind} className="workspace-order-section" id={kind==='active'?'current-bookings':'booking-history'}><div className="workspace-section-heading"><h2>{kind==='active'?'Current booking requests':'Booking history'} <span>{group.total}</span></h2></div>
   {!group.items.length?<p className="workspace-order-empty">{kind==='active'?'No current booking requests. Requests you submit will appear here.':'No past bookings yet. Completed and closed requests will appear here.'}</p>:<div className="workspace-booking-grid">{group.items.map(r=><article key={r.id} className="workspace-order-card"><div className="workspace-order-card-heading"><strong>{labels.agencies[r.lines[0]?.quote.agencyId??'']??r.agencyName}</strong><span className="workspace-order-status">{statusLabels[r.status]??r.status.replaceAll('_',' ').toLowerCase()}</span></div><p className="workspace-order-hint">Requested {date(r.createdAt)} · #{r.id.slice(0,8)}</p>{r.lines.map(l=><Service key={l.id} quote={l.quote} labels={labels}/>)}<div className="workspace-order-bottom"><span>{r.acceptedTotal===null?'Requested estimate':'Accepted quotation'}<strong>{money(r.acceptedTotal??r.lines.reduce((sum,l)=>sum+l.quote.estimate.estimatedDueCentavos,0))}</strong></span><Link className="button secondary" href={`/workspace/bookings/${r.id}`}>View request <ArrowRight size={16} aria-hidden="true"/></Link></div></article>)}</div>}
   {group.pageCount>1&&<nav className="page-navigation" aria-label={kind==='active'?'Current request pages':'Booking history pages'}>{group.page>1&&<Link href={pageLink(kind,group.page-1,bookings)}>Previous</Link>}<span>Page {group.page} of {group.pageCount}</span>{group.page<group.pageCount&&<Link href={pageLink(kind,group.page+1,bookings)}>Next</Link>}</nav>}
  </section>;})}
 </div>;
}
function pageLink(kind:'active'|'history',page:number,bookings:Awaited<ReturnType<typeof bookingOverview>>){return `/workspace?${new URLSearchParams({activePage:String(kind==='active'?page:bookings.active.page),historyPage:String(kind==='history'?page:bookings.history.page)})}#${kind==='active'?'current-bookings':'booking-history'}`;}
