# Saral · सरल

A working, bilingual ITR preparation application for central government, state government and PSU employees. Built with Next.js App Router, React, TypeScript, Supabase/PostgreSQL, private object storage and OpenAI structured outputs.

**PAN-first, fetch-first, chat only for gaps.** The user says “File my ITR”, provides PAN, authorizes the available provider connections, and receives a prepared summary. No salary/profile forms or routine Form 16 uploads appear in the primary journey. Employees do not fill Form 16: their employer issues it. Missing or conflicting information is collected in the conversation. The app never invents fetched records or claims an official acknowledgement without an official response.

See [required provider connections and the normalized gateway contract](docs/records-contract.md). PAN identifies a taxpayer; it does not authorize access. The user must complete the providers’ required identity/consent steps and official verification.

## Interactive demo — ready to try

The local app now opens a complete motion-led demo. Choose **Everything connected** for a zero-question journey or **Just one question** to let GPT-6 Luna fill a missing FD-interest amount from chat. Review, simulate filing, simulate verification, and download a prominently marked demo receipt. No actual ITR is filed.

**Talk to Saral** opens the voice-call experience: OpenAI speech recognition → GPT-6 Luna reasoning → OpenAI spoken reply. The call defaults to Hindi and minimizes into a floating panel while you navigate the app. Spoken answers and corrections save directly to the same bound draft and refresh its summary; final approval stays on screen. Gemini also supplies bounded explanatory notes for tax questions. See [demo and voice documentation](docs/demo-and-voice.md) for provider configuration, microphone behavior and smoke tests. All keys remain server-side.

## Current capabilities and honest limits

Implemented: responsive saffron English/Hindi UI; passwordless Supabase authentication; isolated local sample accounts; saved returns; PAN capture; source-connection orchestration; structured AI interpretation; editable speech transcription; final summary confirmation; loan and source declarations; deterministic old/new tax comparison; review; filing-blocking validation; encrypted profile/document management; audit trail; administrator monitoring; proposed ₹21 fee screen; filing status and acknowledgement views; an official ERI gateway contract and employer payroll connector interface.

**This is a production-oriented foundation, not a certified live filing service.** Live ERI submission deliberately remains blocked until the official schema mapping, current filing-date/interest/fee rules and approved integration are certified. The isolated local demo uses explicitly fictional records and DEMO-labelled receipts. It never claims those are official acknowledgements or fetched taxpayer data. Live AI responses use the configured providers. Loans, additional income and unimplemented deductions are recorded and flagged, not silently excluded from an allegedly complete return.

The collection mode is now conversation-only. A normalized approved-data gateway fills known facts and supplies source references; GPT interprets only missing or corrected answers. The final summary is read-only and corrections are made in chat.

The calculation subset is **AY 2026–27 / FY 2025–26**, resident ordinarily resident adults under 60, salary plus ordinary bank savings/FD/RD interest, taxable income at most ₹50 lakh. This is narrower than statutory ITR-1 eligibility. It excludes property income/loss, capital gains, business, foreign situations and the other cases described by the eligibility questions. Loan/HRA claims and additional-income notes require review before filing. The estimate is explicitly a **core estimate before filing adjustments**.

## Run locally

Requires Node.js 22+ and npm.

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** and click **Experience the demo**. It creates an isolated local session and uses the fictional Aarav Sharma profile—no PAN entry or tax form needed. Choose a scenario, review the prepared summary, and continue through simulated submission and verification. **Talk to Saral** adds voice after explicit microphone consent.

The local sample workspace deliberately does not fetch real taxpayer records. Do not use actual PAN or tax data there. A configured OpenAI key can be checked with `node scripts/check-ai.mjs`; that check sends no taxpayer information and never prints the key.

Without a Supabase configuration, `next dev` creates an encrypted local sample store under ignored `.local/`. The development key is stored on the same machine. This mode is not suitable for real taxpayer data; it is disabled when `NODE_ENV=production`. Each local account is an 8-hour signed HTTP-only session; signing out does not provide account recovery. Production uses verified Supabase user identities.

Copy `.env.example` to `.env.local` when connecting services. No key is exposed through a `NEXT_PUBLIC_` variable. Without AI configuration, PAN capture and connection-status checks still work. AI interpretation of factual follow-up answers requires the server-side key. Missing integrations return explicit unavailable errors; there is no manual-form fallback.

## Connect production services

