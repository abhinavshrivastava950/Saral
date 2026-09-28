import { z } from "zod";
import { ASSESSMENT_YEAR, money } from "./domain";

// AY-specific ordinary-income rules. All arithmetic uses integer paise; no model output is used here.
export const taxInputSchema = z.object({
  year:z.literal(ASSESSMENT_YEAR), regime:z.enum(["new","old"]),
  annualSalary:money, salaryTds:money, savingsInterest:money, depositInterest:money, otherTds:money,
  employerNps:money.default(0), basicDa:money.default(0), eligible80C:money.default(0), eligible80D:money.default(0), professionalTax:money.default(0), hraExemption:money.default(0),
  employerType:z.enum(["central","state","psu","other"]),
});
export type TaxInput = z.input<typeof taxInputSchema>;
export type TaxResult = ReturnType<typeof calculateTax>;
const paise = (v:number) => Math.round(v * 100);
const rupees = (v:number) => v / 100;
export function roundStatutory(paiseValue:number) { return Math.floor((Math.floor(Math.abs(paiseValue) / 100) + 5) / 10) * 10; }

export function calculateTax(raw:TaxInput) {
  const x = taxInputSchema.parse(raw);
  const isNew = x.regime === "new";
  const gross = paise(x.annualSalary);
  if (x.basicDa > x.annualSalary || x.hraExemption > x.annualSalary || x.employerNps > x.annualSalary) throw new Error("Salary components cannot exceed gross salary.");
  const hra = isNew ? 0 : paise(x.hraExemption);
  const standard = Math.min(Math.max(0,gross-hra),paise(isNew?75_000:50_000));
  const professional = isNew ? 0 : Math.min(paise(x.professionalTax),Math.max(0,gross-hra-standard));
  const netSalary = Math.max(0,gross-hra-standard-professional);
  const grossTotal = netSalary + paise(x.savingsInterest) + paise(x.depositInterest);
  const npsRate = isNew || x.employerType === "central" || x.employerType === "state" ? 14 : 10;
  const nps = Math.min(paise(x.employerNps),Math.floor(paise(x.basicDa) * npsRate / 100));
  const c80 = isNew ? 0 : Math.min(paise(x.eligible80C),15_000_000);
  const d80 = isNew ? 0 : Math.min(paise(x.eligible80D),2_500_000);
  const tta = isNew ? 0 : Math.min(paise(x.savingsInterest),1_000_000);
  const deductions = Math.min(grossTotal,nps+c80+d80+tta);
  const taxable = roundStatutory(grossTotal-deductions);
  if (taxable > 5_000_000) throw new Error("Income over ₹50 lakh requires assisted review.");
  const bands = isNew ? [[400000,0],[800000,5],[1200000,10],[1600000,15],[2000000,20],[2400000,25],[Infinity,30]] : [[250000,0],[500000,5],[1000000,20],[Infinity,30]];
  let lower=0; let slabTax=0;
  const breakdown: {from:number;to:number;rate:number;tax:number}[]=[];
  for (const [upper,rate] of bands) {
    const amount = Math.max(0,Math.min(taxable,upper)-lower);
    const taxPaise = amount * rate; // Rupees × percent = paise.
    if (amount>0) breakdown.push({from:lower,to:Math.min(taxable,upper),rate,tax:rupees(taxPaise)});
    slabTax+=taxPaise; lower=upper;
  }
  const rebate = taxable <= (isNew?1_200_000:500_000) ? Math.min(slabTax,paise(isNew?60_000:12_500)) : 0;
  const marginalRelief = isNew && taxable>1_200_000 ? Math.max(0,slabTax-paise(taxable-1_200_000)) : 0;
  const afterRelief = Math.max(0,slabTax-rebate-marginalRelief);
  const cess = Math.round(afterRelief * 4 / 100);
  const liability=afterRelief+cess;
  const credits=paise(x.salaryTds)+paise(x.otherTds);
  const balance=liability-credits;
  return {
    year:ASSESSMENT_YEAR, regime:x.regime, grossSalary:x.annualSalary, standardDeduction:rupees(standard), hraExemption:rupees(hra), professionalTax:rupees(professional),
    employerNpsDeduction:rupees(nps), deduction80C:rupees(c80), deduction80D:rupees(d80), deduction80TTA:rupees(tta), totalDeductions:rupees(deductions),
    netSalary:rupees(netSalary), grossTotalIncome:rupees(grossTotal), taxableIncome:taxable, slabTax:rupees(slabTax), rebate:rupees(rebate), marginalRelief:rupees(marginalRelief), cess:rupees(cess),
    coreTaxLiability:rupees(liability), taxCredits:rupees(credits), estimatedPayable:balance>0?roundStatutory(balance):0, estimatedRefund:balance<0?roundStatutory(balance):0, breakdown,
    excludes:["Filing-date restrictions", "Interest under sections 234A/B/C", "Applicable late filing fees", "Relief under section 89"],
    ruleVersion:"AY2026-27-salary-v1", provisional:true as const,
  };
}
