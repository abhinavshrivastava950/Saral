import "server-only";
import { randomUUID } from "node:crypto";
import { ASSESSMENT_YEAR,emptySalary,emptyScope,emptyDeclarations,type Filing,type Profile,editableFilingSchema } from "@/lib/domain";
import { calculateTax } from "@/lib/tax";
import { filingIssues,preparationIssues,taxInput } from "@/lib/validation";
import { hash } from "./crypto";
import { saveFiling,getProfile,auditEvent } from "./repository";
import { AppError } from "./errors";
import { eri,preparationPacket } from "./eri";
import { initialConversation,effectiveProfile,nextChatQuestion,reviewFacts,chatReady,withConfirmedFacts } from "@/lib/chat";
export async function createFiling(ownerId:string,requestId:string){
  const now=new Date().toISOString();const f:Filing={id:randomUUID(),ownerId,year:ASSESSMENT_YEAR,revision:0,createdAt:now,updatedAt:now,status:"draft",salary:emptySalary(),scope:emptyScope(),declarations:emptyDeclarations(),confirmedFields:[],pending:null,regime:"new",processingConsentAt:now,aiConsentAt:null,prefillConsentAt:null,prefill:null,prefillSource:"unavailable",reviewHash:null,reviewConfirmedAt:null,officialReference:null,acknowledgement:null,paymentStatus:"unavailable",submissionKey:null};
  f.conversation=initialConversation();return saveFiling(f,null,auditEvent(ownerId,f.id,"filing.created_with_consent",requestId));
}
export function assertEditable(f:Filing){if(!["draft","prepared"].includes(f.status)||f.demo?.phase==="submitted"||f.demo?.phase==="verified")throw new AppError(409,"filing_locked","A submitted return cannot be changed in this workflow. Start a new demo to try another scenario.");}
export async function updateFiling(f:Filing,raw:unknown,requestId:string){
  assertEditable(f);const patch=editableFilingSchema.parse(raw);
  if(patch.revision!==f.revision)throw new AppError(409,"revision_conflict","Your return changed. Reload before saving.");
  const {revision:_,...fields}=patch;
  let confirmed=patch.confirmedFields??f.confirmedFields;
  if(patch.salary&&!patch.confirmedFields)confirmed=confirmed.filter(k=>f.salary[k]===patch.salary![k]);
  const salary=patch.salary??f.salary;confirmed=confirmed.filter(k=>salary[k]!==null);
  const updated={...f,...fields,salary,confirmedFields:[...new Set(confirmed)],status:"draft" as const,pending:null,reviewHash:null,reviewConfirmedAt:null,revision:f.revision+1,updatedAt:new Date().toISOString()};
  return saveFiling(updated,f.revision,auditEvent(f.ownerId,f.id,"filing.fields_confirmed",requestId,{fieldCount:confirmed.length}));
}
export function snapshotHash(f:Filing,p:Profile){return hash({year:f.year,salary:f.salary,scope:f.scope,declarations:f.declarations,confirmed:f.confirmedFields,regime:f.regime,prefill:f.prefill,profile:effectiveProfile(f,p),rule:"AY2026-27-salary-v1"});}
function chatCandidate(f:Filing){
  const candidate=withConfirmedFacts(f);
  if(!preparationIssues(candidate).some(i=>i.severity==="error")){
    const newer=calculateTax(taxInput(candidate,"new")),older=calculateTax(taxInput(candidate,"old"));
    candidate.regime=older.coreTaxLiability<newer.coreTaxLiability?"old":"new";
  }
  return candidate;
}
export async function viewFiling(f:Filing){
  const stored=await getProfile(f.ownerId),profile=effectiveProfile(f,stored);const candidate=chatCandidate(f);const issues=preparationIssues(f);let estimates=null;
  if(!preparationIssues(candidate).some(i=>i.severity==="error")&&!f.conversation?.pendingIssues.length)estimates={new:calculateTax(taxInput(candidate,"new")),old:calculateTax(taxInput(candidate,"old"))};
  const problem=preparationIssues(candidate).find(issue=>issue.severity==="error");
  const finishedDemo=f.demo?.phase==="submitted"||f.demo?.phase==="verified";
  const question=finishedDemo?null:nextChatQuestion(f,stored)??(problem?{id:"validation",text:problem.message+" Please clarify the information and its source in chat."}:null);
  return {filing:f,estimates,preparationIssues:issues,filingIssues:filingIssues(f,profile),reviewHash:snapshotHash(f,stored),chatQuestion:question,chatFacts:reviewFacts(f,stored),chatCanReview:!finishedDemo&&chatReady(f,stored)&&estimates!==null,chatReviewHash:snapshotHash(candidate,stored),recommendedRegime:candidate.regime};
}
export async function confirmChatReview(f:Filing,expectedHash:string,requestId:string){
  assertEditable(f);const profile=await getProfile(f.ownerId),candidate=chatCandidate(f);
  if(!chatReady(f,profile)||preparationIssues(candidate).some(i=>i.severity==="error"))throw new AppError(422,"chat_incomplete","There are still missing or uncertain facts. Please resolve them in the conversation first.");
  if(snapshotHash(candidate,profile)!==expectedHash)throw new AppError(409,"review_changed","Some details changed. Please read the latest summary before approving it.");
  const now=new Date().toISOString();candidate.conversation??=initialConversation();candidate.conversation.confirmedAt=now;
  candidate.conversation.messages.push({id:randomUUID(),role:"assistant",at:now,text:f.demo?"Your demo summary is approved. The calculation checks have run. You can now simulate submission and verification; no real return will be filed.":"Your summary is approved. I have not submitted the return. Official filing is enabled only after the remaining validation and integration checks pass."});
  return saveFiling({...candidate,status:"prepared",reviewHash:expectedHash,reviewConfirmedAt:now,revision:f.revision+1,updatedAt:now},f.revision,auditEvent(f.ownerId,f.id,"chat.review_confirmed",requestId));
}
export async function confirmReview(f:Filing,expectedHash:string,requestId:string){
  assertEditable(f);const profile=await getProfile(f.ownerId);
  if(preparationIssues(f).some(i=>i.severity==="error"))throw new AppError(422,"incomplete_return","Confirm your salary details and eligibility first.");
  const currentHash=snapshotHash(f,profile);if(currentHash!==expectedHash)throw new AppError(409,"review_changed","Details changed after review. Please review the latest version.");
  return saveFiling({...f,status:"prepared",reviewHash:currentHash,reviewConfirmedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:f.revision+1},f.revision,auditEvent(f.ownerId,f.id,"review.confirmed",requestId));
}
export async function submitFiling(f:Filing,confirmedHash:string,requestId:string){
  if(f.demo)throw new AppError(403,"demo_cannot_file","Demo records can never be sent to the official filing service.");
  const profile=effectiveProfile(f,await getProfile(f.ownerId));
  if(f.status!=="prepared"||!f.reviewConfirmedAt||f.reviewHash!==confirmedHash||snapshotHash(f,profile)!==confirmedHash)throw new AppError(409,"review_required","Review and explicitly approve the current return before submission.");
  const issues=filingIssues(f,profile);if(issues.some(i=>i.severity==="error"))throw new AppError(422,"filing_blocked","Submission is blocked by unresolved validation checks. Your return has not been filed.");
  const adapter=eri();if(adapter.mode!=="official")throw new AppError(503,"eri_unavailable","Official filing is not connected.");
  const generated=await adapter.generateItrPayload(preparationPacket(f,profile));const validation=await adapter.validateItr(generated.payload);
  if(!validation.official||!validation.valid)throw new AppError(422,"official_validation_failed","The official validator rejected the return. Please resolve the errors.");
  const key=f.submissionKey??randomUUID();
  // Persist intent BEFORE sending. On a timeout this remains pending and must be reconciled, never blindly retried.
  const pending=await saveFiling({...f,status:"submission_pending",submissionKey:key,revision:f.revision+1,updatedAt:new Date().toISOString()},f.revision,auditEvent(f.ownerId,f.id,"submission.started",requestId));
  const result=await adapter.submitItr({payload:generated.payload,idempotencyKey:key,consentHash:confirmedHash});
  return saveFiling({...pending,status:"submitted",officialReference:result.reference,revision:pending.revision+1,updatedAt:new Date().toISOString()},pending.revision,auditEvent(f.ownerId,f.id,"submission.officially_confirmed",requestId));
}
