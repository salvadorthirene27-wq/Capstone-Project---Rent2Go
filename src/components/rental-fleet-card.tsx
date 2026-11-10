import Link from 'next/link';
import {ArrowUpRight,CarFront,Fuel,Settings2,Users} from 'lucide-react';
import type {searchVehicles} from '@/modules/marketplace/vehicles';
import {money} from '@/modules/partners/presentation';
import {driverFeeUnitLabels} from '@/modules/pricing/units';

type Car=Awaited<ReturnType<typeof searchVehicles>>['items'][number];
const units={'12_HOUR':'per 12 hours','24_HOUR':'per 24 hours',CALENDAR_DAY:'per calendar day',HOUR:'per hour'};
export function RentalFleetCard({car,href}:{car:Car;href:string}){
 const title=`${car.facts.make} ${car.facts.model}`;
 return <article className="agency-row tour-row rental-row fleet-row">
  <Link className="fleet-visual" href={href} aria-label={`View ${title} from ${car.agencyName}`}>
   {car.photoIds[0]?<img src={`/api/vehicle-files/${car.photoIds[0]}`} width={480} height={320} loading="lazy" alt={`${title}, supplied by ${car.agencyName}`}/>:<div className="photo-unavailable">Photo unavailable</div>}
  </Link>
  <div className="fleet-details">
   <div className="fleet-heading"><div><p className="page-eyebrow">{car.facts.bodyType} · {car.facts.year}</p><h2><Link href={href}>{title}</Link></h2></div><Link className="button" href={`${href}#rental-booking`} aria-label={`Book now: ${title} from ${car.agencyName}`}>Book now<ArrowUpRight size={18} aria-hidden="true"/></Link></div>
   <p className="fleet-agency"><Link href={`/agencies/${car.agencyId}`}>{car.agencyName}</Link> · {car.serviceAreas}</p>
   <div className="fleet-rate"><strong>{money(car.pricing.rateCentavos)}</strong><span>{units[car.pricing.billingUnit]}</span></div>
   <dl className="fleet-specifications">
    <div><Users size={18} aria-hidden="true"/><dt>Seats, including driver</dt><dd>{car.facts.seats}</dd></div>
    <div><Settings2 size={18} aria-hidden="true"/><dt>Transmission</dt><dd>{car.facts.transmission.toLowerCase()}</dd></div>
    <div><Fuel size={18} aria-hidden="true"/><dt>Fuel</dt><dd>{car.facts.fuel.toLowerCase()}</dd></div>
    <div><CarFront size={18} aria-hidden="true"/><dt>Rental options</dt><dd>{car.pricing.modes.map(m=>m==='SELF_DRIVE'?'Self-drive':'With driver').join(' / ')}</dd></div>
   </dl>
   <p>Refundable deposit: <strong>{money(car.pricing.depositCentavos)}</strong></p>
   {car.estimate&&<div className="fleet-estimate"><p>{car.estimateMode==='SELF_DRIVE'?'Self-drive':'With-driver'} service estimate: <strong>{money(car.estimate.serviceCentavos)}</strong></p><p>Estimated total including refundable deposit: <strong>{money(car.estimate.estimatedDueCentavos)}</strong></p></div>}
   {car.estimateMode==='WITH_DRIVER'&&car.pricing.driverFeeUnit&&<p>Driver: {money(car.pricing.driverFeeCentavos)} · {driverFeeUnitLabels[car.pricing.driverFeeUnit]}</p>}
   <details className="policy-disclosure"><summary>Why this matches</summary><ul>{car.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></details>
  </div>
 </article>;
}
