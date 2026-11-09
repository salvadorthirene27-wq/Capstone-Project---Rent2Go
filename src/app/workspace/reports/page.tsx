import {pageActor} from '@/lib/page-actor';
import {FinancialReportPage} from '@/components/financial-report-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams,environment=query.environment==='DEMO'?'DEMO':'MANUAL';return <FinancialReportPage actor={await pageActor()} scope={{type:'OWNER'}} query={query} title="My earnings reports" basePath="/workspace/reports" back={{href:`/workspace/earnings?environment=${environment}`,label:'Back to my vehicle earnings'}}/>;}
