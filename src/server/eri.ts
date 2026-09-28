import "server-only";
import { z } from "zod";
import { type Filing,type Profile,type Salary } from "@/lib/domain";
import { calculateTax } from "@/lib/tax";
import { taxInput } from "@/lib/validation";
import { AppError } from "./errors";
import { env,localMode } from "./config";
export const preparationPacket=(filing:Filing,profile:Profile)=>({
  format:"saral-preparation-packet-v1", officialItrSchema:false, assessmentYear:filing.year, preparedAt:new Date().toISOString(),
  notice:"Preparation worksheet only. Not employer-issued Form 16, not official ITR JSON, and not proof of filing.",
  taxpayer:profile, salary:filing.salary, scope:filing.scope, declarations:filing.declarations, regime:filing.regime, calculation:calculateTax(taxInput(filing)),
});
export type PreparationPacket=ReturnType<typeof preparationPacket>;
export interface EriAdapter {
  readonly mode:"development"|"official";
  authenticate():Promise<{sessionReference:string}>;
  addClient(input:{taxpayer:Profile;consentAt:string}):Promise<{clientReference:string}>;
  getPrefill(input:{taxpayer:Profile;consentAt:string}):Promise<{source:"official"|"unavailable";fields:Partial<Salary>}>;
  generateItrPayload(input:PreparationPacket):Promise<{schemaVersion:string;payload:unknown}>;
  validateItr(payload:unknown):Promise<{valid:boolean;official:boolean;errors:string[]}>;
  submitItr(input:{payload:unknown;idempotencyKey:string;consentHash:string}):Promise<{source:"official";reference:string}>;
  eVerify(input:{reference:string;method:"redirect"}):Promise<{source:"official";status:"pending"|"verified";redirectUrl?:string}>;
  getAcknowledgement(reference:string):Promise<{source:"official";verified:true;number:string;receivedAt:string;url?:string}>;
}
export class DevelopmentEriAdapter implements EriAdapter {
  readonly mode="development" as const;
  async authenticate(){return {sessionReference:"development-no-official-session"};}
  async addClient(){return {clientReference:"development-no-client-added"};}
  async getPrefill(){return {source:"unavailable" as const,fields:{}};}
  async generateItrPayload(packet:PreparationPacket){return {schemaVersion:"development-preparation-only",payload:packet};}
  async validateItr(){return {valid:false,official:false,errors:["Official ERI validation is not connected."]};}
  async submitItr():Promise<never>{throw new AppError(503,"eri_unavailable","Official submission is not connected. Your return has not been filed.");}
  async eVerify():Promise<never>{throw new AppError(503,"eri_unavailable","e-Verification is available only after an official submission.");}
  async getAcknowledgement():Promise<never>{throw new AppError(404,"no_acknowledgement","No official acknowledgement exists for this return.");}
}
// This is OUR normalized gateway contract, never a guessed ITD endpoint contract.
// The approved ERI operator implements the gateway with its current official specifications.
export class OfficialEriAdapter implements EriAdapter {
  readonly mode="official" as const;
  private async call(operation:string,input:unknown){
    const url=new URL(env("ERI_GATEWAY_URL"));if(url.protocol!=="https:")throw new Error("ERI gateway requires HTTPS");
    const response=await fetch(new URL(`v1/${operation}`,url.href.endsWith("/")?url.href:url.href+"/"),{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${env("ERI_GATEWAY_TOKEN")}`},body:JSON.stringify(input),signal:AbortSignal.timeout(30000),cache:"no-store",redirect:"error"});
    if(!response.ok)throw new AppError(502,"eri_error","The official filing service could not complete this request. Check filing status before retrying.");return response.json();
  }
  async authenticate(){return z.object({sessionReference:z.string().min(1)}).parse(await this.call("authenticate",{}));}
  async addClient(input:{taxpayer:Profile;consentAt:string}){return z.object({clientReference:z.string().min(1)}).parse(await this.call("clients",input));}
  async getPrefill(input:{taxpayer:Profile;consentAt:string}){const {salarySchema}=await import("@/lib/domain");return z.object({source:z.literal("official"),fields:salarySchema.partial().strict()}).parse(await this.call("prefill",input));}
  async generateItrPayload(input:PreparationPacket){return z.object({schemaVersion:z.string().min(1),payload:z.unknown()}).parse(await this.call("generate",input)) as {schemaVersion:string;payload:unknown};}
  async validateItr(payload:unknown){return z.object({valid:z.boolean(),official:z.literal(true),errors:z.array(z.string())}).parse(await this.call("validate",payload));}
  async submitItr(input:{payload:unknown;idempotencyKey:string;consentHash:string}){return z.object({source:z.literal("official"),reference:z.string().min(1)}).parse(await this.call("submit",input));}
  async eVerify(input:{reference:string;method:"redirect"}){return z.object({source:z.literal("official"),status:z.enum(["pending","verified"]),redirectUrl:z.url().optional()}).parse(await this.call("e-verify",input));}
  async getAcknowledgement(reference:string){return z.object({source:z.literal("official"),verified:z.literal(true),number:z.string().min(1),receivedAt:z.iso.datetime(),url:z.url().optional()}).parse(await this.call("acknowledgement",{reference}));}
}
export const eri=():EriAdapter=>!localMode()&&process.env.ERI_GATEWAY_URL?new OfficialEriAdapter():new DevelopmentEriAdapter();
