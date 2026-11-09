"use client";
import Link from "next/link";
import {NotificationBell} from "./notification-bell";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ArrowLeft, LogOut, Menu, X } from "lucide-react";

const links = [
  ["/", "Home"], ["/rentals", "Rentals"], ["/tours", "Tours"],
  ["/agencies", "Agencies"], ["/cart", "Cart"],
  ["/partners", "For agencies"],
] as const;
const documentRoutes = ["/booking-agreements/", "/booking-inspections/", "/booking-payments/", "/booking-refunds/", "/owner-payouts/", "/platform-records/"];

export function Header() {
  const pathname = usePathname();
  const accountPortal=pathname.startsWith("/account-status");
  const [portalAccess,setPortalAccess]=useState<{id:string;active:boolean}|null>(null);
  const selected = (href: string) => href === "/" ? pathname === "/" :
    !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`) ||
      (href === "/rentals" && pathname.startsWith("/cars/")) ||
      (href === "/cart" && pathname === "/checkout"));
  const { data: session, isPending } = authClient.useSession();
  const compact = (accountPortal && (!portalAccess?.active || portalAccess.id!==session?.user?.id)) || pathname === "/login" || documentRoutes.some(route => pathname.startsWith(route));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null),navigation=useRef<HTMLElement>(null);
  const [cartCount, setCartCount] = useState<number | null>(null);
  const userId = session?.user?.id;
  useEffect(()=>{
    setPortalAccess(null);
    if(!accountPortal||!userId)return;
    let current=true;const controller=new AbortController();
    void (async()=>{
      try{
        const res=await fetch('/api/me',{cache:'no-store',signal:controller.signal});
        const actor=res.ok?await res.json():null;
        if(current)setPortalAccess({id:userId,active:res.ok&&actor?.id===userId});
      }catch{if(current)setPortalAccess({id:userId,active:false});}
    })();
    return()=>{current=false;controller.abort();};
  },[accountPortal,userId]);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(()=>{if(open)navigation.current?.querySelector<HTMLElement>("a")?.focus();},[open]);
  useEffect(() => {
    setCartCount(null);
    if (!userId || compact) return;
    let active = true;
    async function refresh() {
      try {
        const res = await fetch("/api/cart/count");
        if (res.ok) {
          const data = await res.json();
          if (active && Number.isSafeInteger(data.count) && data.count >= 0) setCartCount(data.count);
        }
      } catch { /* Navigation works if the count is temporarily unavailable. */ }
    }
    void refresh();
    window.addEventListener("rent2go:cart-changed", refresh);
    return () => { active = false; window.removeEventListener("rent2go:cart-changed", refresh); };
  }, [userId, pathname, compact]);
  async function signOut() {
    setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw Error();
      window.location.assign("/");
    } catch { setError("Unable to sign out. Please try again."); setBusy(false); }
  }
  const brand = <Link className="wordmark" href="/" aria-label="Rent2Go home">Rent2Go<span>.</span></Link>;
  if (compact) return <header className="site-header unified-header compact-header">
    {brand}<Link href={(pathname === "/login" || accountPortal) ? "/" : "/workspace"} className="compact-back"><ArrowLeft size={17} aria-hidden="true" />{(pathname === "/login" || accountPortal) ? "Back to marketplace" : "Back to workspace"}</Link>
  </header>;
  return <>
    <header className={`site-header unified-header${userId?" has-notification-bell":""}${open ? " navigation-expanded" : ""}`}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={e => { if (e.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); } }}>
      {brand}

      <nav ref={navigation} id="main-navigation" className={open ? "navigation-open" : ""} aria-label="Main navigation">
        <div className="navigation-links">
          {links.map(([href, label]) => <Link key={href} href={href==="/partners"&&userId?"/workspace/application":href} aria-current={selected(href==="/partners"&&userId?"/workspace/application":href) ? "page" : undefined} onClick={() => setOpen(false)}>
            {label}{href === "/cart" && cartCount !== null ? ` (${cartCount})` : ""}
          </Link>)}
        </div>
        <div className="navigation-account">
          {session?.user ? <>
            <Link href="/workspace" className="navigation-secondary" aria-current={selected("/workspace") || selected("/agency") || selected("/admin") ? "page" : undefined} onClick={() => setOpen(false)}>Workspace</Link>
            <button type="button" className="navigation-primary" disabled={busy} onClick={signOut}><LogOut size={17} aria-hidden="true" />{busy ? "Signing out…" : "Sign out"}</button>
          </> : <>
            <Link className="navigation-secondary" href="/login" onClick={() => setOpen(false)}>{isPending ? "Account" : "Sign in"}</Link>
            <Link className="navigation-primary" href="/login?mode=signup" onClick={() => setOpen(false)}>Sign up</Link>
          </>}
        </div>
      </nav>
      <div className="navigation-tools">
        {userId&&<NotificationBell userId={userId} onNavigate={()=>setOpen(false)}/>}
      <button type="button" ref={toggle} className="icon-button navigation-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      </div>
    </header>
    {error && <p className="header-error" role="alert">{error}</p>}
  </>;
}
