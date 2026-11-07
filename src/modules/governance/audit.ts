import {z} from 'zod';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),action:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^[A-Z][A-Z0-9_]{1,80}$/).optional())}).strict();
export async function getAuditReview(actor:Actor,input:unknown={}){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const u=await storedActor(actor,c);if(u.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[u.id])).rows[0]?.is_test_fixture)throw new DomainError('Platform audit-review access is required.',403);const q=query.parse(input),rows=(await c.query('SELECT action,entity_id,metadata,created_at FROM app_audit WHERE ($1::text IS NULL OR action=$1) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2',[q.action??null,(q.page-1)*20])).rows,total=Number((await c.query('SELECT count(*) n FROM app_audit WHERE ($1::text IS NULL OR action=$1)',[q.action??null])).rows[0].n);
 return {page:q.page,pageCount:Math.max(1,Math.ceil(total/20)),action:q.action??'',total,items:rows.map(r=>{const context:Record<string,string|number>={};for(const key of ['environment','revision','rowCount','kind','outcome']){const value=r.metadata?.[key];if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0||typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,50}$/.test(value))context[key]=value;}return {action:r.action as string,reference:r.entity_id as string,context,createdAt:(r.created_at as Date).toISOString()};})};
});}
