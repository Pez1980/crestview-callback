// TEMPORARY DEBUG endpoint — echoes back exactly what Telnyx sends.
// Used to diagnose why getAvailableSlots was receiving empty body from
// Telnyx tool-call webhooks. Delete this file once the issue is fixed.

export const config = { api: { bodyParser: false } }

async function readRaw(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", () => resolve(""))
  })
}

export default async function handler(req, res) {
  const raw = await readRaw(req)
  const result = {
    method: req.method,
    headers: req.headers,
    raw_body: raw,
    raw_length: raw.length,
    raw_first_chars: raw.slice(0, 50),
    parsed_attempt: null,
    parsed_error: null,
  }
  try {
    result.parsed_attempt = JSON.parse(raw || "{}")
  } catch (e) {
    result.parsed_error = String(e?.message || e)
  }
  // Return 200 with the diagnostic — the AI will see this and we can scrape from logs
  return res.status(200).json({
    debug: true,
    received: result,
    // Also return a slots-shaped response so the AI continues conversation
    slots: ["2026-05-22T15:00:00Z", "2026-05-22T20:00:00Z"],
    timeZone: "America/Mexico_City",
  })
}
