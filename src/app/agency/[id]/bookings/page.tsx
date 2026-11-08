import {AgencyFollowUps} from '@/components/agency-followups';
import {agencyFollowUps} from '@/modules/bookings/contacts';
import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { BookingList } from "@/components/booking-list";
import { pageActor } from "@/lib/page-actor";
import { listBookingRequests } from "@/modules/bookings/service";
import { DomainError } from "@/modules/partners/workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; followPage?:string }>;
}) {
  const actor = await pageActor(),
    { id } = await params,
    { page, followPage } = await searchParams,
    list = await listBookingRequests(actor, {
      agencyId: id,
      page: page ?? 1,
    }).catch((e) => {
      if (e instanceof DomainError && [403, 404].includes(e.status)) notFound();
      throw e;
    });
  const followups=await agencyFollowUps(actor,id,{page:Math.min(10000,Math.max(1,parseInt(followPage??"1",10)||1))});
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${id}`}>
        Back to agency
      </Link>
      <h1>Agency booking requests</h1>
      <p>
        Review the requests for this agency. Requirement submission and review
        are the next workflow stage.
      </p>
      <AgencyFollowUps data={followups} agencyId={id} requestPage={list.page}/>
      <BookingList extraQuery={{followPage:String(followups.page)}} list={list} base={`/agency/${id}/bookings`} />
    </Workspace>
  );
}
