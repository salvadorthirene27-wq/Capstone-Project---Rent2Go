import {z} from 'zod';
import {uuid} from '../../lib/http';
export const notificationSource=z.enum(['PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE','GOVERNANCE']);
export const inboxQuery=z.object({status:z.enum(['ALL','UNREAD','DELETED']).default('ALL'),category:z.enum(['ALL','PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE','GOVERNANCE']).default('ALL'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const readNotifications=z.object({items:z.array(z.object({source:notificationSource,id:uuid}).strict()).min(1).max(20).refine(items=>new Set(items.map(n=>`${n.source}:${n.id}`)).size===items.length,'Choose each update once.'),query:inboxQuery.default({status:'ALL',category:'ALL',page:1})}).strict();
export type NotificationSource=z.infer<typeof notificationSource>;
const commandBase={idempotencyKey:uuid,query:inboxQuery.default({status:'ALL',category:'ALL',page:1})};
const item=z.object({source:notificationSource,id:uuid}).strict();
export const notificationAction=z.discriminatedUnion('action',[
 z.object({...commandBase,action:z.literal('MARK_ALL_READ')}).strict(),
 z.object({...commandBase,action:z.literal('DELETE_READ')}).strict(),
 z.object({...commandBase,action:z.literal('DELETE_ONE'),item}).strict(),
 z.object({...commandBase,action:z.literal('RESTORE_ONE'),item}).strict(),
 z.object({...commandBase,action:z.literal('RESTORE_BATCH'),batchId:uuid}).strict(),
]);
