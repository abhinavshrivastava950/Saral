import "server-only";
import {randomUUID} from "node:crypto";
import {type Filing,emptySalary,profileSchema} from "@/lib/domain";
import {connectionKinds,initialConversation,chatReady,effectiveProfile} from "@/lib/chat";
import {localMode} from "./config";
import {AppError} from "./errors";
import {createFiling,snapshotHash} from "./filings";
import {auditEvent,saveFiling} from "./repository";
import {filingIssues} from "@/lib/validation";

export function requireDemo(f?:Filing){if(!localMode()||(f&&!f.demo))throw new AppError(403,"demo_only","This simulation is available only for local demo records.");}
const message=(text:string)=>({id:randomUUID(),role:"assistant" as const,text,at:new Date().toISOString()});
export async function startDemo(ownerId:string,scenario:"complete"|"missing-interest",requestId:string){
  requireDemo();const f=await createFiling(ownerId,requestId);const c=initialConversation();
  c.profileDraft={name:"Aarav Sharma",pan:"AAPPS1234A",dateOfBirth:"1988-08-15",address:"12, Sample Colony, New Delhi — fictional address",postalCode:"110001",bankAccount:"000001234567",ifsc:"DEMO0123456"};
  c.messages=[message("नमस्ते, Aarav. I’m Saral, your tax companion. This is a fictional government-employee demo. I’ll simulate connecting payroll, tax and bank records, then prepare the return for you. No real taxpayer account will be accessed.")];
  return saveFiling({...f,conversation:c,demo:{scenario,phase:"created",reference:null,acknowledgement:null},revision:f.revision+1,updatedAt:new Date().toISOString()},f.revision,auditEvent(ownerId,f.id,"demo.started",requestId));
}
export function populateDemo(f:Filing):Filing{
  if(!f.demo||f.demo.phase!=="created")throw new AppError(409,"demo_phase","This demo already has its records. Start a new demo for another scenario.");
  const n=structuredClone(f),c=n.conversation!;const now=new Date().toISOString();
  n.salary={...emptySalary(),employerName:"Demo Department of School Education",employerTan:"DEMO12345A",annualSalary:1440000,salaryTds:100000,savingsInterest:7200,depositInterest:f.demo.scenario==="complete"?18000:null,otherTds:1800,employerNps:84000,basicDa:600000,eligible80C:150000,eligible80D:25000,professionalTax:2400,hraExemption:0};
  n.scope={resident:true,under60:true,onlySalaryAndInterest:true,noSpecialCircumstances:true,employerType:"central",npsIncludedInSalary:true,wantsDeductions:true};
  n.declarations.sourceNotes="Fictional demo payroll certificate, tax-credit statement, bank interest statement and deduction records. These are simulation fixtures, not documents fetched from an employer or the Income Tax Department.";
  c.connections=connectionKinds.map(kind=>({kind,status:"ready",reference:`DEMO-${kind.toUpperCase()}`,receivedAt:now,detail:kind==="employer"?"Simulated Form 16 · salary and employer NPS":kind==="tax"?"Simulated tax credits · ₹1,01,800 TDS":kind==="bank"?"Simulated savings / FD statement":"Simulated 80C and health-insurance evidence"}));
  c.fetchAttemptedAt=now;c.recordsConsentAt=now;c.pendingIssues=[];c.factConfidence={};
  for(const [key,value]of Object.entries(n.salary))if(value!==null){c.factConfidence[`salary.${key}`]="high";c.evidence[`salary.${key}`]="Explicit fictional fixture for this demo";}
  c.messages.push(message(f.demo.scenario==="complete"?"All four simulated sources are ready. I found your salary, tax credits, interest and eligible sample deductions. There are no missing facts in this scenario, so I’ve prepared your comparison without asking you to fill anything in.":"Your simulated Form 16, tax credits and deduction records are ready. One figure is missing: the annual FD interest. Tell me that amount and I’ll finish the comparison. You can use ₹18,000 for this fictional scenario."));
  n.demo!.phase="records_ready";n.prefill={...n.salary};n.prefillSource="unavailable"; // Never claim an official prefill in demo mode.
  return n;
}
export async function fetchDemo(f:Filing,requestId:string){requireDemo(f);const n=populateDemo(f);return saveFiling({...n,revision:f.revision+1,updatedAt:new Date().toISOString()},f.revision,auditEvent(f.ownerId,f.id,"demo.records_simulated",requestId));}
export function demoValidationIssues(f:Filing){
  const launchOnly=new Set(["prefill_pending","filing_adjustments_pending","official_schema_pending"]);
  return filingIssues(f,effectiveProfile(f,profileSchema.parse({}))).filter(i=>i.severity==="error"&&!launchOnly.has(i.code));
}
export async function submitDemo(f:Filing,reviewHash:string,requestId:string){
  requireDemo(f);if(f.demo!.phase!=="records_ready"||f.status!=="prepared"||!f.reviewConfirmedAt||reviewHash!==f.reviewHash||snapshotHash(f,profileSchema.parse({}))!==reviewHash)throw new AppError(409,"demo_review_required","Read and approve the latest summary before simulating submission.");
  if(!chatReady(f,profileSchema.parse({}))||demoValidationIssues(f).length)throw new AppError(422,"demo_validation_failed","Resolve the flagged facts or unsupported claims before finishing this demo.");
  const n=structuredClone(f);n.demo!.phase="submitted";n.demo!.reference=`DEMO-SUB-${f.id.slice(0,8).toUpperCase()}`;
  n.conversation!.messages.push(message("Demo submission accepted by the simulator. This was not sent to the Income Tax Department. Complete the simulated e-verification to see your demo acknowledgement."));
  return saveFiling({...n,revision:f.revision+1,updatedAt:new Date().toISOString()},f.revision,auditEvent(f.ownerId,f.id,"demo.submission_simulated",requestId));
}
export async function verifyDemo(f:Filing,requestId:string){
  requireDemo(f);if(f.demo!.phase!=="submitted")throw new AppError(409,"demo_submission_required","Simulate submission before demo verification.");
  const n=structuredClone(f),now=new Date().toISOString();n.demo!.phase="verified";n.demo!.acknowledgement={number:`DEMO-ACK-${f.id.slice(0,8).toUpperCase()}`,receivedAt:now,simulated:true};
  n.conversation!.messages.push(message("आपका डेमो पूरा हुआ। Your demo acknowledgement is ready. No real ITR has been filed and no refund or payment has been initiated. You can download the clearly marked demo receipt below."));
  return saveFiling({...n,revision:f.revision+1,updatedAt:now},f.revision,auditEvent(f.ownerId,f.id,"demo.verification_simulated",requestId));
}
