// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingAgreement } from "../../src/components/booking-agreement";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const agreement = {
  id: "agreement-1", revision: 2, digest: "agreement-digest", quoteId: "quote-1", quoteDigest: "quote-digest",
  issuedAt: "2030-01-01T00:00:00Z", expiresAt: "2030-01-01T01:00:00Z", templateVersion: "1",
  body: {
    agencyName: "Synthetic Agency", renterName: "Synthetic Renter",
    services: [{ lineId: "line-1", title: "Island rental", kind: "RENTAL", startAt: "2030-02-01T00:00:00Z", endAt: "2030-02-02T00:00:00Z", partySize: 2, serviceCentavos: 350000, refundableDepositCentavos: 500000, driverName: "Synthetic Driver" }],
    totals: { serviceCentavos: 350000, refundableDepositCentavos: 500000, totalCentavos: 850000 },
    policies: [{ lineId: "line-1", terms: "Bring original identification.", cancellationPolicy: "Cancel before cutoff.", refundPolicy: "Refund after review.", damagePolicy: "Deposit subject to inspection.", latePolicy: "Return on time." }],
    acknowledgement: "I consent to this exact electronic agreement and its saved policies.",
  }, outcome: "PENDING", signature: null,
};
const owner = { serverNow: "2030-01-01T00:00:00Z", requestId: "request-1", requestVersion: 7, status: "AGREEMENT_PENDING", isOwner: true, isOperator: false, canIssue: false, canSign: true, holdActive: true, acceptedQuote: { id: "quote-1", digest: "quote-digest" }, agreement, history: [{ id: "agreement-1", revision: 2, issuedAt: agreement.issuedAt, outcome: "PENDING" }] };
const operator = { ...owner, isOwner: false, isOperator: true, canSign: false };
const ready = { ...operator, status: "QUOTE_ACCEPTED", canIssue: true, agreement: null, history: [] };
const signed = { ...owner, requestVersion: 8, status: "AGREEMENT_SIGNED", canSign: false, agreement: { ...agreement, outcome: "SIGNED", signature: { id: "signature-1", signerName: "Synthetic Renter", signedAt: "2030-01-01T00:10:00Z" } } };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
// A synthetic PNG header is sufficient for this browser-boundary test; server tests validate real image bytes.
const image = () => new File([new Uint8Array([137,80,78,71,13,10,26,10])], "synthetic-mark.png", { type: "image/png" });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); refresh.mockClear(); });

it("requires typed matching name, explicit consent and an image before signing the displayed exact agreement", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(response(signed, 201));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingAgreement requestId="request-1" />);
  const user = userEvent.setup(), sign = await screen.findByRole("button", { name: "Sign agreement" });
  expect((sign as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Bring original identification.")).toBeTruthy();
  expect(screen.getByText("Deposit subject to inspection.")).toBeTruthy();
  expect(screen.getByText("I consent to this exact electronic agreement and its saved policies.")).toBeTruthy();
  expect(screen.getAllByText(/₱5,000.00/).length).toBeGreaterThan(0);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  await user.upload(screen.getByLabelText("Upload a signature image"), image());
  await user.type(screen.getByLabelText("Full signer name"), "Someone Else");
  await user.click(screen.getByRole("checkbox"));
  expect((sign as HTMLButtonElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText("Full signer name"));
  await user.type(screen.getByLabelText("Full signer name"), "  synthetic   renter  ");
  await user.click(sign);
  expect(await screen.findByText(/Electronic consent recorded/)).toBeTruthy();
  const [url, options] = fetcher.mock.calls[1];
  expect(url).toBe("/api/booking-requests/request-1/agreement/sign");
  expect(options.method).toBe("POST");
  const form = options.body as FormData;
  expect([...form.keys()].sort()).toEqual(["agreementId", "consent", "digest", "file", "signerName", "version"]);
  expect(form.get("agreementId")).toBe("agreement-1"); expect(form.get("digest")).toBe("agreement-digest");
  expect(form.get("version")).toBe("7"); expect(form.get("consent")).toBe("true");
  expect(form.get("signerName")).toBe("synthetic renter");
  expect((form.get("file") as File).name).toBe("synthetic-mark.png");
  expect(options.headers).toBeUndefined();
  expect(screen.getByRole("img", { name: "Recorded signature of Synthetic Renter" }).getAttribute("src")).toBe("/api/booking-signatures/signature-1");
  expect(screen.queryByRole("button", { name: "Sign agreement" })).toBeNull();
});

it("prepares an agreement only from the exact accepted quotation", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response(operator));
  vi.stubGlobal("fetch", fetcher); render(<BookingAgreement requestId="request-1" />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Prepare agreement" }));
  await screen.findByRole("heading", { name: /Agreement version 2/ });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "ISSUE_AGREEMENT", version: 7, quoteId: "quote-1", digest: "quote-digest" });
});

it("requires a withdrawal reason and preserves exact agreement identity", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(operator)).mockResolvedValueOnce(response(ready));
  vi.stubGlobal("fetch", fetcher); render(<BookingAgreement requestId="request-1" />);
  const user = userEvent.setup(), withdraw = await screen.findByRole("button", { name: "Withdraw agreement" });
  expect((withdraw as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText("Agreement withdrawal reason"), "  Correct contact record first.  ");
  await user.click(withdraw);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "WITHDRAW_AGREEMENT", version: 7, agreementId: "agreement-1", digest: "agreement-digest", reason: "Correct contact record first." });
});

