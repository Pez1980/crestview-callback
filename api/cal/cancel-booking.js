// Vercel serverless — cancel a Cal.com booking by uid.
// Body: { uid: "abc123", reason?: "..." }

const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const apiKey = (process.env.CAL_API_KEY || "").trim()
  if (!apiKey) return res.status(500).json({ error: "Cal.com integration is not configured" })

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {})
    const uid = String(body?.uid || "").trim()
    const reason = String(body?.reason || "").trim() || undefined

    if (!uid) return res.status(400).json({ ok: false, reason: "missing_uid", message: "booking uid required" })

    const payload = {}
    if (reason) payload.cancellationReason = reason

    const calResp = await fetch(`${CAL_API}/bookings/${encodeURIComponent(uid)}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "cal-api-version": CAL_API_VERSION,
      },
      body: JSON.stringify(payload),
    })
    const calData = await calResp.json().catch(() => ({}))
    if (!calResp.ok) {
      const msg = calData?.error?.message || calData?.message || ""
      if (/not found|does not exist/i.test(msg)) {
        return res.status(404).json({ ok: false, reason: "not_found", message: "Booking not found." })
      }
      if (/already cancelled|already canceled/i.test(msg)) {
        return res.status(200).json({ ok: true, already_cancelled: true, uid })
      }
      return res.status(502).json({ ok: false, reason: "calcom_error", detail: calData })
    }
    return res.status(200).json({ ok: true, uid, cancelled: true })
  } catch (err) {
    return res.status(500).json({ ok: false, reason: "exception", message: err?.message })
  }
}
