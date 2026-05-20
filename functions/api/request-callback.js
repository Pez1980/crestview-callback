// Cloudflare Pages Function — places an outbound call via Telnyx Voice AI
// directly, picking the EN or ES-MX assistant based on the form's language.
// Mirrors api/request-callback.js (Vercel) so both hosts stay in sync.

export async function onRequestPost(context) {
  const { request, env } = context

  const apiKey = (env.TELNYX_API_KEY || "").trim()
  const fromNumber = (env.TELNYX_FROM_NUMBER || "").trim()
  const assistantEn = (env.TELNYX_ASSISTANT_ID_EN || "").trim()
  const assistantEs = (env.TELNYX_ASSISTANT_ID_ES_MX || "").trim()
  const connectionEn = (env.TELNYX_CONNECTION_ID_EN || "").trim()
  const connectionEs = (env.TELNYX_CONNECTION_ID_ES_MX || "").trim()

  if (!apiKey || !fromNumber || !assistantEn || !assistantEs || !connectionEn || !connectionEs) {
    return json({ error: "Telnyx integration is not configured" }, 500)
  }

  try {
    const body = await request.json().catch(() => ({}))

    const isEs = body.language === "es-MX"
    const language = isEs ? "es-MX" : "en-US"
    const assistantId = isEs ? assistantEs : assistantEn
    const connectionId = isEs ? connectionEs : connectionEn

    const to = String(body.phone || "").trim()
    if (!/^\+\d{8,15}$/.test(to)) {
      return json({ error: "Invalid phone number" }, 400)
    }

    const firstName = String(body.name || "").trim().split(/\s+/)[0] || "there"
    const dynamicVariables = {
      full_name: String(body.name || "").trim() || "Valued Customer",
      first_name: firstName,
      state: String(body.state || "").trim() || "your area",
      email: String(body.email || "").trim(),
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
      return json({ error: detail, upstream_status: response.status }, response.status)
    }

    return json({
      status: "ok",
      language,
      call_control_id: data?.data?.call_control_id || null,
      call_leg_id: data?.data?.call_leg_id || null,
    })
  } catch (error) {
    return json({ error: error?.message || "Failed to start callback" }, 500)
  }
}

export const onRequest = ({ request }) => {
  if (request.method === "POST") return
  return json({ error: "Method not allowed" }, 405)
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
