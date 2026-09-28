# Architecture and security boundaries

## Data flow

Browser → authenticated same-origin Node API → schema validation → owner-scoped repository → encrypted Supabase payloads.

Optional document/text/audio → separate explicit processing consent → OpenAI adapter → validated **proposal** → user-visible fields → user confirmation → deterministic tax engine → review hash → filing validation → approved ERI gateway → explicit submission consent → official response → verification → official acknowledgement.

Loan and extra-income declarations are included in the worksheet and review hash, with unresolved cases blocking submission. Supporting source notes are retained with the worksheet. The AI may propose these notes but cannot approve them.

## Modules

- `src/lib/domain.ts`: shared Zod schemas and typed field names.
- `src/lib/tax.ts`: pure AY-specific integer-paise calculations. No AI or network dependency.
- `src/lib/validation.ts`: supported eligibility, confirmed-field rules, discrepancies and launch gates.
- `src/server/ai.ts`: OpenAI Responses structured extraction and separate audio transcription.
- `src/server/crypto.ts`: versioned AES-256-GCM envelopes with randomized nonces and owner/record AAD.
- `src/server/repository.ts`: Supabase and isolated encrypted local implementations; optimistic revisions and atomic audits.
- `src/server/filings.ts`: changes invalidate approval; review hashes bind salary, scope, declarations, profile, prefill and rule version.
- `src/server/eri.ts`: normalized gateway contract; development adapter cannot submit or fabricate success.
- `src/server/payroll.ts`: employer-specific OAuth/API extension interface.
- `src/server/security.ts`: strict origin checks, bounded bodies and shared production rate limiting.

## Submission state machine

`draft → prepared → submission_pending → submitted → verified`

Preparation is a distinct state and is never named “filed.” Submitted state requires an official reference. Verified/acknowledgement state requires an official verified response. The optional verification-pending state is reserved for asynchronous official workflows.

Before outbound submission, persist the idempotency key and submission intent. An uncertain timeout leaves `submission_pending` locked; the approved integration must reconcile it against official status. Never create a fresh submission merely because the request timed out. Automatic recovery of uncertain submissions is a launch requirement for the gateway.

## Security controls

- Production Supabase `getUser()` validation, server-side PKCE cookie handling, HTTP-only cookies and HTTPS.
- Every repository request is scoped to the verified identity, not a user ID supplied by the browser. DB RLS provides a second read-access boundary; browser roles cannot write.
- Application encryption binds ciphertext to a specific owner/record. Production key storage must use a secret manager. Local key co-location is explicitly sample-only.
- No PAN, bank number, salary, provider error body, OTP, transcript or document body in logs. Request IDs connect safe operational errors to support.
- CSRF checks require exact configured Origin and reject cross-site requests. No wildcard CORS. CSP, frame restrictions, nosniff and HTTPS headers are set in Next config.
- Documents: 10 MB limit, MIME/signature validation, no direct browser rendering, no public links, default memory-only processing. Optional retained content is encrypted again before private storage.
- Speech: explicit consent, user gesture for microphone, 60-second client recording limit, 8 MB server size limit, editable transcript before interpretation. Server rate limits also bound cost; add organization budget alerts.
- Audit and update operations are atomic for profile/filing writes in PostgreSQL. Audit rows contain safe action metadata. Add operational retention and append-only external log export appropriate to the operator.

## Operational limits that remain

Live Supabase migrations/RLS need a configured staging project; AI quality needs a representative evaluation set. The official AY schema mapper, date/interest/fee calculation rules, approved ERI onboarding, bank validation and acknowledgement contract remain integration/certification work. Payment collection and employer connectors are disabled. Adding secrets does not remove these gates automatically.

Do not market this foundation as certified or ready for live taxpayer filing until those gates are closed and reviewed. No automated security scan replaces an independent deployment security review.
