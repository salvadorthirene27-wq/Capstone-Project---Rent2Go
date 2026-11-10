"use client";

import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <StatusScreen code={500} title="Something went wrong"
    detail="We couldn’t load this page. Please try again in a moment.">
    <button type="button" className="button" onClick={retry}>Try again</button>
    <Link href="/">Back to home</Link>
  </StatusScreen>;
}
