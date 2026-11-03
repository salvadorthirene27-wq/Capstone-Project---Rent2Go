"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="public-main">
      <section className="notice public-section">
        <h1>We couldn’t load this workspace</h1>
        <p>
          Check your connection and try again. If your account is suspended,
          contact the platform administrator.
        </p>
        <button className="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
