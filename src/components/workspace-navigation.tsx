"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {ChevronDown,Home,CircleHelp,Search,CarFront,ClipboardList,CalendarDays,Building2,ShieldCheck,Map,LayoutDashboard,Wallet,ChartNoAxesCombined} from "lucide-react";
import {WorkspaceLink as Link} from "./workspace-link";
import type {Actor} from "@/modules/partners/workflow";

export function WorkspaceNavigation({role,limited=false,showVehicles=role!=='RENTER'}:{role:Actor['role'];limited?:boolean;showVehicles?:boolean}){
 const path=usePathname(),agency=/^\/agency\/([a-f0-9-]{36})(?:\/|$)/i.exec(path)?.[1];
 const [open,setOpen]=useState(false),toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[path]);
 return <div className={`workspace-navigation${open?' workspace-navigation-open':''}`}
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
  onKeyDown={e=>{if(e.key==='Escape'&&open){setOpen(false);toggle.current?.focus();}}}>
  <button type="button" ref={toggle} className="workspace-menu-button" aria-expanded={open} aria-controls="workspace-links" onClick={()=>setOpen(!open)}>{limited?'Account menu':'Workspace menu'}<ChevronDown size={18} aria-hidden="true"/></button>
  <nav id="workspace-links" className="workspace-navigation-groups" aria-label="Workspace navigation" onClick={e=>{if((e.target as Element).closest('a'))setOpen(false);}}>
   {limited ? <><p className="eyebrow">Limited account access</p><Link href="/account-status"><ShieldCheck size={19} aria-hidden="true"/>Account & privacy requests</Link></> : <>
   {!agency&&<Link href="/workspace" exact><LayoutDashboard size={19} aria-hidden="true"/>Dashboard</Link>}

   {agency&&<div className="workspace-nav-group"><p>Agency workspace</p>
    <Link href={`/agency/${agency}`} exact><LayoutDashboard size={19} aria-hidden="true"/>Agency overview</Link>
    <Link href={`/agency/${agency}/bookings`}><ClipboardList size={19} aria-hidden="true"/>Agency bookings</Link>
    <Link href={`/agency/${agency}/vehicles`}><CarFront size={19} aria-hidden="true"/>Fleet & listings</Link>
    <Link href={`/agency/${agency}/tours`}><Map size={19} aria-hidden="true"/>Tours & packages</Link>
    <Link href={`/agency/${agency}/resources`}><CalendarDays size={19} aria-hidden="true"/>Availability & drivers</Link>
    <Link href={`/agency/${agency}/accounting`}><Wallet size={19} aria-hidden="true"/>Owner earnings & payouts</Link>
    <Link href={`/agency/${agency}/remittances`}><Building2 size={19} aria-hidden="true"/>Rent2Go remittances</Link>
    <Link href={`/agency/${agency}/reports`}><ChartNoAxesCombined size={19} aria-hidden="true"/>Agency reports</Link>
   </div>}
   {role==='SUPER_ADMIN'&&<div className="workspace-nav-group"><p>Platform workspace</p>
    <Link href="/admin" exact><ShieldCheck size={19} aria-hidden="true"/>Partner reviews</Link>
    <Link href="/admin/vehicles"><CarFront size={19} aria-hidden="true"/>Vehicle compliance</Link>
    <Link href="/admin/reports"><ChartNoAxesCombined size={19} aria-hidden="true"/>Platform reports</Link>
    <Link href="/admin/remittances"><Wallet size={19} aria-hidden="true"/>Agency remittances</Link>
    <Link href="/admin/payments" activePaths={["/admin/disbursements"]}><Wallet size={19} aria-hidden="true"/>Payment reconciliation</Link>
    <Link href="/admin/operations"><ShieldCheck size={19} aria-hidden="true"/>Service health</Link>
    <Link href="/admin/privacy"><ShieldCheck size={19} aria-hidden="true"/>Account & privacy review</Link>
    <Link href="/admin/users"><ShieldCheck size={19} aria-hidden="true"/>User access & roles</Link>
    <Link href="/admin/settings"><ShieldCheck size={19} aria-hidden="true"/>Platform settings</Link>
    <Link href="/admin/audit"><ClipboardList size={19} aria-hidden="true"/>Audit review</Link>
   </div>}
   <div className="workspace-nav-group"><p>Your bookings</p>
    <Link href="/rentals"><Search size={19} aria-hidden="true"/>Browse cars</Link>
    <Link href="/cart"><CarFront size={19} aria-hidden="true"/>My cart</Link>
    <Link href="/workspace/bookings"><ClipboardList size={19} aria-hidden="true"/>My booking requests</Link>
   </div>
   {showVehicles&&<div className="workspace-nav-group"><p>Vehicle ownership</p>
    <Link href="/workspace/vehicles" activePaths={["/workspace/resources","/workspace/earnings","/workspace/reports"]}><CarFront size={19} aria-hidden="true"/>My vehicles</Link>
   </div>}
   <div className="workspace-nav-group"><p>For agencies</p>
    <Link href="/workspace/application"><Building2 size={19} aria-hidden="true"/>Agency partnership</Link>
   </div>
   <div className="workspace-nav-group"><p>Other menu</p>
    <Link href="/help"><CircleHelp size={19} aria-hidden="true"/>Help center</Link>
    <Link href="/workspace/account" activePaths={["/account-status"]}><ShieldCheck size={19} aria-hidden="true"/>Account</Link>
   </div>
   </>}
   <Link href="/"><Home size={19} aria-hidden="true"/>Marketplace home</Link>
  </nav>
 </div>;
}
