"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main-content" className="public-main">
      <section className="notice public-section">
        <h1>We couldn’t load this page</h1>
        <p>
          The service may be temporarily unavailable. Check your connection
          and try again, or return to the marketplace home page.
        </p>
        <button type="button" className="button" onClick={retry}>
          Try again
        </button>
        <p><Link href="/">Return to marketplace home</Link></p>
      </section>
    </main>
  );
}
