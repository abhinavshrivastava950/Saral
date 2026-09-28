# Form 16 and payroll connections

Form 16 is issued by the employer, generally through its payroll/DDO/HR process using tax-deduction records. Employees may receive it electronically, from a payroll portal, or from their employer. Saral cannot generate an authentic certificate without the employer acting as its issuer.

Central departments, state governments and PSUs do not share one universal employee Form 16 retrieval API. The ERI prefill service provides taxpayer information and is a separate capability from fetching the employer's original PDF.

The `PayrollConnector` contract supports per-employer OAuth consent with PKCE, connection lifetimes, listing year-specific salary documents, retrieving employer-issued bytes and revocation. No connector is active by default. Do not implement a password-collecting portal scraper as a shortcut.

For each connection obtain the exact employer/payroll provider, approved API contract, test credentials, consent scopes, data-handling terms, callback allowlist and revocation rules. Validate returned issuer, financial year and document provenance; pipe downloaded bytes through the same bounded document-processing path, display fields, and ask the employee to confirm. Preserve the original certificate's issuer; never relabel an inferred worksheet as Form 16.

Fallback: request a certificate from the employer, use its annual salary statement, or provide confirmed annual totals. Bank/FD interest and loans still need additional information even where payroll fetching succeeds.
