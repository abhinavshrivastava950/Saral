import { z } from "zod";
import { emptySalary, emptyScope, emptyDeclarations, fieldNames, labels, profileSchema, requiredFields, inr, type Filing, type Profile, type Salary, type FieldName } from "./domain";

export const connectionKinds=["tax","employer","bank","deductions"] as const;
export type ConnectionKind=typeof connectionKinds[number];
export const connectionLabels:Record<ConnectionKind,string>={tax:"Income Tax records",employer:"Employer Form 16",bank:"Bank & FD interest",deductions:"Loans & investments"};
export type Connection={kind:ConnectionKind;status:"not_connected"|"authorization_required"|"ready"|"unavailable"|"error";detail:string;reference?:string;authorizationUrl?:string;receivedAt?:string};
export type ChatMessage={id:string;role:"user"|"assistant";text:string;at:string};
export interface ChatState {
  messages:ChatMessage[];profileDraft:Partial<Profile>;connections:Connection[];fetchAttemptedAt:string|null;
  recordsConsentAt:string|null;pendingIssues:string[];factConfidence:Record<string,"high"|"medium"|"low">;
  evidence:Record<string,string>;confirmedAt:string|null;
}
export function initialConversation():ChatState{return {messages:[],profileDraft:{},connections:connectionKinds.map(kind=>({kind,status:"not_connected",detail:"Waiting for your authorization"})),fetchAttemptedAt:null,recordsConsentAt:null,pendingIssues:[],factConfidence:{},evidence:{},confirmedAt:null};}
export function effectiveProfile(f:Filing,stored:Profile):Profile{
  const draft=f.conversation?.profileDraft??{};
  const base=draft.pan&&stored.pan&&draft.pan!==stored.pan?profileSchema.parse({}):stored;
  return {...base,...draft};
}
export function maskSensitive(text:string){return text.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi,v=>v.slice(0,2)+"••••••"+v.slice(-2)).replace(/\b\d{9,18}\b/g,v=>"••••"+v.slice(-4));}
export const profileLabels:Record<keyof Profile,string>={name:"Name",pan:"PAN",dateOfBirth:"Date of birth",address:"Address",postalCode:"PIN code",bankAccount:"Refund bank account",ifsc:"IFSC"};
export const scopeLabels:Record<keyof Filing["scope"],string>={resident:"Resident and ordinarily resident in India",under60:"Within the supported adult age range",onlySalaryAndInterest:"Income limited to salary and bank interest",noSpecialCircumstances:"No special filing situations",employerType:"Employer category",npsIncludedInSalary:"Employer NPS included in gross salary",wantsDeductions:"Additional deductions beyond connected records"};
const tanQuestion="What is the employer TAN on your Form 16? Enter 4 letters, then 5 digits, then 1 letter. Check the letter O and the digit 0 carefully.";
export function nextChatQuestion(f:Filing,stored:Profile):{id:string;text:string;choices?:string[]}|null {
  const p=effectiveProfile(f,stored),c=f.conversation??initialConversation();
  if(!p.pan)return {id:"pan",text:"पहले अपना PAN बताइए। What is your PAN number? I’ll use it to identify the taxpayer when you authorize the official connections. Please don’t send an OTP or password."};
  if(c.connections.some(x=>x.status==="authorization_required"))return {id:"authorize",text:"Please complete the authorization shown below. I’ll fetch the available records after the provider confirms your permission."};
  if(!c.fetchAttemptedAt)return {id:"connect",text:"PAN noted. Let’s connect your tax and employer records first. I’ll check for salary, TDS, bank interest and available deduction information before asking you anything else."};
  if(!c.connections.some(x=>x.status==="ready"))return {id:"connections_unavailable",text:"The data connections are not available yet, so no taxpayer records have been fetched. Once the approved ERI and employer connections are set up, I can fetch first and ask only for gaps. I won’t ask you to fill a tax form instead."};
  if(c.pendingIssues[0]?.startsWith("salary.employerTan:"))return {id:"confirm:salary.employerTan",text:tanQuestion};
  if(c.pendingIssues.length){const issue=c.pendingIssues[0].replace(/\b(salary|profile|scope)\.([A-Za-z]+):/g,(_,section:string,key:string)=>`${(section==="salary"?labels:section==="profile"?profileLabels:scopeLabels)[key as never]??"This detail"}:`);return {id:"conflict",text:issue+" Please check the source and tell me the correct value."};}
  if(c.factConfidence["salary.employerTan"]&&c.factConfidence["salary.employerTan"]!=="high")return {id:"confirm:salary.employerTan",text:tanQuestion};
  for(const [key,confidence]of Object.entries(c.factConfidence))if(confidence!=="high")return {id:`confirm:${key}`,text:`I’m not certain about ${labels[key.replace("salary.","") as FieldName]??profileLabels[key.replace("profile.","") as keyof Profile]??key}. Please tell me the correct value or confirm the source before I use it.`};
  if([f.scope.resident,f.scope.under60,f.scope.onlySalaryAndInterest,f.scope.noSpecialCircumstances].includes(false))return {id:"assisted",text:"Your situation needs a wider tax flow than this release supports. I’ve kept your information and will not ask unrelated follow-up questions or prepare the wrong ITR."};
  if(f.scope.resident===null)return {id:"resident",text:"For April 2025–March 2026, were you resident and ordinarily resident in India? If you worked or lived abroad, tell me so I can check the right filing route.",choices:["Yes, resident in India","No / I lived abroad"]};
  if(f.scope.employerType===null)return {id:"employerType",text:"Is your employer a central government department, a state government department, or a PSU?",choices:["Central government","State government","PSU"]};
  if(!p.dateOfBirth)return {id:"dateOfBirth",text:"Your records didn’t include your date of birth. What is it? You can say it naturally, for example 12 June 1985."};
  if(f.scope.under60===null)return {id:"under60",text:"Were you aged 18–59 for this assessment year? This first release supports adult salaried taxpayers under 60.",choices:["Yes, 18–59","No"]};
  if(f.scope.onlySalaryAndInterest===null)return {id:"onlySalaryAndInterest",text:"Apart from salary and bank interest, did you have rent, share sales, business, agricultural, overseas or any other income during the year?",choices:["Only salary and bank interest","I have other income"]};
  if(f.scope.noSpecialCircumstances===null)return {id:"noSpecialCircumstances",text:"Do any special cases apply: company directorship, unlisted shares, foreign assets/signing authority, carried-forward losses, deferred ESOP tax, 194N TDS, clubbed income, special-rate income, Portuguese civil-code apportionment or salary-arrears relief?",choices:["None of these apply","One or more apply"]};
  if([f.scope.resident,f.scope.under60,f.scope.onlySalaryAndInterest,f.scope.noSpecialCircumstances].includes(false))return {id:"assisted",text:"Your situation needs a wider tax flow than this release supports. I’ve kept your information, but I won’t prepare or submit the wrong ITR. You can explain anything else here for review."};
  for(const key of ["employerName","employerTan","annualSalary","salaryTds","employerNps"] as FieldName[])if(f.salary[key]===null)return {id:`salary.${key}`,text:key==="employerTan"?tanQuestion:`The connected records are missing ${labels[key].toLowerCase()}. What does your employer’s annual record say? Tell me the value and source; I’ll fill it in.`};
  if((f.salary.employerNps??0)>0){if(f.salary.basicDa===null)return {id:"salary.basicDa",text:"What annual basic salary plus eligible DA does payroll show for the employer NPS calculation?"};if(f.scope.npsIncludedInSalary===null)return {id:"npsIncludedInSalary",text:"Does the annual gross salary already include the employer’s NPS contribution? This avoids counting the deduction twice.",choices:["Yes, already included","No / I’m not sure"]};}
  for(const [key,text]of [["savingsInterest","Did you earn savings-account interest across your banks? Tell me the annual interest, or say zero only if you checked there was none."],["depositInterest","Did you earn any FD or RD interest? I need the annual interest earned, not the deposit balance."],["otherTds","How much TDS was deducted from bank interest? If the bank statement shows none, tell me zero."]] as const)if(f.salary[key]===null)return {id:`salary.${key}`,text};
  if(f.demo?.scenario==="upload-form16"&&f.demo.homeLoanAnswer==null)return {id:"demo.homeLoan",text:"Do you have a home loan for this financial year? Say yes or no. If yes, tell me the annual interest and source; I’ll flag the claim for eligibility review rather than assume a deduction.",choices:["No home loan","Yes, I have a home loan"]};
  if(f.scope.wantsDeductions===null)return {id:"wantsDeductions",text:"Is there a loan, investment, insurance payment, HRA claim or other deduction not already in these records? Tell me about it; I’ll check how it affects the comparison.",choices:["Nothing else to add","I have a loan or deduction"]};
  if(f.scope.wantsDeductions||(["eligible80C","eligible80D","professionalTax","hraExemption"] as const).some(key=>f.salary[key]!==null))for(const key of ["eligible80C","eligible80D","professionalTax","hraExemption"] as FieldName[])if(f.salary[key]===null)return {id:`salary.${key}`,text:`The records don’t confirm ${labels[key].toLowerCase()}. Tell me the eligible annual amount and source, or zero if it does not apply. I’ll keep uncertain claims flagged.`};
  for(const key of ["name","address","postalCode","bankAccount","ifsc"] as const)if(!p[key])return {id:`profile.${key}`,text:`Your connected records are missing ${profileLabels[key].toLowerCase()}. Please tell me that detail here so the return can be completed.`};
  return null;
}
export function chatReady(f:Filing,p:Profile){return nextChatQuestion(f,p)===null;}
export function withConfirmedFacts(f:Filing):Filing{return {...f,confirmedFields:fieldNames.filter(k=>f.salary[k]!==null)};}
export function reviewFacts(f:Filing,p:Profile){const profile=effectiveProfile(f,p);return [
  ...Object.entries(profile).filter(([,v])=>v).map(([key,v])=>({label:profileLabels[key as keyof Profile],value:key==="pan"||key==="bankAccount"?maskSensitive(v):v})),
  ...fieldNames.filter(k=>f.salary[k]!==null).map(key=>({label:labels[key],value:typeof f.salary[key]==="number"?inr(f.salary[key] as number):String(f.salary[key])})),
  ...Object.entries(f.scope).filter(([,value])=>value!==null).map(([key,value])=>({label:scopeLabels[key as keyof Filing["scope"]],value:typeof value==="boolean"?value?"Yes":"No":String(value)})),
  ...(f.declarations.loans.length?[{label:"Loans recorded for review",value:f.declarations.loans.join(", ")}]:[]),
  ...(f.demo?.scenario==="upload-form16"&&f.demo.homeLoanAnswer!==null&&f.demo.homeLoanAnswer!==undefined?[{label:"Home loan disclosed",value:f.demo.homeLoanAnswer?"Yes — eligibility review required":"No"}]:[]),
  ...(f.declarations.loanNotes?[{label:"Loan details",value:f.declarations.loanNotes}]:[]),
  ...(f.declarations.additionalIncomeNotes?[{label:"Other information for review",value:f.declarations.additionalIncomeNotes}]:[]),
  ...(f.declarations.sourceNotes?[{label:"Sources",value:f.declarations.sourceNotes}]:[]),
];}
export const chatExtractionSchema=z.object({
  changes:z.array(z.object({section:z.enum(["salary","profile","scope","declarations"]),key:z.string().max(40),value:z.union([z.string(),z.number(),z.boolean(),z.array(z.string()),z.null()]),confidence:z.enum(["high","medium","low"]),evidence:z.string().max(250)})).max(45),
  uncertainties:z.array(z.string().max(300)).max(10),
});
export type ChatExtraction=z.infer<typeof chatExtractionSchema>;
