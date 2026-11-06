import { WorkspaceNavigation } from "./workspace-navigation";
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
        <WorkspaceNavigation role={actor.role} />
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
