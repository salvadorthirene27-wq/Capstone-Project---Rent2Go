import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({identity:vi.fn(),list:vi.fn(),create:vi.fn(),get:vi.fn(),change:vi.fn(),limit:vi.fn()}));
vi.mock('@/modules/governance/identity',()=>({privacyIdentity:m.identity}));vi.mock('@/modules/governance/privacy',()=>({getPrivacyCases:m.list,createPrivacyCase:m.create,getPrivacyCase:m.get,changePrivacyCase:m.change}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));
import {GET,POST} from '../../src/app/api/privacy/route';
import {PATCH} from '../../src/app/api/privacy/[id]/route';
import {DomainError} from '../../src/modules/partners/workflow';
const base='http://localhost:3100',ctx={params:Promise.resolve({id:'exact-case'})};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.identity.mockResolvedValue({id:'trusted-id',suspended:true});m.list.mockResolvedValue({items:[]});m.create.mockResolvedValue({id:'new-case'});m.change.mockResolvedValue({id:'exact-case'});});afterEach(()=>vi.unstubAllEnvs());
it('checks Origin before the limited privacy identity and rejects duplicate filters',async()=>{
 const req=new Request(base+'/api/privacy',{method:'POST',headers:{origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'});expect((await POST(req)).status).toBe(403);expect(m.identity).not.toHaveBeenCalled();expect((await GET(new Request(base+'/api/privacy?page=1&page=2'))).status).toBe(422);expect(m.list).not.toHaveBeenCalled();
});
it('uses only the verified current identity, including the restricted blocked-account portal, without operational authorization',async()=>{
 const r=await GET(new Request(base+'/api/privacy'));expect(r.headers.get('Cache-Control')).toBe('no-store');expect(m.list).toHaveBeenCalledWith({id:'trusted-id',suspended:true},{});m.change.mockRejectedValueOnce(new DomainError('Privacy request not found.',404));expect((await PATCH(new Request(base+'/api/privacy/exact-case',{method:'PATCH',headers:{origin:base,'Content-Type':'application/json'},body:'{}'}),ctx)).status).toBe(404);expect(m.change).toHaveBeenCalledWith({id:'trusted-id',suspended:true},'exact-case',{});
});
