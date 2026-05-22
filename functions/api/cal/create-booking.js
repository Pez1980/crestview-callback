// Cloudflare Pages mirror of api/cal/create-booking.js — see that file for details.

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
    const { start, timeZone, language } = body || {}
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    if (!start) return json({ ok: false, reason: "missing_start", message: "start required" }, 400)
    if (!email) return json({ ok: false, reason: "missing_email", message: "attendee email required" }, 400)
    if (!name) return json({ ok: false, reason: "missing_name", message: "attendee name required" }, 400)

    const tz = (typeof timeZone === "string" && timeZone.trim()) || "America/Mexico_City"
    const lang = language === "es" || language === "es-MX" ? "es" : "en"
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
        // Idempotency: if Telnyx retried due to its 5s tool-call timeout, the
        // first request silently succeeded and this retry sees slot_taken.
        // Check if THIS attendee already holds the booking — if so, return
        // success (idempotent).
        try {
          const lookupUrl = new URL(`${CAL_API}/bookings`)
          lookupUrl.searchParams.set("attendeeEmail", email)
          lookupUrl.searchParams.set("status", "upcoming")
          const lookupResp = await fetch(lookupUrl, {
            headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": CAL_API_VERSION },
          })
          const lookupData = await lookupResp.json().catch(() => ({}))
          const existing = (lookupData?.data || []).find((b) => {
            if (!b?.start) return false
            return new Date(b.start).getTime() === new Date(startUtc).getTime()
          })
          if (existing) {
            return json({
              ok: true,
              idempotent: true,
              booking: { uid: existing.uid || existing.id || null, start: existing.start || startUtc, attendee_email: email },
            })
          }
        } catch { /* fall through */ }
        return json({ ok: false, reason: "slot_taken", message: "That slot is no longer available — pick another." }, 409)
      }
      return json({ ok: false, reason: "calcom_error", detail: calData }, 502)
    }
    const booking = calData?.data || calData
    return json({
      ok: true,
      booking: {
        uid: booking?.uid || booking?.id || null,
        start: booking?.start || startUtc,
        attendee_email: email,
      },
    })
  } catch (err) {
    return json({ ok: false, reason: "exception", message: err?.message }, 500)
  }
}

export const onRequest = ({ request }) => {
  if (request.method === "POST") return
  return json({ error: "Method not allowed" }, 405)
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })
}
