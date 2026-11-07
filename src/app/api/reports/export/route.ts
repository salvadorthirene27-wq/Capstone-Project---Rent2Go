import {requireActor} from '@/lib/auth';
import {apiError,requireOrigin,readJson} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {exportReport} from '@/modules/reports/service';
export async function POST(req:Request){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:financial-report-exports`,10);const r=await exportReport(actor,await readJson(req));
 return new Response(r.csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${r.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Report-Records':String(r.rowCount),'X-Report-As-Of':r.asOf}});
}catch(e){return apiError(e);}}
