import {z} from 'zod';
import {DomainError} from '../partners/workflow';
import {accountScope,accountQuery,environmentSchema} from './schema';
export function accountRequest(req:Request,params:{agencyId:string;ownerId:string},write=false){
 const p=new URL(req.url).searchParams;
 for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each account filter once.',422);
 const query=(write?z.object({environment:environmentSchema}).strict():accountQuery).parse(Object.fromEntries(p));
 return {scope:accountScope.parse({...params,environment:query.environment}),query};
}
