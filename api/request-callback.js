// Vercel serverless handler — places an outbound callback call.
//
// VOICE_PROVIDER switches between two telephony stacks that are BOTH live and
// in production. This is an evaluation of which performs better, not a
// migration, so neither path may be allowed to rot and both are kept separate:
//   "vonage"  (default) — Vonage Voice API dials the lead; /api/vonage-ncco then
//                          asks LeadTracker for an NCCO that runs the callback
//                          agent on Azure Voice Live + DragonHD, and falls back
//                          to the ElevenLabs SIP trunk only if that mint fails.
//                          NOTE: EL-originated calls over the outbound trunk were
//                          tried and 403 at sip.nexmo.com; Vonage-origination is
//                          the proven leg (see README).
//   "telnyx"             — Telnyx Voice AI. Fully live; set VOICE_PROVIDER=telnyx
//                          and this leg runs. `vonage` is only the fallback an
//                          unset variable lands on.
//
// Telnyx env vars:
//   TELNYX_API_KEY, TELNYX_FROM_NUMBER
//   TELNYX_ASSISTANT_ID_EN, TELNYX_ASSISTANT_ID_ES_MX
//   TELNYX_CONNECTION_ID_EN, TELNYX_CONNECTION_ID_ES_MX
//
// Vonage env vars:
//   VONAGE_APPLICATION_ID          — Vonage Voice Application ID
//   VONAGE_PRIVATE_KEY             — RSA private key for JWT (multiline, \n-escaped)
//   VONAGE_FROM_NUMBER             — E.164 caller ID (e.g. 17735425943)

import { createSign } from "node:crypto"

export const config = { api: { bodyParser: false } }

async function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const t = Buffer.concat(chunks).toString("utf8")
      try { resolve(JSON.parse(t || "{}")) } catch { resolve({}) }
    })
    req.on("error", () => resolve({}))
  })
}

function buildDynamicVariables(body) {
  const fullName = String(body.name || "").trim()
  const nameParts = fullName.split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || "there"
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""
  const state = String(body.state || "").trim() || "your area"
  const email = String(body.email || "").trim()
  const phone = String(body.phone || "").trim()
  return {
    lead_first_name: firstName,
    lead_last_name: lastName,
    lead_email: email,
    lead_phone: phone,
    lead_full_name: fullName || "Valued Customer",
    lead_state: state,
    full_name: fullName || "Cliente",
    first_name: firstName,
    state,
    email,
  }
}

async function handleTelnyx(body, res) {
  const apiKey = (process.env.TELNYX_API_KEY || "").trim()
  const fromNumber = (process.env.TELNYX_FROM_NUMBER || "").trim()
  const assistantEn = (process.env.TELNYX_ASSISTANT_ID_EN || "").trim()
  const assistantEs = (process.env.TELNYX_ASSISTANT_ID_ES_MX || "").trim()
  const connectionEn = (process.env.TELNYX_CONNECTION_ID_EN || "").trim()
  const connectionEs = (process.env.TELNYX_CONNECTION_ID_ES_MX || "").trim()

  if (!apiKey || !fromNumber || !assistantEn || !assistantEs || !connectionEn || !connectionEs) {
    return res.status(500).json({ error: "Telnyx integration is not configured" })
  }

  const isEs = body.language === "es-MX"
  const language = isEs ? "es-MX" : "en-US"
  const assistantId = isEs ? assistantEs : assistantEn
  const connectionId = isEs ? connectionEs : connectionEn

  const to = String(body.phone || "").trim()
  if (!/^\+\d{8,15}$/.test(to)) {
    return res.status(400).json({ error: "Invalid phone number" })
  }

  const dynamicVariables = buildDynamicVariables(body)
  if (
    typeof body.timezone === "string" &&
    body.timezone.length > 0 &&
    body.timezone.length <= 64 &&
    /^[A-Za-z_+\-/]+$/.test(body.timezone)
  ) {
    dynamicVariables.timezone = body.timezone
  }

  const telnyxBody = {
    connection_id: connectionId,
    to,
    from: fromNumber,
    stream_track: "both_tracks",
    answering_machine_detection: "premium",
    timeout_secs: 30,
    time_limit_secs: 600,
    assistant: {
      id: assistantId,
      dynamic_variables: dynamicVariables,
    },
  }

  const response = await fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(telnyxBody),
  })

  const rawText = await response.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch { /* non-JSON */ }

  if (!response.ok) {
    const detail =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.title ||
      data?.error ||
      data?.message ||
      (rawText && rawText.slice(0, 240)) ||
      `Telnyx returned ${response.status}`
    return res.status(response.status).json({ error: detail, upstream_status: response.status })
  }

  return res.status(200).json({
    status: "ok",
    provider: "telnyx",
    language,
    call_control_id: data?.data?.call_control_id || null,
    call_leg_id: data?.data?.call_leg_id || null,
  })
}

function makeVonageJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({
    application_id: appId,
    iat: now,
    jti: `cb-${now}-${Math.random().toString(36).slice(2)}`,
    exp: now + 300,
  })).toString("base64url")
  const sig = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url")
  return `${header}.${payload}.${sig}`
}

