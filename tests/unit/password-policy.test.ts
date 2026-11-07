import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {hashPassword} from '@better-auth/utils/password';
const deps=vi.hoisted(()=>({check:vi.fn(),query:vi.fn(),rate:vi.fn(),forward:vi.fn()}));
vi.mock('../../src/lib/auth',()=>({auth:{emailOtp:{checkVerificationOtp:deps.check},handler:()=>({POST:deps.forward})}}));vi.mock('../../src/lib/db',()=>({db:{query:deps.query}}));vi.mock('../../src/lib/rate-limit',()=>({rateLimit:deps.rate}));
import {guardedPasswordReset,unsupportedPasswordMutation} from '../../src/modules/account/password-policy';
import {POST} from '../../src/app/api/auth/[...path]/route';
let digest:string;
beforeAll(async()=>{digest=await hashPassword('SyntheticCurrent!234');});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
function request(password='SyntheticCurrent!234',extra:Record<string,unknown>={}){vi.stubEnv('APP_ORIGIN','https://rent2go.example');return new Request('https://rent2go.example/api/auth/email-otp/reset-password',{method:'POST',headers:{origin:'https://rent2go.example','content-type':'application/json'},body:JSON.stringify({email:'renter@example.test',otp:'123456',password,...extra})});}
it('checks code possession before credential access and refuses a matching current password without forwarding a reset',async()=>{
 deps.check.mockResolvedValue({data:{success:true}});deps.query.mockResolvedValue({rows:[{digest}]});const forward=vi.fn();const r=await guardedPasswordReset(request(),forward);expect(r.status).toBe(422);expect((await r.json()).code).toBe('PASSWORD_REUSE');expect(forward).not.toHaveBeenCalled();expect(deps.check).toHaveBeenCalledWith({email:'renter@example.test',otp:'123456',type:'forget-password'});expect(deps.check.mock.invocationCallOrder[0]).toBeLessThan(deps.query.mock.invocationCallOrder[0]);
});
it('does not look up a credential or reveal details for a rejected code or invalid payload',async()=>{
 deps.check.mockResolvedValue({error:{message:'PRIVATE AUTH CONTENT'}});const forward=vi.fn();const r=await guardedPasswordReset(request(),forward);expect(r.status).toBe(422);expect(await r.text()).not.toContain('PRIVATE');expect(deps.query).not.toHaveBeenCalled();expect(forward).not.toHaveBeenCalled();expect((await guardedPasswordReset(request('SyntheticCurrent!234',{role:'admin'}),forward)).status).toBe(422);
});
it('forwards a different password once with the unconsumed original request body intact',async()=>{
 deps.check.mockResolvedValue({data:{success:true}});deps.query.mockResolvedValue({rows:[{digest}]});const req=request('SyntheticDifferent!234'),forward=vi.fn(async()=>{expect((await req.json()).password).toBe('SyntheticDifferent!234');return Response.json({success:true});});const r=await guardedPasswordReset(req,forward);expect(r.status).toBe(200);expect(forward).toHaveBeenCalledOnce();
});
it('fails closed for unknown hash formats, missing rows or unavailable lookups, and blocks alternative local password mutation paths',async()=>{
 deps.check.mockResolvedValue({data:{success:true}});const forward=vi.fn();for(const result of [{rows:[{digest:'PRIVATE UNKNOWN FORMAT'}]},{rows:[]}]){deps.query.mockResolvedValueOnce(result);const r=await guardedPasswordReset(request(),forward);expect(r.status).toBe(503);expect(await r.text()).not.toContain('PRIVATE');}deps.query.mockRejectedValueOnce(Error('PRIVATE DATABASE DATA'));expect((await guardedPasswordReset(request(),forward)).status).toBe(503);expect(forward).not.toHaveBeenCalled();for(const path of ['change-password','set-password','reset-password','admin/set-user-password'])expect(unsupportedPasswordMutation(path)).toBe(true);expect(unsupportedPasswordMutation('sign-in/email')).toBe(false);
});
it('guards the direct application auth endpoint while preserving normal sign-in forwarding',async()=>{
 deps.check.mockResolvedValue({data:{success:true}});deps.query.mockResolvedValue({rows:[{digest}]});const r=await POST(request(),{params:Promise.resolve({path:['email-otp','reset-password']})});expect(r.status).toBe(422);expect(deps.forward).not.toHaveBeenCalled();expect((await POST(request(),{params:Promise.resolve({path:['change-password']})})).status).toBe(403);deps.forward.mockResolvedValueOnce(Response.json({ok:true}));expect((await POST(request(),{params:Promise.resolve({path:['sign-in','email']})})).status).toBe(200);expect(deps.forward).toHaveBeenCalledOnce();
});
