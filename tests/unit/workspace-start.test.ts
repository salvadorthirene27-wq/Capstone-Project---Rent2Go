import { beforeEach, expect, it, vi } from "vitest";
import type { Role } from "../../src/modules/partners/workflow";

const services = vi.hoisted(() => ({
  pageActor: vi.fn(),
  myAgencies: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(path); }),
}));

vi.mock("@/lib/page-actor", () => ({ pageActor: services.pageActor }));
vi.mock("@/modules/agencies/service", () => ({ myAgencies: services.myAgencies }));
vi.mock("next/navigation", () => ({ redirect: services.redirect }));

import WorkspaceStart from "../../src/app/workspace/start/page";

beforeEach(() => vi.clearAllMocks());

it.each<[Role, string]>([
  ["RENTER", "/workspace"],
  ["COSIGNER", "/workspace"],
  ["SUPER_ADMIN", "/admin"],
])("routes the stored %s role to its dashboard", async (role, path) => {
  services.pageActor.mockResolvedValue({ id: "actor", role });
  await expect(WorkspaceStart()).rejects.toThrow(path);
  expect(services.myAgencies).not.toHaveBeenCalled();
});

it("opens an agency directly only when the actor has one accessible agency", async () => {
  const actor = { id: "actor", role: "AGENCY_ADMIN" };
  services.pageActor.mockResolvedValue(actor);
  services.myAgencies
    .mockResolvedValueOnce([{ id: "first" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: "first" }, { id: "second" }]);

  await expect(WorkspaceStart()).rejects.toThrow("/agency/first");
  await expect(WorkspaceStart()).rejects.toThrow(/^\/workspace$/);
  await expect(WorkspaceStart()).rejects.toThrow(/^\/workspace$/);
  expect(services.myAgencies).toHaveBeenCalledWith(actor);
});
