import { WorkspaceNavigation } from "./workspace-navigation";
import { ProfileAvatar } from "./profile-avatar";
import {Suspense} from 'react';
import {WorkspaceSections} from './workspace-sections';
import type { Actor } from "@/modules/partners/workflow";
import {hasVehicleWorkspace} from '@/modules/workspace/service';
export async function Workspace({
  actor,
  children,
  limited = false,
}: {
  actor: Actor;
  children: React.ReactNode;
  limited?: boolean;
}) {
  const showVehicles=!limited&&await hasVehicleWorkspace(actor.id,actor.role);
  return (
    <div className="workspace figma-workspace">
      <aside className="sidebar">
        <div className="identity">
          {limited ? <span className="avatar">{(actor.name || "A")[0]}</span> : <ProfileAvatar key={actor.id} fallback={(actor.name || "A")[0]}/>}
          <div>
            <strong>{actor.name}</strong>
            <small>{actor.role.replaceAll("_", " ").toLowerCase()}</small>
          </div>
        </div>
        <WorkspaceNavigation role={actor.role} limited={limited} showVehicles={showVehicles} />
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
