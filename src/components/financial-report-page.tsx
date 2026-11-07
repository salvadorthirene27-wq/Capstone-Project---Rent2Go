import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ZodError} from 'zod';
import {Workspace} from './workspace';
import {FinancialReportView} from './financial-report';
import type {Actor} from '@/modules/partners/workflow';
import {DomainError} from '@/modules/partners/workflow';
import {getReport} from '@/modules/reports/service';
import type {ReportScope} from '@/modules/reports/schema';
export async function FinancialReportPage({actor,scope,query,title,basePath,back}:{actor:Actor;scope:ReportScope;query:Record<string,string|string[]|undefined>;title:string;basePath:string;back:{href:string;label:string}}){
 let warning='';const load=async()=>{try{return await getReport(actor,scope,query);}catch(e){if(e instanceof DomainError&&[403,404].includes(e.status))notFound();if(e instanceof ZodError||(e instanceof DomainError&&e.status===422)){warning='The requested filters were invalid. Showing this month’s default statement for the selected financial records. Update the filters below.';return getReport(actor,scope,{environment:query.environment==='DEMO'?'DEMO':'MANUAL'});}throw e;}};
 const report=await load();
 return <Workspace actor={actor}><Link className="back-link" href={back.href}>{back.label}</Link><h1>{title}</h1><p>{scope.type==='OWNER'?'Your original owner allocations and payouts, without renter documents or other recipients’ finances.':scope.type==='PLATFORM'?'Aggregate agency records and platform allocations. Private renter documents and individual owner payout details are excluded.':'Financial records for this agency, with confirmed movements, closed revenue allocations and saved source records.'}</p>{warning&&<p role="alert" className="notice">{warning}</p>}<FinancialReportView report={report} basePath={basePath}/></Workspace>;
}
