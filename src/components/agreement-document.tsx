import type { AgreementBody } from "@/modules/bookings/agreement-schema";
import { date, money } from "@/modules/partners/presentation";
export type { AgreementBody } from "@/modules/bookings/agreement-schema";

type Signature = { id:string; signerName:string; signedAt:string };
export function AgreementDocument({revision,issuedAt,expiresAt,body,signature}: {
  revision:number; issuedAt:string; expiresAt:string; body:AgreementBody; signature?:Signature|null;
}) {
  const labels={terms:"Service terms",cancellationPolicy:"Cancellation",refundPolicy:"Refunds",damagePolicy:"Damage and deposit",latePolicy:"Late returns and no-shows"} as const;
  return <article className="agreement-document">
    <header>
      <p><strong>{body.agencyName}</strong><br/>Renter: {body.renterName}</p>
      <p>Agreement version {revision}<br/>Issued {date(issuedAt)}<br/>Quotation hold expires {date(expiresAt)} (Philippine time)</p>
    </header>
    {body.services.map(service=><section className="agreement-service" key={service.lineId}>
      <h4>{service.title}</h4>
      <p>{date(service.startAt)} – {date(service.endAt)} (Philippine time)<br/>{service.partySize} {service.partySize===1?"guest":"guests"}{service.driverName&&<><br/>Assigned driver: {service.driverName}</>}</p>
      <p>Service: {money(service.serviceCentavos)}<br/>Refundable deposit: {money(service.refundableDepositCentavos)}</p>
      {body.policies.filter(policy=>policy.lineId===service.lineId).map(policy=><div key={policy.lineId}>
        {Object.entries(labels).map(([key,label])=><p className="preserve-lines" key={key}><strong>{label}</strong><br/>{policy[key as keyof typeof labels]||"None stated."}</p>)}
      </div>)}
    </section>)}
    <dl className="agreement-totals">
      <div><dt>Services</dt><dd>{money(body.totals.serviceCentavos)}</dd></div>
      <div><dt>Refundable deposits</dt><dd>{money(body.totals.refundableDepositCentavos)}</dd></div>
      <div><dt>Agreement total</dt><dd>{money(body.totals.totalCentavos)}</dd></div>
    </dl>
    {body.platformTerms&&<section><h4>{body.platformTerms.title}</h4><p>Platform terms version {body.platformTerms.revision}</p><p className="preserve-lines">{body.platformTerms.text}</p></section>}
    <section><h4>Electronic consent</h4><p>{body.acknowledgement}</p></section>
    {signature&&<section className="agreement-signature-record">
      <h4>Recorded signature</h4>
      <p>{signature.signerName}<br/>Signed {date(signature.signedAt)} (Philippine time)</p>
      <img src={`/api/booking-signatures/${encodeURIComponent(signature.id)}`} alt={`Recorded signature of ${signature.signerName}`} width={420} height={160}/>
    </section>}
  </article>;
}
