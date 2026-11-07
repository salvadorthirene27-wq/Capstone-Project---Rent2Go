import {z} from 'zod';
import {DomainError} from '../partners/workflow';
import {remittanceScope,remittanceQuery,remittanceEnvironment} from './remittance-schema';
export function remittanceRequest(req:Request,agencyId:string,write=false){
 const p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each remittance filter once.',422);
 const query=(write?z.object({environment:remittanceEnvironment.default('MANUAL')}).strict():remittanceQuery).parse(Object.fromEntries(p));return {scope:remittanceScope.parse({agencyId,environment:query.environment}),query};
}
