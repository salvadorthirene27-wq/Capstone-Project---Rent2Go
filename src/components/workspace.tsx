import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Home,
  ShieldCheck,
  CarFront,
} from "lucide-react";
import type { Actor } from "@/modules/partners/workflow";
export function Workspace({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="identity">
          <span className="avatar">{(actor.name || "A")[0]}</span>
          <div>
            <strong>{actor.name}</strong>
            <small>{actor.role.replaceAll("_", " ").toLowerCase()}</small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          <Link href="/workspace">
            <Home size={19} /> Workspace home
          </Link>
          <Link href="/workspace/vehicles">
            <CarFront size={19} /> My personal vehicles
          </Link>
          <Link href="/workspace/application">
            <ClipboardList size={19} /> Agency application
          </Link>
          {actor.role === "SUPER_ADMIN" && (
            <Link href="/admin">
              <ShieldCheck size={19} /> Partner reviews
            </Link>
          )}
          {actor.role === "SUPER_ADMIN" && (
            <Link href="/admin/vehicles">
              <CarFront size={19} /> Vehicle compliance
            </Link>
          )}
          <Link href="/partners">
            <Building2 size={19} /> Partnership guide
          </Link>
          <Link href="/">
            <Home size={19} /> Marketplace home
          </Link>
        </nav>
        <p className="sidebar-note">
          Your policies. Your services.
          <br />
          One connected marketplace.
        </p>
      </aside>
      <main id="main-content" className="workspace-main">
        {children}
      </main>
    </div>
  );
}
