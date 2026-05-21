const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

export async function onRequestPost(context) {
  const { request, env } = context
  const apiKey = (env.CAL_API_KEY || "").trim()
  if (!apiKey) return json({ error: "Cal.com integration is not configured" }, 500)
  try {
    const body = await request.json().catch(() => ({}))
    const uid = String(body?.uid || "").trim()
    const start = String(body?.start || "").trim()
    const timeZone = (typeof body?.timeZone === "string" && body.timeZone.trim()) || "America/Mexico_City"
    const reason = String(body?.reason || "").trim() || undefined
    if (!uid) return json({ ok: false, reason: "missing_uid", message: "booking uid required" }, 400)
    if (!start) return json({ ok: false, reason: "missing_start", message: "new start time required" }, 400)
    const startUtc = /Z$|[+-]\d{2}:\d{2}$/.test(start) ? start : `${start.replace(/(\.\d+)?$/, "")}Z`
    const payload = { start: startUtc }
    if (reason) payload.reschedulingReason = reason
    const calResp = await fetch(`${CAL_API}/bookings/${encodeURIComponent(uid)}/reschedule`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "cal-api-version": CAL_API_VERSION },
      body: JSON.stringify(payload),
    })
    const calData = await calResp.json().catch(() => ({}))
    if (!calResp.ok) {
      const msg = calData?.error?.message || calData?.message || ""
      if (/already has booking|not available/i.test(msg)) return json({ ok: false, reason: "slot_taken", message: "That slot is no longer available — pick another." }, 409)
      if (/not found|does not exist/i.test(msg)) return json({ ok: false, reason: "not_found", message: "Booking not found." }, 404)
      return json({ ok: false, reason: "calcom_error", detail: calData }, 502)
    }
    const booking = calData?.data || calData
    return json({ ok: true, booking: { uid: booking?.uid || booking?.id || uid, start: booking?.start || startUtc, timeZone } })
  } catch (err) {
    return json({ ok: false, reason: "exception", message: err?.message }, 500)
  }
}
export const onRequest = ({ request }) => { if (request.method === "POST") return; return json({ error: "Method not allowed" }, 405) }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }) }
