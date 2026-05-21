// Cloudflare Pages mirror of api/cal/lookup-slots.js — see that file for details.

const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

export async function onRequestPost(context) {
  const { request, env } = context
  const apiKey = (env.CAL_API_KEY || "").trim()
  const eventTypeId = (env.CAL_EVENT_TYPE_ID || "").trim()
  const eventTypeSlug = (env.CAL_EVENT_TYPE_SLUG || "").trim()
  const username = (env.CAL_USERNAME || "").trim()
  if (!apiKey || (!eventTypeId && !(eventTypeSlug && username))) {
    return json({ error: "Cal.com integration is not configured" }, 500)
  }

  try {
    const body = await request.json().catch(() => ({}))
    let { start, end, timeZone } = body || {}
    if (!start) return json({ error: "start required" }, 400)
    const tz = (typeof timeZone === "string" && timeZone.trim()) || "America/Mexico_City"

    const toIsoUtc = (s, edge) => {
      if (/T\d/.test(s)) return /Z$/.test(s) ? s : `${s.replace(/(\.\d+)?$/, "")}Z`
      return edge === "end" ? `${s}T23:59:59Z` : `${s}T00:00:00Z`
    }
    let startTime = toIsoUtc(start, "start")
    let endTime = end ? toIsoUtc(end, "end") : new Date(Date.now() + 14 * 24 * 3600e3).toISOString()
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
    if (!calResp.ok) return json({ error: "Cal.com slots fetch failed", detail: calData }, 502)

    const slotsMap = calData?.data?.slots || calData?.data || calData?.slots || {}
    const slots = []
    for (const day of Object.keys(slotsMap)) {
      const daySlots = slotsMap[day]
      if (!Array.isArray(daySlots)) continue
      for (const s of daySlots) slots.push(s?.time || s)
    }
    return json({ slots: slots.slice(0, 6), timeZone: tz })
  } catch (err) {
    return json({ error: "lookup-slots failed", message: err?.message }, 500)
  }
}

export const onRequest = ({ request }) => {
  if (request.method === "POST") return
  return json({ error: "Method not allowed" }, 405)
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })
}
