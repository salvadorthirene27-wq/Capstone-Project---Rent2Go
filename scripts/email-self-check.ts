import {randomUUID} from 'node:crypto';
import {sendGmailSelfCheck} from '../src/modules/email/provider';
if(process.argv.slice(2).join(' ')!=='--send-self-check')throw new Error('Explicit authorization is required for a single email to the configured sender.');
try{const result=await sendGmailSelfCheck(`<${randomUUID()}@rent2go.invalid>`);console.info(JSON.stringify({...result,recipient:'CONFIGURED_SENDER_ONLY',queueSendingEnabled:process.env.EMAIL_SEND_ENABLED==='true'}));if(result.outcome!=='ACCEPTED')process.exitCode=1;}
catch{console.error(JSON.stringify({outcome:'NOT_SENT',reason:'SETTINGS_UNAVAILABLE'}));process.exitCode=1;}
