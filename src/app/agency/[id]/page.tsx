import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { requireAgencyAccess } from "@/modules/agencies/service";
import { DomainError } from "@/modules/partners/workflow";
import { DashboardTrend } from "@/components/dashboard-trend";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { statusLabels } from "@/components/booking-list";
import { dashboardTrend, getReport } from "@/modules/reports/service";
import { listBookingRequests } from "@/modules/bookings/service";
import { date, money, serviceLabels } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    id = (await params).id;
  let agency;
  try {
    agency = await requireAgencyAccess(actor, id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    return (
      <Workspace actor={actor}>
        <h1>Agency access unavailable</h1>
        <p>
          Your account does not have active access to this agency. Return to
          your workspace to choose an available agency.
        </p>
        <Link href="/workspace">Return to workspace</Link>
      </Workspace>
    );
  }
  const [report, bookings, trend] = await Promise.all([
    getReport(actor, {type:"AGENCY", agencyId:agency.id}),
    listBookingRequests(actor, {agencyId:agency.id}),
    dashboardTrend(actor, {type:"AGENCY",agencyId:agency.id}),
  ]);
  const operations = report.operations;
  const value = (key:string) => report.metrics.find(metric=>metric.key===key)?.value ?? 0;
  return (
    <Workspace actor={actor}>
      <h1>Agency dashboard</h1>
      <p className="eyebrow">{agency.name}</p>
      <p>
        Your operating workspace · Approved policy version{" "}
        {agency.approvedRevision}
      </p>
      <DashboardMetrics items={[
        {label:"Requests submitted",value:operations?.submittedCount ?? 0},
        {label:"Confirmed collections",value:money(value("collections"))},
        {label:"Paid refunds",value:money(value("refunds"))},
        {label:"Services completed",value:operations?.serviceOutcomeCount ?? 0},
      ]}>
        <DashboardTrend label="Booking requests · last 7 days" points={trend}/>
        <p>{report.filters.from} to {report.filters.to} · Manila time · recorded amounts</p>
        {!!operations?.statuses.length && <details><summary>Booking status breakdown</summary><ul className="figma-status-chart" aria-label="Current status of bookings submitted this period">
          {operations.statuses.map(({status,count})=><li key={status}>
            <span>{statusLabels[status] ?? status}</span>
            <meter aria-label={statusLabels[status] ?? status} min={0} max={Math.max(1,operations.submittedCount)} value={count}/>
            <strong>{count}</strong>
          </li>)}
        </ul></details>}
      </DashboardMetrics>
      <div className="figma-dashboard-columns">
        <section className="figma-panel">
          <h2>Recent bookings</h2>
          {bookings.items.length ? <ul className="figma-dashboard-list">{bookings.items.slice(0, 5).map(booking=><li key={booking.id}>
            <Link href={`/agency/${agency.id}/bookings/${booking.id}`}>{booking.contact.name || `Request ${booking.id.slice(0, 8)}`}</Link>
            <span>{date(booking.createdAt)}<br/>{statusLabels[booking.status] ?? booking.status}</span>
          </li>)}</ul> : <p>No requests yet for this agency.</p>}
          <Link href={`/agency/${agency.id}/bookings`}>View all booking requests</Link>
        </section>
        <section className="figma-panel">
          <h2>Booking activity</h2>
          <p>Review current bookings and recorded pickup, return and tour updates.</p>
          <ul className="figma-dashboard-list">
            <li><Link href={`/agency/${agency.id}/bookings`}>Track booking status</Link></li>
            <li><Link href={`/agency/${agency.id}/resources`}>Open the availability calendar</Link></li>
            <li><Link href={`/agency/${agency.id}/reports`}>Review financial and activity reports</Link></li>
          </ul>
        </section>
      </div>
      <section className="context-section">
        <h2>Your public profile</h2>
        <p>{agency.policy.serviceAreas}</p>
        <div className="service-tags">
          {agency.policy.services.map((s) => (
            <span key={s}>{serviceLabels[s]}</span>
          ))}
        </div>
        <p>
          <Link href={`/agencies/${agency.id}`}>
            View public agency profile
          </Link>
        </p>
      </section>
      <section className="context-section">
        <h2>Consigned-vehicle agreement defaults</h2>
        <p>
          Cosigner {agency.policy.split.cosigner / 100}% · Agency{" "}
          {agency.policy.split.agency / 100}% · Rent2Go{" "}
          {agency.policy.split.platform / 100}% · Vehicle maintenance{" "}
          {agency.policy.split.maintenance / 100}%
        </p>
        <p>
          These policy defaults must be accepted in each vehicle agreement. The
          maintenance allocation remains a separate vehicle reserve.
        </p>
        {agency.ownerId === actor.id && (
          <Link className="button secondary" href="/workspace/application">
            Manage policies and application
          </Link>
        )}
      </section>
      <section className="context-section">
        <h2>Service inventory</h2>
        <p>
          <Link href={`/agency/${agency.id}/bookings`}>
            Booking requests and guest requirements
          </Link>
        </p>
        <p>
          <Link href={`/agency/${agency.id}/tours`}>
            Tour packages and departure dates
          </Link>
        </p>
        <p>
          <Link href={`/agency/${agency.id}/resources`}>
            Availability, maintenance and drivers
          </Link>
        </p>
        <Link className="button" href={`/agency/${agency.id}/vehicles`}>
          Manage vehicle inventory
        </Link>
        <p>
          Review submitted cars, agree owner terms and publish compliant
          inventory.
        </p>
      </section>
    </Workspace>
  );
}
