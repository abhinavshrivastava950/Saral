import "server-only";
import {profileSchema,type Filing,type Profile} from "@/lib/domain";
import {effectiveProfile,maskSensitive,nextChatQuestion,withConfirmedFacts} from "@/lib/chat";
import {calculateTax} from "@/lib/tax";
import {filingIssues,preparationIssues,taxInput} from "@/lib/validation";

/** Latest saved state and code-calculated amounts, not a model's memory of the page. */
export function currentReturnContext(f:Filing,stored:Profile=profileSchema.parse({})){
  const candidate=withConfirmedFacts(f),profile=effectiveProfile(f,stored);let calculations=null;
  if(!preparationIssues(candidate).some(x=>x.severity==="error")&&!f.conversation?.pendingIssues.length)calculations={new:calculateTax(taxInput(candidate,"new")),old:calculateTax(taxInput(candidate,"old"))};
  return {
    revision:f.revision,assessmentYear:f.year,status:f.status,isDemo:Boolean(f.demo),demoPhase:f.demo?.phase??null,selectedRegime:f.regime,
    recommendedRegime:calculations?(calculations.old.coreTaxLiability<calculations.new.coreTaxLiability?"old":"new"):null,
    officialSubmissionConfirmed:Boolean(f.officialReference),officialAcknowledgementConfirmed:Boolean(f.acknowledgement),
    salary:f.salary,scope:f.scope,declarations:f.declarations,
    profileCompleteness:Object.fromEntries(Object.entries(profile).map(([key,value])=>[key,Boolean(value)])),
    calculations,calculationWarning:"These figures are computed by code and are provisional. Quote supplied results; do not perform tax arithmetic. No estimate guarantees a refund.",
    approvalRecorded:Boolean(f.reviewConfirmedAt&&f.reviewHash),approvalNotice:"Any recorded approval must still match the latest snapshot before submission.",nextQuestion:nextChatQuestion(f,stored),pendingIssues:f.conversation?.pendingIssues??[],
    validations:filingIssues(f,profile).map(({code,field,severity,message})=>({code,field,severity,message})),
    sourceStatus:f.conversation?.connections.map(({kind,status})=>({kind,status}))??[],
    recentConversation:f.conversation?.messages.slice(-6).map(({role,text})=>({role,text:maskSensitive(text).slice(0,1500)}))??[],
  };
}
