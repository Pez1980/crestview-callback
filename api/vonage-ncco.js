// Vonage answer webhook — returns NCCO that connects call to ElevenLabs SIP.
// Lead dynamic variables arrive as query params and are forwarded as X-* SIP
// headers; ElevenLabs maps X-Lead-First-Name → {{sip_lead_first_name}} etc.

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  const url = new URL(req.url || "", "https://crestview-callback.vercel.app")
  const q = url.searchParams

  const firstName = q.get("first_name") || "there"
  const fullName = q.get("full_name") || "Valued Customer"
  const email = q.get("email") || ""
  const state = q.get("state") || "your area"
  const leadFirstName = q.get("lead_first_name") || firstName
  const leadEmail = q.get("lead_email") || email
  const leadState = q.get("lead_state") || state
  const language = q.get("language") || "en"
  const timezone = q.get("timezone") || ""

  // ElevenLabs SIP — phone number must match the registered E.164, port 5060 TCP
  const sipUri = "sip:+17735425943@sip.rtc.elevenlabs.io:5060;transport=tcp"

  const sipHeaders = {
    "X-Lead-First-Name": leadFirstName,
    "X-Lead-Email": leadEmail,
    "X-Lead-State": leadState,
    "X-Lead-Full-Name": fullName,
    "X-First-Name": firstName,
    "X-Full-Name": fullName,
    "X-Email": email,
    "X-State": state,
    "X-Language": language,
  }
  if (timezone) sipHeaders["X-Timezone"] = timezone

  // Remove empty values
  const cleanHeaders = Object.fromEntries(
    Object.entries(sipHeaders).filter(([, v]) => v)
  )

  const ncco = [
    {
      action: "connect",
      timeout: "30",
      endpoint: [
        {
          type: "sip",
          uri: sipUri,
          headers: cleanHeaders,
        },
      ],
    },
  ]

  res.setHeader("Content-Type", "application/json")
  res.status(200).json(ncco)
}