1. Create a Supabase project in the selected deployment region. Run `supabase/migrations/202609270001_initial.sql`. It creates encrypted-payload tables, RLS policies, atomic revision/audit functions, a distributed rate limiter and a **private** `tax-documents` bucket. Test migrations and RLS against a disposable project before deployment.
2. Set `APP_MODE=production`, HTTPS `APP_URL`, Supabase URL/anon/service-role values and a base64-encoded 32-byte `DATA_ENCRYPTION_KEY`. Generate the key using a secure secret manager. The service-role key must remain server-side. Back up the encryption key independently: losing it makes the records unreadable. Document a rotation/re-encryption procedure before accepting production data.
3. Configure Supabase Auth email delivery, abuse controls, site URL and the exact `/auth/callback` redirect. The callback uses PKCE. Use a real SMTP provider and exercise email-link expiry and logout. Set administrator roles only via trusted `auth.users.app_metadata.role = "admin"`; user-editable metadata cannot grant access.
4. Set `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna`, and `GEMINI_API_KEY`. OpenAI voice and Gemini supporting-knowledge model defaults are listed in `.env.example`. Evaluate extraction accuracy on representative Hindi/English salary records. Review provider retention, data-residency and processor agreements. `store:false` is not a claim of zero provider retention.
5. Complete the approved Type-2 ERI onboarding and implement the normalized gateway in `docs/eri-contract.md`. Verify the current official AY schema and validation rules. Complete the filing-adjustment calculation module and review process before changing the explicit launch gates in `src/lib/validation.ts`. Credentials alone do **not** certify the missing regulatory logic.
6. Connect employer payroll systems individually using `src/server/payroll.ts`. An employer API/consent contract is required; no generic Form 16 endpoint is invented. See `docs/employer-connections.md`.
7. Payment collection remains intentionally disabled. The ₹21 is a **proposed service fee**. Integrate a payment provider with server-priced orders, signed/idempotent webhooks, reconciliation and refunds before enabling collection. Never accept a client-reported “paid” flag.
8. Configure and monitor retention cleanup: schedule `POST /api/internal/purge` every 15 minutes with `Authorization: Bearer <CRON_SECRET>` (at least 32 characters). Retry errors and alert if backlog grows. Raw uploads are not persisted by default. Keep `DOCUMENT_RETENTION_ENABLED=false` until the job is working; retained files expire after 24 hours and are removed in batches of 100. Repeat runs for larger backlogs. Define separate confirmed-return/audit retention and account-erasure policies before launch.

## Deploy

Use a Node.js host supporting Next.js server routes, or the provided multi-stage Dockerfile. Sites' default Worker starter is not used because this application follows the requested Next.js/Node stack with Node crypto and Supabase; publishing a static export would remove the backend.

```bash
npm run typecheck
npm test
npm run build
# After setting production environment variables:
npm start
```

```bash
docker build -t saral-itr .
docker run --env-file /secure/path/production.env -p 3000:3000 saral-itr
```

Terminate TLS at the host/reverse proxy, set the exact HTTPS `APP_URL`, enforce an 11 MB request-body limit, set appropriate upstream timeouts (AI requests can take 60 seconds), protect operational logs, and configure backups/alerts. API responses are private/no-store. Local sample login cannot be enabled in production. `/api/health` is a process-health check, not a certification of connected dependencies.

The checked-in GitHub Actions workflow runs type checking, unit tests, production build and production dependency audit. The repository is not deployed to a public host by this setup.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Chrome against the local server and fictional data. They exercise the complete demo receipt, missing-only questions, voice consent, microphone cleanup with mocked hardware, ownership and lifecycle guards, mobile layout and reduced motion. Unit tests cover tax calculations, encryption, source discrepancies, review snapshots, demo isolation and audio wrapping. Real OpenAI, Supabase, employer and ERI integration tests require configured sandbox accounts; passing local tests is not evidence that those live integrations have been certified.

## Main routes

| UI | Purpose |
| --- | --- |
| `/` / `/welcome` | Conversation workspace |
| `/login` | Secure email-link login / isolated local sample access |
| `/filings/new` | Explicit processing consent |
| `/filings/:id` | PAN-first record connections, missing-only conversation and read-only review |
| `/filings/:id/payment` | Proposed ₹21 service fee and payment availability |
| `/filings/:id/status` / `/acknowledgement` | Official-state-only tracking |
| `/documents` / `/profile` | Record lifecycle / redirect to conversation, without profile forms |
| `/guide` / `/privacy` / `/connections` | Filing guidance, processing information and required providers |
| `/admin` | Server-role-restricted operational events |

`src/app/api/[...path]/route.ts` dispatches authenticated APIs to separate services. Mutations require the configured same-origin request; all sensitive reads enforce ownership. JSON and multipart bodies are bounded. See `docs/architecture.md` for the model and state machine.

## AI model choice

The verified default is GPT-6 Luna: $0.10 input / $0.50 output per million tokens under published standard short-context pricing at the time of implementation. It supports images and structured outputs but needs a separate transcription model for audio. Gemini 3.1 Flash-Lite and 3.5 Flash-Lite were more expensive in the reviewed official pricing; no cheaper **and more accurate** alternative was established. Benchmark real extraction tasks rather than equating token price with accuracy.

Sources: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Google model pricing](https://ai.google.dev/gemini-api/docs/pricing), [Google model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations). See `docs/tax-rules.md` for authoritative tax references.
