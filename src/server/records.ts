import "server-only";
import { z } from "zod";
import { type Filing, type Profile, salarySchema, profileSchema, scopeSchema, declarationsSchema } from "@/lib/domain";
import { connectionKinds, initialConversation, effectiveProfile, type Connection, type ConnectionKind } from "@/lib/chat";
import { AppError } from "./errors";
import { localMode } from "./config";

// OUR normalized gateway, implemented by approved ERI/payroll/financial-data partners.
// These paths are not represented as public government API endpoints.
const recordSchema=z.object({kind:z.enum(connectionKinds),status:z.enum(["authorization_required","ready","unavailable","error"]),detail:z.string().max(350),reference:z.string().min(1).optional(),authorizationUrl:z.url().optional(),receivedAt:z.iso.datetime().optional(),salary:salarySchema.partial().optional(),profile:profileSchema.partial().optional(),scope:scopeSchema.partial().optional(),declarations:declarationsSchema.partial().optional()}).strict();
const bundleSchema=z.object({source:z.literal("authorized_gateway"),subjectPan:z.string(),assessmentYear:z.literal("2026-27"),records:z.array(recordSchema).max(4)}).strict();
export const recordConnectionsConfigured=()=>Boolean(process.env.TAX_DATA_GATEWAY_URL&&process.env.TAX_DATA_GATEWAY_TOKEN)&&!localMode();
export function connectionAvailability(){return {configured:recordConnectionsConfigured(),sources:connectionKinds,reason:localMode()?"Local sample mode does not access real taxpayer accounts.":"Requires approved provider connections."};}
function unavailableConnections():Connection[]{return connectionKinds.map(kind=>({kind,status:"unavailable",detail:localMode()?"Real taxpayer access is disabled in the local sample workspace.":"An approved provider connection has not been configured."}));}
export async function fetchAuthorizedRecords(f:Filing,stored:Profile):Promise<Filing>{
  const c=structuredClone(f.conversation??initialConversation());const p=effectiveProfile(f,stored);
  if(!p.pan)throw new AppError(422,"pan_required","Tell me your PAN before connecting records.");
  if(!c.recordsConsentAt)throw new AppError(403,"consent_required","Please authorize the connections before I request taxpayer information.");
  if(!recordConnectionsConfigured())return {...f,conversation:{...c,connections:unavailableConnections(),fetchAttemptedAt:new Date().toISOString()}};
  const base=new URL(process.env.TAX_DATA_GATEWAY_URL!);if(base.protocol!=="https:")throw new Error("Record gateway requires HTTPS");
  const result=await fetch(new URL("v1/records/sync",base.href.endsWith("/")?base.href:base.href+"/"),{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${process.env.TAX_DATA_GATEWAY_TOKEN}`},body:JSON.stringify({ownerReference:f.ownerId,filingReference:f.id,pan:p.pan,assessmentYear:f.year,consentAt:c.recordsConsentAt,connections:c.connections.map(x=>({kind:x.kind,reference:x.reference})),returnUrl:`${process.env.APP_URL}/filings/${f.id}`}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw new AppError(502,"records_unavailable","The records provider could not complete the request. No filing has been submitted.");
  const data=bundleSchema.parse(await result.json());
  if(data.subjectPan!==p.pan)throw new AppError(502,"taxpayer_mismatch","The provider returned a different taxpayer. Those records were rejected.");
  const next=structuredClone(f);next.conversation=c;c.fetchAttemptedAt=new Date().toISOString();
  const seen=new Set<ConnectionKind>();
  for(const record of data.records){
    if(seen.has(record.kind))throw new AppError(502,"duplicate_source","The provider returned conflicting source records.");seen.add(record.kind);
    if(record.status==="ready"&&(!record.reference||!record.receivedAt))throw new AppError(502,"missing_provenance","A source record has no verifiable reference or timestamp.");
    if(record.authorizationUrl){const url=new URL(record.authorizationUrl);if(url.protocol!=="https:"||!(process.env.TAX_DATA_AUTH_HOSTS??"").split(",").map(x=>x.trim()).includes(url.hostname))throw new AppError(502,"unsafe_authorization_url","The provider authorization address could not be verified.");}
    c.connections=c.connections.map(x=>x.kind===record.kind?{kind:record.kind,status:record.status,detail:record.detail,reference:record.reference,receivedAt:record.receivedAt,authorizationUrl:record.authorizationUrl}:x);
    if(record.status!=="ready")continue;
    if(record.profile?.pan&&record.profile.pan!==p.pan)throw new AppError(502,"taxpayer_mismatch","A source record belongs to a different taxpayer.");
    for(const section of ["salary","scope","profile","declarations"] as const){
      const source=record[section];if(!source)continue;
      const target=(section==="profile"?c.profileDraft:next[section]) as Record<string,unknown>;
      for(const [key,value]of Object.entries(source)){
        if(value===null||value===undefined||value===""||(Array.isArray(value)&&!value.length))continue;
        const path=`${section}.${key}`,old=target[key];
        if(old!==null&&old!==undefined&&old!==""&&!(Array.isArray(old)&&!old.length)&&JSON.stringify(old)!==JSON.stringify(value)){
          const issue=`${path}: your saved value and ${record.kind} record differ.`;if(!c.pendingIssues.includes(issue))c.pendingIssues.push(issue);continue;
        }
        target[key]=value;c.factConfidence[path]="high";c.evidence[path]=`${record.kind} · ${record.reference} · ${record.receivedAt}`;
      }
    }
    if(record.kind==="tax"&&record.salary){next.prefill=record.salary;next.prefillSource="official";next.prefillConsentAt=c.recordsConsentAt;}
  }
  // An omitted source is not evidence that income/deductions are zero.
  for(const kind of connectionKinds)if(!seen.has(kind))c.connections=c.connections.map(x=>x.kind===kind?{kind,status:"unavailable",detail:"This source was not returned by the provider."}:x);
  const dob=effectiveProfile(next,stored).dateOfBirth;
  if(dob)next.scope.under60=dob>"1966-04-01"&&dob<="2008-03-31";
  next.confirmedFields=[];next.reviewHash=null;next.reviewConfirmedAt=null;next.status="draft";c.confirmedAt=null;
  return next;
}
