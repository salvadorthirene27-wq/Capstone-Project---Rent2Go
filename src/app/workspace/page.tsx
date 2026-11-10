import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {Workspace} from '@/components/workspace';
import {WorkspaceOrders} from '@/components/workspace-orders';
import {pageActor} from '@/lib/page-actor';
import {myAgencies} from '@/modules/agencies/service';
import {readCart} from '@/modules/cart/service';
import {bookingOverview,workspaceLabels} from '@/modules/workspace/service';
import {dashboardTrend,getReport} from '@/modules/reports/service';
import {listVehicleOffers} from '@/modules/vehicles/service';
import {money} from '@/modules/partners/presentation';
import {DashboardTrend} from '@/components/dashboard-trend';
import {DashboardMetrics} from '@/components/dashboard-metrics';
import {notFound} from 'next/navigation';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),filters=await searchParams;
 const cosigner=actor.role==='COSIGNER';
 const [agencies,cart,bookings,vehicles,report,trend]=await Promise.all([
  myAgencies(actor),
  readCart(actor),
  bookingOverview(actor,filters).catch(error=>{if(error instanceof ZodError)notFound();throw error;}),
  cosigner ? listVehicleOffers(actor,{scope:'OWNED',pageSize:4}) : null,
  cosigner ? getReport(actor,{type:'OWNER'}) : null,
  cosigner ? dashboardTrend(actor,{type:'OWNER'}) : null,
 ]);
 const labels=await workspaceLabels(actor,[...cart.groups.flatMap(g=>g.items.map(i=>i.savedQuote)),...[...bookings.active.items,...bookings.history.items].flatMap(r=>r.lines.map(l=>l.quote))]);
 const value=(key:string)=>report?.metrics.find(metric=>metric.key===key)?.value??0;
 return <Workspace actor={actor}><h1>{cosigner?'Cosigner dashboard':'Dashboard'}</h1><p>Welcome, {actor.name}.</p>
  {cosigner&&vehicles&&report ? <>
   <DashboardMetrics items={[
    {label:'Vehicle offers',value:vehicles.total},
    {label:'Earnings posted this month',value:money(value('ownerEarned'))},
    {label:'Payouts recorded this month',value:money(value('ownerPaid'))},
    {label:'Available owner earnings',value:money(value('ownerAvailable'))},
   ]}>{trend&&<DashboardTrend label="Posted owner earnings · last 7 days" points={trend} currency/>}<p>Recorded amounts · {report.filters.from} to {report.filters.to}. Current available earnings are shown separately.</p></DashboardMetrics>
   <div className="figma-dashboard-columns">
    <section className="figma-panel"><h2>My vehicles</h2>
     {vehicles.items.length ? <ul className="figma-dashboard-list">{vehicles.items.map(offer=><li key={offer.id}><Link href={`/workspace/vehicles/${offer.id}`}>{offer.facts?.make} {offer.facts?.model}{!offer.facts&&'Vehicle offer'}</Link><span>{offer.state.replaceAll('_',' ').toLowerCase()}</span></li>)}</ul> : <p>Vehicle offers you create will appear here.</p>}
     <Link href="/workspace/vehicles">Manage vehicles and calendars</Link>
    </section>
    <section className="figma-panel"><h2>Earnings &amp; partnerships</h2><p>Review your balance by agency and keep track of your vehicle agreements.</p>
     <ul className="figma-dashboard-list"><li><Link href="/workspace/earnings">Earnings and payout requests</Link></li><li><Link href="/workspace/reports">View earnings reports</Link></li><li><Link href="/agencies">Find an agency partner</Link></li></ul>
    </section>
   </div>
  </> : <DashboardMetrics items={[
   {label:'Saved services',value:cart.totalItems},
   {label:'Current booking requests',value:bookings.active.total},
   {label:'Past booking requests',value:bookings.history.total},
  ]}/>}

  {actor.role==='SUPER_ADMIN'&&<section className="context-section"><h2>Platform reviews</h2><Link className="button secondary" href="/admin">Open partner review queue <ArrowRight size={18} aria-hidden="true"/></Link></section>}
  {!!agencies.length&&<section className="context-section"><h2>Your agencies</h2><div className="directory-list">{agencies.map(a=><Link className="context-link" key={a.id} href={`/agency/${a.id}`}><span><strong>{a.name}</strong><small>Open bookings, fleet, and accounting</small></span><ArrowRight size={20} aria-hidden="true"/></Link>)}</div></section>}
  <WorkspaceOrders cart={cart} bookings={bookings} labels={labels}/>
 </Workspace>;
}
