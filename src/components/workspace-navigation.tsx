"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {ChevronDown,Home,CarFront,ClipboardList,CalendarDays,Building2,ShieldCheck,Map,LayoutDashboard,Wallet,ChartNoAxesCombined,Bell} from "lucide-react";
import {WorkspaceLink as Link} from "./workspace-link";
import type {Actor} from "@/modules/partners/workflow";

export function WorkspaceNavigation({role}:{role:Actor['role']}){
 const path=usePathname(),agency=/^\/agency\/([a-f0-9-]{36})(?:\/|$)/i.exec(path)?.[1];
 const [open,setOpen]=useState(false),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[path]);
 return <div className={`workspace-navigation${open?' workspace-navigation-open':''}`}
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
  onKeyDown={e=>{if(e.key==='Escape'&&open){setOpen(false);toggle.current?.focus();}}}>
  <button type="button" ref={toggle} className="workspace-menu-button" aria-expanded={open} aria-controls="workspace-links" onClick={()=>setOpen(!open)}>Workspace menu<ChevronDown size={18} aria-hidden="true"/></button>
  <nav id="workspace-links" className="workspace-navigation-groups" aria-label="Workspace navigation" onClick={e=>{if((e.target as Element).closest('a'))setOpen(false);}}>
   <Link href="/workspace"><Home size={19} aria-hidden="true"/>Workspace home</Link>
   <Link href="/workspace/notifications"><Bell size={19} aria-hidden="true"/>Notifications</Link>
   {agency&&<div className="workspace-nav-group"><p>Agency workspace</p>
    <Link href={`/agency/${agency}`} exact><LayoutDashboard size={19} aria-hidden="true"/>Agency overview</Link>
    <Link href={`/agency/${agency}/bookings`}><ClipboardList size={19} aria-hidden="true"/>Agency bookings</Link>
    <Link href={`/agency/${agency}/vehicles`}><CarFront size={19} aria-hidden="true"/>Fleet & listings</Link>
    <Link href={`/agency/${agency}/tours`}><Map size={19} aria-hidden="true"/>Tours & packages</Link>
    <Link href={`/agency/${agency}/resources`}><CalendarDays size={19} aria-hidden="true"/>Availability & drivers</Link>
    <Link href={`/agency/${agency}/accounting`}><Wallet size={19} aria-hidden="true"/>Owner earnings & payouts</Link>
    <Link href={`/agency/${agency}/reports`}><ChartNoAxesCombined size={19} aria-hidden="true"/>Agency reports</Link>
   </div>}
   <div className="workspace-nav-group"><p>Your bookings</p>
    <Link href="/cart"><CarFront size={19} aria-hidden="true"/>My cart</Link>
    <Link href="/workspace/bookings"><ClipboardList size={19} aria-hidden="true"/>My booking requests</Link>
   </div>
   <div className="workspace-nav-group"><p>Vehicle ownership</p>
    <Link href="/workspace/vehicles"><CarFront size={19} aria-hidden="true"/>My personal vehicles</Link>
    <Link href="/workspace/resources"><CalendarDays size={19} aria-hidden="true"/>My vehicle calendars</Link>
    <Link href="/workspace/earnings"><Wallet size={19} aria-hidden="true"/>My vehicle earnings</Link>
    <Link href="/workspace/reports"><ChartNoAxesCombined size={19} aria-hidden="true"/>My earnings reports</Link>
   </div>
   <div className="workspace-nav-group"><p>Agency partnership</p>
    <Link href="/workspace/application"><Building2 size={19} aria-hidden="true"/>Agency application</Link>
    <Link href="/partners"><Building2 size={19} aria-hidden="true"/>Partnership guide</Link>
   </div>
   {role==='SUPER_ADMIN'&&<div className="workspace-nav-group"><p>Platform workspace</p>
    <Link href="/admin" exact><ShieldCheck size={19} aria-hidden="true"/>Partner reviews</Link>
    <Link href="/admin/vehicles"><CarFront size={19} aria-hidden="true"/>Vehicle compliance</Link>
    <Link href="/admin/reports"><ChartNoAxesCombined size={19} aria-hidden="true"/>Platform reports</Link>
   </div>}
   <Link href="/"><Home size={19} aria-hidden="true"/>Marketplace home</Link>
  </nav>
 </div>;
}
