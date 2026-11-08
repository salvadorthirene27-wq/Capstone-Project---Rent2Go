// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingPayments } from "../../src/components/booking-payments";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const base = {
  serverNow: "2030-01-01T00:00:00Z", holdExpiresAt: "2030-01-01T01:00:00Z", requestId: "request-1", requestVersion: 8,
  status: "AGREEMENT_SIGNED", isOwner: true, isOperator: false, canSubmitGcash: true, canRecordCash: false,
  canSimulate: true, canReview: false, canResolveDemo: false, allocationCommitted: false, holdActive: true,
  agreement: { id: "agreement-1", digest: "signed-digest", quoteId: "quote-1" }, environment: null,
  methods: ["CASH", "GCASH", "DEMO_CARD", "DEMO_GCASH", "DEMO_PAYPAL"],
  instructions: { gcashAccountName: "Saved Agency Name", gcashInstructions: "Use the saved destination and keep your reference.", gcashQrAvailable: true },
  totals: { serviceCentavos: 350000, refundableDepositCentavos: 500000, totalCentavos: 850000, confirmedCentavos: 0, balanceCentavos: 850000, creditCentavos: 0 },
  attempts: [], collections: [], requiresReconciliation: false,
};
const submitted = { id: "attempt-1", method: "GCASH", environment: "MANUAL", amountCentavos: 100050, reference: "SYNTHETIC-REF", outcome: "SUBMITTED", submittedAt: base.serverNow, reason: null, evidenceId: "file-1", collectionId: null, canResolve: false };
const pending = { ...submitted, method: "DEMO_CARD", environment: "DEMO", outcome: "PENDING", evidenceId: null, canResolve: true };
const collection = { id: "collection-1", method: "GCASH", environment: "MANUAL", amountCentavos: 100050, reference: "SYNTHETIC-REF", recordedAt: base.serverNow };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const image = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "synthetic-receipt.png", { type: "image/png" });

it("shows central provider records without offering a manual or simulated environment switch",async()=>{
 const gateway={...base,channel:"PAYMONGO",environment:"DEMO",canSubmitGcash:false,canRecordCash:false,canSimulate:false,canReview:false,canResolveDemo:false,methods:[],collections:[{...collection,method:"PAYMONGO",environment:"DEMO"}]};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(gateway)));
 render(<BookingPayments requestId="request-1"/>);
 expect(await screen.findByText(/Rent2Go holds the funds/)).toBeTruthy();
 expect(screen.getByText("PayMongo test payment · no charge")).toBeTruthy();
 expect(screen.getByRole("link",{name:"View PayMongo test payment record"})).toBeTruthy();
 expect(screen.queryByRole("radio")).toBeNull();
 expect(screen.queryByLabelText("Simulated payment method")).toBeNull();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); refresh.mockClear(); });
async function fillReceipt() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("GCash amount (PHP)"), "1000.50");
  await user.type(screen.getByLabelText("GCash reference"), "  SYNTHETIC-REF  ");
  await user.upload(screen.getByLabelText("GCash receipt file"), image());
  return user;
}

it("submits exact signed-agreement multipart evidence without treating submission as payment", async () => {
  const updated = { ...base, environment: "MANUAL", requestVersion: 9, attempts: [submitted] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response(updated, 201)).mockResolvedValue(response(updated));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />);
  const user = await fillReceipt();
  expect(screen.getByText("Saved Agency Name")).toBeTruthy();
  expect(screen.getByText("Use the saved destination and keep your reference.")).toBeTruthy();
  expect(screen.getByText("Refundable deposits")).toBeTruthy();
  expect(screen.getAllByText("₱5,000.00").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" }));
  expect(await screen.findByText("Awaiting agency review")).toBeTruthy();
  const [url, options] = fetcher.mock.calls[1], body = options.body as FormData;
  expect(url).toBe("/api/booking-requests/request-1/payments/evidence"); expect(options.method).toBe("POST"); expect(options.headers).toBeUndefined();
  expect([...body.keys()].sort()).toEqual(["agreementId", "amountCentavos", "digest", "file", "idempotencyKey", "reference", "version"]);
  expect(body.get("agreementId")).toBe("agreement-1"); expect(body.get("digest")).toBe("signed-digest");
  expect(body.get("version")).toBe("8"); expect(body.get("amountCentavos")).toBe("100050"); expect(body.get("reference")).toBe("SYNTHETIC-REF");
  expect(body.get("idempotencyKey")).toMatch(/^[0-9a-f-]{36}$/i); expect((body.get("file") as File).name).toBe("synthetic-receipt.png");
  expect(screen.queryByRole("link", { name: /receipt/i })).toBeNull();
  expect(screen.getByRole("link", { name: "View private evidence" }).getAttribute("href")).toBe("/api/booking-payment-files/file-1");
});

