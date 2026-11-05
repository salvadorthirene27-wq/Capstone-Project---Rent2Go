import {date} from "@/modules/partners/presentation";
import type {SavedInspection} from "@/modules/bookings/fulfillment";

export function InspectionDocument({report:r}:{report:SavedInspection}){
 const phase=r.phase==="PRE"?"pre-inspection":"return inspection";
 return <section className="inspection-document">
  <h4>{r.phase==="PRE"?"Pre-inspection":"Return inspection"} · version {r.revision}</h4>
  <p>Recorded {date(r.createdAt)} (Philippine time)</p>
  <dl className="fulfillment-facts"><div><dt>Mileage</dt><dd>{r.body.odometerKm.toLocaleString()} km</dd></div><div><dt>Fuel</dt><dd>{r.body.fuelEighths}/8</dd></div><div><dt>Cleanliness</dt><dd>{r.body.cleanliness==="CLEAN"?"Clean":"Needs cleaning"}</dd></div><div><dt>Safety</dt><dd>{r.body.roadworthy&&r.body.safetyChecked?"Roadworthy; safety checklist checked":"Condition requires attention"}</dd></div></dl>
  <p className="preserve-lines">{r.body.damageNotes}</p>
  <ul className="fulfillment-photo-links">{r.body.photoIds.map((id,index)=><li key={id}><a href={`/api/inspection-photos/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Inspection photo {index+1} · {phase}</a></li>)}</ul>
  {r.decision&&<p>Renter response: <strong>{r.decision==="ACCEPT"?"Accepted":"Disputed"}</strong>{r.reason&&<> · {r.reason}</>}{r.acknowledgedAt&&<> · {date(r.acknowledgedAt)} (Philippine time)</>}</p>}
 </section>;
}
