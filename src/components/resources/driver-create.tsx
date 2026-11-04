"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DriverCreate({ agencyId }: { agencyId: string }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <h1>Add a driver</h1>
      <p>
        Driver contacts and license details are visible only to your agency’s
        active operators. Each license identifies one physical driver.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <form
        className="vehicle-create"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/drivers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agencyId,
                name: data.get("name"),
                phone: data.get("phone"),
                licenseNumber: data.get("licenseNumber"),
                licenseExpiry: data.get("licenseExpiry"),
                active: data.get("active") === "on",
              }),
            });
            const result = await r.json();
            if (!r.ok)
              throw Error(
                result.issues
                  ? result.issues
                      .map(
                        (i: { path: string[]; message: string }) =>
                          `${i.path.join(".")}: ${i.message}`,
                      )
                      .join("; ")
                  : result.error,
              );
            router.push(`/workspace/resources/${result.id}`);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Unable to create driver. Try again.",
            );
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Driver name
            <input name="name" required minLength={2} maxLength={120} />
          </label>
          <label>
            Contact number
            <input name="phone" required minLength={7} maxLength={32} />
          </label>
          <label>
            License identifier
            <input name="licenseNumber" required minLength={3} maxLength={80} />
          </label>
          <label>
            License expiry
            <input name="licenseExpiry" type="date" required />
          </label>
          <label className="consent-row">
            <input type="checkbox" name="active" defaultChecked />
            Active for assignments (requires a current license)
          </label>
          <button className="button">
            {busy ? "Creating driver…" : "Create driver"}
          </button>
        </fieldset>
      </form>
    </>
  );
}
