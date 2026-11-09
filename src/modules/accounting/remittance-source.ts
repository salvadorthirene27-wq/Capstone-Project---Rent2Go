import {centrallyCollectedRevenueSql} from '../gateway/custody-source';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {remittanceScope,agencyCreditConsent,type RemittanceScope} from './remittance-schema';
import {remittanceSource,remittanceBalances} from './remittance-balances';

export async function lockPlatformAccount(c:PoolClient,scope:RemittanceScope){
 await c.query('INSERT INTO platform_account(id,agency_id,environment)VALUES($1,$2,$3) ON CONFLICT(agency_id,environment) DO NOTHING',[randomUUID(),scope.agencyId,scope.environment]);
 return (await c.query('SELECT id,version FROM platform_account WHERE agency_id=$1 AND environment=$2 FOR UPDATE',[scope.agencyId,scope.environment])).rows[0] as {id:string;version:number};
}
export async function remittanceContext(c:PoolClient,actor:Actor,input:RemittanceScope,lock=false){
 const scope=remittanceScope.parse(input);let user=await storedActor(actor,c);
 let agency=(await c.query("SELECT g.id,g.owner_id,g.active,COALESCE(g.display_name,r.payload->>'businessName') name FROM agency g JOIN partner_revision r ON r.application_id=g.application_id AND r.revision=g.approved_revision WHERE g.id=$1",[scope.agencyId])).rows[0];
 if(!agency||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Remittance account not found.',404);
 let member=(await c.query('SELECT active FROM agency_member WHERE agency_id=$1 AND actor_id=$2',[scope.agencyId,user.id])).rows[0];
 let operator=agency.owner_id===user.id||Boolean(member?.active),platform=user.role==='SUPER_ADMIN'&&!operator;
 if(!operator&&!platform)throw new DomainError('Remittance account not found.',404);
 let account=(await c.query('SELECT id,version FROM platform_account WHERE agency_id=$1 AND environment=$2',[scope.agencyId,scope.environment])).rows[0] as {id:string;version:number}|undefined;
 if(lock){
  account=await lockPlatformAccount(c,scope);
  // An UPDATE lock also protects the absent-member gap through the agency FK:
  // a reviewer cannot gain agency membership during independent receipt review.
  agency=(await c.query('SELECT id,owner_id,active FROM agency WHERE id=$1 FOR UPDATE',[scope.agencyId])).rows[0];
  await c.query('SELECT id FROM app_actor WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',[[...new Set([user.id,agency.owner_id])].sort()]);
  user=await storedActor(actor,c);member=(await c.query('SELECT active FROM agency_member WHERE agency_id=$1 AND actor_id=$2 FOR SHARE',[scope.agencyId,user.id])).rows[0];
  operator=agency.owner_id===user.id||Boolean(member?.active);platform=user.role==='SUPER_ADMIN'&&!operator;
  if((!operator&&!platform)||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Current remittance authority is required.',403);
 }
 const name=(await c.query("SELECT COALESCE(g.display_name,r.payload->>'businessName') name FROM agency g JOIN partner_revision r ON r.application_id=g.application_id AND r.revision=g.approved_revision WHERE g.id=$1",[scope.agencyId])).rows[0].name;
 return {scope,user,account,operator,platform,agencyName:name as string,agencyActive:Boolean(agency.active)};
}
export type RemittanceContext=Awaited<ReturnType<typeof remittanceContext>>;

/** Fragments are fixed server SQL, never request text. */
export const platformFactsSql=(tenant='e.agency_id=$1::uuid',environment='$2::text')=>`WITH entries AS(SELECT e.id,e.agency_id,e.environment,e.close_id,e.quote_id,e.line_id,e.source_kind,e.bps,e.amount_centavos FROM booking_revenue_entry e WHERE (${tenant}) AND e.environment=${environment} AND e.recipient='PLATFORM' AND NOT ${centrallyCollectedRevenueSql()}),
 credited AS(SELECT x.entry_id,sum(x.amount_centavos) n FROM booking_revenue_credit x JOIN entries e ON e.id=x.entry_id GROUP BY x.entry_id),
 paid AS(SELECT s.entry_id,sum(s.amount_centavos) n FROM platform_remittance_source s JOIN entries e ON e.id=s.entry_id JOIN platform_remittance_receipt p ON p.remittance_id=s.remittance_id GROUP BY s.entry_id),
 applied AS(SELECT s.entry_id,sum(s.amount_centavos) n FROM platform_credit_allocation s JOIN entries e ON e.id=s.entry_id GROUP BY s.entry_id),
 reserved AS(SELECT s.entry_id,sum(s.amount_centavos) n FROM platform_remittance_source s JOIN entries e ON e.id=s.entry_id WHERE NOT EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=s.remittance_id) AND NOT EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=s.remittance_id) GROUP BY s.entry_id),
 granted AS(SELECT g.entry_id,sum(g.amount_centavos) n FROM platform_agency_credit g JOIN entries e ON e.id=g.entry_id GROUP BY g.entry_id),
 f AS(SELECT e.*,e.amount_centavos original,COALESCE(c.n,0) credits,COALESCE(p.n,0) paid,COALESCE(o.n,0) applied,COALESCE(r.n,0) reserved,COALESCE(g.n,0) granted FROM entries e LEFT JOIN credited c ON c.entry_id=e.id LEFT JOIN paid p ON p.entry_id=e.id LEFT JOIN applied o ON o.entry_id=e.id LEFT JOIN reserved r ON r.entry_id=e.id LEFT JOIN granted g ON g.entry_id=e.id),
 balances AS(SELECT f.*,GREATEST(original-credits-paid-applied,0)-reserved due,GREATEST(paid+applied-(original-credits),0) excess FROM f)`;
const facts=platformFactsSql();
export async function remittanceTotals(c:PoolClient,scope:RemittanceScope){
 const row=(await c.query(`${facts} SELECT COALESCE(sum(original),0)::text original,COALESCE(sum(credits),0)::text credits,COALESCE(sum(paid),0)::text paid,COALESCE(sum(applied),0)::text applied,COALESCE(sum(reserved),0)::text reserved,COALESCE(sum(due),0)::text due,COALESCE(sum(excess),0)::text excess,COALESCE(sum(granted),0)::text granted FROM balances`,[scope.agencyId,scope.environment])).rows[0];
 return remittanceBalances({original:BigInt(row.original),credits:BigInt(row.credits),paid:BigInt(row.paid),offset:BigInt(row.applied),reserved:BigInt(row.reserved),due:BigInt(row.due),excess:BigInt(row.excess),accepted:BigInt(row.granted)});
}
function sourceView(row:any){
 const amounts=remittanceSource(BigInt(row.original),BigInt(row.credits),BigInt(row.paid),BigInt(row.applied),BigInt(row.reserved));
 return {entryId:row.id as string,title:row.title as string,sourceKind:row.source_kind as 'SERVICE'|'EXTRA',platformBps:Number(row.bps),closeId:row.close_id as string,closeDigest:row.close_digest as string,closedAt:(row.closed_at as Date).toISOString(),startAt:row.start_at as string|null,endAt:row.end_at as string|null,originalPolicyRevision:row.policy_revision as number|null,originalPaymentPreference:row.payment_preference as string|null,originalSettlementSchedule:row.settlement_schedule as string|null,...amounts,grantedCentavos:Number(row.granted),pendingCreditCentavos:Number(BigInt(row.excess)-BigInt(row.granted))};
}
const identity=`SELECT b.*,f.digest close_digest,f.created_at closed_at,l.public_snapshot->>'title' title,l.public_snapshot->>'startAt' start_at,l.public_snapshot->>'endAt' end_at,p.revision policy_revision,p.payload->>'platformPaymentMethod' payment_preference,p.payload->>'settlementSchedule' settlement_schedule FROM balances b JOIN booking_financial_close f ON f.id=b.close_id JOIN booking_quotation_line l ON l.quote_id=b.quote_id AND l.line_id=b.line_id JOIN booking_request_line old ON old.id=b.line_id JOIN agency g ON g.id=b.agency_id LEFT JOIN partner_revision p ON p.application_id=g.application_id AND p.revision=CASE WHEN old.public_quote->>'policyRevision' ~ '^[1-9][0-9]{0,8}$' THEN (old.public_quote->>'policyRevision')::int ELSE NULL END`;
export async function remittanceSources(c:PoolClient,scope:RemittanceScope,page:number,kind:'DUE'|'CREDIT'){
 const condition=kind==='DUE'?'due>0':'excess>granted',params=[scope.agencyId,scope.environment];
 const result=(await c.query(`${facts} SELECT *,count(*) OVER()::int total FROM (${identity}) v WHERE ${condition} ORDER BY closed_at,id LIMIT 20 OFFSET $3`,[...params,(page-1)*20])).rows;
 const total=Number(result[0]?.total??(await c.query(`${facts} SELECT count(*) n FROM balances WHERE ${condition}`,params)).rows[0].n),items=result.map(sourceView);
 return {page,pageCount:Math.max(1,Math.ceil(total/20)),total,items,digest:digest({scope,page,kind,items})};
}
export function creditPacketFromSource(scope:RemittanceScope,source:ReturnType<typeof sourceView>){
 const body={agencyId:scope.agencyId,environment:scope.environment,source,amountCentavos:source.pendingCreditCentavos,consentText:agencyCreditConsent};return {body,digest:digest(body)};
}
export async function agencyCreditPacket(c:PoolClient,scope:RemittanceScope,entryId:string){
 const row=(await c.query(`${facts} ${identity} WHERE b.id=$3`,[scope.agencyId,scope.environment,entryId])).rows[0];
 if(!row)throw new DomainError('Original platform allocation not found.',404);
 return creditPacketFromSource(scope,sourceView(row));
}
export async function availableAgencyCredits(c:PoolClient,accountId:string|null){
 const rows=(await c.query('SELECT g.id,g.amount_centavos-COALESCE((SELECT sum(u.amount_centavos) FROM platform_credit_use u WHERE u.credit_id=g.id),0) available,g.created_at FROM platform_agency_credit g WHERE g.account_id=$1 AND g.amount_centavos>COALESCE((SELECT sum(u.amount_centavos) FROM platform_credit_use u WHERE u.credit_id=g.id),0) ORDER BY g.created_at,g.id LIMIT 20',[accountId])).rows;
 const items=rows.map(r=>({creditId:r.id as string,availableCentavos:Number(r.available),acceptedAt:(r.created_at as Date).toISOString()}));return {items,digest:digest({accountId,items})};
}
export async function notifyRemittance(c:PoolClient,ctx:RemittanceContext,action:string,referenceId:string){
 await c.query('UPDATE platform_account SET version=version+1 WHERE id=$1',[ctx.account!.id]);ctx.account!.version++;
 await audit(c,ctx.user,action,referenceId,{agencyId:ctx.scope.agencyId,environment:ctx.scope.environment});
 await c.query("INSERT INTO remittance_notification(id,account_id,recipient_id,message) SELECT gen_random_uuid(),$1,u.id,$2 FROM app_actor u WHERE NOT u.suspended AND NOT u.is_test_fixture AND (platform_agency_operator(u.id,$1) OR platform_independent_reviewer(u.id,$1))",[ctx.account!.id,'Platform remittance activity was recorded. Review payment claims, confirmed receipts and accepted agency credits separately.']);
}
/** Caller already holds the booking lock. Acquire platform before owner/agency
 * authority locks so this posting serializes with remittances without inversion. */
export async function lockPlatformReduction(c:PoolClient,entryId:string,amount:number){
 if(amount===0)return;
 const entry=(await c.query("SELECT agency_id,environment FROM booking_revenue_entry WHERE id=$1 AND recipient='PLATFORM'",[entryId])).rows[0];if(!entry)throw new DomainError('Original platform allocation needs review.',409);
 const scope:RemittanceScope={agencyId:entry.agency_id,environment:entry.environment};await lockPlatformAccount(c,scope);
 const f=(await c.query('SELECT * FROM platform_source_facts($1)',[entryId])).rows[0],remaining=BigInt(f.original)-BigInt(f.credits)-BigInt(amount)-BigInt(f.paid)-BigInt(f.applied);
 if(BigInt(f.reserved)>(remaining>0n?remaining:0n))throw new DomainError('Resolve or revoke the affected platform remittance reservation before posting this credit.',409);
}
export async function notifyPlatformReduction(c:PoolClient,actor:Actor,entryId:string,creditId:string){
 const account=(await c.query("SELECT a.id,a.agency_id,a.environment FROM platform_account a JOIN booking_revenue_entry e ON e.agency_id=a.agency_id AND e.environment=a.environment WHERE e.id=$1 AND e.recipient='PLATFORM'",[entryId])).rows[0];
 if(!account)throw new DomainError('Platform adjustment account is unavailable.',409);
 // The revenue-credit trigger already advanced this account version.
 await audit(c,actor,'PLATFORM_ALLOCATION_REDUCED',creditId,{entryId,agencyId:account.agency_id,environment:account.environment});
 await c.query("INSERT INTO remittance_notification(id,account_id,recipient_id,message) SELECT gen_random_uuid(),$1,u.id,$2 FROM app_actor u WHERE NOT u.suspended AND NOT u.is_test_fixture AND (platform_agency_operator(u.id,$1) OR platform_independent_reviewer(u.id,$1))",[account.id,'A closed-service platform allocation changed. Review remittance dues and any agency credit requiring acceptance.']);
}
