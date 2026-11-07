import {pageActor} from '@/lib/page-actor';
import {FinancialReportPage} from '@/components/financial-report-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <FinancialReportPage actor={await pageActor()} scope={{type:'PLATFORM'}} query={await searchParams} title="Platform aggregate reports" basePath="/admin/reports" back={{href:'/admin',label:'Back to platform workspace'}}/>;}
