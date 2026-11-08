import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DomainError} from '../../src/modules/partners/workflow';
const m=vi.hoisted(()=>({config:vi.fn(),receive:vi.fn(),actor:vi.fn()}));
vi.mock('@/modules/gateway/notifications',()=>({notificationConfig:m.config,receivePayMongoNotification:m.receive}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));
import {POST} from '../../src/app/api/payments/paymongo/webhook/route';
const url='http://localhost:3100/api/payments/paymongo/webhook';
beforeEach(()=>{vi.resetAllMocks();m.config.mockReturnValue({});m.receive.mockResolvedValue({received:true});});
it('forwards exact raw bytes to signature validation without requiring browser auth or an Origin header',async()=>{
 const raw=' {"data": {"value": "é"}}\n',r=await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Paymongo-Signature':'opaque-signature'},body:raw}));
 expect(r.status).toBe(202);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({received:true});expect(new TextDecoder().decode(m.receive.mock.calls[0][0])).toBe(raw);expect(m.receive.mock.calls[0][1]).toBe('opaque-signature');expect(m.actor).not.toHaveBeenCalled();
});
it('fails closed when disabled and does not read or accept a notification',async()=>{
 m.config.mockImplementation(()=>{throw new DomainError('Payment notifications are not enabled.',503);});expect((await POST(new Request(url,{method:'POST',body:'{}'}))).status).toBe(503);expect(m.receive).not.toHaveBeenCalled();
});
it('rejects missing signatures, unsupported media and oversized bodies before receipt processing',async()=>{
 expect((await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))).status).toBe(401);
 expect((await POST(new Request(url,{method:'POST',headers:{'Content-Type':'text/plain','Paymongo-Signature':'opaque'},body:'{}'}))).status).toBe(415);
 expect((await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Paymongo-Signature':'opaque'},body:'x'.repeat(512*1024+1)}))).status).toBe(413);expect(m.receive).not.toHaveBeenCalled();
});
it('returns signature denial without exposing payment or configuration facts',async()=>{
 m.receive.mockRejectedValue(new DomainError('Invalid payment notification signature.',401));const r=await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Paymongo-Signature':'opaque'},body:'{}'}));expect(r.status).toBe(401);expect(Object.keys(await r.json())).toEqual(['error']);
});
