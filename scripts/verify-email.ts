import {verifyGmailConnection} from '../src/modules/email/provider';
const result=await verifyGmailConnection();
console.info(JSON.stringify({...result,messageSent:false}));
if(!result.ready)process.exitCode=1;
