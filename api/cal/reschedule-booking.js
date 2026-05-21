// Vercel serverless — reschedule a Cal.com booking by uid.
// Body: { uid: "abc123", start: "2026-05-23T15:00:00Z", timeZone?: "...", reason?: "..." }

const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const apiKey = (process.env.CAL_API_KEY || "").trim()
  if (!apiKey) return res.status(500).json({ error: "Cal.com integration is not configured" })

  try {
    const body = await readJsonBody(req)
    const uid = String(body?.uid || "").trim()
    const start = String(body?.start || "").trim()
    const timeZone = (typeof body?.timeZone === "string" && body.timeZone.trim()) || "America/Mexico_City"
    const reason = String(body?.reason || "").trim() || undefined

    if (!uid) return res.status(400).json({ ok: false, reason: "missing_uid", message: "booking uid required" })
    if (!start) return res.status(400).json({ ok: false, reason: "missing_start", message: "new start time required" })

    const startUtc = /Z$|[+-]\d{2}:\d{2}$/.test(start) ? start : `${start.replace(/(\.\d+)?$/, "")}Z`

    // Cal.com v2 /reschedule does NOT accept timeZone in body — only rescheduledBy + reschedulingReason.
    const payload = { start: startUtc }
    if (reason) payload.reschedulingReason = reason

    const calResp = await fetch(`${CAL_API}/bookings/${encodeURIComponent(uid)}/reschedule`, {
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
      if (/already has booking|not available/i.test(msg)) {
        return res.status(409).json({ ok: false, reason: "slot_taken", message: "That slot is no longer available — pick another." })
      }
      if (/not found|does not exist/i.test(msg)) {
        return res.status(404).json({ ok: false, reason: "not_found", message: "Booking not found." })
      }
      return res.status(502).json({ ok: false, reason: "calcom_error", detail: calData })
    }
    const booking = calData?.data || calData
    return res.status(200).json({
      ok: true,
      booking: {
        uid: booking?.uid || booking?.id || uid,
        start: booking?.start || startUtc,
        timeZone,
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, reason: "exception", message: err?.message })
  }
}
