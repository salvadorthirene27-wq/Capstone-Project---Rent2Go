// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingQuotation } from "../../src/components/booking-quotation";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const quote = {
  id: "quote-1", revision: 2, digest: "exact-digest", issuedAt: "2031-01-01T00:00:00Z", expiresAt: "2031-01-02T00:00:00Z",
  lines: [{ lineId: "line-1", title: "Island rental", kind: "RENTAL", startAt: "2031-01-04T00:00:00Z", endAt: "2031-01-05T00:00:00Z", partySize: 2, serviceCentavos: 350000, refundableDepositCentavos: 500000, driverName: "Maria Driver" }],
  totals: { serviceCentavos: 350000, refundableDepositCentavos: 500000, totalCentavos: 850000 },
  policies: [{ lineId: "line-1", terms: "Bring original identification.", cancellationPolicy: "Cancel before cutoff.", refundPolicy: "Refund after review.", damagePolicy: "Deposit subject to inspection.", latePolicy: "Return on time." }], outcome: "PENDING",
};
const owner = { requestId: "request-1", requestVersion: 7, status: "QUOTE_PENDING", isOwner: true, isOperator: false, canIssue: false, canRespond: true, driverSelections: [], quote, history: [{ id: "quote-1", revision: 2, issuedAt: quote.issuedAt, expiresAt: quote.expiresAt, outcome: "PENDING" }] };
const ready = { ...owner, status: "READY_FOR_APPROVAL", isOwner: false, isOperator: true, canIssue: true, canRespond: false, quote: null, history: [], driverSelections: [{ lineId: "line-1", title: "Island rental", drivers: [{ id: "driver-1", name: "Maria Driver" }] }] };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); refresh.mockClear(); });

it("keeps a funded committed quotation accepted after its former temporary deadline",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...owner,serverNow:"2031-01-03T00:00:00Z",allocationCommitted:true,status:"READY_FOR_SERVICE",canRespond:false,quote:{...quote,outcome:"ACCEPTED"}})));
 render(<BookingQuotation requestId="request-1"/>);
 expect(await screen.findByText(/inventory is committed/i)).toBeTruthy();
 expect(screen.queryByText(/This quotation has expired and cannot be accepted/)).toBeNull();
 expect(screen.queryByRole("button",{name:"Accept quotation"})).toBeNull();
});

it("requires review consent and sends the displayed exact quote identity and version", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(response({ ...owner, requestVersion: 8, status: "QUOTE_ACCEPTED", canRespond: false, quote: { ...quote, outcome: "ACCEPTED" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  const user = userEvent.setup();
  const accept = await screen.findByRole("button", { name: "Accept quotation" });
  expect((accept as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Bring original identification.")).toBeTruthy();
  expect(screen.getByText("Deposit subject to inspection.")).toBeTruthy();
  expect(screen.getAllByText(/₱5,000.00/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Expires/).length).toBeGreaterThan(0);
  expect(screen.queryByRole("combobox")).toBeNull();
  await user.click(screen.getByRole("checkbox"));
  await user.click(accept);
  await screen.findByText(/next step is the agreement/i);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "ACCEPT_QUOTE", version: 7, quoteId: "quote-1", digest: "exact-digest" });
  expect(screen.queryByRole("button", { name: "Accept quotation" })).toBeNull();
  expect(refresh).toHaveBeenCalledOnce();
});

it("requires an explicit eligible driver for each driver rental before issuing", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({ ...owner, isOwner: false, isOperator: true, canRespond: false }));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  const user = userEvent.setup(), issue = await screen.findByRole("button", { name: "Approve and issue quotation" });
  expect((issue as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByLabelText("Driver for Island rental"), "driver-1");
  await user.click(issue);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "ISSUE_QUOTE", version: 7, drivers: [{ lineId: "line-1", driverId: "driver-1" }] });
  expect(await screen.findByText(/Maria Driver/)).toBeTruthy();
});

it.each([
  { state: { ...ready, status: "UNDER_REVIEW", canIssue: false }, label: "unfinished human review" },
  { state: { ...ready, isOwner: true }, label: "operator's own request" },
  { state: { ...ready, canIssue: false }, label: "server refusal" },
])("hides issue controls for $label", async ({ state }) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state)));
  render(<BookingQuotation requestId="request-1" />);
  await screen.findByRole("heading", { name: "Booking quotation" });
  await waitFor(() => expect(screen.queryByText("Loading quotation…")).toBeNull());
  expect(screen.queryByRole("button", { name: "Approve and issue quotation" })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});

