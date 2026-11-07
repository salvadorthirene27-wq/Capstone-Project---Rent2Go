"use client";
import {useEffect,useRef,useState} from 'react';
import type {FinancialReport} from '@/modules/reports/service';
import {reportRecordLabels} from '@/modules/reports/presentation';
export function ReportFilters({filters}:{filters:FinancialReport['filters']}){
 const [from,setFrom]=useState(filters.from),[to,setTo]=useState(filters.to),[error,setError]=useState(''),message=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error)message.current?.focus();},[error]);
 return <form method="get" className="report-filters" onSubmit={e=>{const days=(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000+1;if(!from||!to||!Number.isFinite(days)||days<1||days>366){e.preventDefault();setError('Choose an end date on or after the start, within 366 days.');}}}>
  <label className="field">From (Philippine date)<input type="date" name="from" required value={from} aria-describedby={error?'report-filter-error':undefined} onChange={e=>{setFrom(e.target.value);setError('');}}/></label>
  <label className="field">To (Philippine date)<input type="date" name="to" required value={to} aria-describedby={error?'report-filter-error':undefined} onChange={e=>{setTo(e.target.value);setError('');}}/></label>
  <label className="field">Financial records<select name="environment" defaultValue={filters.environment}><option value="MANUAL">Manual records</option><option value="DEMO">Simulated records</option></select></label>
  <label className="field">Statement type<select name="record" defaultValue={filters.record}>{filters.allowedRecords.map(r=><option key={r} value={r}>{reportRecordLabels[r]}</option>)}</select></label>
  <button className="button" type="submit">Apply filters</button>{error&&<p id="report-filter-error" className="error-message" role="alert" ref={message} tabIndex={-1}>{error}</p>}
 </form>;
}
