import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
import {Workspace} from '@/components/workspace';
import {WorkspaceOrders} from '@/components/workspace-orders';
import {pageActor} from '@/lib/page-actor';
import {myAgencies} from '@/modules/agencies/service';
import {readCart} from '@/modules/cart/service';
import {bookingOverview,workspaceLabels} from '@/modules/workspace/service';
import {notFound} from 'next/navigation';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),filters=await searchParams;
 const [agencies,cart,bookings]=await Promise.all([myAgencies(actor),readCart(actor),bookingOverview(actor,filters).catch(error=>{if(error instanceof ZodError)notFound();throw error;})]);
 const labels=await workspaceLabels(actor,[...cart.groups.flatMap(g=>g.items.map(i=>i.savedQuote)),...[...bookings.active.items,...bookings.history.items].flatMap(r=>r.lines.map(l=>l.quote))]);
 return <Workspace actor={actor}><p className="eyebrow">Your Rent2Go workspace</p><h1>Welcome, {actor.name}</h1><p>Keep track of your saved services and every booking, from request to return.</p>
  {actor.role==='SUPER_ADMIN'&&<section className="context-section"><h2>Platform reviews</h2><Link className="button secondary" href="/admin">Open partner review queue <ArrowRight size={18} aria-hidden="true"/></Link></section>}
  {!!agencies.length&&<section className="context-section"><h2>Your agencies</h2><div className="directory-list">{agencies.map(a=><Link className="context-link" key={a.id} href={`/agency/${a.id}`}><span><strong>{a.name}</strong><small>Open bookings, fleet, and accounting</small></span><ArrowRight size={20} aria-hidden="true"/></Link>)}</div></section>}
  <WorkspaceOrders cart={cart} bookings={bookings} labels={labels}/>
 </Workspace>;
}
