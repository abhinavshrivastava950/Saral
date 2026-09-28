# Approved ERI gateway contract

`OfficialEriAdapter` calls **our normalized server-to-server gateway**, not fabricated Income Tax endpoints. Implement this gateway with the approved operator's current official specifications. Do not scrape or automate the e-Filing website.

All operations: HTTPS POST, `Authorization: Bearer ERI_GATEWAY_TOKEN`, JSON, explicit timeouts. Secrets remain server-side. Network destinations are deployment configuration, never user-provided URLs.

| Gateway operation | Adapter method | Required meaning |
| --- | --- | --- |
| `/v1/authenticate` | authenticate | Authorized official session; return sessionReference |
| `/v1/clients` | addClient | Add taxpayer under recorded, scoped consent; return clientReference |
| `/v1/prefill` | getPrefill | Official source only; normalize fields without claiming completeness |
| `/v1/generate` | generateItrPayload | Map preparation packet into pinned, current official ITR schema |
| `/v1/validate` | validateItr | Full official/business validation; official:true plus errors |
| `/v1/submit` | submitItr | Idempotency-safe official submission; source:official and reference |
| `/v1/e-verify` | eVerify | Official verification/redirect; no OTP is sent to conversational AI |
| `/v1/acknowledgement` | getAcknowledgement | Only a confirmed verified official return; number and receivedAt |

Payload interfaces and response validation are in `src/server/eri.ts`. `saral-preparation-packet-v1` exports are **not** valid official upload JSON. Do not submit them directly to ITD. Add the official schema artifact, checksum, schema tests, dated cross-field rules and integration fixtures as part of onboarding.

Gateway must implement taxpayer authorization, credential rotation, allowed scopes, token expiry, official-schema versioning, official-request reference logging, idempotency, reconciliation after network uncertainty, e-verification expiry, official acknowledgement retrieval and no automatic retry of uncertain submissions. Whitelist exact verified redirect hostnames with `ERI_REDIRECT_HOSTS`. Add e-verification status synchronization before live operation.

The adapter supplies code boundaries so official transport changes do not require rewriting the UI or tax engine. It does **not** provide credentials, ERI approval, invented APIs or official certification. The current application retains filing launch gates even if a gateway URL is configured.

Official background: [ERI services](https://www.incometax.gov.in/iec/foportal/help/eri/servicesavailable), [API specifications](https://www.incometax.gov.in/iec/foportal/api-specifications). Confirm the operator's live contract; public specification versions may be older than the production system.
