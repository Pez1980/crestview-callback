# Crestview Callback

Form at https://crestview-callback.vercel.app/ — voice AI calls the lead back
within seconds of submission and books a Cal.com consultation.

## Voice provider switch

`VOICE_PROVIDER` (Vercel production env) picks the telephony backend for
`api/request-callback.js`:

| Value | Path |
|---|---|
| `telnyx` (default) | Telnyx `POST /v2/calls` with the Telnyx-hosted AI assistant (`telnyx-agent/`) |
| `vonage` | ElevenLabs `POST /v1/convai/sip-trunk/outbound-call` — the EL agent dials out over its Vonage SIP trunk (`sip.nexmo.com`), agent picked per call by language (`vonage-agent/`) |

Switch with one command (flips the env var and redeploys — env changes only
apply on a new deployment):

```
./scripts/switch-voice-provider.sh vonage   # or telnyx
```

**This switch is independent of LeadTracker's `DIALER_PROVIDER` on EC2.**
Moving the whole platform off Telnyx means flipping both.

## Vonage path notes

- Agents live in ElevenLabs: "Crestview Callback Agent EN" and "… ES-MX"
  (configs mirrored in `vonage-agent/*.json`, behavior parity with the Telnyx
  assistants: same persona, 6-step Cal.com booking flow, same tool endpoints).
- Both languages share one EL phone number (`ELEVENLABS_PHONE_NUMBER_ID`,
  +17735425943); `agent_id` is chosen per call, so ES needs no second number.
- Lead context is passed as `conversation_initiation_client_data.dynamic_variables`.
- `api/vonage-ncco.js` / `api/vonage-event.js` are legacy from the abandoned
  Vonage-originated NCCO→SIP approach, which never completed a call (every
  attempt failed in 0–1s; ElevenLabs-originated calls replaced it Aug-2026).
- Carriers reply SIP 403 to fictional numbers (e.g. +1500555xxxx) — a 403 on
  the smoke-test number does not mean the trunk is broken.
