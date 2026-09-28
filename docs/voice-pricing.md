# OpenAI voice pricing

This app uses a chained voice pipeline so GPT-6 Luna remains the reasoning model. It does not use a ChatGPT subscription or the Realtime API's separate audio pricing.

Verified from official model/pricing pages on 28 September 2026. Standard USD rates; prices and project access can change.

| Component | Model | Published billing |
| --- | --- | --- |
| Listen | `gpt-4o-mini-transcribe` | Estimated $0.003 per input audio minute |
| Speak | `gpt-4o-mini-tts` | $0.60 per million input text tokens + $12 per million output audio tokens |
| Reason | `gpt-6-luna` | $0.10 per million input text tokens + $0.50 per million output text tokens for standard short-context requests |

Five minutes of user audio is approximately **$0.015 for transcription alone**. As a token-usage example, 2,000 TTS input text tokens and 10,000 generated audio tokens cost **$0.1212 for speech generation**. These are examples, not a fixed price for a five-minute call. The actual spoken duration, audio-token count, language, turn count and reasoning usage determine the bill.

There is no separate per-minute connection charge in this implementation: quiet time while browsing does not send silent recordings to the provider. Audio may include short silence around an utterance. In-flight requests can still incur usage if a call is stopped after they were sent. Hosting, tax, currency conversion and optional Gemini knowledge calls are additional. The proposed ₹21 service fee is not an API-cost estimate.

Use the provider's usage/billing dashboard for actual charges. A fixed all-in INR quote would require real usage measurements and the current exchange rate; this document does not invent one.

Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Mini TTS](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
