// Cloudflare Pages Function — handles POST /api/request-callback
// Mirrors the Vercel handler at /api/request-callback.js but uses the
// Web standard Request/Response and reads env vars from `context.env`.

export async function onRequestPost(context) {
  const { request, env } = context

  const swiftleadsBaseUrl = (env.SWIFTLEADS_BASE_URL || "").trim().replace(/\/+$/, "")
  const callbackSecret = (env.SWIFTLEADS_CALLBACK_SECRET || "").trim()

  if (!swiftleadsBaseUrl || !callbackSecret) {
    return json({ error: "Server callback integration is not configured" }, 500)
  }

  try {
    const body = await request.json().catch(() => ({}))

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

    const forwarded = { ...body, language }
    if (timezone) forwarded.timezone = timezone
    else delete forwarded.timezone

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

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = data?.detail || data?.error || "Callback request failed"
      return json({ error: detail }, response.status)
    }

    return json({
      status: "ok",
      lead_id: data?.lead_id || null,
      call_control_id: data?.call_control_id || null,
    })
  } catch {
    return json({ error: "Failed to request callback" }, 500)
  }
}

// Reject non-POST verbs cleanly.
export const onRequest = ({ request }) => {
  if (request.method === "POST") return // handled by onRequestPost above
  return json({ error: "Method not allowed" }, 405)
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
