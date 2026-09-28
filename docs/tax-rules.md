# Tax calculation scope and sources

Version: `AY2026-27-salary-v1`. FY 1 April 2025–31 March 2026 only.

The engine is deliberately narrower than ITR-1. Supported: ordinarily resident salaried adults under 60, ordinary savings/FD/RD interest, taxable income up to ₹50 lakh. Central/state/PSU/other employer categories are explicit. New regime default; old regime comparison is an estimate, not confirmation that a late election is allowed.

## Implemented rules

- New slabs: 0–4L 0%, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25%, above 24L 30%.
- Old under-60 slabs: 0–2.5L 0%, 2.5–5L 5%, 5–10L 20%, above 10L 30%.
- Standard deduction is limited by salary: ₹75,000 new; ₹50,000 old. It is applied once to aggregate salary.
- Ordinary-income section 87A rebate: at most ₹60,000 when new-regime total income is ≤₹12 lakh; at most ₹12,500 when old-regime income is ≤₹5 lakh. New-regime marginal relief compares slab tax against income above ₹12 lakh.
- Cess 4% after rebate/relief. No surcharge in supported income range.
- Old: eligible 80C capped ₹1.5L, self-only eligible under-60 health premium 80D capped ₹25,000, savings-only 80TTA capped ₹10,000. These are excluded from new-regime comparison and excluded entirely if the taxpayer opts out of entering old-regime deductions. Entered values are preserved, not erased.
- Employer NPS: actual contribution limited by eligible basic + DA; 14% for central/state government in both regimes; 10% for PSU/other in old regime and 14% in new regime. Gross salary must already include the contribution. Employee NPS is not treated as employer NPS.
- HRA and professional tax are considered only in old comparison. Claimed HRA is not a validated exemption and blocks filing pending review.
- Use integer paise. Section 288A/288B rounding discards paise first and rounds to nearest ₹10. Credits are subtracted before final payable/refund rounding; negative refund magnitudes are rounded positively.

Loan interest, property, personal NPS deductions, parents/family 80D, donations, special-rate income and other unimplemented claims are NOT quietly assumed eligible. Record and flag them. Separate DOB boundary validation protects the under-60 scope; senior/minor situations need a new calculator branch.

## Launch gates

Core tax is not final tax due. Sections 234A/B/C, applicable late fees, section 89 relief, filing dates, old-regime election deadlines, official credit reconciliation, exact AY schema validation and all relevant official cross-field rules must be resolved before filing. The unconditional launch errors in `filingIssues()` deliberately protect that boundary.

## Official references

- [ITD salaried individuals AY 2026–27: rates, forms and deductions](https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1)
- [Current ITR-1 FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/ITR1-FAQ?mobile-app=1)
- [Official Form 16 sample and issuer](https://eportal.incometax.gov.in/iec/foservices/assets/pdf/1_Form16_Sample.pdf)
- [Income-tax Act through Finance Act 2025](https://incometaxindia.gov.in/Documents/income-tax-act-1961-as-amended-by-finance-act-2025.pdf)
- [Section 16](https://wmstatic-prd.incometaxindia.gov.in/web/guest/w/section-16-63)
- [Official AY 2026–27 ITR-1 schema v1.1](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-06/ITR-1_2026_Main_V1.1.json)
- [Official AY validation rules](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-05/CBDT_e-Filing_ITR%201_Validation%20Rules_AY%202026-27.pdf)
- [AIS FAQ](https://www.incometax.gov.in/iec/foportal/ais-faq)

Review authoritative updates and pin a new ruleset before supporting another financial year. Source links do not imply that the official schema has already been implemented or certified here.
