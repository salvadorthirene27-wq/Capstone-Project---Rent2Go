import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),export:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));
vi.mock('@/modules/reports/service',()=>({getReport:m.get,exportReport:m.export}));
import {GET} from '../../src/app/api/reports/route';
import {POST} from '../../src/app/api/reports/export/route';
import {DomainError} from '../../src/modules/partners/workflow';
const base='http://localhost:3100',url=base+'/api/reports';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.actor.mockResolvedValue({id:'owner',role:'COSIGNER'});m.get.mockResolvedValue({rows:[]});m.export.mockResolvedValue({filename:'rent2go-owner.csv',csv:'\uFEFF"PHP","Centavos"\r\n"1.00","100"\r\n',rowCount:1,asOf:'2026-11-07T00:00:00.000Z'});});
afterEach(()=>vi.unstubAllEnvs());
it('rejects duplicate filters and attempts to add an agency to personal scope before querying reports',async()=>{
 expect((await GET(new Request(url+'?scope=OWNER&from=2026-11-01&from=2026-11-02'))).status).toBe(422);
 expect((await GET(new Request(url+'?scope=OWNER&agencyId=c79318ab-a56e-4cc8-a8b0-a3e4676d7b36'))).status).toBe(422);
 expect(m.get).not.toHaveBeenCalled();
 const response=await GET(new Request(url+'?scope=OWNER&environment=DEMO&record=PAYOUTS'));
 expect(response.headers.get('Cache-Control')).toBe('no-store');expect(m.get).toHaveBeenCalledWith({id:'owner',role:'COSIGNER'},{type:'OWNER'},{environment:'DEMO',record:'PAYOUTS'});
});
it('enforces export Origin before authentication and never turns service failures into a downloadable statement',async()=>{
 const req=(origin:string)=>new Request(url+'/export',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{}'});
 expect((await POST(req('https://foreign.test'))).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect(m.export).not.toHaveBeenCalled();
 m.export.mockRejectedValueOnce(new DomainError('Access changed. Refresh before exporting.',409));const response=await POST(req(base));expect(response.status).toBe(409);expect(response.headers.get('Content-Disposition')).toBeNull();expect(await response.json()).toEqual({error:'Access changed. Refresh before exporting.'});
});
it('returns an explicit private CSV attachment and record metadata after authorized export',async()=>{
 const body={scope:{type:'OWNER'},filters:{environment:'DEMO'},purpose:'Reconcile my earnings',acknowledged:true},response=await POST(new Request(url+'/export',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 expect(response.status).toBe(200);expect(m.export).toHaveBeenCalledWith({id:'owner',role:'COSIGNER'},body);expect(response.headers.get('Content-Type')).toContain('text/csv');expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="rent2go-owner.csv"');expect(response.headers.get('X-Report-Records')).toBe('1');expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');expect(await response.text()).toContain('"1.00","100"');
});
