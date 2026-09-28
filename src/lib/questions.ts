import type { Filing } from "./domain";
/** Question selection is deterministic so the assistant asks only for missing relevant facts. */
export function nextQuestion(f:Filing):{en:string;hi:string}{
  if(f.salary.annualSalary===null)return {en:"What was your total gross salary for April 2025–March 2026? Tell me the annual amount from payroll, not take-home pay.",hi:"अप्रैल 2025 से मार्च 2026 तक आपका कुल सकल वेतन कितना था? सालाना राशि बताएँ, हाथ में मिलने वाला वेतन नहीं।"};
  if(f.salary.salaryTds===null)return {en:"How much tax did your employer deduct from salary over the year? Use the annual TDS total.",hi:"पूरे वर्ष में आपके वेतन से कितना टीडीएस काटा गया? सालाना राशि बताएँ।"};
  if(f.salary.employerNps===null)return {en:"How much did your employer contribute to NPS during the year? Keep your own contribution separate.",hi:"पूरे वर्ष में आपके नियोक्ता ने एनपीएस में कितना योगदान दिया? अपना योगदान अलग रखें।"};
  if(f.salary.employerNps>0&&f.salary.basicDa===null)return {en:"What is the annual basic salary plus eligible DA shown in payroll for the NPS calculation?",hi:"एनपीएस की गणना के लिए वेतन विवरण में सालाना मूल वेतन और पात्र डीए कितना है?"};
  if(f.salary.savingsInterest===null)return {en:"How much savings-account interest did you earn across all banks? Please use the total annual interest, not the account balance.",hi:"सभी बचत खातों से साल भर में कितना ब्याज मिला? खाते की कुल जमा राशि नहीं, ब्याज बताएँ।"};
  if(f.salary.depositInterest===null)return {en:"Did you earn FD or recurring-deposit interest? Tell me the annual interest and the source statement.",hi:"क्या एफडी या आरडी से ब्याज मिला? सालाना ब्याज और जानकारी का स्रोत बताएँ।"};
  if(f.salary.otherTds===null)return {en:"Was any tax deducted from your bank interest? Tell me the total interest TDS, including zero if you checked there was none.",hi:"क्या बैंक के ब्याज से टीडीएस काटा गया? जाँचकर कुल राशि बताएँ, नहीं कटा हो तो शून्य।"};
  return {en:"Your main salary and interest amounts are entered. Is there an investment, loan, deduction or information source you want us to record for review?",hi:"वेतन और ब्याज की मुख्य जानकारी दर्ज है। कोई निवेश, ऋण, कटौती या जानकारी का स्रोत जाँच के लिए बताना चाहेंगे?"};
}
