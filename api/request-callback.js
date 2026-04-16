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

    const response = await fetch(`${swiftleadsBaseUrl}/api/v1/calls/public/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-callback-secret": callbackSecret,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = data?.detail || data?.error || "Callback request failed"
      return res.status(response.status).json({ error: detail })
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
