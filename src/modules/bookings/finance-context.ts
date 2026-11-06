import type {PoolClient} from 'pg';
import {uuid} from '../../lib/http';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {lockBookingAuthority} from './quotation';
export async function financialContext(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?' FOR UPDATE':''}`,[uuid.parse(id)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError('Request not found.',404);
 if((await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Access denied.',403);
 const a=(await c.query('SELECT g.active AND NOT o.suspended AND NOT o.is_test_fixture AS active,(g.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$2 AND m.active)) AS operator FROM agency g JOIN app_actor o ON o.id=g.owner_id WHERE g.id=$1',[r.agency_id,user.id])).rows[0];
 const owner=r.renter_id===user.id,operator=!owner&&Boolean(a?.active&&a?.operator);
 if(!owner&&!operator)throw new DomainError('Request not found.',404);
 return {r,user,owner,operator,agencyActive:Boolean(a?.active)};
}
export type FinancialContext=Awaited<ReturnType<typeof financialContext>>;
export async function financialLines(c:PoolClient,quoteId:string){return(await c.query('SELECT line_id,public_snapshot,private_financial_snapshot FROM booking_quotation_line WHERE quote_id=$1 ORDER BY line_id',[quoteId])).rows;}
export async function lockFinancialAuthority(c:PoolClient,ctx:FinancialContext,operator:boolean,lines:Awaited<ReturnType<typeof financialLines>>){
 const owners=lines.filter(l=>l.private_financial_snapshot.category==='CONSIGNED').map(l=>l.private_financial_snapshot.cosignerId as string);
 if(owners.some(id=>!id))throw new DomainError('Original vehicle ownership requires review.',409);
 const authority=await lockBookingAuthority(c,ctx,[ctx.r.renter_id,...owners],operator);
 if(!authority.active)throw new DomainError('This agency is currently unavailable.',409);
 ctx.agencyActive=authority.active;
}
