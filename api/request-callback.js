// Vercel serverless handler — places an outbound callback call.
//
// VOICE_PROVIDER controls which telephony backend is used:
//   "telnyx"  (default) — Telnyx Voice AI
//   "vonage"             — ElevenLabs agent dials out over its Vonage SIP trunk
//
// Telnyx env vars:
//   TELNYX_API_KEY, TELNYX_FROM_NUMBER
//   TELNYX_ASSISTANT_ID_EN, TELNYX_ASSISTANT_ID_ES_MX
//   TELNYX_CONNECTION_ID_EN, TELNYX_CONNECTION_ID_ES_MX
//
// Vonage (via ElevenLabs) env vars:
//   ELEVENLABS_API_KEY             — ElevenLabs workspace API key
//   ELEVENLABS_PHONE_NUMBER_ID     — EL phone number id (SIP trunk over sip.nexmo.com)
//   ELEVENLABS_AGENT_ID_EN         — EN agent id (fallback: VONAGE_AGENT_ID_EN)
//   ELEVENLABS_AGENT_ID_ES_MX      — ES-MX agent id (fallback: VONAGE_AGENT_ID_ES_MX)

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

// Vonage provider = ElevenLabs originates the call over its Vonage SIP trunk
// (POST /v1/convai/sip-trunk/outbound-call). The trunk on the EL phone number
// is already configured against sip.nexmo.com with credentials, so no NCCO /
// answer-webhook leg is involved, and agent_id is chosen per call — the same
// number serves both the EN and ES-MX agents.
async function handleVonage(body, res) {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim()
  const phoneNumberId = (process.env.ELEVENLABS_PHONE_NUMBER_ID || "").trim()
  const agentEn = (process.env.ELEVENLABS_AGENT_ID_EN || process.env.VONAGE_AGENT_ID_EN || "").trim()
  const agentEs = (process.env.ELEVENLABS_AGENT_ID_ES_MX || process.env.VONAGE_AGENT_ID_ES_MX || "").trim()

  if (!apiKey || !phoneNumberId || !agentEn) {
    return res.status(500).json({ error: "ElevenLabs/Vonage integration is not configured" })
  }

  const isEs = body.language === "es-MX"
  const language = isEs ? "es-MX" : "en-US"
  const agentId = (isEs && agentEs) ? agentEs : agentEn

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

  const response = await fetch("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: to,
      conversation_initiation_client_data: {
        dynamic_variables: dynamicVars,
      },
    }),
  })

  const rawText = await response.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch { /* non-JSON */ }

  if (!response.ok || data?.success === false) {
    const detail =
      data?.detail?.message ||
      (Array.isArray(data?.detail) ? data.detail.map((d) => d?.msg).filter(Boolean).join("; ") : data?.detail) ||
      data?.message ||
      (rawText && rawText.slice(0, 240)) ||
      `ElevenLabs returned ${response.status}`
    return res.status(response.ok ? 502 : response.status).json({ error: detail, upstream_status: response.status })
  }

  return res.status(200).json({
    status: "ok",
    provider: "vonage",
    language,
    conversation_id: data?.conversation_id || null,
    call_uuid: data?.sip_call_id || data?.callSid || null,
  })
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const body = await readJsonBody(req)
    const provider = (process.env.VOICE_PROVIDER || "telnyx").trim().toLowerCase()

    if (provider === "vonage") {
      return await handleVonage(body, res)
    }
    return await handleTelnyx(body, res)
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to start callback" })
  }
}
