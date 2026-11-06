import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn(),payments:vi.fn(),pay:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/bookings/settlement',()=>({getSettlement:m.get,changeSettlement:m.change}));vi.mock('@/modules/bookings/settlement-payment',()=>({getSettlementPayments:m.payments,changeSettlementPayment:m.pay}));
import {GET,PATCH} from '../../src/app/api/booking-requests/[id]/settlement/route';
import {GET as payments,PATCH as pay} from '../../src/app/api/booking-requests/[id]/settlement-payments/route';
import {settlementCommand} from '../../src/modules/bookings/settlement-schema';
import {DomainError} from '../../src/modules/partners/workflow';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({id})},base='http://localhost:3100',actor={id:'renter',role:'RENTER'},request=(origin=base)=>new Request(base,{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:'{}'});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.actor.mockResolvedValue(actor);m.get.mockResolvedValue({current:null});m.payments.mockResolvedValue({open:[]});m.change.mockResolvedValue({});m.pay.mockResolvedValue({});});afterEach(()=>vi.unstubAllEnvs());
it('checks origins before either financial mutation and requires authentication for both reads',async()=>{
 expect((await PATCH(request('https://foreign.test'),ctx)).status).toBe(403);expect((await pay(request('https://foreign.test'),ctx)).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();m.actor.mockRejectedValue(new DomainError('Sign in',401));expect((await GET(new Request(base),ctx)).status).toBe(401);expect((await payments(new Request(base),ctx)).status).toBe(401);
});
it('rejects duplicate page parameters and preserves scoped/private domain conflicts',async()=>{
 expect((await GET(new Request(base+'?page=1&page=2'),ctx)).status).toBe(422);expect((await payments(new Request(base+'?page=1&page=2'),ctx)).status).toBe(422);expect(m.get).not.toHaveBeenCalled();m.change.mockRejectedValue(new DomainError('Refresh settlement',409));expect((await PATCH(request(),ctx)).status).toBe(409);m.payments.mockRejectedValue(new DomainError('Not found',404));expect((await payments(new Request(base),ctx)).status).toBe(404);
});
it('accepts no client-provided financial allocations, amounts or implied renter consent',()=>{
 const cmd={action:'PROPOSE_SETTLEMENT',version:1,idempotencyKey:id,reason:'Exact source terms'};expect(settlementCommand.safeParse(cmd).success).toBe(true);expect(settlementCommand.safeParse({...cmd,obligationCentavos:1}).success).toBe(false);expect(settlementCommand.safeParse({...cmd,allocations:[]}).success).toBe(false);expect(settlementCommand.safeParse({action:'DECIDE_SETTLEMENT',version:1,idempotencyKey:id,settlementId:id,digest:'a'.repeat(64),decision:'ACCEPT',consent:false,reason:''}).success).toBe(false);
});
