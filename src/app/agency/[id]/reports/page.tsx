import {notFound} from 'next/navigation';
import {uuid} from '@/lib/http';
import {pageActor} from '@/lib/page-actor';
import {FinancialReportPage} from '@/components/financial-report-page';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const actor=await pageActor(),id=uuid.safeParse((await params).id);if(!id.success)notFound();return <FinancialReportPage actor={actor} scope={{type:'AGENCY',agencyId:id.data}} query={await searchParams} title="Agency financial reports" basePath={`/agency/${id.data}/reports`} back={{href:`/agency/${id.data}`,label:'Back to agency'}}/>;}
