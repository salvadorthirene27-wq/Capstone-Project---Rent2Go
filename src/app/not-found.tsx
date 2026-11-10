import Link from "next/link";
import { StatusScreen } from "@/components/status-screen";

export default function NotFound() {
  return <StatusScreen code={404} title="Page not found"
    detail="The link may be incorrect, or the page may have moved.">
    <Link className="button" href="/">Back to home</Link>
  </StatusScreen>;
}
