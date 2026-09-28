# Interactive demo and voice experience

## Run the complete demo

Start `npm run dev`, open http://127.0.0.1:3000, choose a scenario, and click **Experience the demo**.

- **Everything connected:** fictional employer, tax, bank and deduction records are assembled. No factual question is needed. The real deterministic tax engine compares regimes; expand the details, approve the summary, simulate submission, then simulate verification to get the marked receipt.
- **Just one question:** the FD-interest field is intentionally unknown. Enable AI chat and state the annual interest (the sample uses ₹18,000). GPT-6 Luna extracts the answer and the deterministic engine recalculates. No taxpayer form is shown.
- **Voice:** Talk to Saral or Voice call opens an explicit microphone/data-processing consent screen. The call greets you, listens until a natural pause, transcribes your answer, processes it and speaks the response. Tap the microphone control to interrupt speech or finish a turn. Use **Minimize** or Escape to keep talking while you browse. The floating call panel supports pause/resume, reopen and End call. Only End call (or leaving/reloading the browser document) releases the microphone.

The sample is fictional Aarav Sharma. Salary ₹14,40,000, employer NPS ₹84,000 on the defined ₹6,00,000 base, savings interest ₹7,200, FD interest ₹18,000, salary TDS ₹1,00,000 and interest TDS ₹1,800. Eligible sample deductions are included in the fixture. The engine produces a core new-regime refund estimate of ₹22,830; no actual refund is initiated.

## Demo safety boundary

`src/server/demo.ts` uses a separate `filing.demo` state machine and `DEMO-` references. Official reference and acknowledgement fields remain null. API guards reject official actions for demo records. Demo endpoints require local development mode and an owner-scoped signed session. A demo cannot be enabled merely by submitting a `demo` flag to production endpoints.

Review hashes and revisions protect the simulated submission too. Only production-integration launch checks are excluded from demo preflight; uncertain data and unsupported loans/claims still block it. The receipt explicitly says **not filed with the Income Tax Department**. There is no simulated real payment or refund. These fixtures must never be presented as live-fetched records.

## Hindi and navigation

Voice starts in **Hindi** by default, with English and automatic Hindi/English options. OpenAI transcription is instructed to retain Hindi speech in Devanagari and preserves spoken amounts, units and corrections. Luna normalizes those answers into typed draft fields; spoken confirmations use Hindi labels and the exact saved values, not model-generated tax arithmetic.

The call is owned by `VoiceSessionProvider` in the shared root layout. Client-side navigation between Overview, Help, Connections and the return does not recreate the microphone or AudioContext. A minimized panel always identifies the bound return. Opening another return does not silently retarget the call; end the existing call before connecting to another one.

The provider reads the latest revision before every voice turn and retries one revision conflict safely. Both interpretation and return-specific questions receive `currentReturnContext`: current values, calculated estimates for both regimes, selected/recommended regime, validation holds, filing status and recent conversation. This is the saved return state, not arbitrary screen contents or unsaved composer text. Updates are broadcast to the currently visible return and shown as before/after changes. Returning from another page reads the saved state. Changes invalidate previous approval. Voice cannot approve or submit a return.

The microphone is disabled during playback and processing to reduce echo. Quiet periods do not end the call or send silent audio to the provider. Pause disables capture; resuming is explicit. In-flight, already submitted answers can finish saving after a call ends, but late audio never plays. Full-page reloads, sign-out, closing the tab or leaving the app document end the call; cross-site/background mobile-browser persistence is not promised.

## Provider roles

- **GPT-6 Luna:** structured interpretation, classification and the final conversational explanation. It cannot authorize filing or supply final tax arithmetic.
- **OpenAI voice:** `gpt-4o-mini-transcribe` listens and `gpt-4o-mini-tts` speaks using the `marin` voice. The voice is explicitly disclosed as AI-generated.
- **Gemini:** supporting explanatory notes using a bounded set of cited application facts. This is not an unrestricted current-law search engine. Knowledge notes go to Luna for the final response.
- **Deterministic TypeScript engine:** regime comparison, statutory arithmetic, limits and validation.

OpenAI voice uses `/v1/audio/transcriptions` and `/v1/audio/speech`, with WAV output. Model/voice defaults are configured through `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE`. Gemini is used only for supporting knowledge notes. Keys remain only in server environment variables. `store:false` does not promise zero retention by a provider; review account tier, agreements and processing settings before real data use.

Voice is an application-managed, turn-based call experience, with GPT-6 Luna controlling the tax agent. Browser MediaRecorder plus RMS silence detection sends one utterance after a pause. This keeps Luna in charge and prevents a voice model from submitting a return. The audio meter reflects actual microphone/playback amplitude. Audio and transcripts are visible, raw audio is not persisted, and end-call cleanup blocks late playback. Browser microphone/HTTPS support and provider availability are required. Headphone use can improve echo behavior.

## Verification

`npm test` covers demo isolation, lifecycle, deterministic amounts and WAV conversion. `npm run test:e2e` covers both visual layouts, reduced motion, the complete marked receipt, missing-only questions, voice consent, ownership and invalid phase transitions. Browser tests mock the microphone/provider boundaries and additionally verify navigation persistence, pause/resume, correct return binding, off-page Hindi edits and microphone cleanup. They do not use a person's microphone or bill provider calls.

Optional live smoke tests (small billable requests, fictional content only):

```bash
node scripts/check-ai.mjs
node scripts/check-gemini.mjs
node scripts/check-voice.mjs
node scripts/check-demo-ai.mjs
node scripts/check-hindi-voice.mjs
```

The demo AI script checks live Luna extraction and the Gemini-to-Luna explanatory path. The Hindi script generates a fictional Hindi sentence, transcribes it, fills FD interest, then verifies that a Hindi correction changes ₹18,000 to ₹22,500 and clears the previous approval. Both delete their test draft afterwards. The voice smoke test generates one short sentence and transcribes it back. Browser/hardware microphone quality still needs user-device testing.

Sources: [OpenAI speech generation](https://developers.openai.com/api/docs/guides/text-to-speech), [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text). See [voice pricing](voice-pricing.md) for the verified billing units.
