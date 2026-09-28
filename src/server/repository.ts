import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readFile,mkdir,rename,writeFile,unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { type Filing,type DocumentRecord,type AuditEvent,type Profile,profileSchema } from "@/lib/domain";
import { localDirectory,seal,unseal } from "./crypto";
import { localMode,env } from "./config";
import { AppError } from "./errors";

export const database=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
type LocalData={filings:Filing[];documents:DocumentRecord[];profiles:Record<string,Profile>;audit:AuditEvent[]};
const globalStore=globalThis as typeof globalThis & {saralWriteQueue?:Promise<unknown>};
async function readLocalDisk():Promise<LocalData> {
  try{return JSON.parse((await unseal(await readFile(join(localDirectory,"workspace.enc"),"utf8"),"saral-local-v1")).toString());}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {filings:[],documents:[],profiles:{},audit:[]};throw e;}
}
function queueLocal<T>(work:()=>Promise<T>):Promise<T>{
  const operation=(globalStore.saralWriteQueue??Promise.resolve()).then(work);
  globalStore.saralWriteQueue=operation.catch(()=>{});return operation;
}
async function localRead():Promise<LocalData>{return queueLocal(readLocalDisk);}
async function replaceLocalSnapshot(source:string,destination:string){
  // Windows can briefly deny replacement while indexing/scanning the destination.
  for(let attempt=0;attempt<6;attempt++){
    try{await rename(source,destination);return;}catch(error){
      if(!["EPERM","EACCES","EBUSY"].includes((error as NodeJS.ErrnoException).code??"")||attempt===5)throw error;
      await new Promise(resolve=>setTimeout(resolve,25*2**attempt));
    }
  }
}
async function localUpdate<T>(fn:(state:LocalData)=>T):Promise<T>{
  return queueLocal(async()=>{
    const state=await readLocalDisk();const result=fn(state);await mkdir(localDirectory,{recursive:true});
    const tmp=join(localDirectory,randomUUID()+".tmp");
    try{await writeFile(tmp,await seal(Buffer.from(JSON.stringify(state)),"saral-local-v1"),{mode:0o600});await replaceLocalSnapshot(tmp,join(localDirectory,"workspace.enc"));return result;}
    catch(error){await unlink(tmp).catch(()=>{});throw error;}
  });
}
const encode=(value:unknown,context:string)=>seal(Buffer.from(JSON.stringify(value)),context);
async function decode<T>(value:string,context:string):Promise<T>{return JSON.parse((await unseal(value,context)).toString()) as T;}
function dbError(error:unknown){if(error)throw new AppError(503,"storage_unavailable","Your changes could not be saved. Please try again.");}
export function auditEvent(ownerId:string,filingId:string|null,action:string,requestId:string,metadata:AuditEvent["metadata"]={}):AuditEvent{return {id:randomUUID(),ownerId,filingId,action,requestId,metadata,at:new Date().toISOString()};}
export async function audit(event:AuditEvent){
  if(localMode()){await localUpdate(s=>s.audit.push(event));return;}
  const {error}=await database().from("audit_events").insert({id:event.id,owner_id:event.ownerId,filing_id:event.filingId,action:event.action,occurred_at:event.at,request_id:event.requestId,metadata:event.metadata});dbError(error);
}
export async function listFilings(ownerId:string):Promise<Filing[]>{
  if(localMode())return (await localRead()).filings.filter(f=>f.ownerId===ownerId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const {data,error}=await database().from("filings").select("id,payload_ciphertext").eq("owner_id",ownerId).order("updated_at",{ascending:false});dbError(error);
  return Promise.all((data??[]).map(row=>decode<Filing>(row.payload_ciphertext,`${ownerId}:${row.id}`)));
}
export async function getFiling(ownerId:string,id:string):Promise<Filing>{
  let result:Filing|undefined;
  if(localMode())result=(await localRead()).filings.find(f=>f.id===id&&f.ownerId===ownerId);
  else {const {data,error}=await database().from("filings").select("payload_ciphertext").eq("owner_id",ownerId).eq("id",id).maybeSingle();dbError(error);if(data)result=await decode<Filing>(data.payload_ciphertext,`${ownerId}:${id}`);}
  if(!result)throw new AppError(404,"not_found","This return is not available in your workspace.");return result;
}
export async function saveFiling(f:Filing,expectedRevision:number|null,event:AuditEvent):Promise<Filing>{
  if(localMode())return localUpdate(s=>{
    const i=s.filings.findIndex(x=>x.id===f.id&&x.ownerId===f.ownerId);
    if(expectedRevision===null){if(i>=0)throw new AppError(409,"conflict","Return already exists.");s.filings.push(f);}
    else {if(i<0||s.filings[i].revision!==expectedRevision)throw new AppError(409,"revision_conflict","This return changed in another tab. Refresh it before saving.");s.filings[i]=f;}
    s.audit.push(event);return f;
  });
  const {data,error}=await database().rpc("save_filing",{p_id:f.id,p_owner:f.ownerId,p_expected_revision:expectedRevision,p_revision:f.revision,p_status:f.status,p_payload:await encode(f,`${f.ownerId}:${f.id}`),p_action:event.action,p_request_id:event.requestId});
  dbError(error);if(data!==true)throw new AppError(409,"revision_conflict","This return changed in another tab. Refresh it before saving.");return f;
}
export async function getProfile(ownerId:string):Promise<Profile>{
  if(localMode())return (await localRead()).profiles[ownerId]??profileSchema.parse({});
  const {data,error}=await database().from("profiles").select("payload_ciphertext").eq("owner_id",ownerId).maybeSingle();dbError(error);
  return data?decode<Profile>(data.payload_ciphertext,`profile:${ownerId}`):profileSchema.parse({});
}
export async function saveProfile(ownerId:string,profile:Profile,requestId:string){
  if(localMode())await localUpdate(s=>{s.profiles[ownerId]=profile;s.audit.push(auditEvent(ownerId,null,"profile.updated",requestId));});
  else {const {error}=await database().rpc("save_profile",{p_owner:ownerId,p_payload:await encode(profile,`profile:${ownerId}`),p_request_id:requestId});dbError(error);}
}
export async function listDocuments(ownerId:string):Promise<DocumentRecord[]>{
  if(localMode())return (await localRead()).documents.filter(d=>d.ownerId===ownerId);
  const {data,error}=await database().from("documents").select("id,metadata_ciphertext").eq("owner_id",ownerId);dbError(error);
  return Promise.all((data??[]).map(row=>decode<DocumentRecord>(row.metadata_ciphertext,`document:${ownerId}:${row.id}`)));
}
export async function saveDocument(d:DocumentRecord){
  if(localMode()){await localUpdate(s=>{const i=s.documents.findIndex(x=>x.id===d.id&&x.ownerId===d.ownerId);if(i<0)s.documents.push(d);else s.documents[i]=d;});return;}
  const {error}=await database().from("documents").upsert({id:d.id,owner_id:d.ownerId,filing_id:d.filingId,expires_at:d.expiresAt,status:d.status,metadata_ciphertext:await encode(d,`document:${d.ownerId}:${d.id}`)});dbError(error);
}
export async function expiredDocuments():Promise<DocumentRecord[]>{
  if(localMode())return (await localRead()).documents.filter(d=>d.status==="retained"&&Date.parse(d.expiresAt)<=Date.now());
  const {data,error}=await database().from("documents").select("id,owner_id,metadata_ciphertext").eq("status","retained").lte("expires_at",new Date().toISOString()).limit(100);
  dbError(error);return Promise.all((data??[]).map(row=>decode<DocumentRecord>(row.metadata_ciphertext,`document:${row.owner_id}:${row.id}`)));
}
export async function deleteDraft(ownerId:string,id:string,requestId:string){
  const filing=await getFiling(ownerId,id);if(!["draft","prepared"].includes(filing.status))throw new AppError(409,"retention_required","Submitted returns require the configured retention process.");
  if(localMode())await localUpdate(s=>{s.filings=s.filings.filter(f=>f.id!==id||f.ownerId!==ownerId);s.audit.push(auditEvent(ownerId,id,"filing.deleted",requestId));});
  else {const {error}=await database().rpc("delete_draft",{p_owner:ownerId,p_id:id,p_request_id:requestId});dbError(error);}
}
export async function auditSummary(ownerId:string,admin=false){
  if(localMode())return (await localRead()).audit.filter(a=>a.ownerId===ownerId).slice(-100).reverse();
  let query=database().from("audit_events").select("action,occurred_at,request_id,metadata").order("occurred_at",{ascending:false}).limit(100);
  if(!admin)query=query.eq("owner_id",ownerId);const {data,error}=await query;dbError(error);return data??[];
}
