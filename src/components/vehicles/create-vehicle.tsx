"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { VehicleFactsFields, emptyFacts } from "./vehicle-fields";
type Agency = { id: string; name: string };
export function CreateVehicle({
  ownership,
  agency,
  initialAgencies = [],
}: {
  ownership: "CONSIGNED" | "AGENCY_OWNED";
  agency?: Agency;
  initialAgencies?: Agency[];
}) {
  const router = useRouter(),
    [facts, setFacts] = useState(emptyFacts),
    [registration, setRegistration] = useState(""),
    [agencyId, setAgencyId] = useState(agency?.id ?? ""),
    [agencies, setAgencies] = useState(initialAgencies),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function find() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/agencies?${new URLSearchParams({ search, pageSize: "48" })}`,
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setAgencies(
        data.items.filter((a: { services: string[] }) =>
          a.services.some((s) => s === "SELF_DRIVE" || s === "WITH_DRIVER"),
        ),
      );
    } catch {
      setError("Unable to find agencies. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>
        {ownership === "CONSIGNED"
          ? "Offer your car to an agency"
          : "Add an agency-owned vehicle"}
      </h1>
      <p>
        {ownership === "CONSIGNED"
          ? "You remain the personal owner. The agency proposes operating terms and revenue shares for your acceptance before compliance review."
          : `This car belongs to ${agency?.name}. Personal cars must use the Cosigner submission workflow.`}
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {!agency && (
          <section className="context-section">
            <h2>Choose your operating agency</h2>
            <div className="directory-filters">
              <label>
                Agency name or service area
                <input
                  maxLength={120}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button className="button secondary" type="button" onClick={find}>
                Find rental agencies
              </button>
            </div>
            <p>
              Select an approved rental agency below. Search again to find
              another agency.
            </p>
          </section>
        )}
        <form
          className="vehicle-create"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/vehicles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ownership,
                  agencyId,
                  registration,
                  facts: {
                    ...facts,
                    features: facts.features
                      .map((f) => f.trim())
                      .filter(Boolean),
                  },
                }),
              });
              const data = await r.json();
              if (!r.ok)
                throw Error(
                  data.issues
                    ? data.issues
                        .map(
                          (i: { path: string[]; message: string }) =>
                            `${i.path.join(".")}: ${i.message}`,
                        )
                        .join("; ")
                    : data.error || "Unable to create vehicle.",
                );
              router.push(`/workspace/vehicles/${data.id}`);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Unable to create vehicle. Try again.",
              );
              setBusy(false);
            }
          }}
        >
          <label>
            Operating agency
            {agency ? (
              <input value={agency.name} readOnly />
            ) : (
              <select
                required
                value={agencyId}
                onChange={(e) => setAgencyId(e.target.value)}
              >
                <option value="">Select an agency</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          {!agency && !agencies.length && (
            <p>
              No rental agencies found. Try another search or return after an
              agency is approved.
            </p>
          )}
          <label>
            Vehicle registration / plate identifier
            <input
              required
              minLength={3}
              maxLength={20}
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              autoComplete="off"
            />
            <small>
              Kept private. The same physical car can be registered only once.
            </small>
          </label>
          <VehicleFactsFields value={facts} onChange={setFacts} />
          <button className="button" type="submit">
            {busy ? "Creating vehicle…" : "Create vehicle draft"}
          </button>
        </form>
      </fieldset>
    </>
  );
}
