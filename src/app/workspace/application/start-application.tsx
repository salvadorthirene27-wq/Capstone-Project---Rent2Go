"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function StartApplication() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/partners", { method: "POST" });
            const data = await r.json();
            if (!r.ok)
              throw new Error(data.error || "Unable to create application.");
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Unable to create application. Try again.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Creating application…" : "Create my application"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
