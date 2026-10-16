import assert from "node:assert/strict"
import { createHmac, generateKeyPairSync } from "node:crypto"
import { Readable } from "node:stream"
import test from "node:test"
import handler from "../api/request-callback.js"

test("outbound AI uses asynchronous advanced AMD and a signed tenant event URL", async (t) => {
  const saved = { ...process.env }
  t.after(() => { process.env = saved })
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  Object.assign(process.env, {
    VOICE_PROVIDER: "vonage",
    VONAGE_APPLICATION_ID: "synthetic-app",
    VONAGE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
    VONAGE_API_SECRET: "synthetic-event-secret",
    LEADTRACKER_BASE_URL: "https://crm.example.test",
    LEADTRACKER_CTA_BRAND: "swiftleads",
  })
  const requests = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    if (url.includes("quick-lead")) return { ok: true, json: async () => ({ leadId: 123 }) }
    assert.equal(url, "https://api.nexmo.com/v1/calls")
    return { ok: true, text: async () => JSON.stringify({ uuid: "synthetic-call" }) }
  })
  const req = Readable.from([Buffer.from(JSON.stringify({ name: "Synthetic Test", phone: "+12025550199", email: "test@example.test" }))])
  req.method = "POST"
  const res = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
  await handler(req, res)
  assert.equal(res.code, 200)
  assert.equal(res.body.call_uuid, "synthetic-call")
  assert.equal(requests.length, 2)
  const call = requests[1].body
  assert.deepEqual(call.advanced_machine_detection, { behavior: "continue", mode: "default", beep_timeout: 45 })
  assert.equal(call.machine_detection, undefined)
  const event = new URL(call.event_url[0])
  assert.equal(event.origin, "https://crm.example.test")
  assert.equal(event.pathname, "/api/public/cta/swiftleads/callback-voice-event")
  const timestamp = event.searchParams.get("timestamp")
  const to = event.searchParams.get("to")
  const from = event.searchParams.get("from")
  assert.equal(to, "+12025550199")
  assert.equal(from, `+${call.from.number}`)
  assert.equal(event.searchParams.get("signature"), createHmac("sha256", "synthetic-event-secret")
    .update(["callback-amd-v1", timestamp, "swiftleads", to, from].join(".")).digest("hex"))
  assert.equal(new URL(call.answer_url[0]).pathname, "/api/vonage-ncco")
})
