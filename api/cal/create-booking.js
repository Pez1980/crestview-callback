// Vercel serverless — proxy to Cal.com /v2/bookings.
// Mirrors LT inbound-agent.js:1266 booking logic verbatim (minus call_records
// coupling since we don't have an inbound call context here).
//
// Called by both EN and ES-MX Telnyx assistants once the lead picks a slot.
//
// Request body (Telnyx tool):
//   {
//     start: "2026-05-22T15:00:00Z",        REQUIRED (ISO 8601, UTC preferred)
//     name: "María González",               REQUIRED
//     email: "maria@example.com",           REQUIRED
//     timeZone: "America/Mexico_City",      optional (defaults to Mexico_City)
//     language: "es" | "en"                 optional (defaults to en)
//   }
// Response: { ok: true, booking: { uid, start, attendee_email } }

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
  const eventTypeId = (process.env.CAL_EVENT_TYPE_ID || "").trim()
  const eventTypeSlug = (process.env.CAL_EVENT_TYPE_SLUG || "").trim()
  const username = (process.env.CAL_USERNAME || "").trim()
  if (!apiKey || (!eventTypeId && !(eventTypeSlug && username))) {
    return res.status(500).json({ error: "Cal.com integration is not configured" })
  }

  try {
    const body = await readJsonBody(req)
    const { start, timeZone, language } = body || {}
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()

    if (!start) return res.status(400).json({ ok: false, reason: "missing_start", message: "start required" })
    if (!email) return res.status(400).json({ ok: false, reason: "missing_email", message: "attendee email required" })
    if (!name) return res.status(400).json({ ok: false, reason: "missing_name", message: "attendee name required" })

    const tz = (typeof timeZone === "string" && timeZone.trim()) || "America/Mexico_City"
    const lang = language === "es" || language === "es-MX" ? "es" : "en"

    // Cal.com v2 parses bare local times as UTC — would shift them. Force a Z
    // suffix when missing and not already TZ-qualified.
    const startUtc = /Z$|[+-]\d{2}:\d{2}$/.test(start)
      ? start
      : `${start.replace(/(\.\d+)?$/, "")}Z`

    const payload = {
      start: startUtc,
      attendee: { name, email, timeZone: tz, language: lang },
    }
    if (eventTypeId && /^\d+$/.test(eventTypeId)) {
      payload.eventTypeId = Number(eventTypeId)
    } else {
      payload.eventTypeSlug = eventTypeSlug || eventTypeId
      payload.username = username
    }

    const calResp = await fetch(`${CAL_API}/bookings`, {
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
      return res.status(502).json({ ok: false, reason: "calcom_error", detail: calData })
    }
    const booking = calData?.data || calData
    return res.status(200).json({
      ok: true,
      booking: {
        uid: booking?.uid || booking?.id || null,
        start: booking?.start || startUtc,
        attendee_email: email,
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, reason: "exception", message: err?.message })
  }
}
