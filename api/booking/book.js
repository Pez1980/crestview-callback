// Books a native LeadTracker consultation from the agent's chosen option.
// Takes the caller-local `date` + `time` exactly as returned by /api/booking/slots,
// re-fetches live availability, resolves the matching UTC slot SERVER-SIDE, and
// books it. The LLM never converts timezones or constructs timestamps.

import { formatInZone, pickOptions } from "./slots.js"

export const config = { api: { bodyParser: false } }

const LT_SLOTS_URL = "https://leadtrackerai.com/api/public/cta/swiftleads"
const LT_BOOK_URL = "https://leadtrackerai.com/api/public/cta/swiftleads/book"

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
  const body = await readJsonBody(req)

  const timeZone = String(body.timezone || "America/New_York").trim()
  const date = String(body.date || "").trim()
  const time = String(body.time || "").trim()
  const name = String(body.name || "").trim()
  const email = String(body.email || "").trim()
  const phone = String(body.phone || "").trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD and time must be HH:MM from a slots option" })
  }
  const wanted = `${date} ${time.padStart(5, "0")}`

  try {
    const upstream = await fetch(LT_SLOTS_URL)
    const data = await upstream.json()
    if (!upstream.ok || !Array.isArray(data.slots)) {
      return res.status(502).json({ error: "availability_unavailable" })
    }
    const match = data.slots.find((s) => {
      const p = formatInZone(s.start, timeZone)
      return `${p.date} ${p.time}` === wanted
    })
    if (!match) {
      const alternatives = pickOptions(data.slots, timeZone).map((o) => ({
        date: o.date, time: o.time,
      }))
      return res.status(409).json({ error: "time_no_longer_available", alternatives })
    }

    const ltRes = await fetch(LT_BOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, start: match.start, timezone: timeZone, ...(body.demo ? { demo: true } : {}) }),
    })
    const ltData = await ltRes.json().catch(() => ({}))
    if (!ltRes.ok) {
      return res.status(ltRes.status).json({
        error: ltData?.error || "booking_failed",
        code: ltData?.code || null,
      })
    }
    const b = ltData.booking || {}
    return res.status(200).json({
      status: "booked",
      confirmed_local_time: `${date} ${time} (${timeZone})`,
      uid: b.uid || null,
    })
  } catch (err) {
    return res.status(502).json({ error: "booking_failed" })
  }
}
