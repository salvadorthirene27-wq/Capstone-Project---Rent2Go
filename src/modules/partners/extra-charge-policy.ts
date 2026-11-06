import type {PoolClient} from "pg";
import {uuid,versionSchema} from "../../lib/http";
import {digest} from "../cart/pricing";
import {DomainError} from "./workflow";
import {policyForCharge} from "./extra-charges";
// Financial commands authorize the participant and lock the booking/agency first.
// This resolver reads immutable approved policy only, never a draft amendment.
export async function approvedExtraChargePolicy(c:Pick<PoolClient,"query">,agencyId:string,type:string,context:string,revision?:number){
 if(revision!==undefined)versionSchema.parse(revision);
 const row=(await c.query("SELECT a.application_id,r.revision AS policy_revision,r.payload->'extraChargePolicies' AS policies FROM agency a JOIN app_actor o ON o.id=a.owner_id JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=COALESCE($2::int,a.approved_revision) WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND ($2::int IS NULL OR EXISTS(SELECT 1 FROM partner_review review WHERE review.application_id=r.application_id AND review.revision=r.revision AND review.decision='APPROVE'))",[uuid.parse(agencyId),revision??null])).rows[0];
 if(!row)throw new DomainError("The agency's approved extra-charge policy is unavailable.",409);
 const p=policyForCharge(row.policies,type,context);if(!p)throw new DomainError("This charge type and service context have no complete approved allocation. Revise the agency policy before proposing the charge.",409);
 const share=(n:number|null)=>{if(n===null)throw new DomainError("The approved extra-charge allocation is incomplete.",409);return n;};
 const policy={type:p.type,context:p.context,explanation:p.explanation,shares:{cosigner:share(p.shares.cosigner),agency:share(p.shares.agency),platform:share(p.shares.platform),maintenance:share(p.shares.maintenance)}},source={applicationId:row.application_id as string,revision:row.policy_revision as number,policy};
 return {...source,digest:digest(source)};
}