it("preserves an uncertain failed upload and reuses its idempotency key for an exact retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockRejectedValueOnce(Error("Connection lost"))
    .mockResolvedValueOnce(response({ ...base, environment: "MANUAL", attempts: [submitted] }, 201)).mockResolvedValue(response(base));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = await fillReceipt();
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" })); await screen.findByRole("alert");
  expect((screen.getByLabelText("GCash amount (PHP)") as HTMLInputElement).value).toBe("1000.50");
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" }));
  await waitFor(() => expect(fetcher.mock.calls.length).toBe(4));
  expect((fetcher.mock.calls[1][1].body as FormData).get("idempotencyKey")).toBe((fetcher.mock.calls[2][1].body as FormData).get("idempotencyKey"));
});

it("requires reload after conflict and clears obsolete receipt inputs", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({ error: "Booking changed" }, 409))
    .mockResolvedValue(response({ ...base, requestVersion: 10, agreement: { ...base.agreement, id: "agreement-2", digest: "replacement" } }));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = await fillReceipt();
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Reload payments");
  expect((screen.getByRole("button", { name: "Submit GCash evidence" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Reload payments" }));
  await waitFor(() => expect((screen.getByLabelText("GCash amount (PHP)") as HTMLInputElement).value).toBe(""));
  expect((screen.getByLabelText("GCash reference") as HTMLInputElement).value).toBe("");
});

it("records operator cash with exact centavos and receiver context, then displays credit separately", async () => {
  const operator = { ...base, isOwner: false, isOperator: true, canSubmitGcash: false, canRecordCash: true, canSimulate: false };
  const paid = { ...operator, environment: "MANUAL", totals: { ...base.totals, confirmedCentavos: 900000, balanceCentavos: 0, creditCentavos: 50000 }, collections: [{ ...collection, method: "CASH", amountCentavos: 900000 }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(operator)).mockResolvedValue(response(paid)); vi.stubGlobal("fetch", fetcher);
  render(<BookingPayments requestId="request-1" />); const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Cash amount (PHP)"), "9000.00"); await user.type(screen.getByLabelText("Cash reference"), "CASH-SYNTHETIC");
  expect((screen.getByRole("button", { name: "Record received cash" }) as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText("Cash receiver note"), "Received in person at the agency desk.");
  await user.click(screen.getByRole("button", { name: "Record received cash" }));
  await screen.findByText("Unapplied credit");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "RECORD_CASH", version: 8, idempotencyKey: expect.any(String), agreementId: "agreement-1", digest: "signed-digest", amountCentavos: 900000, reference: "CASH-SYNTHETIC", note: "Received in person at the agency desk." });
  expect(screen.getByText("₱500.00")).toBeTruthy(); expect(screen.getByRole("link", { name: "View payment receipt" }).getAttribute("href")).toBe("/booking-payments/collection-1");
});

it("reviews immutable submitted evidence with a required reason and warns about late reconciliation", async () => {
  const operator = { ...base, environment: "MANUAL", isOwner: false, isOperator: true, canSubmitGcash: false, canSimulate: false, canReview: true, holdActive: false, attempts: [submitted] };
  const result = { ...operator, requiresReconciliation: true, attempts: [{ ...submitted, outcome: "CONFIRMED", reason: "Matched actual received funds", collectionId: "collection-1" }], collections: [collection] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(operator)).mockResolvedValue(response(result)); vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />);
  const user = userEvent.setup(), confirm = await screen.findByRole("button", { name: "Confirm GCash receipt" });
  expect((confirm as HTMLButtonElement).disabled).toBe(true); await user.type(screen.getByLabelText("Review reason for SYNTHETIC-REF"), "Matched actual received funds"); await user.click(confirm);
  await screen.findByText(/Reconciliation required/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "REVIEW_GCASH", version: 8, idempotencyKey: expect.any(String), attemptId: "attempt-1", decision: "CONFIRM", reason: "Matched actual received funds" });
  expect(screen.getByText(/cannot authorize service release/)).toBeTruthy();
});

