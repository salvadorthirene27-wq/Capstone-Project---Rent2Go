"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <footer className="site-footer"><span className="wordmark">Rent2Go<span>.</span></span><p>Car rentals, tours, and agency partners.</p><small>© 2026 Rent2Go.</small><p><Link href="/help">Help</Link> · <Link href="/terms">Marketplace terms</Link> · <Link href="/photo-credits">Photo credits</Link></p></footer>;
}
