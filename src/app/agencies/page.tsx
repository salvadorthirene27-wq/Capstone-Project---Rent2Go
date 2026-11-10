import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import { publicAgencies, agencySearchSchema } from "@/modules/agencies/service";
import { serviceOptions } from "@/modules/partners/schema";
import { serviceLabels } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore agencies" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = agencySearchSchema.safeParse({
    search: raw.search ?? "",
    service: raw.service || undefined,
    page: raw.page ?? 1,
  });
  const query = parsed.success ? parsed.data : agencySearchSchema.parse({});
  const result = await publicAgencies(query);
  const pageHref = (page: number) =>
    `/agencies?${new URLSearchParams({ search: query.search, ...(query.service ? { service: query.service } : {}), page: String(page) })}`;
  return (
    <main id="main-content" className="public-main directory-main figma-catalog">
      <Link className="back-link" href="/">Back to home page</Link>
      <div className="directory-heading">
        <div>
<h1>Browse Agencies</h1>
          <p>
            Explore approved partners, their service areas, and the terms that
            work for your trip.
          </p>
        </div>
        <Link href="/partners">
          Bring your agency to Rent2Go <ArrowRight size={17} />
        </Link>
      </div>
      <form className="marketplace-form figma-search-panel" action="/agencies">
        <div className="figma-search-row">
          <label className="figma-search-field">
            <span className="sr-only">Agency or service area</span>
            <img src="/figma/catalog/search.svg" alt="" />
            <input name="search" maxLength={120} defaultValue={query.search} placeholder="Search by name or destination" />
          </label>
          <label className="figma-sort-field">
            Service
            <select name="service" defaultValue={query.service ?? ""}>
              <option value="">All services</option>
              {serviceOptions.map((service) => (
                <option key={service} value={service}>{serviceLabels[service]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="figma-catalog-actions">
          <button className="button">Find agencies</button>
          <Link href="/agencies">Clear filters</Link>
        </div>
      </form>
      {!parsed.success && (
        <p role="alert">
          Some search options were invalid. Showing all agencies; enter your
          search again.
        </p>
      )}
      <p className="result-count">
        {result.total} {result.total === 1 ? "agency" : "agencies"} found ·
        Alphabetical order
      </p>
      <div className="directory-list">
        {result.items.map((a) => (
          <article className="agency-row" key={a.id}>
            <div>
              <span className="status-badge">Approved partner</span>
              <h2>
                <Link href={`/agencies/${a.id}`}>{a.name}</Link>
              </h2>
              <p className="service-area">
                <MapPin size={17} />
                {a.serviceAreas}
              </p>
              <div className="service-tags">
                {a.services.map((s) => (
                  <span key={s}>{serviceLabels[s]}</span>
                ))}
              </div>
            </div>
            <Link className="button secondary" href={`/agencies/${a.id}`}>
              View agency <ArrowRight size={17} />
            </Link>
          </article>
        ))}
      </div>
      {!result.items.length && (
        <section className="directory-empty">
          <h2>
            {result.total
              ? "No agencies on this page"
              : "No agencies match yet"}
          </h2>
          <p>Try another name, service area, or service type.</p>
          <Link href="/agencies">Reset search</Link>
        </section>
      )}
      {result.pageCount > 1 && (
        <nav className="pagination" aria-label="Agency pages">
          {query.page > 1 && (
            <Link href={pageHref(query.page - 1)}>Previous</Link>
          )}
          <span>
            Page {query.page} of {result.pageCount}
          </span>
          {query.page < result.pageCount && (
            <Link href={pageHref(query.page + 1)}>Next</Link>
          )}
        </nav>
      )}
    </main>
  );
}