it("keeps demo commands credential-free and resolves a pending simulation explicitly", async () => {
  const first = { ...base, environment: "DEMO", canResolveDemo: true, attempts: [pending] };
  const last = { ...first, canResolveDemo: false, attempts: [{ ...pending, outcome: "DECLINED", reason: "Demo declined" }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(first)).mockResolvedValue(response(last));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Simulated payment · no charge"));
  await user.selectOptions(screen.getByLabelText("Simulated payment method"), "DEMO_PAYPAL"); await user.selectOptions(screen.getByLabelText("Simulation result"), "PENDING");
  await user.click(screen.getByRole("button", { name: "Simulate payment — no money moves" }));
  const resolve = await screen.findByRole("button", { name: "Resolve simulated payment" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "SIMULATE_PAYMENT", version: 8, idempotencyKey: expect.any(String), agreementId: "agreement-1", digest: "signed-digest", method: "DEMO_PAYPAL", outcome: "PENDING" });
  expect(screen.queryByLabelText(/card number|cvv|password/i)).toBeNull();
  expect((screen.getByLabelText("Manual GCash or cash") as HTMLInputElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Resolve simulation result for SYNTHETIC-REF — no money moves"), "DECLINED"); await user.click(resolve);
  await screen.findByText("Demo declined");
  expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ action: "RESOLVE_DEMO", version: 8, idempotencyKey: expect.any(String), attemptId: "attempt-1", outcome: "DECLINED" });
});

it("preserves an old pending demo attempt while resolving only the current quotation attempt", async () => {
  const old = { ...pending, id: "old-quote-attempt", reference: "OLD-QUOTE-DEMO", canResolve: false };
  const current = { ...pending, id: "current-quote-attempt", reference: "CURRENT-QUOTE-DEMO", canResolve: true };
  const state = { ...base, environment: "DEMO", canResolveDemo: true, agreement: { ...base.agreement, id: "agreement-2", quoteId: "quote-2" }, attempts: [old, current] };
  const result = { ...state, canResolveDemo: false, attempts: [old, { ...current, outcome: "CANCELLED", canResolve: false }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValue(response(result));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = userEvent.setup();
  const resolver = await screen.findByRole("button", { name: "Resolve simulated payment" });
  expect(screen.getAllByRole("button", { name: "Resolve simulated payment" }).length).toBe(1);
  expect(resolver.matches(":disabled")).toBe(false);
  expect(screen.getByText(/Reference: OLD-QUOTE-DEMO/)).toBeTruthy();
  expect(screen.queryByLabelText("Resolve simulation result for OLD-QUOTE-DEMO — no money moves")).toBeNull();
  await user.selectOptions(screen.getByLabelText("Resolve simulation result for CURRENT-QUOTE-DEMO — no money moves"), "CANCELLED");
  await user.click(resolver); await screen.findByText("Cancelled");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "RESOLVE_DEMO", version: 8, idempotencyKey: expect.any(String), attemptId: "current-quote-attempt", outcome: "CANCELLED" });
  expect(screen.getByText(/Reference: OLD-QUOTE-DEMO/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Resolve simulated payment" })).toBeNull();
});

it.each(["GCash", "Cash"])("limits %s references to the server's 160 characters", async method => {
  const state = method === "GCash" ? base : { ...base, isOwner: false, isOperator: true, canRecordCash: true };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state))); render(<BookingPayments requestId="request-1" />);
  const input = await screen.findByLabelText(`${method} reference`); await userEvent.setup().type(input, "R".repeat(161));
  expect((input as HTMLInputElement).value.length).toBe(160);
});

