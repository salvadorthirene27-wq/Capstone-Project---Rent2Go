// Explicit one-shot batches avoid a permanent polling worker on a free database.
import {bookingWorkerTarget} from './lib/booking-worker-target';
const recovery=process.argv.includes('--recover-only');
if(!recovery&&(!process.argv.includes('--enable-email')||process.env.EMAIL_SEND_ENABLED!=='true'))throw new Error('Email sending must be explicitly enabled. No messages were processed.');
process.env.DATABASE_URL=bookingWorkerTarget(process.env,['--enable',...(process.argv.includes('--test')?['--test']:[])]);
const {processEmailBatch,recoverInterruptedEmails}=await import('../src/modules/email/service');
const {db}=await import('../src/lib/db');
try{console.info(JSON.stringify(recovery?{recovered:await recoverInterruptedEmails(),messageSent:false}:await processEmailBatch()));}
catch(error){console.error(JSON.stringify({result:'failed',type:error instanceof Error?error.name:'unknown'}));process.exitCode=1;}
finally{await db.end();}
