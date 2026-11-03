import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, transaction } from "../../lib/db";
import { defaultApplication, draftApplicationSchema, completeApplicationSchema, type ApplicationInput } from "./schema";
import { authorizeTransition, DomainError, type Actor, type Action, type ApplicationStatus } from "./workflow";

export type Application = { id:string; ownerId:string; status:ApplicationStatus; version:number; submittedRevision:number; payload:ApplicationInput; updatedAt:string };
function map(row: Record<string,unknown>): Application { return { id:String(row.id), ownerId:String(row.owner_id), status:row.status as ApplicationStatus, version:Number(row.version), submittedRevision:Number(row.submitted_revision), payload:row.payload as ApplicationInput, updatedAt:String(row.updated_at) }; }
export async function storedActor(actor:Pick<Actor,"id">, client: Pick<PoolClient,"query">=db):Promise<Actor> {
  const row=(await client.query("SELECT id,email,name,role,suspended FROM app_actor WHERE id=$1",[actor.id])).rows[0];
  if (!row || row.suspended) throw new DomainError("Access denied.",403);
  return row;
}
async function locked(client:PoolClient, id:string):Promise<Application> {
  const row=(await client.query("SELECT * FROM partner_application WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!row) throw new DomainError("Application not found.",404);
  return map(row);
}
export async function audit(client:PoolClient,actor:Actor,action:string,id:string,metadata:Record<string,unknown>={}) {
  await client.query("INSERT INTO app_audit(id,actor_id,action,entity_id,metadata) VALUES($1,$2,$3,$4,$5)",[randomUUID(),actor.id,action,id,JSON.stringify(metadata)]);
}
async function notify(client:PoolClient,recipient:string,id:string,message:string) {
  await client.query("INSERT INTO app_notification(id,recipient_id,application_id,message) VALUES($1,$2,$3,$4)",[randomUUID(),recipient,id,message]);
}
export async function createApplication(actor:Actor) {
  return transaction(async c=>{
    const user=await storedActor(actor,c);
    const result=await c.query("INSERT INTO partner_application(id,owner_id,payload) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO NOTHING RETURNING *",[randomUUID(),user.id,JSON.stringify(defaultApplication)]);
    if(result.rowCount) { const app=map(result.rows[0]); await audit(c,user,"APPLICATION_CREATED",app.id); return app; }
    return map((await c.query("SELECT * FROM partner_application WHERE owner_id=$1",[user.id])).rows[0]);
  });
}
export async function listApplications(actor:Actor) {
  const user=await storedActor(actor);
  const rows=(await db.query("SELECT * FROM partner_application WHERE ($1::boolean OR owner_id=$2) ORDER BY updated_at DESC LIMIT 100",[user.role==="SUPER_ADMIN",user.id])).rows;
  return rows.map(map);
}
export async function getApplication(actor:Actor,id:string) {
  const user=await storedActor(actor);
  const row=(await db.query("SELECT * FROM partner_application WHERE id=$1 AND ($2::boolean OR owner_id=$3)",[id,user.role==="SUPER_ADMIN",user.id])).rows[0];
  if(!row) throw new DomainError("Application not found.",404);
  const [revisions,reviews,files]=await Promise.all([
    db.query("SELECT revision,payload,submitted_at FROM partner_revision WHERE application_id=$1 ORDER BY revision",[id]),
    db.query("SELECT decision,reason,revision,created_at FROM partner_review WHERE application_id=$1 ORDER BY created_at DESC",[id]),
    db.query("SELECT id,purpose,original_name,mime,size_bytes,created_at FROM private_file WHERE application_id=$1 ORDER BY created_at",[id])
  ]);
  return {...map(row),revisions:revisions.rows,reviews:reviews.rows,files:files.rows};
}
export async function saveDraft(actor:Actor,id:string,input:unknown,version:number) {
  const payload=draftApplicationSchema.parse(input);
  return transaction(async c=>{
    const user=await storedActor(actor,c),app=await locked(c,id);
    authorizeTransition(user,app,"SAVE",version);
    const row=(await c.query("UPDATE partner_application SET payload=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id,JSON.stringify(payload)])).rows[0];
    await audit(c,user,"APPLICATION_SAVED",id,{version:version+1}); return map(row);
  });
}
export async function submitApplication(actor:Actor,id:string,version:number) {
  return transaction(async c=>{
    const user=await storedActor(actor,c),app=await locked(c,id);
    authorizeTransition(user,app,"SUBMIT",version);
    const payload=completeApplicationSchema.parse(app.payload);
    const files=(await c.query("SELECT id,purpose FROM private_file WHERE application_id=$1 AND owner_id=$2",[id,user.id])).rows;
    if(!files.some(f=>f.purpose==="REGISTRATION")) throw new DomainError("Upload registration evidence before submitting.");
    if(payload.acceptedMethods.includes("GCASH") && !files.some(f=>f.purpose==="GCASH_QR")) throw new DomainError("Upload the business-owned GCash QR before submitting.");
    const revision=app.submittedRevision+1;
    await c.query("INSERT INTO partner_revision(application_id,revision,payload) VALUES($1,$2,$3)",[id,revision,JSON.stringify(payload)]);
    for(const f of files) await c.query("INSERT INTO partner_revision_file(application_id,revision,file_id) VALUES($1,$2,$3)",[id,revision,f.id]);
    const row=(await c.query("UPDATE partner_application SET status='SUBMITTED',submitted_revision=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id,revision])).rows[0];
    await audit(c,user,"APPLICATION_SUBMITTED",id,{revision});
    const admins=(await c.query("SELECT id FROM app_actor WHERE role='SUPER_ADMIN' AND NOT suspended")).rows;
    for(const a of admins) await notify(c,a.id,id,"A partner application is ready for review.");
    return map(row);
  });
}
export async function reviewApplication(actor:Actor,id:string,version:number,decision:Extract<Action,"START_REVIEW"|"APPROVE"|"CHANGES_REQUESTED"|"REJECT">,reason:string) {
  return transaction(async c=>{
    const user=await storedActor(actor,c),app=await locked(c,id);
    authorizeTransition(user,app,decision,version,reason);
    const status=decision==="START_REVIEW"?"UNDER_REVIEW":decision==="APPROVE"?"APPROVED":decision==="REJECT"?"REJECTED":"CHANGES_REQUESTED";
    if(decision!=="START_REVIEW") {
      await c.query("INSERT INTO partner_review(id,application_id,revision,reviewer_id,decision,reason) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),id,app.submittedRevision,user.id,decision,reason.trim()]);
      await notify(c,app.ownerId,id,`Your partner application: ${status.toLowerCase().replaceAll("_"," ")}. ${reason.trim()}`);
    }
    if(decision==="APPROVE") {
      const submitted=(await c.query("SELECT payload FROM partner_revision WHERE application_id=$1 AND revision=$2",[id,app.submittedRevision])).rows[0];
      completeApplicationSchema.parse(submitted.payload);
      await c.query("INSERT INTO agency(id,application_id,owner_id,approved_revision) VALUES($1,$2,$3,$4)",[randomUUID(),id,app.ownerId,app.submittedRevision]);
      await c.query("UPDATE app_actor SET role='AGENCY_ADMIN' WHERE id=$1 AND role <> 'SUPER_ADMIN'",[app.ownerId]);
    }
    const row=(await c.query("UPDATE partner_application SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id,status])).rows[0];
    await audit(c,user,`APPLICATION_${decision}`,id,{revision:app.submittedRevision,version:version+1}); return map(row);
  });
}
export async function withdrawApplication(actor:Actor,id:string,version:number) {
  return transaction(async c=>{
    const user=await storedActor(actor,c),app=await locked(c,id); authorizeTransition(user,app,"WITHDRAW",version);
    const row=(await c.query("UPDATE partner_application SET status='WITHDRAWN',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
    await audit(c,user,"APPLICATION_WITHDRAWN",id); return map(row);
  });
}
