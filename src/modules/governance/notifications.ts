import type {PoolClient} from 'pg';
export async function notifyPrivacy(c:PoolClient,caseId:string){
 await c.query("INSERT INTO governance_notification(id,recipient_id,case_id,message) SELECT gen_random_uuid(),u.id,$1,'Account or privacy request activity was recorded. Review the exact request and saved outcome in its protected workspace.' FROM app_actor u WHERE u.id=(SELECT actor_id FROM privacy_case WHERE id=$1) OR (u.role='SUPER_ADMIN' AND NOT u.suspended AND NOT u.is_test_fixture)",[caseId]);
}
export async function notifyUserAccess(c:PoolClient,eventId:string){
 await c.query("INSERT INTO governance_notification(id,recipient_id,account_event_id,message) SELECT gen_random_uuid(),u.id,$1,'An account access or role decision was recorded. Review your account status or the authorized platform review.' FROM app_actor u WHERE u.id=(SELECT subject_id FROM account_governance_event WHERE id=$1) OR (u.role='SUPER_ADMIN' AND NOT u.suspended AND NOT u.is_test_fixture)",[eventId]);
}
