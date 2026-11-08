import type {PoolClient} from 'pg';
/** SQL only uses a fixed application-owned alias, never a request parameter. */
export function notificationWorkSql(alias:string,pendingOnly=false){
 if(!/^[a-z]+$/.test(alias))throw Error('Invalid checkout alias.');
 return `EXISTS(SELECT 1 FROM paymongo_notification n LEFT JOIN paymongo_notification_result nr ON nr.notification_id=n.id
 WHERE n.kind<>'IGNORED' AND (n.checkout_id=${alias}.id OR nr.checkout_id=${alias}.id
 OR EXISTS(SELECT 1 FROM paymongo_checkout_link nl WHERE nl.checkout_id=${alias}.id AND nl.provider_id=n.provider_id AND nl.mode=n.mode AND nl.merchant_fingerprint=n.merchant_fingerprint)
 OR EXISTS(SELECT 1 FROM paymongo_notification_conflict nc WHERE nc.notification_id=n.id AND nc.checkout_id=${alias}.id))
 AND (${pendingOnly?"nr.notification_id IS NULL":"nr.notification_id IS NULL OR nr.outcome NOT IN('RECORDED','IGNORED') OR EXISTS(SELECT 1 FROM paymongo_notification_conflict nc WHERE nc.notification_id=n.id)"}))`;
}
export async function hasPendingNotification(c:PoolClient,id:string){
 if(!(await c.query("SELECT to_regclass('paymongo_notification') ready")).rows[0].ready)return false;
 return Boolean((await c.query(`SELECT 1 FROM paymongo_checkout x WHERE x.id=$1 AND ${notificationWorkSql('x',true)}`,[id])).rowCount);
}

export async function hasNotificationReview(c:PoolClient,id:string){
 if(!(await c.query("SELECT to_regclass('paymongo_notification') ready")).rows[0].ready)return false;
 return Boolean((await c.query(`SELECT 1 FROM paymongo_checkout x WHERE x.id=$1 AND ${notificationWorkSql('x')}`,[id])).rowCount);
}
