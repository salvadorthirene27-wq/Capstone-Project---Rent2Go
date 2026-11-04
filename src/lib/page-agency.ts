import { notFound } from "next/navigation";
import { requireAgencyAccess } from "../modules/agencies/service";
import { DomainError, type Actor } from "../modules/partners/workflow";
export async function pageAgency(actor: Actor, id: string) {
  try {
    return await requireAgencyAccess(actor, id);
  } catch (error) {
    if (error instanceof DomainError && [403, 404].includes(error.status))
      notFound();
    throw error;
  }
}
