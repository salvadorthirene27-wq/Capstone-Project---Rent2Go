import {payMongoConfig} from '../gateway/paymongo';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
export async function getOperations(actor:Actor){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const user=await storedActor(actor,c);
 if(user.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Platform operational access is required.',403);
 const clock=(await c.query('SELECT clock_timestamp() now')).rows[0].now as Date,row=(await c.query('SELECT status,started_at,lease_until,last_seen_at,last_success_at,last_failure_at,last_error_type,last_processed FROM background_worker WHERE name=$1',['BOOKING_HOLD_EXPIRY'])).rows[0];
 const due=(await c.query("SELECT count(*)::int n FROM booking_hold h JOIN booking_request r ON r.id=h.request_id WHERE r.status IN('QUOTE_PENDING','QUOTE_ACCEPTED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_RECONCILIATION_REQUIRED') AND h.released_at IS NULL AND h.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id)")).rows[0].n as number;
 const history=(await c.query('SELECT outcome,processed,error_type,started_at,completed_at FROM background_worker_run WHERE worker_name=$1 ORDER BY completed_at DESC,id DESC LIMIT 10',['BOOKING_HOLD_EXPIRY'])).rows;
 let paymentState='DISABLED',paymentSeen:Date|null=null,paymentSuccess:Date|null=null;
 if(process.env.PAYMONGO_ENABLED==='true'){
  try{
   payMongoConfig();
   const schema=(await c.query("SELECT to_regclass('paymongo_booking_posting') posting,EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='background_worker'::regclass AND pg_get_constraintdef(oid) LIKE '%PAYMONGO_CHECKOUT_SYNC%') supervision")).rows[0];
   if(!schema.posting||!schema.supervision)paymentState='SCHEMA_REQUIRED';
   else{
    const p=(await c.query("SELECT * FROM background_worker WHERE name='PAYMONGO_CHECKOUT_SYNC'")).rows[0];
    paymentSeen=p?.last_seen_at??null;paymentSuccess=p?.last_success_at??null;
    paymentState=!p?'NOT_STARTED':p.status==='STOPPED'?'STOPPED':p.lease_until<=clock?'STALE':p.last_failure_at&&(!p.last_success_at||p.last_failure_at>p.last_success_at)?'NEEDS_ATTENTION':p.last_success_at&&p.last_success_at>=p.started_at?'RUNNING':'STARTING';
   }
  }catch(error){if(error instanceof DomainError)paymentState='CONFIGURATION_REQUIRED';else throw error;}
 }
 const stamp=(v:Date|null|undefined)=>v?.toISOString()??null;
 const state=!row?'NOT_STARTED':row.status==='STOPPED'?'STOPPED':row.lease_until<=clock?'STALE':row.last_failure_at&&(!row.last_success_at||row.last_failure_at>row.last_success_at)?'NEEDS_ATTENTION':row.last_success_at&&row.last_success_at>=row.started_at?'RUNNING':'STARTING';
 return {preparedAt:clock.toISOString(),databaseReachable:true,holdExpiry:{state,awaitingExpiry:due,lastSeenAt:stamp(row?.last_seen_at),lastSuccessAt:stamp(row?.last_success_at),lastFailureAt:stamp(row?.last_failure_at),lastErrorType:row?.last_error_type??null,lastProcessed:row?row.last_processed as number|null:null},history:history.map(r=>({outcome:r.outcome as 'SUCCEEDED'|'FAILED',processed:r.processed as number|null,errorType:r.error_type as string|null,startedAt:stamp(r.started_at)!,completedAt:stamp(r.completed_at)!})),paymentSync:{state:paymentState,lastSeenAt:stamp(paymentSeen),lastSuccessAt:stamp(paymentSuccess)},emailDispatchEnabled:process.env.EMAIL_SEND_ENABLED==='true'};
});}
