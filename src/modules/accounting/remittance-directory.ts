import {z} from 'zod';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {remittanceEnvironment} from './remittance-schema';
import {remittanceBalances} from './remittance-balances';
import {platformFactsSql} from './remittance-source';
export const remittanceDirectoryQuery=z.object({environment:remittanceEnvironment.default('MANUAL'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export async function getRemittanceDirectory(actor:Actor,input:unknown={}){
 const q=remittanceDirectoryQuery.parse(input);
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const user=await storedActor(actor,c);
  if(user.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Platform remittance access is required.',403);
  const eligible="EXISTS(SELECT 1 FROM booking_revenue_entry e WHERE e.agency_id=g.id AND e.environment=$1::text AND e.recipient='PLATFORM' AND e.amount_centavos>0)",selected=`SELECT g.id,g.active,r.payload->>'businessName' name,count(*) OVER()::int total FROM agency g JOIN partner_revision r ON r.application_id=g.application_id AND r.revision=g.approved_revision WHERE ${eligible} ORDER BY r.payload->>'businessName',g.id LIMIT 20 OFFSET $2`;
  const rows=(await c.query(`WITH selected AS(${selected}),${platformFactsSql('e.agency_id IN(SELECT id FROM selected)','$1::text').slice(5)} SELECT s.id,s.name,s.active,s.total,COALESCE(sum(b.original),0)::text original,COALESCE(sum(b.credits),0)::text credits,COALESCE(sum(b.paid),0)::text paid,COALESCE(sum(b.applied),0)::text applied,COALESCE(sum(b.reserved),0)::text reserved,COALESCE(sum(b.due),0)::text due,COALESCE(sum(b.excess),0)::text excess,COALESCE(sum(b.granted),0)::text granted FROM selected s LEFT JOIN balances b ON b.agency_id=s.id GROUP BY s.id,s.name,s.active,s.total ORDER BY s.name,s.id`,[q.environment,(q.page-1)*20])).rows;
  const total=Number(rows[0]?.total??(await c.query(`SELECT count(*) n FROM agency g WHERE ${eligible}`,[q.environment])).rows[0].n);
  return {environment:q.environment,page:q.page,pageCount:Math.max(1,Math.ceil(total/20)),total,items:rows.map(r=>({agencyId:r.id as string,agencyName:r.name as string,agencyActive:r.active as boolean,balances:remittanceBalances({original:BigInt(r.original),credits:BigInt(r.credits),paid:BigInt(r.paid),offset:BigInt(r.applied),reserved:BigInt(r.reserved),due:BigInt(r.due),excess:BigInt(r.excess),accepted:BigInt(r.granted)})}))};
 });
}
