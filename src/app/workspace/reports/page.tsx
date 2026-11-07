import {pageActor} from '@/lib/page-actor';
import {FinancialReportPage} from '@/components/financial-report-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <FinancialReportPage actor={await pageActor()} scope={{type:'OWNER'}} query={await searchParams} title="My earnings reports" basePath="/workspace/reports" back={{href:'/workspace/earnings',label:'Back to my vehicle earnings'}}/>;}
