// Vonage answer webhook — asks LeadTracker for the NCCO that runs the callback
// agent, and falls back to the legacy ElevenLabs SIP trunk if that fails.
//
// Why the round trip: the agent now runs on Azure Voice Live behind
// LeadTracker's own media bridge, which holds the prompt, the booking tools, the
// DragonHD voice, the recording and the call record. Voice Live has no
// agent-side prompt store, so the party that mints the media session has to be
// the party that owns the prompt — this app cannot hand Vonage a websocket URL
// on its own. It still owns the caller ID and the decision to dial.
//
// The fallback is deliberate and non-negotiable: by the time this webhook fires
// the lead has already picked up the phone. Any failure — LeadTracker down, a
// rotated secret, Azure unconfigured — has to land on the route that shipped
// before rather than on silence.

import { createHmac } from "crypto"

export const config = { api: { bodyParser: false } }

// EL phone-number registrations (see vonage-agent/README notes):
//   +17735425943 → Crestview Callback Agent EN
//   +17735425944 → Crestview Callback Agent ES-MX (routing token only; not a live DID)
const EL_SIP_NUMBER_EN = "+17735425943"
const EL_SIP_NUMBER_ES = "+17735425944"

const LEADTRACKER_BASE = (process.env.LEADTRACKER_BASE_URL || "https://leadtrackerai.com").replace(/\/$/, "")
const LEADTRACKER_BRAND = process.env.LEADTRACKER_CTA_BRAND || "swiftleads"
// Vonage waits ~5s for an answer webhook before dropping the call, so this is
// budgeted well inside that: a slow mint must still leave time to build the SIP
// fallback and return it.
const MINT_TIMEOUT_MS = 3000

function digits(value) {
  const raw = String(value || "").replace(/\D/g, "")
  return /^[1-9]\d{7,14}$/.test(raw) ? `+${raw}` : ""
}

/**
 * Ask LeadTracker to mint the media session and build the NCCO.
 *
 * Signed with VONAGE_API_SECRET over a canonical field list (not the raw JSON):
 * both projects already hold that secret, so no new production environment
 * variable is needed, and a canonical string cannot break on a serialiser
 * difference between the two runtimes.
 *
 * @returns {Promise<object[]|null>} the NCCO, or null to use the fallback.
 */
async function mintAgentNcco({ callUuid, to, from, lead }) {
  const secret = (process.env.VONAGE_API_SECRET || "").trim()
  if (!secret || !callUuid || !to || !from) return null

  const timestamp = Date.now()
  const signature = createHmac("sha256", secret)
    .update([timestamp, LEADTRACKER_BRAND, callUuid, to, from].join("."))
    .digest("hex")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${LEADTRACKER_BASE}/api/public/cta/${encodeURIComponent(LEADTRACKER_BRAND)}/callback-voice-session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, signature, callUuid, to, from, ...lead }),
        signal: controller.signal,
      }
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error("[vonage-ncco] mint rejected", response.status, detail.slice(0, 200))
      return null
    }
    const data = await response.json()
    // Only an NCCO whose connect action really is a websocket is accepted; a
    // malformed body takes the fallback rather than being handed to Vonage.
    const connect = Array.isArray(data?.ncco)
      ? data.ncco.find((action) => action?.action === "connect")
      : null
    if (connect?.endpoint?.[0]?.type !== "websocket" || !connect.endpoint[0].uri) {
      console.error("[vonage-ncco] mint returned no websocket endpoint")
      return null
    }
    return data.ncco
  } catch (err) {
    console.error("[vonage-ncco] mint failed", err?.name === "AbortError" ? "timeout" : err?.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The route that shipped before Voice Live: SIP into the ElevenLabs agent. */
function elevenLabsNcco({ language, lead }) {
  const elNumber = language === "es" ? EL_SIP_NUMBER_ES : EL_SIP_NUMBER_EN
  const headers = {
    "X-Lead-First-Name": lead.leadFirstName,
    "X-Lead-Last-Name": lead.leadLastName,
    "X-Lead-Full-Name": lead.leadFullName,
    "X-Lead-Email": lead.leadEmail,
    "X-Lead-Phone": lead.leadPhone,
    "X-Lead-State": lead.leadState,
    "X-First-Name": lead.firstName,
    "X-Full-Name": lead.fullName,
    "X-Email": lead.email,
    "X-State": lead.state,
    "X-Language": language,
    "X-Timezone": lead.timezone,
  }
  return [
    {
      action: "connect",
      timeout: "30",
      endpoint: [
        {
          type: "sip",
          uri: `sip:${elNumber}@sip.rtc.elevenlabs.io:5060;transport=tcp`,
          headers: Object.fromEntries(Object.entries(headers).filter(([, v]) => v)),
        },
      ],
    },
  ]
}

export default async function handler(req, res) {
  const url = new URL(req.url || "", "https://crestview-callback.vercel.app")
  const q = url.searchParams

  const firstName = q.get("first_name") || "there"
  const fullName = q.get("full_name") || "Valued Customer"
  const email = q.get("email") || ""
  const state = q.get("state") || "your area"
  const language = q.get("language") === "es" ? "es" : "en"
  // Always send a timezone: every offered slot is converted into it, and an
  // absent zone produces confidently wrong weekdays.
  const timezone = q.get("timezone") || "America/New_York"
  const lead = {
    firstName,
    fullName,
    email,
    state,
    timezone,
    language,
    leadFirstName: q.get("lead_first_name") || firstName,
    leadLastName: q.get("lead_last_name") || "",
    leadFullName: q.get("lead_full_name") || fullName,
    leadEmail: q.get("lead_email") || email,
    leadPhone: q.get("lead_phone") || "",
    leadState: q.get("lead_state") || state,
  }
  const leadIdRaw = Number(q.get("lead_id"))
  const leadId = Number.isSafeInteger(leadIdRaw) && leadIdRaw > 0 ? leadIdRaw : null

  // Vonage appends these to the answer URL: `uuid` is this call leg, `to` is the
  // lead, `from` is our caller ID.
  const callUuid = String(q.get("uuid") || "").trim().toLowerCase()
  const to = digits(q.get("to") || lead.leadPhone)
  const from = digits(q.get("from"))

  const ncco =
    (await mintAgentNcco({
      callUuid,
      to,
      from,
      lead: { ...lead, phone: to, leadId },
    })) || elevenLabsNcco({ language, lead })

  res.setHeader("Content-Type", "application/json")
  res.status(200).json(ncco)
}
