import { z } from "zod";
import type { ChatState } from "./chat";

export const ASSESSMENT_YEAR = "2026-27" as const;
export const money = z.number().finite().nonnegative().max(100_000_000).refine(v => Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, "Use at most two decimal places");
export const salarySchema = z.object({
  employerName: z.string().trim().max(150).nullable(),
  employerTan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/, "Enter a valid employer TAN").nullable(),
  annualSalary: money.nullable(), salaryTds: money.nullable(),
  savingsInterest: money.nullable(), depositInterest: money.nullable(), otherTds: money.nullable(),
  employerNps: money.nullable(), basicDa: money.nullable(),
  eligible80C: money.nullable(), eligible80D: money.nullable(), professionalTax: money.nullable(), hraExemption: money.nullable(),
});
export type Salary = z.infer<typeof salarySchema>;
export type FieldName = keyof Salary;
export const fieldNames = Object.keys(salarySchema.shape) as FieldName[];
export const labels: Record<FieldName, string> = {
  employerName: "Employer name", employerTan: "Employer TAN", annualSalary: "Annual gross salary", salaryTds: "Tax deducted from salary (TDS)",
  savingsInterest: "Savings-account interest", depositInterest: "Fixed / recurring-deposit interest", otherTds: "TDS on bank interest",
  employerNps: "Employer's NPS contribution", basicDa: "Basic salary + eligible DA", eligible80C: "Eligible 80C investments", eligible80D: "Eligible health-insurance premium (self)", professionalTax: "Professional tax paid", hraExemption: "HRA exemption claimed",
};
export const emptySalary = (): Salary => Object.fromEntries(fieldNames.map(k => [k, null])) as Salary;
export const scopeSchema = z.object({
  resident: z.boolean().nullable(), under60: z.boolean().nullable(), onlySalaryAndInterest: z.boolean().nullable(), noSpecialCircumstances: z.boolean().nullable(),
  employerType: z.enum(["central", "state", "psu", "other"]).nullable(), npsIncludedInSalary: z.boolean().nullable(), wantsDeductions: z.boolean().nullable(),
});
export const emptyScope = (): z.infer<typeof scopeSchema> => ({resident:null, under60:null, onlySalaryAndInterest:null, noSpecialCircumstances:null, employerType:null, npsIncludedInSalary:null, wantsDeductions:null});
export const profileSchema = z.object({
  name: z.string().trim().max(100).default(""), pan: z.union([z.literal(""), z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/)]).default(""),
  dateOfBirth: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const time=Date.parse(value);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;},"Enter a real calendar date")]).default(""),
  address: z.string().max(300).default(""), postalCode: z.union([z.literal(""),z.string().regex(/^\d{6}$/)]).default(""),
  bankAccount: z.union([z.literal(""),z.string().regex(/^\d{9,18}$/)]).default(""), ifsc: z.union([z.literal(""),z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)]).default(""),
});
export type Profile = z.infer<typeof profileSchema>;
export const declarationsSchema=z.object({
  loans:z.array(z.enum(["home","education","personal","other"])).max(4),
  loanInterest:money.nullable(), loanNotes:z.string().max(1500),
  additionalIncomeNotes:z.string().max(1500), sourceNotes:z.string().max(3000),
});
export type Declarations=z.infer<typeof declarationsSchema>;
export const emptyDeclarations=():Declarations=>({loans:[],loanInterest:null,loanNotes:"",additionalIncomeNotes:"",sourceNotes:""});
export const proposalSchema = z.object({
  fields: z.array(z.object({key:z.enum(fieldNames as [FieldName,...FieldName[]]),value:z.union([z.string(), z.number(),z.null()]),confidence:z.enum(["high","medium","low"]),evidence:z.string().max(250)})).max(30),
  message: z.string().max(1200), warnings: z.array(z.string().max(250)).max(15),
  declarations:z.object({loans:z.array(z.enum(["home","education","personal","other"])).max(4),loanInterest:z.number().nonnegative().max(100000000).nullable(),loanNotes:z.string().max(1500),additionalIncomeNotes:z.string().max(1500),sourceNotes:z.string().max(3000)}),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type Issue = {code:string; field?: string; severity:"error"|"warning"; message:string};
export type FilingStatus = "draft"|"prepared"|"submission_pending"|"submitted"|"verification_pending"|"verified";
export interface Filing {
  demo?: {scenario:"complete"|"missing-interest";phase:"created"|"records_ready"|"submitted"|"verified";reference:string|null;acknowledgement:{number:string;receivedAt:string;simulated:true}|null};
  conversation?:ChatState;
  id:string; ownerId:string; year:typeof ASSESSMENT_YEAR; revision:number; createdAt:string; updatedAt:string; status:FilingStatus;
  salary:Salary; scope:z.infer<typeof scopeSchema>; declarations:Declarations; confirmedFields:FieldName[]; pending:Proposal|null; regime:"new"|"old";
  processingConsentAt:string; aiConsentAt:string|null; prefillConsentAt:string|null; prefill:Partial<Salary>|null;
  prefillSource:"unavailable"|"official"; reviewHash:string|null; reviewConfirmedAt:string|null;
  officialReference:string|null; acknowledgement: {number:string; receivedAt:string; url?:string}|null;
  paymentStatus:"unavailable"|"pending"|"paid"; submissionKey:string|null;
}
export interface DocumentRecord {id:string; filingId:string; ownerId:string; name:string; mime:string; size:number; createdAt:string; expiresAt:string; storagePath:string|null; status:"retained"|"deleted";}
export interface AuditEvent {id:string;ownerId:string;filingId:string|null;action:string;at:string;requestId:string; metadata:Record<string,string|number|boolean>;}
export const editableFilingSchema = z.object({
  revision:z.number().int().nonnegative(), salary:salarySchema.optional(), scope:scopeSchema.optional(), declarations:declarationsSchema.optional(),
  confirmedFields:z.array(z.enum(fieldNames as [FieldName,...FieldName[]])).optional(), regime:z.enum(["new","old"]).optional(),
}).strict();
export function requiredFields(filing: Pick<Filing,"salary"|"scope">): FieldName[] {
  const fields:FieldName[] = ["annualSalary","salaryTds","savingsInterest","depositInterest","otherTds","employerNps"];
  if ((filing.salary.employerNps ?? 0)>0) fields.push("basicDa");
  if (filing.scope.wantsDeductions) fields.push("eligible80C","eligible80D","professionalTax","hraExemption");
  return fields;
}
export function inr(value:number) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value); }
