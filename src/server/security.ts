import "server-only";
import { createHmac } from "node:crypto";
import { appOrigin,localMode } from "./config";
import { encryptionKey } from "./crypto";
import { database } from "./repository";
import { AppError } from "./errors";
export function verifyOrigin(request:Request){
  const origin=request.headers.get("origin");if(!origin||origin!==appOrigin())throw new AppError(403,"origin_rejected","This request did not come from your tax workspace.");
  const fetchSite=request.headers.get("sec-fetch-site");if(fetchSite&&!["same-origin","none"].includes(fetchSite))throw new AppError(403,"cross_site_rejected","Cross-site requests are not accepted.");
}
const globalRate=globalThis as typeof globalThis&{saralRateBuckets?:Map<string,{count:number;expires:number}>};
export async function rateLimit(subject:string,action:string,limit=60,windowSeconds=60){
  const key=createHmac("sha256",await encryptionKey()).update(`${action}:${subject}`).digest("hex");
  if(localMode()){
    const map=globalRate.saralRateBuckets??=new Map();const now=Date.now();for(const [k,v]of map)if(v.expires<=now)map.delete(k);
    const bucket=map.get(key)??{count:0,expires:now+windowSeconds*1000};bucket.count++;map.set(key,bucket);if(bucket.count>limit)throw new AppError(429,"rate_limited","Please wait a moment before trying again.");return;
  }
  const {data,error}=await database().rpc("consume_rate_limit",{p_key:key,p_limit:limit,p_window_seconds:windowSeconds});
  if(error)throw new AppError(503,"rate_limit_unavailable","Please try again shortly.");if(data!==true)throw new AppError(429,"rate_limited","Please wait a moment before trying again.");
}
export async function boundedBody(request:Request,limit:number){
  if(Number(request.headers.get("content-length")??0)>limit)throw new AppError(413,"body_too_large","This file or request is too large.");
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new AppError(413,"body_too_large","This file or request is too large.");}chunks.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
export async function jsonBody(request:Request){try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,100_000)));}catch(e){if(e instanceof AppError)throw e;throw new AppError(400,"invalid_json","Please send valid JSON.");}}
export async function multipartBody(request:Request){const body=await boundedBody(request,11*1024*1024);return new Request(request.url,{method:"POST",headers:{"content-type":request.headers.get("content-type")??""},body:body as BodyInit}).formData();}
