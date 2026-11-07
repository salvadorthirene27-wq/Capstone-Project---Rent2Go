import nodemailer from 'nodemailer';
import {z} from 'zod';

export type MailOutcome = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN' | 'CANCELLED';
export type MailResult = {outcome:MailOutcome;reason:string};
const address = z.email().max(254).refine(value=>!/[\r\n<>]/.test(value));

export function gmailSettings(env:NodeJS.ProcessEnv=process.env){
  const user=address.parse(env.SMTP_USER);
  if(env.EMAIL_PROVIDER!=='gmail'||env.SMTP_HOST!=='smtp.gmail.com'||env.SMTP_PORT!=='465'||env.SMTP_SECURE!=='true'||!user.toLowerCase().endsWith('@gmail.com')||!/^[a-zA-Z0-9]{16}$/.test(env.SMTP_PASSWORD??''))
    throw new Error('Gmail sender settings are missing or invalid.');
  return {user,password:env.SMTP_PASSWORD!};
}

function transport(){
  const config=gmailSettings();
  return {user:config.user,client:nodemailer.createTransport({
    host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:config.user,pass:config.password},
    tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
  })};
}

// DNS, TLS and authentication only: no envelope or message is submitted.
export async function verifyGmailConnection():Promise<{ready:boolean;reason:string}>{
  let sender:ReturnType<typeof transport>|undefined;
  try{sender=transport();await sender.client.verify();return {ready:true,reason:'AUTHENTICATED'};}
  catch(error){const code=(error as {code?:string})?.code;return {ready:false,reason:code==='EAUTH'?'AUTHENTICATION_FAILED':code==='ECONNECTION'||code==='ETIMEDOUT'||code==='ESOCKET'?'CONNECTION_FAILED':'SETTINGS_OR_PROVIDER_UNAVAILABLE'};}
  finally{sender?.client.close();}
}

export function inboxMail(origin:string){
  const url=new URL(origin);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Configure a trusted application origin.');
  return {subject:'You have a Rent2Go update',text:`A new update is available in your Rent2Go account.\n\nSign in to view it: ${url.origin}/workspace/notifications\n\nFor privacy, document details and financial information are available only after signing in. You can change email preferences in your notification inbox.\n\nRent2Go`};
}

export async function sendInboxMail(to:string,messageId:string):Promise<MailResult>{
  if(process.env.EMAIL_SEND_ENABLED!=='true')return {outcome:'CANCELLED',reason:'PERMISSION_CHANGED'};
  return deliver(to,messageId,inboxMail(process.env.APP_ORIGIN??''));
}

export async function sendGmailSelfCheck(messageId:string):Promise<MailResult>{
  // Deliberate CLI-only, one-recipient check. It does not enable the queue.
  return deliver(gmailSettings().user,messageId,{subject:'Rent2Go email connection check',text:'Your Rent2Go Gmail sender is connected.\n\nThis is the single connection check you authorized. No booking documents or financial details are included.\n\nRent2Go'});
}

async function deliver(to:string,messageId:string,message:{subject:string;text:string}):Promise<MailResult>{
  let sender:ReturnType<typeof transport>|undefined;
  try{
    const recipient=address.parse(to);
    if(!/^<[a-f0-9-]{36}@rent2go\.invalid>$/.test(messageId))throw new Error('Invalid mail identity.');
    sender=transport();
    const info=await sender.client.sendMail({from:{name:'Rent2Go',address:sender.user},to:{address:recipient,name:''},envelope:{from:sender.user,to:[recipient]},messageId,...message});
    // Acceptance by SMTP is not proof of delivery to a person's inbox.
    return info.accepted?.length===1?{outcome:'ACCEPTED',reason:'SMTP_ACCEPTED'}:{outcome:'REJECTED',reason:'RECIPIENT_REJECTED'};
  }catch(error){
    const e=error as {code?:string;responseCode?:number;command?:string};
    if(e.code==='EAUTH')return {outcome:'REJECTED',reason:'AUTHENTICATION_FAILED'};
    if(Number.isInteger(e.responseCode)&&e.responseCode!>=400&&e.responseCode!<=599)return {outcome:'REJECTED',reason:'SMTP_REJECTED'};
    // A dropped connection after DATA may have delivered the message. Never retry it automatically.
    return {outcome:'UNKNOWN',reason:'OUTCOME_UNCONFIRMED'};
  }finally{sender?.client.close();}
}
