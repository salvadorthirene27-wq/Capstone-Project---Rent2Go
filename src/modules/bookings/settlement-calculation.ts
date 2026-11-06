import {z} from 'zod';
import {DomainError} from '../partners/workflow';
import {validateVehicleShares,type VehicleShares} from '../vehicles/workflow';
import type {AssessmentBody} from './assessment';
export const roundingRule='Largest remainder in whole centavos; equal remainders use Cosigner, agency, Rent2Go, maintenance order.';
export const settlementConsent='I reviewed this exact settlement and its itemized assessment. I authorize funds held for this booking, including any refundable deposit, to cover only the stated services and accepted charges. Any net excess remains refundable to me, and any remaining balance requires a separately recorded payment. This acceptance does not itself record a refund payment or complete the booking.';
const cents=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export function safeCents(value:bigint){if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw new DomainError('Financial totals exceed the supported whole-centavo range.',409);return Number(value);}
export const sumCents=(values:number[])=>safeCents(values.reduce((n,v)=>n+BigInt(cents.parse(v)),0n));
export function splitCentavos(amount:number,shares:VehicleShares){
 cents.parse(amount);const keys=['cosigner','agency','platform','maintenance'] as const;
 if(keys.some(k=>!Number.isInteger(shares[k])||shares[k]<0||shares[k]>10000)||keys.reduce((n,k)=>n+shares[k],0)!==10000)throw new DomainError('An allocation must contain four explicit shares totaling100%.',409);
 const rows=keys.map((key,index)=>({key,index,amount:BigInt(amount)*BigInt(shares[key])/10000n,remainder:BigInt(amount)*BigInt(shares[key])%10000n}));
 let remaining=BigInt(amount)-rows.reduce((n,r)=>n+r.amount,0n);
 for(const r of [...rows].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(remaining===0n)break;r.amount++;remaining--;}
 return Object.fromEntries(rows.map(r=>[r.key,safeCents(r.amount)])) as VehicleShares;
}
export function fundApplication(serviceCentavos:number,extraCentavos:number,netHeldCentavos:number){
 const obligationCentavos=sumCents([serviceCentavos,extraCentavos]);cents.parse(netHeldCentavos);
 const serviceAppliedCentavos=Math.min(serviceCentavos,netHeldCentavos),extraAppliedCentavos=Math.min(extraCentavos,netHeldCentavos-serviceAppliedCentavos);
 return {serviceCentavos,extraCentavos,obligationCentavos,netHeldCentavos,serviceAppliedCentavos,extraAppliedCentavos,refundDueCentavos:Math.max(netHeldCentavos-obligationCentavos,0),additionalBalanceCentavos:Math.max(obligationCentavos-netHeldCentavos,0)};
}
type Financial={line_id:string;private_financial_snapshot:{category:string;shares:unknown;vehicleId?:string;cosignerId?:string}};
export function revenueAllocations(proposal:AssessmentBody['proposal'],financials:Financial[]){
 if(new Set(financials.map(l=>l.line_id)).size!==financials.length||financials.length!==proposal.lines.length)throw new DomainError('Exact original financial terms are required for every service.',409);
 const entries:{lineId:string;sourceKind:'SERVICE'|'EXTRA';sourceId:string;recipient:'COSIGNER'|'AGENCY'|'PLATFORM'|'MAINTENANCE';beneficiaryActorId:string|null;vehicleId:string|null;basisCentavos:number;bps:number;amountCentavos:number;policy:unknown}[]=[];
 for(const line of proposal.lines){
  const f=financials.find(l=>l.line_id===line.lineId)?.private_financial_snapshot;
  if(!f||f.category!==line.context)throw new DomainError('Saved ownership context does not match the assessment.',409);
  const shares=validateVehicleShares(f.category==='CONSIGNED'?'CONSIGNED':'AGENCY_OWNED',f.shares);
  if(f.category==='TOUR_ONLY'&&(shares.maintenance!==0||shares.cosigner!==0))throw new DomainError('Tour revenue cannot create vehicle maintenance or owner earnings.',409);
  if(f.category==='CONSIGNED'&&(!f.cosignerId||!f.vehicleId))throw new DomainError('The original vehicle owner must be identified before accounting.',409);
  const add=(sourceKind:'SERVICE'|'EXTRA',sourceId:string,basis:number,s:VehicleShares,policy:unknown)=>{
   if(!basis)return;const amounts=splitCentavos(basis,s);
   for(const recipient of ['COSIGNER','AGENCY','PLATFORM','MAINTENANCE'] as const){const key=recipient.toLowerCase() as keyof VehicleShares;entries.push({lineId:line.lineId,sourceKind,sourceId,recipient,beneficiaryActorId:recipient==='COSIGNER'?f.cosignerId??null:null,vehicleId:f.vehicleId??null,basisCentavos:basis,bps:s[key],amountCentavos:amounts[key],policy});}
  };
  add('SERVICE',line.lineId,line.netServiceCentavos,shares,{category:f.category,shares,basis:'SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT',driverFeesIncluded:true});
  for(const charge of proposal.charges.filter(i=>i.lineId===line.lineId))add('EXTRA',charge.id,charge.amountCentavos,charge.policy.policy.shares,charge.policy);
 }
 if(sumCents(entries.map(e=>e.amountCentavos))!==proposal.obligationCentavos)throw new DomainError('Accounting entries do not conserve the accepted obligation.',409);
 return entries;
}
