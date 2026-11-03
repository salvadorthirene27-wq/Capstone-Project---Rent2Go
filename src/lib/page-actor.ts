import { redirect } from "next/navigation";
import { requireActor } from "./auth";
import { DomainError } from "../modules/partners/workflow";
export async function pageActor() {
  try {
    return await requireActor();
  } catch (e) {
    if (e instanceof DomainError && e.status === 401) redirect("/login");
    throw e;
  }
}
