import { WorkspaceNavigation } from "./workspace-navigation";
import {Suspense} from 'react';
import {WorkspaceSections} from './workspace-sections';
import type { Actor } from "@/modules/partners/workflow";
export function Workspace({
  actor,
  children,
  limited = false,
}: {
  actor: Actor;
  children: React.ReactNode;
  limited?: boolean;
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
        <WorkspaceNavigation role={actor.role} limited={limited} />
        <p className="sidebar-note">
          {limited ? <>Your account requests and access decisions.<br />Your existing records remain preserved.</> : <>Your policies. Your services.<br />One connected marketplace.</>}
        </p>
      </aside>
      <main id="main-content" className="workspace-main">
        {!limited&&<Suspense fallback={null}><WorkspaceSections/></Suspense>}
        {children}
      </main>
    </div>
  );
}
