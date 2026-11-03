"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { LogOut, ArrowUpRight } from "lucide-react";
export function Header() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <>
      <div className="demo-bar">
        Development demo <span>Payments are simulated. No money moves.</span>
      </div>
      <header className="site-header">
        <Link className="wordmark" href="/">
          Rent2Go<span>.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/partners">
            For agencies <ArrowUpRight size={15} />
          </Link>
          {session?.user ? (
            <>
              <Link href="/workspace">Workspace</Link>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  window.location.href = "/";
                }}
              >
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <Link className="button small" href="/login">
              {isPending ? "Account" : "Sign in"}
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
