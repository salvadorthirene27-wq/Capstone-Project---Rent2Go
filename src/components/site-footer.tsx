"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <footer className="site-footer"><span className="wordmark">Rent2Go<span>.</span></span><p>Car rentals, tours, and agency partners.</p><small>Local development demonstration · 2026</small><p><Link href="/photo-credits">Demo photo credits</Link></p></footer>;
}
