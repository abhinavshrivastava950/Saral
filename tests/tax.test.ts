import { describe,it,expect } from "vitest";
import { calculateTax,roundStatutory,type TaxInput } from "../src/lib/tax";
const input = (annualSalary:number, regime:"new"|"old"="new"):TaxInput => ({year:"2026-27",regime,annualSalary,salaryTds:0,savingsInterest:0,depositInterest:0,otherTds:0,employerType:"central"});
describe("AY2026-27 deterministic tax",()=>{
  it.each([[1275000,1200000,0],[1285000,1210000,10400],[1325000,1250000,52000],[1400000,1325000,81900],[1500000,1425000,97500]])("new regime salary %i",(salary,taxable,tax)=>{const r=calculateTax(input(salary));expect(r.taxableIncome).toBe(taxable);expect(r.coreTaxLiability).toBe(tax);});
  it.each([[550000,500000,0],[1500000,1450000,257400]])("old regime salary %i",(salary,taxable,tax)=>{const r=calculateTax(input(salary,"old"));expect(r.taxableIncome).toBe(taxable);expect(r.coreTaxLiability).toBe(tax);});
  it("standard deduction never spills over into interest",()=>{const r=calculateTax({...input(40000),savingsInterest:100000});expect(r.standardDeduction).toBe(40000);expect(r.taxableIncome).toBe(100000);});
  it("deducts savings interest only under old regime",()=>{const r=calculateTax({...input(1500000,"old"),savingsInterest:15000,depositInterest:50000});expect(r.deduction80TTA).toBe(10000);expect(calculateTax({...input(1500000),savingsInterest:15000}).deduction80TTA).toBe(0);});
  it("caps deductions and does not carry them into new regime",()=>{const x={...input(1500000,"old"),eligible80C:200000,eligible80D:30000};expect(calculateTax(x).deduction80C).toBe(150000);expect(calculateTax(x).deduction80D).toBe(25000);expect(calculateTax({...x,regime:"new"}).deduction80C).toBe(0);});
  it("uses the employer NPS base and employer category",()=>{const x={...input(1500000,"old"),employerNps:150000,basicDa:1000000};expect(calculateTax(x).employerNpsDeduction).toBe(140000);expect(calculateTax({...x,employerType:"psu"}).employerNpsDeduction).toBe(100000);});
  it("rounds after discarding paise, including refund half ties",()=>{expect(roundStatutory(120000499)).toBe(1200000);expect(roundStatutory(120000500)).toBe(1200010);expect(roundStatutory(-1500)).toBe(20);expect(roundStatutory(-1499)).toBe(10);});
  it("subtracts credits before rounding and separates refund",()=>{const r=calculateTax({...input(1275000),salaryTds:15});expect(r.estimatedRefund).toBe(20);expect(r.estimatedPayable).toBe(0);const t=calculateTax({...input(1500000),salaryTds:97506});expect(t.estimatedRefund).toBe(10);});
  it.each([-1,NaN,Infinity,10.001])("rejects invalid money %s",v=>expect(()=>calculateTax(input(v))).toThrow());
  it("rejects unsupported years and over-50L taxable income",()=>{expect(()=>calculateTax({...input(1000000),year:"2025-26" as "2026-27"})).toThrow();expect(()=>calculateTax(input(6000000))).toThrow();});
});
