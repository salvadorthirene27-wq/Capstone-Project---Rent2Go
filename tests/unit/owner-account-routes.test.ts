import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn(),authorize:vi.fn(),attach:vi.fn(),store:vi.fn(),remove:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/lib/storage',()=>({storeFile:m.store,removeOrphan:m.remove}));vi.mock('@/modules/accounting/owner-accounts',()=>({getOwnerAccount:m.get,changeOwnerAccount:m.change,authorizeOwnerPayout:m.authorize,attachOwnerPayout:m.attach}));
import {GET,PATCH} from '../../src/app/api/owner-accounts/[agencyId]/[ownerId]/route';
import {POST} from '../../src/app/api/owner-accounts/[agencyId]/[ownerId]/evidence/route';
import {DomainError} from '../../src/modules/partners/workflow';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({agencyId:id,ownerId:'owner'})},base='http://localhost:3100',url=base+`/api/owner-accounts/${id}/owner`,request=(origin=base)=>new Request(url+'?environment=DEMO',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:'{}'});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);vi.stubEnv('STORAGE_DRIVER','local');m.actor.mockResolvedValue({id:'payer',role:'AGENCY_ADMIN'});m.get.mockResolvedValue({});m.change.mockResolvedValue({});m.authorize.mockResolvedValue({alreadyApplied:false,state:{accountId:id}});m.store.mockResolvedValue(undefined);m.remove.mockResolvedValue(undefined);});afterEach(()=>vi.unstubAllEnvs());
function form(paid='true'){const f=new FormData();for(const [k,v]of Object.entries({version:'1',idempotencyKey:id,withdrawalId:id,reference:'SYNTHETIC',reason:'Synthetic execution evidence',externalPaid:paid}))f.append(k,v);f.append('file',new File([Buffer.from([137,80,78,71,13,10,26,10,0])],'synthetic.png',{type:'image/png'}));return f;}
it('enforces Origin before mutation and rejects duplicate or extra account filters',async()=>{
 expect((await PATCH(request('https://foreign.test'),ctx)).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect((await GET(new Request(url+'?environment=DEMO&environment=MANUAL'),ctx)).status).toBe(422);expect((await GET(new Request(url+'?environment=MANUAL&includePrivate=true'),ctx)).status).toBe(422);expect(m.get).not.toHaveBeenCalled();m.actor.mockRejectedValue(new DomainError('Sign in',401));expect((await GET(new Request(url+'?environment=DEMO'),ctx)).status).toBe(401);
});
it('rejects implied actual payment and duplicate multipart fields before storing evidence',async()=>{
 expect((await POST(new Request(url+'/evidence?environment=MANUAL',{method:'POST',headers:{origin:base},body:form('false')}),ctx)).status).toBe(422);const duplicate=form();duplicate.append('reference','ANOTHER');expect((await POST(new Request(url+'/evidence?environment=MANUAL',{method:'POST',headers:{origin:base},body:duplicate}),ctx)).status).toBe(422);expect(m.authorize).not.toHaveBeenCalled();expect(m.store).not.toHaveBeenCalled();
});
it('removes an orphan if authority or account version changes after evidence storage',async()=>{
 m.attach.mockRejectedValue(new DomainError('The account changed.',409));expect((await POST(new Request(url+'/evidence?environment=MANUAL',{method:'POST',headers:{origin:base},body:form()}),ctx)).status).toBe(409);expect(m.store).toHaveBeenCalledTimes(1);expect(m.remove).toHaveBeenCalledWith(m.store.mock.calls[0][0]);expect(m.attach.mock.calls[0][2]).toMatchObject({externalPaid:true,withdrawalId:id});
});
