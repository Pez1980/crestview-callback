// Vercel serverless — proxy to Cal.com /v2/slots/available.
// Mirrors the exact request shape LeadTracker uses (server/routes/inbound-agent.js:986).
// Called by both EN and ES-MX Telnyx assistants when the lead asks for times.
//
// Env vars required:
//   CAL_API_KEY            — Cal.com v2 API key from app.cal.com → Settings → API Keys
//   CAL_EVENT_TYPE_ID      — numeric event type id for the consultation slot (preferred)
//   CAL_EVENT_TYPE_SLUG    — fallback if you use a slug instead of numeric id
//   CAL_USERNAME           — required when CAL_EVENT_TYPE_SLUG is used (e.g. "parvez-swiftleadsai")
//
// Request body (called by Telnyx assistant as a webhook tool):
//   { start: "2026-05-22T00:00:00Z", end: "2026-05-22T23:59:59Z", timeZone: "America/Mexico_City" }
// Response: { slots: ["2026-05-22T15:00:00Z", ...], timeZone: "..." }

const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {})
    let { start, end, timeZone } = body || {}
    if (!start) return res.status(400).json({ error: "start required" })

    const tz = (typeof timeZone === "string" && timeZone.trim()) || "America/Mexico_City"

    // Normalize to UTC ISO with Z — Cal.com v2 quirk: bare local times are
    // interpreted as UTC. Mirrors LT inbound-agent.js:1002-1009.
    const toIsoUtc = (s, edge) => {
      if (/T\d/.test(s)) return /Z$/.test(s) ? s : `${s.replace(/(\.\d+)?$/, "")}Z`
      return edge === "end" ? `${s}T23:59:59Z` : `${s}T00:00:00Z`
    }
    let startTime = toIsoUtc(start, "start")
    let endTime = end ? toIsoUtc(end, "end") : new Date(Date.now() + 14 * 24 * 3600e3).toISOString()

    // Clamp start to now+5min to avoid empty-slots-for-the-past bug.
    const nowPlus5 = new Date(Date.now() + 5 * 60e3).toISOString()
    if (startTime < nowPlus5) startTime = nowPlus5
    const startMs = new Date(startTime).getTime()
    const endMs = new Date(endTime).getTime()
    if (endMs <= startMs) endTime = new Date(startMs + 24 * 3600e3).toISOString()
    const maxEndMs = startMs + 14 * 24 * 3600e3
    if (new Date(endTime).getTime() > maxEndMs) endTime = new Date(maxEndMs).toISOString()

    const tzParam = encodeURIComponent(tz)
    let url
    if (eventTypeId && /^\d+$/.test(eventTypeId)) {
      url = `${CAL_API}/slots/available?eventTypeId=${eventTypeId}&startTime=${startTime}&endTime=${endTime}&timeZone=${tzParam}`
    } else {
      const slug = eventTypeSlug || eventTypeId
      url = `${CAL_API}/slots/available?eventTypeSlug=${encodeURIComponent(slug)}&usernameList[]=${encodeURIComponent(username)}&startTime=${startTime}&endTime=${endTime}&timeZone=${tzParam}`
    }

    const calResp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": CAL_API_VERSION },
    })
    const calData = await calResp.json().catch(() => ({}))
    if (!calResp.ok) {
      return res.status(502).json({ error: "Cal.com slots fetch failed", detail: calData })
    }
    const slotsMap = calData?.data?.slots || calData?.data || calData?.slots || {}
    const slots = []
    for (const day of Object.keys(slotsMap)) {
      const daySlots = slotsMap[day]
      if (!Array.isArray(daySlots)) continue
      for (const s of daySlots) slots.push(s?.time || s)
    }
    return res.status(200).json({ slots: slots.slice(0, 6), timeZone: tz })
  } catch (err) {
    return res.status(500).json({ error: "lookup-slots failed", message: err?.message })
  }
}
