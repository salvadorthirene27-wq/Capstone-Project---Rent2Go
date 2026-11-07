import {z} from 'zod';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {DomainError,type Actor} from '../partners/workflow';
import {remittanceContext} from './remittance-source';
export const platformRecordKind=z.enum(['REMITTANCE','RECEIPT','AGENCY_CREDIT','CREDIT_APPLICATION']);
export async function remittanceEvidenceForRead(actor:Actor,id:string){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const row=(await c.query('SELECT t.file_id,t.mime,t.backend,a.id account_id,a.agency_id,a.environment FROM platform_remittance_attempt t JOIN platform_account a ON a.id=t.account_id WHERE t.file_id=$1',[uuid.parse(id)])).rows[0];if(!row)throw new DomainError('Private remittance evidence not found.',404);
 await remittanceContext(c,actor,{agencyId:row.agency_id,environment:row.environment});return {objectKey:`${row.account_id}/${row.file_id}`,mime:row.mime as string,backend:row.backend as string,name:`remittance-${row.file_id}.${row.mime==='image/png'?'png':row.mime==='image/jpeg'?'jpg':'pdf'}`};
});}
export async function getPlatformRecord(actor:Actor,kindInput:string,idInput:string){
 const kind=platformRecordKind.parse(kindInput),id=uuid.parse(idInput),table={REMITTANCE:'platform_remittance',RECEIPT:'platform_remittance_receipt',AGENCY_CREDIT:'platform_agency_credit',CREDIT_APPLICATION:'platform_credit_application'}[kind];
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const row=(await c.query(`SELECT r.id,r.body,r.digest,r.amount_centavos,r.created_at,a.agency_id,a.environment FROM ${table} r JOIN platform_account a ON a.id=r.account_id WHERE r.id=$1`,[id])).rows[0];if(!row)throw new DomainError('Platform financial record not found.',404);
  const ctx=await remittanceContext(c,actor,{agencyId:row.agency_id,environment:row.environment});
  const state=kind==='REMITTANCE'?(await c.query("SELECT p.id receipt_id,x.action cancellation FROM platform_remittance r LEFT JOIN platform_remittance_receipt p ON p.remittance_id=r.id LEFT JOIN platform_remittance_cancel x ON x.remittance_id=r.id WHERE r.id=$1",[id])).rows[0]:null;
  return {id,kind,scope:ctx.scope,agencyName:ctx.agencyName,isAgency:ctx.operator,isPlatform:ctx.platform,record:row.body as Record<string,unknown>,digest:row.digest as string,amountCentavos:Number(row.amount_centavos),createdAt:(row.created_at as Date).toISOString(),state:state?{receiptId:state.receipt_id as string|null,cancellation:state.cancellation as string|null}:null,backHref:ctx.operator?`/agency/${ctx.scope.agencyId}/remittances?environment=${ctx.scope.environment}`:`/admin/remittances/${ctx.scope.agencyId}?environment=${ctx.scope.environment}`};
 });
}
export type PlatformRecord=Awaited<ReturnType<typeof getPlatformRecord>>;
