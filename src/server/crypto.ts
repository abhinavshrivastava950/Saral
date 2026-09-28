import { createCipheriv,createDecipheriv,randomBytes,createHash,createHmac,timingSafeEqual } from "node:crypto";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
export const localDirectory=join(process.cwd(),".local");
let keyPromise:Promise<Buffer>|undefined;
export function encryptionKey():Promise<Buffer> {
  keyPromise ??= (async()=>{
    if(process.env.DATA_ENCRYPTION_KEY) {const key=Buffer.from(process.env.DATA_ENCRYPTION_KEY,"base64");if(key.length!==32)throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes in base64");return key;}
    if(process.env.NODE_ENV==="production" || process.env.APP_MODE==="production" || process.env.SUPABASE_URL) throw new Error("DATA_ENCRYPTION_KEY required");
    await mkdir(localDirectory,{recursive:true}); const path=join(localDirectory,"development.key");
    try{await writeFile(path,randomBytes(32),{flag:"wx",mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
    return readFile(path);
  })(); return keyPromise;
}
export async function seal(value:Uint8Array,context:string) {
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",await encryptionKey(),iv);cipher.setAAD(Buffer.from(context));
  return Buffer.concat([Buffer.from([1]),iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString("base64");
}
export async function unseal(value:string,context:string) {
  const data=Buffer.from(value,"base64");if(data.length<29 || data[0]!==1)throw new Error("Invalid encrypted envelope");
  const decipher=createDecipheriv("aes-256-gcm",await encryptionKey(),data.subarray(1,13));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(13,-16)),decipher.final()]);
}
export const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function sign(value:string) {return createHmac("sha256",await encryptionKey()).update("session-v1:"+value).digest("base64url");}
export function safeEqual(a:string,b:string) {const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