it.each([
  { action: "DECLINE_QUOTE", state: owner, label: "Decline reason", button: "Decline quotation" },
  { action: "WITHDRAW_QUOTE", state: { ...owner, isOwner: false, isOperator: true, canRespond: false }, label: "Withdrawal reason", button: "Withdraw quotation" },
  { action: "REJECT", state: ready, label: "Rejection reason", button: "Reject request" },
])("requires a reason for $action and sends only the permitted action fields", async ({ action, state, label, button }) => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValueOnce(response({ ...owner, status: "REJECTED", canRespond: false, quote: null }));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  const user = userEvent.setup(), control = await screen.findByRole("button", { name: button });
  expect((control as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText(label), "  Service no longer needed.  ");
  await user.click(control);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action, version: 7, reason: "Service no longer needed.", ...(action === "REJECT" ? {} : { quoteId: "quote-1", digest: "exact-digest" }) });
});

it("locks stale actions until reload and clears consent for the newly loaded quote", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(response({ error: "Request changed." }, 409)).mockResolvedValueOnce(response({ ...owner, requestVersion: 9, quote: { ...quote, id: "quote-2", digest: "new-digest", revision: 3 } }));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Accept quotation" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Reload quotation");
  expect((screen.getByRole("button", { name: "Accept quotation" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Reload quotation" }));
  await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false));
  expect((screen.getByRole("button", { name: "Accept quotation" }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([
  { ...owner, quote: { ...quote, outcome: "EXPIRED" } },
  { ...owner, quote: { ...quote, expiresAt: "2001-01-01T00:00:00Z" } },
  { ...owner, canRespond: false },
])("keeps unavailable or expired quotations read-only", async (state) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state)));
  render(<BookingQuotation requestId="request-1" />);
  await screen.findByText("Island rental");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept quotation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline quotation" })).toBeNull();
});

it("shows accepted quotation and revision history without withdrawal or payment controls", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...owner, status: "QUOTE_ACCEPTED", isOwner: false, isOperator: true, canRespond: false, quote: { ...quote, outcome: "ACCEPTED" }, history: [{ id: "quote-old", revision: 1, issuedAt: quote.issuedAt, expiresAt: quote.expiresAt, outcome: "WITHDRAWN" }, { ...owner.history[0], outcome: "ACCEPTED" }] })));
  render(<BookingQuotation requestId="request-1" />);
  await screen.findByText(/next step is the agreement/i);
  expect(screen.getByText(/Version 1 · Withdrawn/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Withdraw quotation" })).toBeNull();
  expect(screen.queryByRole("button", { name: /pay|sign/i })).toBeNull();
});

it("expires an open quotation even when its hold exceeds the browser timer limit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...owner, quote: { ...quote, expiresAt: "2030-02-01T00:00:00Z" } })));
  await act(async () => { render(<BookingQuotation requestId="request-1" />); });
  expect(screen.getByRole("button", { name: "Accept quotation" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000); });
  expect(screen.getByRole("button", { name: "Accept quotation" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000); });
  expect(screen.queryByRole("button", { name: "Accept quotation" })).toBeNull();
  expect(screen.getByText(/has expired and cannot be accepted/)).toBeTruthy();
});

it("prevents duplicate submissions while an acceptance is in flight", async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockReturnValueOnce(pending);
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  const accept = screen.getByRole("button", { name: "Accept quotation" });
  await user.dblClick(accept);
  expect((accept as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { finish(response({ ...owner, status: "QUOTE_ACCEPTED", canRespond: false, quote: { ...quote, outcome: "ACCEPTED" } })); });
  expect(screen.queryByRole("button", { name: "Accept quotation" })).toBeNull();
});

it("recovers a failed quotation load through the reload action", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ error: "Quotation unavailable." }, 503)).mockResolvedValueOnce(response(ready));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingQuotation requestId="request-1" />);
  expect((await screen.findByRole("alert")).textContent).toContain("Quotation unavailable.");
  await userEvent.setup().click(screen.getByRole("button", { name: "Reload quotation" }));
  expect(await screen.findByRole("button", { name: "Approve and issue quotation" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("uses the supplied server clock when the browser clock is incorrect",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2032-01-01T00:00:00Z"));
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...owner,serverNow:"2030-01-01T00:00:00Z",quote:{...quote,expiresAt:"2030-01-01T01:00:00Z"}})));
 await act(async()=>{render(<BookingQuotation requestId="request-1"/>);});
 expect(screen.getByRole("button",{name:"Accept quotation"})).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(61*60*1000);});
 expect(screen.queryByRole("button",{name:"Accept quotation"})).toBeNull();
});
