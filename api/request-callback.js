export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const swiftleadsBaseUrl = (process.env.SWIFTLEADS_BASE_URL || "").trim().replace(/\/+$/, "")
  const callbackSecret = (process.env.SWIFTLEADS_CALLBACK_SECRET || "").trim()

  if (!swiftleadsBaseUrl || !callbackSecret) {
    return res.status(500).json({ error: "Server callback integration is not configured" })
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {})

    // Normalize language → assistant routing. Default to en-US if unset.
    const language = body.language === "es-MX" ? "es-MX" : "en-US"

    // Validate optional IANA timezone — drop silently if malformed.
    let timezone = null
    if (
      typeof body.timezone === "string" &&
      body.timezone.length > 0 &&
      body.timezone.length <= 64 &&
      /^[A-Za-z_+\-/]+$/.test(body.timezone)
    ) {
      timezone = body.timezone
    }

    // Forward ONLY the fields the upstream Swiftleads schema accepts.
    // Extra fields (language, timezone) get rejected by strict validation
    // — send them as headers instead so the backend can opt in.
    const forwarded = {
      name: body.name,
      email: body.email,
      state: body.state,
      phone: body.phone,
    }

    const headers = {
      "Content-Type": "application/json",
      "x-callback-secret": callbackSecret,
      "x-callback-language": language,
    }
    if (timezone) headers["x-callback-timezone"] = timezone

    const response = await fetch(`${swiftleadsBaseUrl}/api/v1/calls/public/callback`, {
      method: "POST",
      headers,
      body: JSON.stringify(forwarded),
    })

    // Capture raw upstream response so we can surface the real reason a
    // submission failed instead of the generic "Callback request failed".
    const rawText = await response.text()
    let data = {}
    try { data = JSON.parse(rawText) } catch { /* upstream returned non-JSON */ }

    if (!response.ok) {
      const detail =
        data?.detail ||
        data?.error ||
        data?.message ||
        (rawText && rawText.slice(0, 240)) ||
        `Upstream returned ${response.status}`
      return res.status(response.status).json({ error: detail, upstream_status: response.status })
    }

    return res.status(200).json({
      status: "ok",
      lead_id: data?.lead_id || null,
      call_control_id: data?.call_control_id || null,
    })
  } catch (error) {
    return res.status(500).json({ error: "Failed to request callback" })
  }
}
