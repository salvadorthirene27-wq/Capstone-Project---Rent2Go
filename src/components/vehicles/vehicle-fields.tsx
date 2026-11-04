"use client";
import type { VehicleFacts, VehicleTerms } from "@/modules/vehicles/schema";
import { driverFeeUnitLabels } from "@/modules/pricing/units";
export const emptyFacts: VehicleFacts = {
  make: "",
  model: "",
  year: 2026,
  seats: 5,
  transmission: "AUTOMATIC",
  fuel: "GASOLINE",
  bodyType: "SEDAN",
  description: "",
  features: [],
  pickupInstructions: "",
};
export function VehicleFactsFields({
  value,
  onChange,
}: {
  value: VehicleFacts;
  onChange: (v: VehicleFacts) => void;
}) {
  const text = (
    key: "make" | "model" | "description" | "pickupInstructions",
    label: string,
    multi = false,
  ) => (
    <label key={key}>
      {label}
      {multi ? (
        <textarea
          required
          minLength={key === "description" ? 10 : 5}
          maxLength={key === "description" ? 4000 : 2000}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      ) : (
        <input
          required
          maxLength={80}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <>
      <div className="field-grid">
        {text("make", "Make")}
        {text("model", "Model")}
        <label>
          Model year
          <input
            type="number"
            min={1980}
            max={2100}
            required
            value={value.year || ""}
            onChange={(e) =>
              onChange({ ...value, year: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Seats, including driver
          <input
            type="number"
            min={1}
            max={50}
            required
            value={value.seats || ""}
            onChange={(e) =>
              onChange({ ...value, seats: Number(e.target.value) })
            }
          />
        </label>
        {(
          [
            ["transmission", "Transmission", ["AUTOMATIC", "MANUAL"]],
            ["fuel", "Fuel", ["GASOLINE", "DIESEL", "HYBRID", "ELECTRIC"]],
            [
              "bodyType",
              "Body type",
              ["SEDAN", "HATCHBACK", "SUV", "MPV", "VAN", "PICKUP", "OTHER"],
            ],
          ] as const
        ).map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {o.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {text("description", "Vehicle description", true)}
      {text("pickupInstructions", "Pickup instructions", true)}
      <label>
        Features, one per line
        <textarea
          maxLength={1600}
          value={value.features.join("\n")}
          onChange={(e) =>
            onChange({ ...value, features: e.target.value.split("\n") })
          }
        />
      </label>
    </>
  );
}
export function VehicleTermsFields({
  value,
  onChange,
}: {
  value: VehicleTerms;
  onChange: (v: VehicleTerms) => void;
}) {
  function cash(
    key: "rateCentavos" | "depositCentavos" | "driverFeeCentavos",
    label: string,
  ) {
    return (
      <label key={key}>
        {label}
        <input
          type="number"
          min={key === "rateCentavos" ? 0.01 : 0}
          max={1000000}
          step="0.01"
          required={
            key !== "driverFeeCentavos" || value.modes.includes("WITH_DRIVER")
          }
          defaultValue={value[key] === null ? "" : value[key] / 100}
          onChange={(e) =>
            onChange({
              ...value,
              [key]:
                e.target.value === ""
                  ? null
                  : Math.round(Number(e.target.value) * 100),
            })
          }
        />
      </label>
    );
  }
  return (
    <>
      <div className="field-grid">
        {cash("rateCentavos", "Vehicle rate (PHP)")}
        {cash("depositCentavos", "Refundable deposit (PHP)")}
        <label>
          Billing unit
          <select
            value={value.billingUnit}
            onChange={(e) =>
              onChange({
                ...value,
                billingUnit: e.target.value as VehicleTerms["billingUnit"],
              })
            }
          >
            <option value="24_HOUR">Per 24 hours</option>
            <option value="CALENDAR_DAY">Per calendar day</option>
            <option value="HOUR">Per hour</option>
          </select>
        </label>
        {cash("driverFeeCentavos", "Driver charge (PHP; 0 if included)")}
        <label>
          Driver fee unit
          <select
            value={value.driverFeeUnit ?? ""}
            required={value.modes.includes("WITH_DRIVER")}
            onChange={(e) =>
              onChange({
                ...value,
                driverFeeUnit: (e.target.value ||
                  null) as VehicleTerms["driverFeeUnit"],
              })
            }
          >
            <option value="">Choose the driver fee unit</option>
            {Object.entries(driverFeeUnitLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="checkbox-group" role="group" aria-label="Rental modes">
        {(["SELF_DRIVE", "WITH_DRIVER"] as const).map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={value.modes.includes(m)}
              onChange={(e) =>
                onChange({
                  ...value,
                  modes: e.target.checked
                    ? [...value.modes, m]
                    : value.modes.filter((x) => x !== m),
                })
              }
            />
            {m === "SELF_DRIVE" ? "Self-drive" : "With driver"}
          </label>
        ))}
      </div>
      {(
        [
          ["inclusions", "Included"],
          ["exclusions", "Excluded / additional charges"],
          ["agreementTerms", "Owner–agency agreement terms"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea
            required
            minLength={key === "agreementTerms" ? 10 : 1}
            maxLength={key === "agreementTerms" ? 8000 : 4000}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      <h3>Revenue allocation (%)</h3>
      <p>
        Allocate eligible service revenue only. Refundable deposits are
        separate. Total must be 100%.
      </p>
      <div className="field-grid">
        {(
          [
            ["cosigner", "Cosigner"],
            ["agency", "Agency"],
            ["platform", "Rent2Go"],
            ["maintenance", "Vehicle maintenance reserve"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              required
              min={0}
              max={100}
              step="0.01"
              defaultValue={value.shares[key] / 100}
              onChange={(e) =>
                onChange({
                  ...value,
                  shares: {
                    ...value.shares,
                    [key]: Math.round(Number(e.target.value) * 100),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    </>
  );
}
