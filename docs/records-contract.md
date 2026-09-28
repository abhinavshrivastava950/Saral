# PAN-first, fetch-first conversation

The user says “File my ITR”, supplies PAN to identify the taxpayer, and authorizes access. The system requests records before asking factual questions. The interface contains no taxpayer profile or salary form and does not ask the user to upload Form 16.

PAN is an identifier, not proof of identity or authorization. The operator must establish an authenticated user session, obtain the provider's required consent/verification, and bind each connection to that user, PAN, year and return. Never implement PAN-only access to private records.

## Required connections

1. An approved Type-2 ERI or authorized filing partner: client consent, prefill, validation, submission, e-verification and acknowledgement. Prefill does not imply universal AIS/26AS or Form 16 PDF access; confirm the partner's actual current contract.
2. Each supported employer/payroll/HRMS system: consented retrieval of its employer-issued Form 16 or authoritative salary/TDS records. Central departments, state systems and PSUs need specific authorized integrations. No universal public PAN-to-Form-16 API is assumed.
3. Where needed, an authorized bank/financial-data partner for interest or investments, and lender/NPS/insurance data for supporting claims. Account Aggregator participation is subject to eligible regulated FIU arrangements and purpose/consent restrictions; an ordinary application cannot assume direct access to every bank or loan using PAN. Institution and field coverage varies.
4. OpenAI: structured interpretation and natural-language answers. It supplies neither account authorization nor authoritative tax arithmetic.

## Normalized gateway

The application calls **our gateway** `POST /v1/records/sync` with server-side bearer authentication. These are not invented ITD URLs. Configure `TAX_DATA_GATEWAY_URL`, `TAX_DATA_GATEWAY_TOKEN` and the exact `TAX_DATA_AUTH_HOSTS` after onboarding partners. Production-only: real taxpayer connections are disabled in local sample mode.

Input contains `ownerReference`, `filingReference`, `pan`, `assessmentYear`, `consentAt`, existing connection references and an application return URL. Gateway must bind these to its authenticated consent sessions. A record request can return authorization-required, unavailable or error separately for each source; those states must never be disguised as success.

Response schema is implemented in `src/server/records.ts`:

```json
{
  "source": "authorized_gateway",
  "subjectPan": "<the requested taxpayer PAN>",
  "assessmentYear": "2026-27",
  "records": [
    {
      "kind": "tax",
      "status": "authorization_required",
      "detail": "Complete the official taxpayer consent process",
      "reference": "<opaque connection reference>",
      "authorizationUrl": "https://<approved-provider-host>/<consent-session>"
    }
  ]
}
```

Kinds: `tax`, `employer`, `bank`, `deductions`. A `ready` record must include a unique source reference and ISO receivedAt timestamp, plus normalized `salary`, `profile`, `scope` or `declarations` fields supported by the shared schemas. Only include facts present in the authorized source; absence is not zero, no loan, Indian residency or eligibility. For employer PDFs, the gateway/connector must retrieve and process the actual authorized document; it must not fabricate normalized salary fields. Keep document issuer, financial year and evidence references intact.

The application rejects mismatched PAN/year, duplicate sources, unapproved redirects and ready records without provenance. Conflicting values are retained for resolution, not overwritten. Every new record or answer invalidates previous review approval.

When all required facts are available and reliable, no factual question is asked: the chat goes to its prepared summary. Unknowns, low confidence, unsupported income and conflicts generate only the necessary questions/review holds. Never let an LLM's confidence or assertion of completeness replace official validation.

The user approves a snapshot-bound summary and authorizes submission. E-verification and acknowledgement follow the official service. Source access consent alone is not permission to submit a return silently. Live filing retains the existing official schema/date/interest/fee certification gates.

References: [official ERI API overview](https://www.incometax.gov.in/iec/foportal/api-specifications), [ITD salaried records](https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1), [RBI financial-awareness material on consented AA data](https://www.rbi.org.in/commonman/images/FAME202426022024.pdf).