it.each([
  { ...ready, isOwner: true }, { ...ready, status: "UNDER_REVIEW" }, { ...ready, canIssue: false }, { ...ready, holdActive: false },
])("hides prepare controls when authority, accepted stage or live hold is absent", async state => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state))); render(<BookingAgreement requestId="request-1" />);
  await waitFor(() => expect(screen.queryByText("Loading agreement…")).toBeNull());
  expect(screen.queryByRole("button", { name: "Prepare agreement" })).toBeNull();
});

it.each([
  { ...owner, holdActive: false }, { ...owner, canSign: false }, { ...owner, status: "HOLD_EXPIRED" },
  { ...owner, acceptedQuote: { id: "quote-new", digest: "quote-new-digest" } },
])("keeps agreements read-only without current exact quotation and permission", async state => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state))); render(<BookingAgreement requestId="request-1" />);
  await screen.findByText("Island rental");
  expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByRole("button", { name: "Sign agreement" })).toBeNull();
});

it("locks stale controls and clears name, consent and image when reloading a new revision", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockResolvedValueOnce(response({ error: "Request changed." }, 409)).mockResolvedValueOnce(response({ ...owner, requestVersion: 9, agreement: { ...agreement, id: "agreement-2", digest: "new-digest", revision: 3 } }));
  vi.stubGlobal("fetch", fetcher); render(<BookingAgreement requestId="request-1" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Full signer name"), "Synthetic Renter");
  await user.upload(screen.getByLabelText("Upload a signature image"), image()); await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Sign agreement" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Reload agreement");
  expect((screen.getByRole("button", { name: "Sign agreement" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Reload agreement" }));
  await screen.findByRole("heading", { name: /Agreement version 3/ });
  expect((screen.getByLabelText("Full signer name") as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText("Upload a signature image") as HTMLInputElement).value).toBe("");
});

it("prevents duplicate signing while the image submission is in flight", async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce(response(owner)).mockReturnValueOnce(pending);
  vi.stubGlobal("fetch", fetcher); render(<BookingAgreement requestId="request-1" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Full signer name"), "Synthetic Renter");
  await user.upload(screen.getByLabelText("Upload a signature image"), image()); await user.click(screen.getByRole("checkbox"));
  const sign = screen.getByRole("button", { name: "Sign agreement" }); await user.dblClick(sign);
  expect((sign as HTMLButtonElement).disabled).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { finish(response(signed, 201)); });
});

it("uses server time plus elapsed time to disable signing when the hold expires", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2032-01-01T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(owner)));
  await act(async () => { render(<BookingAgreement requestId="request-1" />); });
  expect(screen.getByRole("button", { name: "Sign agreement" })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(61 * 60 * 1000); });
  expect(screen.queryByRole("button", { name: "Sign agreement" })).toBeNull();
  expect(screen.getByText(/hold has expired/i)).toBeTruthy();
});

it("preserves signed history after hold expiry without implying current authorization", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...signed, status: "HOLD_EXPIRED", holdActive: false, history: [{ id: "old-agreement", revision: 1, issuedAt: agreement.issuedAt, outcome: "SIGNED" }] })));
  render(<BookingAgreement requestId="request-1" />);
  expect(await screen.findByRole("img", { name: "Recorded signature of Synthetic Renter" })).toBeTruthy();
  expect(screen.getByText(/Version 1 · Signed/)).toBeTruthy();
  expect(screen.getByText(/does not authorize a new quotation/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /sign|withdraw|pay|print/i })).toBeNull();
});

it("rejects unsupported or oversized images and recovers a failed initial load", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ error: "Agreement unavailable." }, 503)).mockResolvedValueOnce(response(owner));
  vi.stubGlobal("fetch", fetcher); render(<BookingAgreement requestId="request-1" />);
  expect((await screen.findByRole("alert")).textContent).toContain("Agreement unavailable.");
  await userEvent.setup().click(screen.getByRole("button", { name: "Reload agreement" }));
  const upload = await screen.findByLabelText("Upload a signature image");
  fireEvent.change(upload, { target: { files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })] } });
  expect(screen.getByRole("alert").textContent).toContain("PNG or JPEG");
  fireEvent.change(upload, { target: { files: [new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" })] } });
  expect(screen.getByRole("alert").textContent).toContain("1 MB");
});

it("links the displayed immutable agreement to the protected printable view", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(owner)));
  render(<BookingAgreement requestId="request-1" />);
  const link = await screen.findByRole("link", { name: "View printable agreement" });
  expect(link.getAttribute("href")).toBe("/booking-agreements/agreement-1");
});


it("labels an older signed agreement as historical when another quotation is current", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...signed, status: "QUOTE_ACCEPTED", canIssue: false, acceptedQuote: { id: "quote-new", digest: "new-quote-digest" } })));
  render(<BookingAgreement requestId="request-1" />);
  await screen.findByRole("img", { name: "Recorded signature of Synthetic Renter" });
  expect(screen.getByText(/does not authorize a new quotation/)).toBeTruthy();
  expect(screen.queryByText(/Agreement signed. Payment is a later step/)).toBeNull();
});
