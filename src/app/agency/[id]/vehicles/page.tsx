import Link from "next/link";
import { Clock3, Plus } from "lucide-react";
import { z } from "zod";
import { Workspace } from "@/components/workspace";
import { VehicleQueue, listingAvailabilityLabels } from "@/components/vehicles/vehicle-queue";
import { ListingEditDialog, ListingFilters } from "@/components/vehicles/listing-overlay";
import { VehicleEditor } from "@/components/vehicles/vehicle-editor";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
import { agencyListingFilters, vehicleDetail, vehicleQueueSchema } from "@/modules/vehicles/service";
import { vehicleFactsSchema, vehicleTermsSchema } from "@/modules/vehicles/schema";
import { DomainError } from "@/modules/partners/workflow";

const filterKeys = ["pending","make","model","year","bodyType","transmission","billingUnit","availability","minRate","maxRate"] as const;
const units = {"24_HOUR":"Per 24 hours", CALENDAR_DAY:"Per calendar day", HOUR:"Per hour"};
const label = (value: string) => value[0] + value.slice(1).replaceAll("_"," ").toLowerCase();
function centavos(value?: string) {
  if (!value) return undefined;
  return /^\d{1,7}(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN;
}
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await pageActor(),
    agency = await pageAgency(actor, (await params).id),
    q = await searchParams;
  const basePath = `/agency/${agency.id}/vehicles`;
  const raw = Object.fromEntries([...filterKeys,"state","page","edit"].map(key => [key, typeof q[key] === "string" ? q[key].trim() || undefined : undefined]));
  const {edit, state, page: requestedPage, ...rawFilters} = raw;
  const parsed = agencyListingFilters.safeParse({...rawFilters, minRate:centavos(raw.minRate), maxRate:centavos(raw.maxRate)});
  const filters = parsed.success ? parsed.data : undefined;
  const status = vehicleQueueSchema.shape.state.safeParse(state);
  const page = Math.min(10000, Math.max(1, parseInt(requestedPage ?? "1", 10) || 1));
  const query = new URLSearchParams();
  if (status.success && status.data) query.set("state",status.data);
  if (parsed.success) for (const key of filterKeys) if (raw[key] !== undefined) query.set(key,raw[key]);
  if (page > 1) query.set("page",String(page));
  const backHref = query.size ? `${basePath}?${query}` : basePath;
  const toggle = new URLSearchParams(query);
  toggle.delete("page");
  if (filters?.pending) toggle.delete("pending");
  else { toggle.set("pending","1"); toggle.delete("state"); }
  const detail = z.uuid().safeParse(edit).success && edit ? await vehicleDetail(actor, edit).then(
    item => item.agencyId === agency.id && item.capabilities.isAgency && item.capabilities.isOwner ? item : null,
    error => { if (error instanceof DomainError && [403,404].includes(error.status)) return null; throw error; },
  ) : null;
  return (
    <Workspace actor={actor}>
      <div className="agency-listings">
        <div className="agency-listing-toolbar">
          <h1>{filters?.pending ? "Pending vehicle requests" : "Car Listings"}</h1>
          <div className="agency-listing-actions">
            <Link className="button secondary" href={toggle.size ? `${basePath}?${toggle}` : basePath}><Clock3 size={19}/>{filters?.pending ? "All listings" : "Pending Requests"}</Link>
            <ListingFilters key={query.toString()}>
              <form action={basePath}>
                {filters?.pending && <input type="hidden" name="pending" value="1"/>}
                <label>Brand name<input name="make" defaultValue={raw.make} maxLength={80}/></label>
                <div className="agency-filter-pair">
                  <label>Model<input name="model" defaultValue={raw.model} maxLength={80}/></label>
                  <label>Year<input name="year" defaultValue={raw.year} type="number" min={1980} max={2100}/></label>
                </div>
                <div className="agency-filter-pair">
                  <label>Body type<select name="bodyType" defaultValue={raw.bodyType ?? ""}>
                    <option value="">Any type</option>{vehicleFactsSchema.shape.bodyType.options.map(v => <option key={v} value={v}>{v === "SUV" || v === "MPV" ? v : label(v)}</option>)}
                  </select></label>
                  <label>Rental type<select name="billingUnit" defaultValue={raw.billingUnit ?? ""}>
                    <option value="">Any unit</option>{vehicleTermsSchema.shape.billingUnit.options.map(v => <option key={v} value={v}>{units[v]}</option>)}
                  </select></label>
                </div>
                <div className="agency-filter-pair">
                  <label>Availability now<select name="availability" defaultValue={raw.availability ?? ""}>
                    <option value="">Any availability</option>{Object.entries(listingAvailabilityLabels).map(([v,name]) => <option key={v} value={v}>{name}</option>)}
                  </select></label>
                  <label>Transmission<select name="transmission" defaultValue={raw.transmission ?? ""}>
                    <option value="">Any transmission</option>{vehicleFactsSchema.shape.transmission.options.map(v => <option key={v} value={v}>{label(v)}</option>)}
                  </select></label>
                </div>
                <label>Listing status<select name="state" defaultValue={status.success ? status.data ?? "" : ""}>
                  <option value="">All statuses</option>{vehicleQueueSchema.shape.state.unwrap().options.map(v => <option key={v} value={v}>{label(v)}</option>)}
                </select></label>
                <div className="agency-filter-pair">
                  <label>Min. rate (₱)<input name="minRate" defaultValue={raw.minRate} type="number" min={0} max={1_000_000} step={0.01}/></label>
                  <label>Max. rate (₱)<input name="maxRate" defaultValue={raw.maxRate} type="number" min={0} max={1_000_000} step={0.01}/></label>
                </div>
                <button className="button" type="submit">Apply</button>
                {query.size > 0 && <Link href={filters?.pending ? `${basePath}?pending=1` : basePath}>Clear filters</Link>}
              </form>
            </ListingFilters>
            <Link className="button" href={`${basePath}/new`}><Plus size={19}/>Add listing</Link>
          </div>
        </div>
        {(!parsed.success || !status.success) && <p className="notice" role="alert">Check the year, listing options, and minimum and maximum rates to apply your filters.</p>}
        {edit && !detail && <p className="notice" role="alert">This listing is not available to edit in this agency.</p>}
        <VehicleQueue actor={actor} scope="AGENCY" agencyId={agency.id} page={page}
          state={status.success ? status.data : undefined} filters={filters} basePath={basePath} listingQuery={query.toString()}/>
        {detail && <ListingEditDialog backHref={backHref} title="Edit details">
          <VehicleEditor key={`${detail.id}:${detail.version}`} initial={detail} compact />
          <Link href={`/workspace/vehicles/${detail.id}`}>Open full listing and review history</Link>
        </ListingEditDialog>}
      </div>
    </Workspace>
  );
}