it("locks all actions through mutation and authoritative reload", async () => {
  let finish!: (value: unknown) => void; const loading = new Promise(resolve => { finish = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response(base)).mockReturnValueOnce(loading); vi.stubGlobal("fetch", fetcher);
  render(<BookingPayments requestId="request-1" />); const user = await fillReceipt(); await user.dblClick(screen.getByRole("button", { name: "Submit GCash evidence" }));
  await waitFor(() => expect(fetcher.mock.calls.length).toBe(3)); expect((screen.getByRole("button", { name: "Reload payments" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText("GCash amount (PHP)").matches(":disabled")).toBe(true);
  await act(async () => { finish(response(base)); });
});

it("rejects invalid amounts and unsupported or oversized evidence before submitting", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(base)); vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />);
  const user = await fillReceipt(); await user.clear(screen.getByLabelText("GCash amount (PHP)")); await user.type(screen.getByLabelText("GCash amount (PHP)"), "1.001");
  expect((screen.getByRole("button", { name: "Submit GCash evidence" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("GCash receipt file"), { target: { files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })] } });
  expect(screen.getByRole("alert").textContent).toContain("PNG, JPEG or PDF");
  fireEvent.change(screen.getByLabelText("GCash receipt file"), { target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })] } });
  expect(screen.getByRole("alert").textContent).toContain("5 MB"); expect(fetcher.mock.calls.length).toBe(1);
});

it("shows no invented payable amount before signing and excludes self-review controls", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...base, agreement: null, canSubmitGcash: false, canSimulate: false, isOperator: true, canReview: true, attempts: [submitted] })));
  render(<BookingPayments requestId="request-1" />); await screen.findByText(/Sign the current agreement/);
  expect(screen.queryByText("Outstanding balance")).toBeNull(); expect(screen.queryByRole("button", { name: "Confirm GCash receipt" })).toBeNull();
});

it("keeps committed allocations payable beyond the old deadline using the server clock", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...base, allocationCommitted: true })));
  await act(async () => { render(<BookingPayments requestId="request-1" />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(61 * 60 * 1000); });
  expect(screen.getByLabelText("GCash amount (PHP)")).toBeTruthy(); expect(screen.getByText(/Inventory allocation is committed/)).toBeTruthy();
});

it("expires an uncommitted allocation using elapsed server time despite an incorrect device clock", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2040-01-01T00:00:00Z")); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(base)));
  await act(async () => { render(<BookingPayments requestId="request-1" />); });
  expect(screen.getByLabelText("GCash amount (PHP)")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(61 * 60 * 1000); });
  expect(screen.queryByLabelText("GCash amount (PHP)")).toBeNull(); expect(screen.getByText(/temporary allocation has expired/)).toBeTruthy();
});

it("labels demo transactions and printable receipts without mixing manual funds", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...base, environment: "DEMO", attempts: [{ ...pending, outcome: "CONFIRMED", collectionId: "collection-1" }], collections: [{ ...collection, environment: "DEMO", method: "DEMO_CARD" }] })));
  render(<BookingPayments requestId="request-1" />);
  const receipt = await screen.findByRole("link", { name: "View simulated payment record" }); expect(receipt.getAttribute("href")).toBe("/booking-payments/collection-1");
  expect(screen.getAllByText("Simulated payment · no charge").length).toBeGreaterThan(1); expect(screen.queryByLabelText("GCash amount (PHP)")).toBeNull();
});

