import {z} from 'zod';
import {uuid} from '../../lib/http';
import {DomainError} from '../partners/workflow';
export const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
 if(v.startsWith('0000'))return false;const d=new Date(`${v}T00:00:00.000Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
},'Choose an actual calendar date.');
export const reportScope=z.discriminatedUnion('type',[
 z.object({type:z.literal('AGENCY'),agencyId:uuid}).strict(),
 z.object({type:z.literal('OWNER')}).strict(),
 z.object({type:z.literal('PLATFORM')}).strict(),
]);
export type ReportScope=z.infer<typeof reportScope>;
export const reportQuery=z.object({environment:z.enum(['MANUAL','DEMO']).default('MANUAL'),from:calendarDate.optional(),to:calendarDate.optional(),record:z.enum(['ALLOCATIONS','COLLECTIONS','REFUNDS','PAYOUTS','AGENCIES']).optional(),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export function reportWindow(input:unknown,today:string,scope:ReportScope['type']){
 const q=reportQuery.parse(input),end=q.to??calendarDate.parse(today),start=q.from??`${end.slice(0,7)}-01`,days=(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000+1;
 if(days<1||days>366)throw new DomainError('Choose an end date on or after the start, within 366 days.',422);
 const allowed=scope==='PLATFORM'?['AGENCIES']:scope==='OWNER'?['ALLOCATIONS','PAYOUTS']:['ALLOCATIONS','COLLECTIONS','REFUNDS','PAYOUTS'],record=q.record??allowed[0];
 if(!allowed.includes(record))throw new DomainError('This report record type is unavailable for your scope.',403);
 return {...q,from:start,to:end,record:record as NonNullable<typeof q.record>,allowedRecords:allowed};
}
export const exportCommand=z.object({scope:reportScope,filters:reportQuery,purpose:z.string().trim().min(5).max(500),acknowledged:z.literal(true)}).strict();
