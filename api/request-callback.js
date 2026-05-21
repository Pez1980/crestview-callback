// Vercel serverless handler — places an outbound call via Telnyx Voice AI
// directly, picking the EN or ES-MX assistant based on the form's language.
//
// Required env vars (Production):
//   TELNYX_API_KEY              — Bearer token
//   TELNYX_FROM_NUMBER          — E.164 caller ID, must belong to your account
//   TELNYX_ASSISTANT_ID_EN      — English assistant id
//   TELNYX_ASSISTANT_ID_ES_MX   — Spanish (Mexico) assistant id
//   TELNYX_CONNECTION_ID_EN     — TeXML app id bound to the EN assistant
//   TELNYX_CONNECTION_ID_ES_MX  — TeXML app id bound to the ES-MX assistant

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}") } catch { return {} } }
  if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString("utf8") || "{}") } catch { return {} } }
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => { const t = Buffer.concat(chunks).toString("utf8"); try { resolve(JSON.parse(t || "{}")) } catch { resolve({}) } })
    req.on("error", () => resolve({}))
  })
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const apiKey = (process.env.TELNYX_API_KEY || "").trim()
  const fromNumber = (process.env.TELNYX_FROM_NUMBER || "").trim()
  const assistantEn = (process.env.TELNYX_ASSISTANT_ID_EN || "").trim()
  const assistantEs = (process.env.TELNYX_ASSISTANT_ID_ES_MX || "").trim()
  const connectionEn = (process.env.TELNYX_CONNECTION_ID_EN || "").trim()
  const connectionEs = (process.env.TELNYX_CONNECTION_ID_ES_MX || "").trim()

  if (!apiKey || !fromNumber || !assistantEn || !assistantEs || !connectionEn || !connectionEs) {
    return res.status(500).json({ error: "Telnyx integration is not configured" })
  }

  try {
    const body = await readJsonBody(req)

    const isEs = body.language === "es-MX"
    const language = isEs ? "es-MX" : "en-US"
    const assistantId = isEs ? assistantEs : assistantEn
    const connectionId = isEs ? connectionEs : connectionEn

    const to = String(body.phone || "").trim()
    if (!/^\+\d{8,15}$/.test(to)) {
      return res.status(400).json({ error: "Invalid phone number" })
    }

    // Pass lead context to the assistant as dynamic variables so it greets by
    // name, references their state, and personalises the conversation.
    // We send BOTH naming conventions ({{first_name}} and {{lead_first_name}})
    // because the existing EN assistant template uses {{lead_first_name}} in
    // its greeting while the ES assistant uses {{first_name}}. Sending both is
    // belt-and-suspenders so neither assistant ever lands on a null/placeholder.
    const fullName = String(body.name || "").trim()
    const nameParts = fullName.split(/\s+/).filter(Boolean)
    const firstName = nameParts[0] || "there"
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""
    const state = String(body.state || "").trim() || "your area"
    const email = String(body.email || "").trim()
    const dynamicVariables = {
      // ES-style naming (used by the Mexican Spanish assistant)
      full_name: fullName || "Valued Customer",
      first_name: firstName,
      state,
      email,
      // EN-style naming (used by the existing EN assistant template)
      lead_first_name: firstName,
      lead_last_name: lastName,
      lead_email: email,
      lead_full_name: fullName || "Valued Customer",
      lead_state: state,
    }

    // Optional IANA timezone for downstream booking. Validate shape, drop if malformed.
    let timezone = null
    if (
      typeof body.timezone === "string" &&
      body.timezone.length > 0 &&
      body.timezone.length <= 64 &&
      /^[A-Za-z_+\-/]+$/.test(body.timezone)
    ) {
      timezone = body.timezone
      dynamicVariables.timezone = timezone
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
      return res.status(response.status).json({
        error: detail,
        upstream_status: response.status,
      })
    }

    return res.status(200).json({
      status: "ok",
      language,
      call_control_id: data?.data?.call_control_id || null,
      call_leg_id: data?.data?.call_leg_id || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to start callback" })
  }
}
