const CAL_API = "https://api.cal.com/v2"
const CAL_API_VERSION = "2024-08-13"

export async function onRequestPost(context) {
  const { request, env } = context
  const apiKey = (env.CAL_API_KEY || "").trim()
  if (!apiKey) return json({ error: "Cal.com integration is not configured" }, 500)
  try {
    const body = await request.json().catch(() => ({}))
    const uid = String(body?.uid || "").trim()
    const reason = String(body?.reason || "").trim() || undefined
    if (!uid) return json({ ok: false, reason: "missing_uid", message: "booking uid required" }, 400)
    const payload = {}
    if (reason) payload.cancellationReason = reason
    const calResp = await fetch(`${CAL_API}/bookings/${encodeURIComponent(uid)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "cal-api-version": CAL_API_VERSION },
      body: JSON.stringify(payload),
    })
    const calData = await calResp.json().catch(() => ({}))
    if (!calResp.ok) {
      const msg = calData?.error?.message || calData?.message || ""
      if (/not found|does not exist/i.test(msg)) return json({ ok: false, reason: "not_found", message: "Booking not found." }, 404)
      if (/already cancelled|already canceled/i.test(msg)) return json({ ok: true, already_cancelled: true, uid })
      return json({ ok: false, reason: "calcom_error", detail: calData }, 502)
    }
    return json({ ok: true, uid, cancelled: true })
  } catch (err) {
    return json({ ok: false, reason: "exception", message: err?.message }, 500)
  }
}
export const onRequest = ({ request }) => { if (request.method === "POST") return; return json({ error: "Method not allowed" }, 405) }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }) }
