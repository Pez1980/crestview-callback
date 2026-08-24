// Slot options for the voice agent. Fetches native LeadTracker availability,
// converts to the caller's timezone SERVER-SIDE, and returns at most four
// pre-picked options (two per day, two days) with ready-to-speak sentences.
// The agent reads `say` verbatim and books by echoing `date` + `time` — no
// timezone or weekday math ever happens in the LLM.

export const config = { api: { bodyParser: false } }

const LT_SLOTS_URL = "https://leadtrackerai.com/api/public/cta/swiftleads"

export function formatInZone(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
      weekday: "long",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  )
  const hour = parts.hour === "24" ? "00" : parts.hour
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    weekday: parts.weekday,
  }
}

function zoneLabel(timeZone) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((x) => x.type === "timeZoneName")
    return p ? p.value : timeZone
  } catch {
    return timeZone
  }
}

function spoken(dateParts, timeZone, withZone) {
  const [h, m] = dateParts.time.split(":").map(Number)
  const ampm = h >= 12 ? "in the afternoon" : "in the morning"
  const h12 = h % 12 === 0 ? 12 : h % 12
  const minutes = m === 0 ? "" : `:${String(m).padStart(2, "0")}`
  const [y, mo, d] = dateParts.date.split("-").map(Number)
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, mo - 1, d)))
  const base = `${dateParts.weekday}, ${month} ${d} at ${h12}${minutes} ${ampm}`
  // Zone only on the first option — repeating "Eastern Time" after every
  // choice sounds robotic when the agent reads the list verbatim.
  return withZone ? `${base}, ${zoneLabel(timeZone)}` : base
}

export function pickOptions(slots, timeZone, limitDays = 2, perDay = 2) {
  const byDay = new Map()
  const all = slots.map((s) => ({ start: s.start, ...formatInZone(s.start, timeZone) }))
  // Only offer civil hours in the CALLER's zone (9:00–18:59 local); the host
  // calendar spans more, but nobody wants a 6am consultation offer.
  const civil = all.filter((s) => {
    const h = Number(s.time.slice(0, 2))
    return h >= 9 && h < 19
  })
  for (const p of (civil.length ? civil : all)) {
    if (!byDay.has(p.date)) byDay.set(p.date, [])
    byDay.get(p.date).push(p)
  }
  const options = []
  for (const [, daySlots] of [...byDay.entries()].slice(0, limitDays)) {
    daySlots.sort((a, b) => a.time.localeCompare(b.time))
    const morning = daySlots.find((s) => Number(s.time.slice(0, 2)) < 12)
    const afternoon = daySlots.find((s) => Number(s.time.slice(0, 2)) >= 12)
    const picks = [morning, afternoon].filter(Boolean)
    while (picks.length < perDay && picks.length < daySlots.length) {
      const next = daySlots.find((s) => !picks.includes(s))
      if (!next) break
      picks.push(next)
    }
    options.push(...picks.slice(0, perDay))
  }
  return options.slice(0, limitDays * perDay)
}

export default async function handler(req, res) {
  const url = new URL(req.url || "", "https://crestview-callback.vercel.app")
  const timeZone = url.searchParams.get("timezone") || "America/New_York"

  try {
    const upstream = await fetch(LT_SLOTS_URL)
    const data = await upstream.json()
    if (!upstream.ok || !Array.isArray(data.slots)) {
      return res.status(502).json({ error: "availability_unavailable" })
    }
    const now = Date.now()
    const usable = data.slots.filter((s) => new Date(s.start).getTime() > now + 60 * 60 * 1000)
    const options = pickOptions(usable, timeZone).map((o, i) => ({
      option: i + 1,
      date: o.date,
      time: o.time,
      say: spoken(o, timeZone, i === 0),
    }))
    return res.status(200).json({ timezone: timeZone, options })
  } catch (err) {
    return res.status(502).json({ error: "availability_unavailable" })
  }
}
