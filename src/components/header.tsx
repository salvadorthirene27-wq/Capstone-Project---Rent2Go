"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { LogOut, ArrowUpRight, Menu, X } from "lucide-react";
export function Header() {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
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
          <Link href="/agencies" onClick={() => setOpen(false)}>
            Agencies
          </Link>
          <Link href="/partners" onClick={() => setOpen(false)}>
            For agencies <ArrowUpRight size={15} />
          </Link>
          {session?.user ? (
            <>
              <Link href="/workspace" onClick={() => setOpen(false)}>
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
