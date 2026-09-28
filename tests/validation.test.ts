import { describe,it,expect } from "vitest";
import { emptySalary,emptyScope,emptyDeclarations,profileSchema,requiredFields,type Filing } from "../src/lib/domain";
import { preparationIssues,filingIssues,taxInput } from "../src/lib/validation";
import { calculateTax } from "../src/lib/tax";
const fixture=():Filing=>({
  id:"filing",ownerId:"owner",year:"2026-27",revision:0,createdAt:"2026-09-27T00:00:00Z",updatedAt:"2026-09-27T00:00:00Z",status:"draft",salary:{...emptySalary(),annualSalary:1500000,salaryTds:100000,savingsInterest:0,depositInterest:0,otherTds:0,employerNps:0},
  scope:{...emptyScope(),resident:true,under60:true,onlySalaryAndInterest:true,noSpecialCircumstances:true,employerType:"central",wantsDeductions:false},declarations:emptyDeclarations(),confirmedFields:["annualSalary","salaryTds","savingsInterest","depositInterest","otherTds","employerNps"],pending:null,regime:"new",processingConsentAt:"2026-09-27T00:00:00Z",aiConsentAt:null,prefillConsentAt:null,prefill:null,prefillSource:"unavailable",reviewHash:null,reviewConfirmedAt:null,officialReference:null,acknowledgement:null,paymentStatus:"unavailable",submissionKey:null,
});
describe("confirmation, scope and filing gates",()=>{
  it("only complete confirmed ordinary-income data is ready for an estimate",()=>{const f=fixture();expect(preparationIssues(f)).toEqual([]);f.salary.savingsInterest=null;expect(preparationIssues(f).some(x=>x.field==="savingsInterest"&&x.severity==="error")).toBe(true);});
  it("a value alone never proves confirmation",()=>{const f=fixture();f.confirmedFields=[];expect(preparationIssues(f).filter(x=>x.code==="unconfirmed_field")).toHaveLength(6);});
  it("declined deductions cannot lower tax through hidden unconfirmed values",()=>{const f=fixture();f.salary.eligible80C=150000;f.salary.hraExemption=100000;const r=calculateTax(taxInput(f,"old"));expect(r.deduction80C).toBe(0);expect(r.hraExemption).toBe(0);});
  it("asking for deductions requires explicit confirmations including zero",()=>{const f=fixture();f.scope.wantsDeductions=true;expect(requiredFields(f)).toContain("eligible80D");expect(preparationIssues(f).filter(x=>x.code==="unconfirmed_field")).toHaveLength(4);});
  it("employer NPS needs basic+DA and salary inclusion",()=>{const f=fixture();f.salary.employerNps=50000;expect(preparationIssues(f).some(x=>x.code==="nps_salary")).toBe(true);expect(requiredFields(f)).toContain("basicDa");});
  it("unsupported income is rejected rather than forced into ITR-1",()=>{const f=fixture();f.scope.onlySalaryAndInterest=false;expect(preparationIssues(f).some(x=>x.code==="scope_onlySalaryAndInterest")).toBe(true);});
  it("loan facts are retained but block filing pending review",()=>{const f=fixture();f.declarations.loans=["education"];f.declarations.loanInterest=10000;expect(preparationIssues(f).find(x=>x.code==="loan_review")?.severity).toBe("warning");expect(filingIssues(f,profileSchema.parse({})).find(x=>x.code==="loan_review")?.severity).toBe("error");});
  it("complete preparation is never mistaken for official filing readiness",()=>{const f=fixture();const issues=filingIssues(f,profileSchema.parse({}));expect(issues.some(x=>x.code==="official_schema_pending")).toBe(true);expect(issues.some(x=>x.code==="filing_adjustments_pending")).toBe(true);expect(issues.some(x=>x.code==="prefill_pending")).toBe(true);});
  it("official mismatches are surfaced without changing taxpayer values",()=>{const f=fixture();f.prefillSource="official";f.prefill={salaryTds:99000};expect(filingIssues(f,profileSchema.parse({})).some(x=>x.code==="prefill_mismatch")).toBe(true);expect(f.salary.salaryTds).toBe(100000);});
});
