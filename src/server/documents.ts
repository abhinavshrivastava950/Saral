import "server-only";
import { mkdir,writeFile,unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { type DocumentRecord } from "@/lib/domain";
import { seal,localDirectory } from "./crypto";
import { localMode } from "./config";
import { database,listDocuments,saveDocument,audit,auditEvent } from "./repository";
import { AppError } from "./errors";
export function fileMime(bytes:Buffer){
  if(bytes.subarray(0,5).toString()==="%PDF-")return "application/pdf";
  if(bytes.length>8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.length>3 && bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  throw new AppError(415,"unsupported_file","Use a PDF, PNG or JPG file. The contents must match the file type.");
}
export async function registerDocument(ownerId:string,filingId:string,file:File,retain:boolean,requestId:string){
  if(retain&&process.env.DOCUMENT_RETENTION_ENABLED!=="true")throw new AppError(409,"retention_disabled","Temporary document retention is not enabled. Process without retaining the raw file.");
  if(file.size===0||file.size>10*1024*1024)throw new AppError(413,"file_size","Choose a file between 1 byte and 10 MB.");
  const bytes=Buffer.from(await file.arrayBuffer());const mime=fileMime(bytes);if(file.type&&file.type!==mime)throw new AppError(415,"mime_mismatch","The file contents do not match its type. Export it again as PDF, PNG or JPG.");
  const id=randomUUID();const storagePath=retain?`${ownerId}/${id}.enc`:null;
  if(storagePath){
    const encrypted=await seal(bytes,`document:${ownerId}:${id}:bytes`);
    if(localMode()){await mkdir(join(localDirectory,"documents"),{recursive:true});await writeFile(join(localDirectory,"documents",`${id}.enc`),encrypted,{mode:0o600});}
    else {const {error}=await database().storage.from("tax-documents").upload(storagePath,Buffer.from(encrypted),{contentType:"application/octet-stream",upsert:false});if(error)throw new AppError(503,"document_storage_failed","The document could not be stored. Try again.");}
  }
  const doc:DocumentRecord={id,ownerId,filingId,name:file.name.slice(0,150),mime,size:bytes.length,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+24*3600_000).toISOString(),storagePath,status:retain?"retained":"deleted"};
  await saveDocument(doc);await audit(auditEvent(ownerId,filingId,"document.processed",requestId,{retained:retain,bytes:bytes.length}));return {doc,bytes,mime};
}
export async function removeDocument(ownerId:string,id:string,requestId:string){
  const doc=(await listDocuments(ownerId)).find(d=>d.id===id);if(!doc)throw new AppError(404,"not_found","Document not found.");
  if(doc.storagePath){
    if(localMode()){try{await unlink(join(localDirectory,"documents",`${doc.id}.enc`));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}}
    else{const {error}=await database().storage.from("tax-documents").remove([doc.storagePath]);if(error)throw new AppError(503,"delete_failed","Document removal failed. Please retry.");}
  }
  await saveDocument({...doc,storagePath:null,status:"deleted"});await audit(auditEvent(ownerId,doc.filingId,"document.deleted",requestId));
}
export async function purgeExpired(ownerId:string,requestId:string){for(const doc of await listDocuments(ownerId))if(doc.status==="retained"&&Date.parse(doc.expiresAt)<=Date.now())await removeDocument(ownerId,doc.id,requestId);}
