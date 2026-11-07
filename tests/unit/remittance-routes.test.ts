import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn(),authorize:vi.fn(),attach:vi.fn(),store:vi.fn(),remove:vi.fn(),file:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/lib/storage',()=>({storeFile:m.store,removeOrphan:m.remove,loadFile:m.load}));vi.mock('@/modules/accounting/remittances',()=>({getRemittanceAccount:m.get}));vi.mock('@/modules/accounting/remittance-actions',()=>({changeRemittance:m.change,authorizeRemittanceEvidence:m.authorize,attachRemittanceEvidence:m.attach}));vi.mock('@/modules/accounting/remittance-records',()=>({remittanceEvidenceForRead:m.file}));
import {GET,PATCH} from '../../src/app/api/remittances/[agencyId]/route';
import {POST} from '../../src/app/api/remittances/[agencyId]/evidence/route';
import {GET as download} from '../../src/app/api/remittance-files/[id]/route';
import {DomainError} from '../../src/modules/partners/workflow';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({agencyId:id})},base='http://localhost:3100',url=base+`/api/remittances/${id}`;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);vi.stubEnv('STORAGE_DRIVER','local');m.actor.mockResolvedValue({id:'payer',role:'AGENCY_ADMIN'});m.get.mockResolvedValue({});m.change.mockResolvedValue({});m.authorize.mockResolvedValue({alreadyApplied:false,accountId:id});m.attach.mockResolvedValue({usedFile:true,state:{saved:true}});m.store.mockResolvedValue(undefined);m.remove.mockResolvedValue(undefined);});afterEach(()=>vi.unstubAllEnvs());
function form(paid='true'){const f=new FormData();for(const [k,v]of Object.entries({action:'SUBMIT_REMITTANCE_PROOF',version:'1',idempotencyKey:id,remittanceId:id,digest:'d'.repeat(64),reference:'SYNTHETIC',note:'Synthetic execution evidence',externalPaid:paid}))f.append(k,v);f.append('file',new File([Buffer.from([137,80,78,71,13,10,26,10,0])],'synthetic.png',{type:'image/png'}));return f;}
const proof=(f=form())=>new Request(url+'/evidence?environment=MANUAL',{method:'POST',headers:{origin:base},body:f});
it('checks mutation Origin before auth and rejects duplicate or extra filters',async()=>{
 expect((await PATCH(new Request(url,{method:'PATCH',headers:{origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'}),ctx)).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();
 for(const query of ['environment=DEMO&environment=MANUAL','environment=DEMO&ownerId=foreign'])expect((await GET(new Request(url+'?'+query),ctx)).status).toBe(422);expect(m.get).not.toHaveBeenCalled();m.actor.mockRejectedValue(new DomainError('Sign in',401));expect((await GET(new Request(url),ctx)).status).toBe(401);
});
it('requires exact proof fields, explicit external-payment acknowledgment and valid file bytes before storage',async()=>{
 expect((await POST(proof(form('false')),ctx)).status).toBe(422);const f=form();f.append('reference','DUPLICATE');expect((await POST(proof(f),ctx)).status).toBe(422);const invalid=form();invalid.set('file',new File(['not a png'],'fake.png',{type:'image/png'}));expect((await POST(proof(invalid),ctx)).status).toBe(422);expect(m.authorize).not.toHaveBeenCalled();expect(m.store).not.toHaveBeenCalled();
});
it('rechecks authorization after storing proof and removes a newly orphaned file',async()=>{
 m.attach.mockRejectedValue(new DomainError('Authority changed.',409));expect((await POST(proof(),ctx)).status).toBe(409);expect(m.store).toHaveBeenCalledTimes(1);expect(m.remove).toHaveBeenCalledWith(m.store.mock.calls[0][0]);expect(m.attach.mock.calls[0][2]).toMatchObject({externalPaid:true,remittanceId:id});
});
it('does not duplicate uploaded files on exact retry, including a concurrent committed retry',async()=>{
 m.authorize.mockResolvedValueOnce({alreadyApplied:true,state:{saved:true}});expect((await POST(proof(),ctx)).status).toBe(201);expect(m.store).not.toHaveBeenCalled();m.attach.mockResolvedValueOnce({usedFile:false,state:{saved:true}});expect((await POST(proof(),ctx)).status).toBe(201);expect(m.remove).toHaveBeenCalledWith(m.store.mock.calls[0][0]);
});
it('authorizes private proof before reading bytes and delivers only protected attachments',async()=>{
 const fileCtx={params:Promise.resolve({id})};m.file.mockRejectedValueOnce(new DomainError('Not found.',404));expect((await download(new Request(base),fileCtx)).status).toBe(404);expect(m.load).not.toHaveBeenCalled();m.file.mockResolvedValue({objectKey:`${id}/${id}`,backend:'local',mime:'image/png',name:'remittance.png'});m.load.mockResolvedValue(Buffer.from([1,2]));const r=await download(new Request(base),fileCtx);expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');expect(r.headers.get('Content-Security-Policy')).toContain('sandbox');expect(r.headers.get('Content-Disposition')).toContain('attachment;');
});
