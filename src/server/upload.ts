import "server-only";
import { randomUUID } from "node:crypto";
import { proposalSchema, salarySchema, type FieldName, type Filing, type Proposal, type Salary } from "@/lib/domain";
import { initialConversation, maskSensitive } from "@/lib/chat";
import { assertEditable } from "./filings";
import { auditEvent, saveFiling } from "./repository";
import { AppError } from "./errors";

// A Form 16 does not establish bank interest or TDS deducted by a bank.
export const form16Fields = [
  "employerName", "employerTan", "annualSalary", "salaryTds", "employerNps", "basicDa",
  "eligible80C", "eligible80D", "professionalTax", "hraExemption",
] as const satisfies readonly FieldName[];
const form16FieldSet = new Set<FieldName>(form16Fields);

const safeText = (text: string) => maskSensitive(text)
  .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "•••• •••• ••••");

export function safeForm16Proposal(raw: Proposal): Proposal {
  const proposal = proposalSchema.parse(raw);
  return {
    ...proposal,
    message: safeText(proposal.message),
    warnings: proposal.warnings.map(safeText),
    fields: proposal.fields.map(field => ({
      ...field,
      value: typeof field.value === "string" ? safeText(field.value) : field.value,
      evidence: safeText(field.evidence),
    })),
    declarations: {
      ...proposal.declarations,
      loanNotes: safeText(proposal.declarations.loanNotes),
      additionalIncomeNotes: safeText(proposal.declarations.additionalIncomeNotes),
      sourceNotes: safeText(proposal.declarations.sourceNotes),
    },
  };
}

export async function storeForm16Proposal(filing: Filing, raw: Proposal, requestId: string) {
  assertEditable(filing);
  if (filing.pending) throw new AppError(409, "proposal_pending", "Review or discard the previous extraction before uploading another document.");
  const proposal = safeForm16Proposal(raw);
  if (!proposal.fields.some(field => form16FieldSet.has(field.key) && field.value !== null && salarySchema.shape[field.key].safeParse(field.value).success)) {
    throw new AppError(422, "no_form16_fields", "I could not read any supported Form 16 values. Try a clearer annual certificate.");
  }
  const now = new Date().toISOString();
  const conversation = filing.conversation ? { ...filing.conversation, confirmedAt: null } : undefined;
  return saveFiling({ ...filing, pending: proposal, pendingKind: "form16", conversation, aiConsentAt: now, status: "draft", reviewHash: null, reviewConfirmedAt: null, revision: filing.revision + 1, updatedAt: now },
    filing.revision, auditEvent(filing.ownerId, filing.id, "document.extracted_for_review", requestId, { proposedFields: proposal.fields.length }));
}

export async function confirmForm16Proposal(filing: Filing, revision: number, selectedKeys: FieldName[], requestId: string) {
  assertEditable(filing);
  if (revision !== filing.revision) throw new AppError(409, "revision_conflict", "This draft changed. Refresh before confirming the extraction.");
  if (!filing.pending || filing.pendingKind !== "form16") throw new AppError(409, "proposal_required", "Upload and review a Form 16 before confirming its values.");
  const next = structuredClone(filing);
  const proposal = next.pending!;
  const conversation = next.conversation ??= initialConversation();
  const accepted: FieldName[] = [];
  const acceptedValues: Partial<Salary> = {};
  if (new Set(selectedKeys).size !== selectedKeys.length) throw new AppError(400, "duplicate_fields", "Choose each extracted field only once.");
  const proposed = new Map(proposal.fields.map(field => [field.key, field]));
  for (const key of selectedKeys) {
    const field = proposed.get(key);
    if (!form16FieldSet.has(key) || !field || field.value === null || field.confidence === "low" || !salarySchema.shape[key].safeParse(field.value).success)
      throw new AppError(422, "unconfirmed_field", "Only valid, supported Form 16 values shown in the extraction can be selected.");
  }
  conversation.pendingIssues = conversation.pendingIssues.filter(issue => !selectedKeys.some(key => issue.startsWith(`salary.${key}:`)));
  for (const key of selectedKeys) {
    delete conversation.factConfidence[`salary.${key}`];
    delete conversation.evidence[`salary.${key}`];
  }
  for (const field of proposal.fields) {
    if (!selectedKeys.includes(field.key)) continue;
    const parsed = salarySchema.shape[field.key].safeParse(field.value);
    if (!parsed.success) continue; // Exhaustively checked above.
    (acceptedValues as Record<FieldName, Salary[FieldName]>)[field.key] = parsed.data as Salary[FieldName];
    accepted.push(field.key);
    conversation.factConfidence[`salary.${field.key}`] = field.confidence;
    conversation.evidence[`salary.${field.key}`] = `User-confirmed Form 16 extraction: ${field.evidence}`.slice(0, 250);
  }
  next.salary = salarySchema.parse({ ...next.salary, ...acceptedValues });
  if (next.demo && accepted.length) { next.prefill = null; next.prefillSource = "unavailable"; }
  if (accepted.includes("annualSalary") || accepted.includes("employerNps")) next.scope.npsIncludedInSalary = null;
  if (accepted.length && (proposal.declarations.loans.length || proposal.declarations.loanNotes || proposal.declarations.additionalIncomeNotes)) {
    conversation.pendingIssues.push("document: Other income or loan details in this document need separate chat review; no deduction was assumed.");
  }
  conversation.pendingIssues = conversation.pendingIssues.slice(0, 12);
  if (accepted.length) conversation.connections = conversation.connections.map(connection => connection.kind === "employer"
    ? { ...connection, status: "ready", detail: "User-uploaded Form 16 · reviewed AI extraction · no raw file retained", reference: "USER-UPLOAD", receivedAt: new Date().toISOString() }
    : connection);
  conversation.messages.push({ id: randomUUID(), role: "assistant", at: new Date().toISOString(), text: `I added ${accepted.length} reviewed Form 16 value${accepted.length === 1 ? "" : "s"} to your draft. I will ask about anything missing or uncertain. This is still a ${next.demo ? "fictional demo" : "draft"}; no ITR has been filed.` });
  conversation.confirmedAt = null;
  next.confirmedFields = [];
  next.pending = null;
  next.pendingKind = null;
  next.status = "draft";
  next.reviewHash = null;
  next.reviewConfirmedAt = null;
  const now = new Date().toISOString();
  next.revision = filing.revision + 1;
  next.updatedAt = now;
  return saveFiling(next, filing.revision, auditEvent(filing.ownerId, filing.id, "document.extraction_confirmed", requestId, { acceptedFields: accepted.length }));
}

export async function rejectForm16Proposal(filing: Filing, revision: number, requestId: string) {
  assertEditable(filing);
  if (revision !== filing.revision) throw new AppError(409, "revision_conflict", "This draft changed. Refresh before discarding the extraction.");
  if (!filing.pending || filing.pendingKind !== "form16") throw new AppError(409, "proposal_required", "There is no Form 16 extraction awaiting review.");
  const now = new Date().toISOString();
  return saveFiling({ ...filing, pending: null, pendingKind: null, revision: filing.revision + 1, updatedAt: now }, filing.revision,
    auditEvent(filing.ownerId, filing.id, "document.extraction_discarded", requestId));
}
