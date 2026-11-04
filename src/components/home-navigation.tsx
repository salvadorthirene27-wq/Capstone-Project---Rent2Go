"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function HomeNavigation() {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const links = [["/", "Home"], ["/rentals", "Rentals"], ["/tours", "Tours"], ["/agencies", "Agencies"], ["/cart", "Cart"], ["/#roles", "Our Roles"]];
  async function signOut() {
    setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw Error();
      window.location.assign("/");
    } catch { setError("Unable to sign out. Please try again."); setBusy(false); }
  }
  return <nav className="home-navigation relative flex items-center justify-between px-12 py-8 w-full" aria-label="Main navigation"
    onKeyDown={e => { if (e.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); } }}>
    <Link href="/" className="home-brand text-2xl font-bold tracking-tighter text-[#ABD1C6]">Rent2Go</Link>
    <button type="button" ref={toggle} className="home-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="home-links" onClick={() => setOpen(!open)}>{open ? <X size={24}/> : <Menu size={24}/>}</button>
    <div id="home-links" className={`home-links${open ? " home-links-open" : ""}`}>
      <ul className="flex items-center gap-1 p-1.5 text-sm font-medium border-white/10 border rounded-full backdrop-blur-xl bg-white/5">
        {links.map(([href, label]) => <li key={href}><Link href={href} onClick={() => setOpen(false)} aria-current={href === "/" ? "page" : undefined}
          className={href === "/" ? "bg-[#2F5D50] text-white px-5 py-2 rounded-full text-sm font-medium transition-all shadow-md" : "text-white/80 hover:text-white px-5 py-2 rounded-full text-sm font-medium transition-all"}>{label}</Link></li>)}
      </ul>
    </div>
    <div className="home-account flex justify-end items-center gap-4">
      {session?.user ? <><Link href="/workspace" className="px-6 py-2 text-sm font-medium border border-[#ABD1C6] text-[#ABD1C6] rounded-full">Workspace</Link><button type="button" disabled={busy} onClick={signOut} className="px-6 py-2.5 bg-[#2F5D50] text-white text-sm font-semibold rounded-full">{busy ? "Signing out…" : "Sign out"}</button></> : <>
      <Link href="/login" className="px-6 py-2 text-sm font-medium border border-[#ABD1C6] text-[#ABD1C6] rounded-full hover:bg-[#ABD1C6] hover:text-black transition-all">{isPending ? "Account" : "Login"}</Link>
      <Link href="/login?mode=signup" className="px-6 py-2.5 bg-[#2F5D50] text-white text-sm font-semibold rounded-full hover:bg-[#3d7868] transition-all shadow-lg">Sign Up</Link></>}
    </div>
    {error && <p className="home-nav-error" role="alert">{error}</p>}
  </nav>;
}
