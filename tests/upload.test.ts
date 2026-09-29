import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDeclarations, emptySalary, emptyScope, profileSchema, type Filing, type Proposal } from "../src/lib/domain";
import { initialConversation } from "../src/lib/chat";

const state = vi.hoisted(() => ({ save: vi.fn(), profile: vi.fn() }));
vi.mock("@/server/repository", () => ({
  saveFiling: state.save,
  getProfile: state.profile,
  auditEvent: (ownerId: string, filingId: string, action: string) => ({ ownerId, filingId, action }),
}));
import { confirmForm16Proposal, rejectForm16Proposal, storeForm16Proposal } from "../src/server/upload";
import { confirmChatReview, updateFiling, viewFiling } from "../src/server/filings";

function filing(): Filing {
  const c = initialConversation();
  c.profileDraft = { name: "Fictional Worker", pan: "AAPPS1234A", dateOfBirth: "1988-08-15", address: "Fictional address", postalCode: "110001", bankAccount: "000001234567", ifsc: "DEMO0123456" };
  c.connections = c.connections.map(connection => ({ ...connection, status: "ready" }));
  c.fetchAttemptedAt = "2026-09-27T00:00:00Z";
  c.factConfidence["salary.annualSalary"] = "high";
  return {
    id: "00000000-0000-4000-8000-000000000001", ownerId: "owner", year: "2026-27", revision: 3,
    createdAt: "2026-09-27T00:00:00Z", updatedAt: "2026-09-27T00:00:00Z", status: "prepared",
    salary: { ...emptySalary(), employerName: "Demo Employer", employerTan: "DEMO12345A", annualSalary: 1440000, salaryTds: 100000, savingsInterest: 7200, depositInterest: 18000, otherTds: 1800, employerNps: 0, eligible80C: 150000, eligible80D: 25000, professionalTax: 2400, hraExemption: 0 },
    scope: { ...emptyScope(), resident: true, under60: true, onlySalaryAndInterest: true, noSpecialCircumstances: true, employerType: "state", wantsDeductions: true },
    declarations: emptyDeclarations(), confirmedFields: ["annualSalary"], pending: null, regime: "new",
    processingConsentAt: "2026-09-27T00:00:00Z", aiConsentAt: null, prefillConsentAt: null, prefill: null, prefillSource: "unavailable",
    reviewHash: "old-review", reviewConfirmedAt: "2026-09-27T00:00:00Z", officialReference: null, acknowledgement: null,
    paymentStatus: "unavailable", submissionKey: null, conversation: c,
    demo: { scenario: "complete", phase: "records_ready", reference: null, acknowledgement: null },
  };
}

function proposal(): Proposal {
  return {
    fields: [
      { key: "annualSalary", value: 1520000, confidence: "high", evidence: "Part B, annual gross salary" },
      { key: "salaryTds", value: 110000, confidence: "medium", evidence: "Part A, TDS total" },
      { key: "employerName", value: "Sample Treasury", confidence: "high", evidence: "Employer heading" },
      { key: "depositInterest", value: 990000, confidence: "high", evidence: "Not a Form 16 field" },
      { key: "eligible80D", value: 40000, confidence: "low", evidence: "Unclear insurance row" },
    ],
    message: "Review the salary values for AAPPS1234A.", warnings: [],
    declarations: { loans: [], loanInterest: null, loanNotes: "", additionalIncomeNotes: "", sourceNotes: "" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.save.mockImplementation(async (f: Filing) => f);
  state.profile.mockResolvedValue(profileSchema.parse({}));
});

describe("user-reviewed Form 16 extraction", () => {
  it("stores only a masked proposal and invalidates earlier approval without modifying salary", async () => {
    const source = filing();
    const pending = await storeForm16Proposal(source, proposal(), "request");
    expect(pending.salary).toEqual(source.salary);
    expect(pending.pending?.fields).toHaveLength(5);
    expect(pending.pending?.message).not.toContain("AAPPS1234A");
    expect(pending.status).toBe("draft");
    expect(pending.reviewHash).toBeNull();
    expect(pending.reviewConfirmedAt).toBeNull();
    expect((await viewFiling(pending)).chatCanReview).toBe(false);
    await expect(confirmChatReview(pending, "old-review", "request")).rejects.toMatchObject({ code: "proposal_pending" });
    await expect(updateFiling(pending, { revision: pending.revision, salary: pending.salary }, "request")).rejects.toMatchObject({ code: "proposal_pending" });
  });

  it("applies only explicitly selected supported values and leaves bank data untouched", async () => {
    const pending = await storeForm16Proposal(filing(), proposal(), "request");
    const confirmed = await confirmForm16Proposal(pending, pending.revision, ["annualSalary", "salaryTds"], "request");
    expect(confirmed.salary.annualSalary).toBe(1520000);
    expect(confirmed.salary.salaryTds).toBe(110000);
    expect(confirmed.salary.employerName).toBe("Demo Employer");
    expect(confirmed.salary.depositInterest).toBe(18000);
    expect(confirmed.salary.eligible80D).toBe(25000);
    expect(confirmed.pending).toBeNull();
    expect(confirmed.conversation?.factConfidence["salary.salaryTds"]).toBe("medium");
    expect((await viewFiling(confirmed)).chatQuestion?.id).toBe("confirm:salary.salaryTds");
    expect(confirmed.reviewConfirmedAt).toBeNull();
  });

  it("rejects an unsupported, uncertain or fabricated selected value", async () => {
    const pending = await storeForm16Proposal(filing(), proposal(), "request");
    for (const key of ["depositInterest", "eligible80D", "savingsInterest"] as const)
      await expect(confirmForm16Proposal(pending, pending.revision, [key], "request")).rejects.toMatchObject({ code: "unconfirmed_field" });
    await expect(confirmForm16Proposal(pending, pending.revision, ["annualSalary", "annualSalary"], "request")).rejects.toMatchObject({ code: "duplicate_fields" });
    await expect(confirmForm16Proposal(pending, pending.revision - 1, ["annualSalary"], "request")).rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("discards the proposal without changing any financial value", async () => {
    const source = filing();
    const pending = await storeForm16Proposal(source, proposal(), "request");
    const discarded = await rejectForm16Proposal(pending, pending.revision, "request");
    expect(discarded.salary).toEqual(source.salary);
    expect(discarded.pending).toBeNull();
  });

  it("does not accept a document after demo submission", async () => {
    const source = filing();
    source.demo!.phase = "submitted";
    await expect(storeForm16Proposal(source, proposal(), "request")).rejects.toMatchObject({ code: "filing_locked" });
  });
});
