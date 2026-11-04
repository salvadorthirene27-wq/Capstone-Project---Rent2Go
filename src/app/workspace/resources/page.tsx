import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { ResourceList } from "@/components/resources/resource-list";
import { pageActor } from "@/lib/page-actor";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    q = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(q.page ?? "1", 10) || 1));
  return (
    <Workspace actor={actor}>
      <h1>My vehicle calendars</h1>
      <p>
        Manage your personal vehicles’ unavailability and maintenance. Owner
        blocks can be released by the owner who placed them.
      </p>
      <p>
        <Link href="/workspace/vehicles">
          Manage vehicle submissions and agreements
        </Link>
      </p>
      <ResourceList
        actor={actor}
        scope="OWNED"
        page={page}
        basePath="/workspace/resources"
      />
    </Workspace>
  );
}
