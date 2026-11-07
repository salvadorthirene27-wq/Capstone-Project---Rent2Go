import {afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({identity:vi.fn(),send:vi.fn(),verify:vi.fn(),rate:vi.fn()}));
vi.mock('../../src/modules/account/service',()=>({accountIdentity:deps.identity}));vi.mock('../../src/lib/auth',()=>({auth:{emailOtp:{sendVerificationOtp:deps.send,verifyEmail:deps.verify}}}));vi.mock('../../src/lib/rate-limit',()=>({rateLimit:deps.rate}));
import {GET,POST} from '../../src/app/api/account/route';
const account={id:'real-current-user',email:'sample@example.test',name:'Synthetic',role:'RENTER',emailVerified:false};
function post(body:unknown,origin='https://rent2go.example'){return POST(new Request('https://rent2go.example/api/account',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));}
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('uses the authenticated account email and refuses arbitrary recipient fields and foreign Origins',async()=>{
 vi.stubEnv('APP_ORIGIN','https://rent2go.example');deps.identity.mockResolvedValue(account);deps.send.mockResolvedValue({data:{success:true}});
 expect((await post({action:'SEND_VERIFICATION'},'https://attacker.example')).status).toBe(403);expect((await post({action:'SEND_VERIFICATION',email:'other@example.test'})).status).toBe(422);expect(deps.send).not.toHaveBeenCalled();expect((await post({action:'SEND_VERIFICATION'})).status).toBe(200);expect(deps.send).toHaveBeenCalledWith({email:account.email,type:'email-verification'});expect(deps.rate).toHaveBeenCalledWith('real-current-user:account-SEND_VERIFICATION',2);
});
it('does not verify invalid codes, mismatched identities, or unsuccessful provider replies',async()=>{
 vi.stubEnv('APP_ORIGIN','https://rent2go.example');deps.identity.mockResolvedValue(account);expect((await post({action:'VERIFY_EMAIL',code:'123'})).status).toBe(422);expect(deps.verify).not.toHaveBeenCalled();deps.verify.mockResolvedValueOnce({error:{message:'PRIVATE PROVIDER DETAIL'}}).mockResolvedValueOnce({data:{user:{id:'other',email:account.email,emailVerified:true}}}).mockResolvedValueOnce({data:{user:{id:account.id,email:account.email,emailVerified:true}}});
 const failed=await post({action:'VERIFY_EMAIL',code:'123456'});expect(failed.status).toBe(422);expect(await failed.text()).not.toContain('PRIVATE');expect((await post({action:'VERIFY_EMAIL',code:'123456'})).status).toBe(409);const success=await post({action:'VERIFY_EMAIL',code:'123456'});expect((await success.json()).account.emailVerified).toBe(true);
});
it('reads only the current account and does not resend for an already verified account',async()=>{
 vi.stubEnv('APP_ORIGIN','https://rent2go.example');deps.identity.mockResolvedValue({...account,emailVerified:true});expect((await GET(new Request('https://rent2go.example/api/account?actor=other'))).status).toBe(422);const r=await GET(new Request('https://rent2go.example/api/account'));expect(r.headers.get('cache-control')).toBe('no-store');expect((await r.json()).id).toBe(account.id);expect((await post({action:'SEND_VERIFICATION'})).status).toBe(200);expect(deps.send).not.toHaveBeenCalled();
});
