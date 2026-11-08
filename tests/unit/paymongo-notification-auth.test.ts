import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {createHmac} from 'node:crypto';
const m=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn()}));vi.mock('../../src/lib/db',()=>({transaction:m.transaction,db:{query:m.query}}));
import {receivePayMongoNotification} from '../../src/modules/gateway/notifications';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_pureNotificationFixture');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','webhook');vi.stubEnv('PAYMONGO_WEBHOOK_SECRET','unit-signing-secret');});afterEach(()=>vi.unstubAllEnvs());
it('rejects a forged signature before obtaining a database connection',async()=>{
 await expect(receivePayMongoNotification(Buffer.from('{}'),'t=1800000000,te='+ '0'.repeat(64)+',li=')).rejects.toMatchObject({status:401});expect(m.transaction).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
});
it('uses PostgreSQL time after MAC authentication and rejects an old authentic request before recording it',async()=>{
 const raw=Buffer.from('{}'),t=1700000000,signature=createHmac('sha256','unit-signing-secret').update(t+'.').update(raw).digest('hex'),query=vi.fn().mockResolvedValue({rows:[{n:new Date(1800000000000)}]});m.transaction.mockImplementation(fn=>fn({query}));await expect(receivePayMongoNotification(raw,`t=${t},te=${signature},li=`)).rejects.toMatchObject({status:401});expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain('clock_timestamp');
});