// Vonage dials the lead; when they answer, the /api/vonage-ncco webhook returns
// an NCCO that SIP-connects the call to the ElevenLabs agent for their language.
// Lead context travels as query params → X-* SIP headers → {{sip_x_*}} vars.
async function handleVonage(body, res, { leadId = null } = {}) {
  const appId = (process.env.VONAGE_APPLICATION_ID || "").trim()
  const privateKeyRaw = (process.env.VONAGE_PRIVATE_KEY || "").trim()
  const fromNumber = "13128008565" // Swiftleads registered pool DID; +17735425943 is spam-flagged

  if (!appId || !privateKeyRaw) {
    return res.status(500).json({ error: "Vonage integration is not configured" })
  }

  const isEs = body.language === "es-MX"
  const language = isEs ? "es-MX" : "en-US"

  const to = String(body.phone || "").trim()
  if (!/^\+\d{8,15}$/.test(to)) {
    return res.status(400).json({ error: "Invalid phone number" })
  }

  const dynamicVars = buildDynamicVariables(body)
  if (
    typeof body.timezone === "string" &&
    body.timezone.length > 0 &&
    body.timezone.length <= 64 &&
    /^[A-Za-z_+\-/]+$/.test(body.timezone)
  ) {
    dynamicVars.timezone = body.timezone
  }

  const nccoBase = "https://crestview-callback.vercel.app/api/vonage-ncco"
  const nccoParams = new URLSearchParams({
    first_name: dynamicVars.first_name,
    full_name: dynamicVars.full_name,
    email: dynamicVars.email,
    state: dynamicVars.state,
    lead_first_name: dynamicVars.lead_first_name,
    lead_last_name: dynamicVars.lead_last_name,
    lead_full_name: dynamicVars.lead_full_name,
    lead_email: dynamicVars.lead_email,
    lead_phone: dynamicVars.lead_phone,
    lead_state: dynamicVars.lead_state,
    language: isEs ? "es" : "en",
  })
  if (dynamicVars.timezone) nccoParams.set("timezone", dynamicVars.timezone)
  if (leadId) nccoParams.set("lead_id", String(leadId))
  const answerUrl = `${nccoBase}?${nccoParams.toString()}`

  // Unescape the private key (env vars replace \n with literal backslash-n)
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n")

  const jwt = makeVonageJwt(appId, privateKey)

  const vonageBody = {
    to: [{ type: "phone", number: to.replace(/^\+/, "") }],
    from: { type: "phone", number: fromNumber },
    answer_url: [answerUrl],
    answer_method: "GET",
    event_url: ["https://crestview-callback.vercel.app/api/vonage-event"],
    event_method: "POST",
    length_timer: 600,
    ringing_timer: 30,
  }

  const response = await fetch("https://api.nexmo.com/v1/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vonageBody),
  })

  const rawText = await response.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch { /* non-JSON */ }

  if (!response.ok) {
    const detail =
      data?.description ||
      data?.error_title ||
      data?.message ||
      (rawText && rawText.slice(0, 240)) ||
      `Vonage returned ${response.status}`
    return res.status(response.status).json({ error: detail, upstream_status: response.status })
  }

  return res.status(200).json({
    status: "ok",
    provider: "vonage",
    language,
    call_uuid: data?.uuid || null,
  })
}

// Save the lead to LeadTracker's CRM immediately on submission — before the
// call is even placed. Without this, a prospect who doesn't answer or hangs
// up before booking never existed anywhere: the CRM only ever got a lead if
// the AI call connected AND completed a booking.
// Returns the CRM lead id when it is known, so the call this app is about to
// place can be attributed to that lead's timeline instead of arriving as an
// orphan call record. A failure here still never fails the callback.
async function saveLeadToCrm(body) {
  // Vercel serverless functions can freeze/terminate right after the response
  // is sent, so a true unawaited background call risks never completing.
  // Await it, but bounded — this must never meaningfully delay the callback.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch("https://leadtrackerai.com/api/public/cta/swiftleads/quick-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        phone: body.phone,
        state: body.state,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json().catch(() => ({}))
    const leadId = Number(data?.leadId)
    return Number.isSafeInteger(leadId) && leadId > 0 ? leadId : null
  } catch (err) {
    console.error("[crm-lead] save failed", err?.message)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const body = await readJsonBody(req)

    // A slow or failed CRM save must never block or fail the callback itself
    // — the call is the time-sensitive part. Bounded above at 4s.
    const leadId = await saveLeadToCrm(body)

    // Both providers are live; this only picks which leg a given call takes.
    // The fallback is vonage so an environment that loses the variable stays on
    // the leg carrying most traffic instead of silently switching provider.
    const provider = (process.env.VOICE_PROVIDER || "vonage").trim().toLowerCase()

    if (provider === "telnyx") {
      return await handleTelnyx(body, res)
    }
    return await handleVonage(body, res, { leadId })
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to start callback" })
  }
}
