// Vonage answer webhook — returns NCCO that connects the call to the
// ElevenLabs agent's SIP trunk. Lead dynamic variables arrive as query params
// and are forwarded as X-* SIP headers; ElevenLabs exposes them to the agent
// as {{sip_x_<lowercased-header>}} (X-Lead-First-Name → {{sip_x_lead_first_name}}).
//
// Agent selection is by dialed number: ElevenLabs routes an inbound SIP call
// to the agent assigned to the number in the request URI. EN and ES-MX use
// separate EL-registered routing numbers on the same trunk.

export const config = { api: { bodyParser: false } }

// EL phone-number registrations (see vonage-agent/README notes):
//   +17735425943 → Crestview Callback Agent EN
//   +17735425944 → Crestview Callback Agent ES-MX (routing token only; not a live DID)
const EL_SIP_NUMBER_EN = "+17735425943"
const EL_SIP_NUMBER_ES = "+17735425944"

export default async function handler(req, res) {
  const url = new URL(req.url || "", "https://crestview-callback.vercel.app")
  const q = url.searchParams

  const firstName = q.get("first_name") || "there"
  const fullName = q.get("full_name") || "Valued Customer"
  const email = q.get("email") || ""
  const state = q.get("state") || "your area"
  const leadFirstName = q.get("lead_first_name") || firstName
  const leadLastName = q.get("lead_last_name") || ""
  const leadFullName = q.get("lead_full_name") || fullName
  const leadEmail = q.get("lead_email") || email
  const leadPhone = q.get("lead_phone") || ""
  const leadState = q.get("lead_state") || state
  const language = q.get("language") || "en"
  const timezone = q.get("timezone") || ""

  const elNumber = language === "es" ? EL_SIP_NUMBER_ES : EL_SIP_NUMBER_EN
  const sipUri = `sip:${elNumber}@sip.rtc.elevenlabs.io:5060;transport=tcp`

  const sipHeaders = {
    "X-Lead-First-Name": leadFirstName,
    "X-Lead-Last-Name": leadLastName,
    "X-Lead-Full-Name": leadFullName,
    "X-Lead-Email": leadEmail,
    "X-Lead-Phone": leadPhone,
    "X-Lead-State": leadState,
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
