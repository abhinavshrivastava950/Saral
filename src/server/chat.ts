import "server-only";
import { randomUUID } from "node:crypto";
import { declarationsSchema, emptyDeclarations, emptySalary, emptyScope, salarySchema, scopeSchema, profileSchema, labels, type Filing,type Profile,type FieldName } from "@/lib/domain";
import { initialConversation,maskSensitive,nextChatQuestion,effectiveProfile,profileLabels,scopeLabels,type ChatExtraction } from "@/lib/chat";
import { assertEditable } from "./filings";
import { audit,auditEvent,saveFiling } from "./repository";
import { AppError } from "./errors";
import { interpretAnswer } from "./chat-ai";
import { fetchAuthorizedRecords } from "./records";
import {isKnowledgeQuestion,answerTaxQuestion} from "./knowledge";
import type {VoiceLanguage} from "@/lib/voice-language";

export function chatMessage(role:"user"|"assistant",text:string){return {id:randomUUID(),role,text:maskSensitive(text),at:new Date().toISOString()};}
export function applyChatExtraction(f:Filing,extraction:ChatExtraction):{filing:Filing;changes:string[]}{
  const next=structuredClone(f);const c=next.conversation??=initialConversation();const changes:string[]=[];const seen=new Set<string>();
  for(const change of extraction.changes){
    const key=`${change.section}.${change.key}`;if(seen.has(key))throw new AppError(422,"ambiguous_answer","I found two conflicting values for the same detail. Please clarify that one amount.");seen.add(key);
    if(change.section==="profile"&&change.key==="pan")continue;
    const shape=change.section==="salary"?salarySchema.shape:change.section==="profile"?profileSchema.shape:change.section==="scope"?scopeSchema.shape:declarationsSchema.shape;
    const schema=Object.hasOwn(shape,change.key)?(shape as Record<string,{safeParse:(v:unknown)=>{success:boolean;data?:unknown}}>)[change.key]:undefined;
    const value=key==="salary.employerTan"&&typeof change.value==="string"?change.value.trim().toUpperCase():change.value;
    const parsed=schema?.safeParse(value);
    if(!parsed?.success){const issue=`${key}: I could not validate this value.`;if(!c.pendingIssues.includes(issue))c.pendingIssues.push(issue);continue;}
    if(change.value===null){c.factConfidence[key]="low";continue;}
    const target=(change.section==="profile"?c.profileDraft:next[change.section]) as Record<string,unknown>;
    target[change.key]=parsed.data;c.factConfidence[key]=change.confidence;c.evidence[key]=maskSensitive(change.evidence);
    c.pendingIssues=c.pendingIssues.filter(x=>!x.startsWith(key+":"));
    const label=change.section==="salary"?labels[change.key as FieldName]:change.section==="profile"?profileLabels[change.key as keyof Profile]:change.section==="scope"?scopeLabels[change.key as keyof Filing["scope"]]:change.key;
    const display=typeof parsed.data==="boolean"?parsed.data?"Yes":"No":Array.isArray(parsed.data)?parsed.data.length?parsed.data.join(", "):"None stated":String(parsed.data);
    changes.push(`${label}: ${maskSensitive(display)}`);
  }
  if(next.demo?.scenario==="upload-form16"){
    const loanAnswer=extraction.changes.find(change=>change.section==="declarations"&&change.key==="loans"&&Array.isArray(change.value));
    if(loanAnswer&&Array.isArray(loanAnswer.value))next.demo.homeLoanAnswer=loanAnswer.value.includes("home");
  }
  if(changes.length)c.pendingIssues=c.pendingIssues.filter(issue=>!issue.startsWith("answer:"));
  for(const issue of extraction.uncertainties){const message="answer: "+maskSensitive(issue);if(!c.pendingIssues.includes(message))c.pendingIssues.push(message);}
  const dob=c.profileDraft.dateOfBirth;
  if(dob&&profileSchema.shape.dateOfBirth.safeParse(dob).success)next.scope.under60=dob>"1966-04-01"&&dob<="2008-03-31";
  c.pendingIssues=c.pendingIssues.slice(0,12);c.confirmedAt=null;next.confirmedFields=[];next.reviewHash=null;next.reviewConfirmedAt=null;next.status="draft";next.pending=null;next.pendingKind=null;
  return {filing:next,changes};
}
async function persistChat(original:Filing,next:Filing,requestId:string,action:string){
  next.revision=original.revision+1;next.updatedAt=new Date().toISOString();
  if(next.conversation!.messages.length>240)throw new AppError(409,"conversation_limit","This conversation has reached its message limit. Please contact support before continuing.");
  return saveFiling(next,original.revision,auditEvent(next.ownerId,next.id,action,requestId));
}
export async function sendChatMessage(f:Filing,text:string,aiConsent:boolean,profile:Profile,requestId:string,language:VoiceLanguage="auto"):Promise<Filing>{
  assertEditable(f);
  if(f.pending)throw new AppError(409,"proposal_pending","Review or discard the document extraction before continuing the conversation.");
  const next=structuredClone(f),c=next.conversation??=initialConversation();
  const panMatches=text.toUpperCase().match(/\b[A-Z]{5}\d{4}[A-Z]\b/g);
  if(f.demo&&panMatches?.length)throw new AppError(422,"demo_identity","This demo uses Aarav’s fictional profile. Please do not enter a real PAN.");
  if(panMatches?.length&&new Set(panMatches).size>1)throw new AppError(422,"multiple_pans","Please send only the PAN for the person whose return we are preparing.");
  c.messages.push(chatMessage("user",text));
  if(isKnowledgeQuestion(text)){
    if(!aiConsent)throw new AppError(403,"ai_consent_required","Please allow AI processing before sending a question to the assistants.");
    await audit(auditEvent(f.ownerId,f.id,"knowledge.processing_consented",requestId));
    c.messages.push(chatMessage("assistant",await answerTaxQuestion(text,language,f,profile)));
    return persistChat(f,next,requestId,"knowledge.answered");
  }
  if(panMatches?.[0]){
    const old=effectiveProfile(f,profile).pan,pan=panMatches[0];
    if(old&&old!==pan){next.salary=emptySalary();next.scope=emptyScope();next.declarations=emptyDeclarations();next.prefill=null;next.prefillSource="unavailable";next.prefillConsentAt=null;next.conversation={...initialConversation(),messages:c.messages};}
    const state=next.conversation!;state.profileDraft.pan=pan;state.confirmedAt=null;next.confirmedFields=[];next.reviewHash=null;next.reviewConfirmedAt=null;next.status="draft";
    state.messages.push(chatMessage("assistant",old&&old!==pan?"PAN changed. I cleared the previous taxpayer’s fetched data and approvals. Please authorize records for this PAN.":"PAN noted securely. I’ll connect your records first, so you don’t have to type information the providers already have."));
    return persistChat(f,next,requestId,"chat.pan_recorded");
  }
  const question=nextChatQuestion(next,profile);
  if(!effectiveProfile(next,profile).pan||question?.id==="connect"||question?.id==="authorize"||question?.id==="connections_unavailable"){
    c.messages.push(chatMessage("assistant",question?.text??"Let’s connect the records before I ask you for missing information."));
    return persistChat(f,next,requestId,"chat.message_recorded");
  }
  if(!aiConsent)throw new AppError(403,"ai_consent_required","Please allow AI processing of your chosen answer before continuing.");
  await audit(auditEvent(f.ownerId,f.id,"ai.chat_processing_consented",requestId));
  // Exact identifiers use deterministic format validation; never guess O/0 substitutions.
  let extracted:ChatExtraction;
  const tanExpected=question?.id==="salary.employerTan"||question?.id==="confirm:salary.employerTan";
  const bareTan=text.trim().toUpperCase();
  const bankMatch=text.match(/\b\d{9,18}\b/);
  if(tanExpected&&/^[A-Z0-9]{10}$/.test(bareTan)){
    if(!salarySchema.shape.employerTan.safeParse(bareTan).success)throw new AppError(422,"invalid_employer_tan","Employer TAN needs 4 letters, 5 digits and 1 final letter. Check O (letter) versus 0 (zero), then copy the value from your Form 16.");
    extracted={changes:[{section:"salary",key:"employerTan",value:bareTan,confidence:"high",evidence:"User explicitly supplied the employer TAN after checking Form 16"}],uncertainties:[]};
  }
  else if(bankMatch&&(question?.id==="profile.bankAccount"||question?.id==="confirm:profile.bankAccount"||/\b(bank|account)\b|खाता/i.test(text)))extracted={changes:[{section:"profile",key:"bankAccount",value:bankMatch[0],confidence:"high",evidence:"User supplied the requested refund account"}],uncertainties:[]};
  else extracted=await interpretAnswer(next,profile,text);
  const applied=applyChatExtraction(next,extracted);const updated=applied.filing;updated.aiConsentAt=new Date().toISOString();
  updated.conversation!.messages.push(chatMessage("assistant",applied.changes.length?"I’ve updated the draft behind the scenes:\n"+applied.changes.join("\n")+"\nYou’ll approve the full summary before filing.":"I haven’t changed your tax details from that answer. Please clarify the missing information below."));
  return persistChat(f,updated,requestId,"chat.facts_proposed");
}
export async function connectChatRecords(f:Filing,profile:Profile,requestId:string){
  assertEditable(f);const next=structuredClone(f),c=next.conversation??=initialConversation();c.recordsConsentAt=new Date().toISOString();
  await audit(auditEvent(f.ownerId,f.id,"records.access_consented",requestId));
  const fetched=await fetchAuthorizedRecords(next,profile);
  const count=fetched.conversation!.connections.filter(x=>x.status==="ready").length;
  fetched.conversation!.messages.push(chatMessage("assistant",count?`I received records from ${count} connected source${count===1?"":"s"}. I’ve filled the available details into a draft and will ask only about missing or conflicting facts.`:"I checked the connection setup. No taxpayer records have been fetched. The required authorized providers are not connected or are awaiting permission; I won’t replace that with a long form."));
  return persistChat(f,fetched,requestId,"records.sync_completed");
}
