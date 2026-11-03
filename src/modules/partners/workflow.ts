export type Role = "RENTER" | "COSIGNER" | "AGENCY_ADMIN" | "SUPER_ADMIN";
export type Actor = { id: string; role: Role; email?: string; name?: string };
export type ApplicationStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type Action = "SAVE" | "SUBMIT" | "WITHDRAW" | "START_REVIEW" | "APPROVE" | "CHANGES_REQUESTED" | "REJECT";
export class DomainError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function authorizeTransition(actor: Actor, app: { ownerId: string; status: ApplicationStatus; version: number }, action: Action, expectedVersion: number, reason = "") {
  const review = ["START_REVIEW", "APPROVE", "CHANGES_REQUESTED", "REJECT"].includes(action);
  if (review ? actor.role !== "SUPER_ADMIN" : actor.id !== app.ownerId) throw new DomainError("Access denied.", 403);
  if (review && actor.id === app.ownerId) throw new DomainError("You cannot review your own application.", 403);
  if (expectedVersion !== app.version) throw new DomainError("This application changed. Reload before trying again.", 409);
  const allowed = review ? ["SUBMITTED", "UNDER_REVIEW"] : action === "WITHDRAW" ? ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"] : ["DRAFT", "CHANGES_REQUESTED"];
  if (!allowed.includes(app.status)) throw new DomainError("This action is unavailable in the current status.", 409);
  if (review && action !== "START_REVIEW" && reason.trim().length < 5) throw new DomainError("Provide a clear review reason (at least 5 characters).");
}
