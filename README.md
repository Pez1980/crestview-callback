# Crestview Callback

Form at https://crestview-callback.vercel.app/ — voice AI calls the lead back
within seconds of submission and books a Cal.com consultation.

## Voice provider switch

`VOICE_PROVIDER` (Vercel production env) picks the telephony backend for
`api/request-callback.js`:

| Value | Path |
|---|---|
| `telnyx` (default) | Telnyx `POST /v2/calls` with the Telnyx-hosted AI assistant (`telnyx-agent/`) |
| `vonage` | Vonage `POST /v1/calls` dials the lead; the answer NCCO (`api/vonage-ncco.js`) SIP-connects to the ElevenLabs agent, routed by language via the dialed EL number (`vonage-agent/`) |

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
  assistants: same persona, 6-step booking flow — native LeadTracker
  scheduling via `/api/public/cta/swiftleads`, not Cal.com).
- Agent routing is by dialed EL number: EN = +17735425943, ES-MX =
  +17735425944 (the ES number is an EL registration used purely as a routing
  token — it is not a live DID).
- Lead context travels as X-* SIP headers on the NCCO connect; ElevenLabs
  exposes them as `{{sip_x_<header>}}` (X-Lead-First-Name →
  `{{sip_x_lead_first_name}}`). The July 2026 failures were caused solely by
  prompts using `{{sip_lead_*}}` (missing the `x_`).
- Do NOT switch to ElevenLabs-originated outbound (`sip-trunk/outbound-call`):
  Vonage's legacy `sip.nexmo.com` termination replies SIP 403 even with valid
  api-key/secret digest credentials; the modern path needs a Programmable SIP
  domain provisioned in the Vonage dashboard.

## Outbound AI voicemail detection

Vonage callbacks use paid Advanced Machine Detection with `mode: default`,
`behavior: continue` and a 45-second beep timeout. Detection runs in parallel
with the agent connection; it does not delay the answer NCCO or automatically
leave a voicemail. The Telnyx path retains its existing premium detection.

Human/machine results are sent directly to LeadTracker's
`/api/public/cta/:brand/callback-voice-event`. The event URL carries a 15-minute
HMAC capability over `callback-amd-v1.timestamp.brand.to.from`, using the
existing shared `VONAGE_API_SECRET`. LeadTracker additionally matches tenant,
outbound Vonage UUID, phone pair and call creation time before storing results.
Deploy the receiving LeadTracker route before deploying this app.
