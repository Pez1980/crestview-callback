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
//   SWIFTLEADS_ORG_ID           — Callz org to log calls under (default: DEMO SL)
//   SWIFTLEADS_WEBHOOK_BASE     — Agent base URL (default: https://agent.swiftleadsai.com)

export const config = { api: { bodyParser: false } }

function buildSwiftLeadsWebhookUrl({ base, orgId, assistantId, dynamicVariables }) {
  const params = new URLSearchParams({
    organization_id: orgId,
    callback_source: "webform",
    assistant_id: assistantId,
  })
  if (dynamicVariables && Object.keys(dynamicVariables).length > 0) {
    params.set("dynamic_variables", JSON.stringify(dynamicVariables))
  }
  return `${base.replace(/\/$/, "")}/api/v1/calls/webhook?${params}`
}

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
  const slOrgId = (process.env.SWIFTLEADS_ORG_ID || "454d7717-c5a2-4738-abb6-3acf3de600f3").trim()
  const slWebhookBase = (process.env.SWIFTLEADS_WEBHOOK_BASE || "https://agent.swiftleadsai.com").trim()

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

    const fullName = String(body.name || "").trim()
    const nameParts = fullName.split(/\s+/).filter(Boolean)
    const firstName = nameParts[0] || "there"
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""
    const state = String(body.state || "").trim() || "your area"
    const email = String(body.email || "").trim()
    const dynamicVariables = {
      full_name: fullName || "Valued Customer",
      first_name: firstName,
      state,
      email,
      lead_first_name: firstName,
      lead_last_name: lastName,
      lead_email: email,
      lead_full_name: fullName || "Valued Customer",
      lead_state: state,
    }

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
      webhook_url: buildSwiftLeadsWebhookUrl({
        base: slWebhookBase,
        orgId: slOrgId,
        assistantId,
        dynamicVariables,
      }),
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
