import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/ocr/service',()=>({getDocumentOcr:m.get,changeDocumentOcr:m.change}));
import {GET,POST} from '../../src/app/api/booking-requests/[id]/requirements/[fileId]/ocr/route';
import {ocrCommand} from '../../src/modules/ocr/schema';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({id,fileId:id})},base='http://localhost:3100',url=base+`/api/booking-requests/${id}/requirements/${id}/ocr`;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.actor.mockResolvedValue({id:'renter',role:'RENTER'});m.get.mockResolvedValue({selected:null});m.change.mockResolvedValue({selected:null});});afterEach(()=>vi.unstubAllEnvs());
it('enforces action Origin before authentication and rejects duplicate result selectors',async()=>{
 expect((await POST(new Request(url,{method:'POST',headers:{origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'}),ctx)).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect((await GET(new Request(url+'?jobId='+id+'&jobId='+id),ctx)).status).toBe(422);expect(m.get).not.toHaveBeenCalled();
});
it('uses authenticated server-derived file scope and no-store responses without accepting client URLs',async()=>{
 const response=await GET(new Request(url),ctx);expect(response.headers.get('cache-control')).toBe('no-store');expect(m.get).toHaveBeenCalledWith({id:'renter',role:'RENTER'},id,id,{});const command={action:'EXTRACT',version:1,idempotencyKey:id,consent:true,policyVersion:'ocr-space-v1'};expect(ocrCommand.safeParse({...command,url:'https://foreign.test'}).success).toBe(false);expect(ocrCommand.safeParse({...command,consent:false}).success).toBe(false);expect(ocrCommand.safeParse({...command,policyVersion:'another-provider'}).success).toBe(false);expect(ocrCommand.safeParse({action:'COMPARE',version:1,idempotencyKey:id,jobId:id,digest:'a'.repeat(64),decision:'UNUSABLE',acknowledged:true,note:''}).success).toBe(false);
});
