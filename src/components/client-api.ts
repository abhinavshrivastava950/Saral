import type { Filing,Issue,Profile,DocumentRecord } from "@/lib/domain";
import type { TaxResult } from "@/lib/tax";
import type {DraftChange} from "@/lib/voice-language";
export type Session={user:{id:string;email:string;admin:boolean;local:boolean}|null;mode:"local"|"production";demoAvailable?:boolean;geminiConfigured?:boolean;voiceConfigured?:boolean;voiceProvider?:"openai";aiConfigured:boolean;authConfigured:boolean;eriConfigured:boolean;recordsConfigured?:boolean;serviceFee:number};
export type FilingView={filing:Filing;estimates:{new:TaxResult;old:TaxResult}|null;preparationIssues:Issue[];filingIssues:Issue[];reviewHash:string;chatQuestion:{id:string;text:string;choices?:string[]}|null;chatFacts:Array<{label:string;value:string}>;chatCanReview:boolean;chatReviewHash:string;recommendedRegime:"new"|"old";voiceReply?:string;voiceChanges?:DraftChange[]};
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);if(options.body&&!(options.body instanceof FormData))headers.set("Content-Type","application/json");
  const result=await fetch("/api/"+path,{...options,headers,cache:"no-store",credentials:"same-origin"});
  const data=await result.json();if(!result.ok)throw new Error(data.error??"Something went wrong. Please try again.");return data as T;
}
export const post=<T>(path:string,data:unknown)=>api<T>(path,{method:"POST",body:JSON.stringify(data)});
export type {Profile,DocumentRecord};
