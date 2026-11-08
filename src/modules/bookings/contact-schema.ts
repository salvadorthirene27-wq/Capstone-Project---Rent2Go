import {z} from 'zod';
const instant=z.iso.datetime({offset:true}).transform(v=>new Date(v).toISOString());
const common={version:z.number().int().positive(),idempotencyKey:z.uuid(),assigneeId:z.string().min(1).max(160).nullable(),nextFollowUpAt:instant.nullable(),note:z.string().trim().min(3).max(2000)};
export const contactCommand=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('ASSIGNMENT')}).strict(),
 z.object({...common,action:z.literal('CONTACT'),method:z.enum(['PHONE','EMAIL']),outcome:z.enum(['REACHED','NO_ANSWER','AWAITING_REPLY','NOT_PROCEEDING']),contactedAt:instant}).strict(),
]);
export const contactPage=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const contactMethodLabels={PHONE:'Phone call',EMAIL:'Email'} as const;
export const contactOutcomeLabels={REACHED:'Reached',NO_ANSWER:'No answer',AWAITING_REPLY:'Awaiting reply',NOT_PROCEEDING:'Not proceeding — contact note only'} as const;