it("links the saved agency QR through the protected booking endpoint only when available", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({ ...base, instructions: { ...base.instructions, gcashQrAvailable: false } }));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />);
  expect((await screen.findByRole("link", { name: "View agency GCash QR" })).getAttribute("href")).toBe("/api/booking-requests/request-1/payments/gcash-qr");
  await userEvent.setup().click(screen.getByRole("button", { name: "Reload payments" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "View agency GCash QR" })).toBeNull());
});

it("rejects submitted evidence without overriding its amount or reference", async () => {
  const operator = { ...base, environment: "MANUAL", isOwner: false, isOperator: true, canReview: true, attempts: [submitted] };
  const rejected = { ...operator, attempts: [{ ...submitted, outcome: "REJECTED", reason: "Reference does not match received funds" }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(operator)).mockResolvedValue(response(rejected)); vi.stubGlobal("fetch", fetcher);
  render(<BookingPayments requestId="request-1" />); const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Review reason for SYNTHETIC-REF"), "Reference does not match received funds");
  await user.click(screen.getByRole("button", { name: "Reject GCash receipt" })); await screen.findByText("Rejected");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "REVIEW_GCASH", version: 8, idempotencyKey: expect.any(String), attemptId: "attempt-1", decision: "REJECT", reason: "Reference does not match received funds" });
  expect(screen.queryByRole("link", { name: "View payment receipt" })).toBeNull();
});

it("reuses a demo command key after a lost response and gives a changed outcome a fresh key", async () => {
  const declined = { ...base, environment: "DEMO", attempts: [{ ...pending, outcome: "DECLINED" }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockRejectedValueOnce(Error("Connection lost"))
    .mockResolvedValueOnce(response(declined)).mockResolvedValueOnce(response(declined)).mockResolvedValue(response(declined));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = userEvent.setup();
  await user.click(await screen.findByLabelText("Simulated payment · no charge"));
  await user.selectOptions(screen.getByLabelText("Simulation result"), "DECLINED");
  await user.click(screen.getByRole("button", { name: "Simulate payment — no money moves" })); await screen.findByRole("alert");
  expect((screen.getByLabelText("Simulation result") as HTMLSelectElement).value).toBe("DECLINED");
  await user.click(screen.getByRole("button", { name: "Simulate payment — no money moves" })); await screen.findByText("Declined");
  const original = JSON.parse(fetcher.mock.calls[1][1].body), retry = JSON.parse(fetcher.mock.calls[2][1].body);
  expect(retry).toEqual(original);
  await user.selectOptions(screen.getByLabelText("Simulation result"), "CANCELLED");
  await user.click(screen.getByRole("button", { name: "Simulate payment — no money moves" }));
  await waitFor(() => expect(fetcher.mock.calls.length).toBe(6));
  expect(JSON.parse(fetcher.mock.calls[4][1].body).idempotencyKey).not.toBe(original.idempotencyKey);
});

it("requires reload if the action succeeded but refreshing current capabilities failed", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({ ...base, environment: "MANUAL", attempts: [submitted] }, 201))
    .mockRejectedValueOnce(Error("Refresh disconnected"));
  vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = await fillReceipt();
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" }));
  expect((await screen.findByRole("alert")).textContent).toContain("The action was recorded");
  expect((screen.getByRole("button", { name: "Submit GCash evidence" }) as HTMLButtonElement).disabled).toBe(true);
});

it.each(["0", "-1", "1e3", "90071992547410.00"])("does not send an invalid money amount %s", async amount => {
  const fetcher = vi.fn().mockResolvedValue(response(base)); vi.stubGlobal("fetch", fetcher); render(<BookingPayments requestId="request-1" />); const user = await fillReceipt();
  await user.clear(screen.getByLabelText("GCash amount (PHP)")); await user.type(screen.getByLabelText("GCash amount (PHP)"), amount);
  await user.click(screen.getByRole("button", { name: "Submit GCash evidence" })); expect(fetcher.mock.calls.length).toBe(1);
});
