"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { LogOut, ArrowUpRight, Menu, X } from "lucide-react";
export function Header() {
  const pathname = usePathname();
  const selected = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === "/rentals" && pathname.startsWith("/cars/")) ||
        (href === "/cart" && pathname === "/checkout");
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [cartCount, setCartCount] = useState<number | null>(null);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setCartCount(null);
      return;
    }
    let active = true;
    async function refresh() {
      try {
        const res = await fetch("/api/cart/count");
        if (res.ok) {
          const data = await res.json();
          if (active) setCartCount(data.count);
        }
      } catch {
        /* Retain navigation when the count is temporarily unavailable. */
      }
    }
    void refresh();
    window.addEventListener("rent2go:cart-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("rent2go:cart-changed", refresh);
    };
  }, [userId, pathname]);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.location.href = "/";
    } catch {
      setError("Unable to sign out. Please try again.");
      setBusy(false);
    }
  }
  return (
    <>
      <div className="demo-bar">
        Development demo <span>Payments are simulated. No money moves.</span>
      </div>
      <header
        className="site-header"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <Link className="wordmark" href="/">
          Rent2Go<span>.</span>
        </Link>
        <button
          ref={toggle}
          className="icon-button navigation-toggle"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav
          id="main-navigation"
          className={open ? "navigation-open" : ""}
          aria-label="Main navigation"
        >
          <Link
            href="/"
            aria-current={selected("/") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/rentals"
            aria-current={selected("/rentals") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Car rentals
          </Link>
          <Link
            href="/tours"
            aria-current={selected("/tours") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Tours
          </Link>
          <Link
            href="/agencies"
            aria-current={selected("/agencies") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Agencies
          </Link>
          <Link
            href="/cart"
            aria-current={selected("/cart") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Cart{cartCount !== null ? ` (${cartCount})` : ""}
          </Link>
          <Link
            href="/partners"
            aria-current={selected("/partners") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            For agencies <ArrowUpRight size={15} />
          </Link>
          {session?.user ? (
            <>
              <Link
                href="/workspace"
                aria-current={
                  selected("/workspace") ||
                  selected("/agency") ||
                  selected("/admin")
                    ? "page"
                    : undefined
                }
                onClick={() => setOpen(false)}
              >
                Workspace
              </Link>
              <button
                className="nav-signout"
                aria-label="Sign out"
                disabled={busy}
                onClick={signOut}
              >
                <LogOut size={19} /> Sign out
              </button>
            </>
          ) : (
            <Link
              className="button small"
              href="/login"
              onClick={() => setOpen(false)}
            >
              {isPending ? "Account" : "Sign in"}
            </Link>
          )}
        </nav>
      </header>
      {error && (
        <p className="header-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
