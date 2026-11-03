import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="public-main">
      <section className="notice public-section">
        <h1>This page isn’t available</h1>
        <p>The link may be incorrect, or you may not have access.</p>
        <Link className="button" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
