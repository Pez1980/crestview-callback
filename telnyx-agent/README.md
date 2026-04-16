# Crestview Callback Agent — Telnyx Voice AI

Voice AI agent that calls leads back within 60 seconds of form submission and books a free consultation.

## Architecture

```
Form Submit → Store lead in DB → Trigger Telnyx call → Agent greets by name
                                                      → Qualifies (buy/sell/both)
                                                      → Books consultation
                                                      → Sends SMS confirmation
                                                      → Logs outcome
```

## Files

| File | Purpose |
|------|---------|
| `assistant.json` | Full Telnyx assistant config — prompt, tools, voice, interruption settings |
| `webhook-handler.js` | Dynamic variables webhook — injects lead context at call start |

## Setup

### 1. Create the assistant

```bash
curl -X POST https://api.telnyx.com/v2/ai/assistants \
  -H "Authorization: Bearer YOUR_TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d @assistant.json
```

### 2. Update webhook URLs

Replace all `YOUR_API_DOMAIN` in `assistant.json` with your actual API domain. You need these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/api/telnyx/lead-context` | Dynamic variables webhook — returns lead data by phone |
| `/api/telnyx/availability` | Returns available time slots for a given state |
| `/api/telnyx/book` | Creates a booking in your calendar system |
| `/api/telnyx/sms-confirm` | Sends SMS confirmation after booking |
| `/api/telnyx/log-outcome` | Logs call outcome for analytics |

### 3. Trigger the callback

When the form is submitted, store the lead and immediately trigger the Telnyx call:

```bash
curl -X POST https://api.telnyx.com/v2/calls \
  -H "Authorization: Bearer YOUR_TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "YOUR_CONNECTION_ID",
    "to": "+1LEAD_PHONE_NUMBER",
    "from": "+1YOUR_TELNYX_NUMBER",
    "answering_machine_detection": "premium",
    "webhook_url": "https://YOUR_API_DOMAIN/api/telnyx/call-events",
    "start_ai_assistant": {
      "assistant_id": "ASSISTANT_ID_FROM_STEP_1"
    }
  }'
```

### 4. Transfer number

Update the `transfer_to_human` tool destination in `assistant.json` with your actual support line.

## Prompt Design Rationale

- **Opening**: References their form submission immediately (pattern interrupt + context). Uses first name.
- **Qualifying**: Single question ("buy, sell, or both?") — minimal friction, maximum signal.
- **Booking**: Assumptive binary close ("tomorrow morning or Thursday afternoon?") converts 2x vs open-ended.
- **Objections**: One soft redirect max, then respect the no. Never pushy.
- **Pacing**: 0.4s wait after user stops speaking. Interruption enabled for natural conversation.
- **AMD**: 5-second analysis window catches voicemail, leaves a short message.
- **25-word rule**: Prevents monologuing. Forces conversational rhythm.
- **Call target**: Under 3 minutes total. Most bookings happen in 90 seconds.

## Voice Selection

Using `Telnyx.NaturalHD.Estelle` — warm, clear female voice. 78% of companies choose female voices for higher warmth/approachability scores in sales contexts.

Speed set to 1.0x (default). Increase to 1.05-1.1 if A/B testing shows faster pacing converts better for your market.

## Metrics to Track

| Metric | Target |
|--------|--------|
| Pickup rate | >40% |
| Booking conversion (of answered) | >25% |
| Avg call duration (booked) | <2 min |
| Avg call duration (not booked) | <1 min |
| First response latency | <400ms |
| Transfer-to-human rate | <10% |
| Voicemail rate | <30% |
