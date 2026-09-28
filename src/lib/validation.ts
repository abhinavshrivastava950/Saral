import { type Filing, type Issue, type Profile, requiredFields } from "./domain";
import { calculateTax, type TaxInput } from "./tax";

export function taxInput(f:Filing, regime=f.regime):TaxInput {
  return {year:f.year, regime, employerType:f.scope.employerType ?? "other", annualSalary:f.salary.annualSalary ?? 0, salaryTds:f.salary.salaryTds ?? 0,
    savingsInterest:f.salary.savingsInterest ?? 0,depositInterest:f.salary.depositInterest ?? 0,otherTds:f.salary.otherTds ?? 0,
    employerNps:f.salary.employerNps ?? 0,basicDa:f.salary.basicDa ?? 0,eligible80C:f.scope.wantsDeductions ? f.salary.eligible80C ?? 0:0,eligible80D:f.scope.wantsDeductions ? f.salary.eligible80D ?? 0:0,
    professionalTax:f.scope.wantsDeductions ? f.salary.professionalTax ?? 0:0,hraExemption:f.scope.wantsDeductions ? f.salary.hraExemption ?? 0:0};
}
export function preparationIssues(f:Filing):Issue[] {
  const issues:Issue[]=[];
  if(f.declarations?.loans.length) issues.push({code:"loan_review",severity:"warning",message:"Your loan details are saved. Loan-related deductions need eligibility review and are not included in this estimate."});
  if(f.declarations?.additionalIncomeNotes.trim()) issues.push({code:"additional_income_review",severity:"warning",message:"Your additional income notes need classification before filing; this estimate includes only salary and entered bank interest."});
  for (const k of ["resident","under60","onlySalaryAndInterest","noSpecialCircumstances"] as const) {
    if (f.scope[k]!==true) issues.push({code:`scope_${k}`,field:k,severity:"error",message:f.scope[k]===false?"This situation needs assisted review and is outside the first release.":"Complete the eligibility questions before we prepare an estimate."});
  }
  if (!f.scope.employerType) issues.push({code:"employer_type",severity:"error",message:"Select your employer category."});
  if (f.scope.wantsDeductions===null) issues.push({code:"deduction_choice",severity:"error",message:"Tell us whether you have old-regime deductions to compare."});
  for (const field of requiredFields(f)) {
    if (f.salary[field]===null || !f.confirmedFields.includes(field)) issues.push({code:"unconfirmed_field",field,severity:"error",message:"Please enter and confirm this amount, including zero where applicable."});
  }
  if ((f.salary.employerNps ?? 0)>0 && f.scope.npsIncludedInSalary!==true) issues.push({code:"nps_salary",severity:"error",message:"Confirm gross salary includes employer NPS; ask payroll if unsure."});
  if ((f.salary.hraExemption ?? 0)>0) issues.push({code:"hra_review",field:"hraExemption",severity:"warning",message:"HRA exemption needs evidence and independent verification before filing."});
  if ((f.salary.salaryTds ?? 0)>(f.salary.annualSalary ?? 0)) issues.push({code:"tds_salary",field:"salaryTds",severity:"error",message:"Salary TDS exceeds salary. Recheck the source statement."});
  if ((f.salary.otherTds ?? 0)>((f.salary.savingsInterest ?? 0)+(f.salary.depositInterest ?? 0))) issues.push({code:"tds_interest",field:"otherTds",severity:"error",message:"Interest TDS exceeds interest income. Recheck the statement."});
  if (!issues.some(i=>i.severity==="error")) {
    try { calculateTax(taxInput(f)); } catch { issues.push({code:"tax_scope",severity:"error",message:"These salary components or income totals are outside the supported calculation limits."}); }
  }
  return issues;
}
export function filingIssues(f:Filing, profile:Profile):Issue[] {
  const issues=preparationIssues(f).map(i=>["hra_review","loan_review","additional_income_review"].includes(i.code)?{...i,severity:"error" as const}:i);
  for (const field of ["name","pan","dateOfBirth","address","postalCode","bankAccount","ifsc"] as const) if (!profile[field]) issues.push({code:"profile_missing",field,severity:"error",message:`Complete ${field} in your profile before filing.`});
  if (profile.dateOfBirth && (profile.dateOfBirth<="1966-04-01" || profile.dateOfBirth>"2008-03-31" || Number.isNaN(Date.parse(profile.dateOfBirth)))) issues.push({code:"age_review",severity:"error",message:"Age or date of birth needs assisted review for this release."});
  for (const field of ["employerName","employerTan"] as const) if (!f.salary[field] || !f.confirmedFields.includes(field)) issues.push({code:"employer_missing",field,severity:"error",message:"Confirm employer name and TAN from your salary/TDS statement."});
  if (f.prefillSource!=="official") issues.push({code:"prefill_pending",severity:"error",message:"Official prefill and tax-credit reconciliation have not been completed."});
  if (f.prefill) for (const [field,value] of Object.entries(f.prefill)) {
    if (value!==null && value!==f.salary[field as keyof typeof f.salary]) issues.push({code:"prefill_mismatch",field,severity:"error",message:"Your confirmed value differs from official prefill. Resolve the discrepancy before filing."});
  }
  // Deliberate fail-closed launch gates. Do not remove until approved AY schema, filing-date and fee logic are integrated.
  issues.push({code:"filing_adjustments_pending",severity:"error",message:"Filing-date eligibility, interest and late fees require the certified filing integration."});
  issues.push({code:"official_schema_pending",severity:"error",message:"The preparation packet must be mapped to and validated against the current official ITR schema."});
  return issues;
}
