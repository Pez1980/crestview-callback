// Vonage event webhook — receives call status updates (started, ringing,
// answered, completed, failed, rejected, ...). Logged so `vercel logs` can
// reconstruct why a call leg never rang (status + detail + sip/hangup cause).

export const config = { api: { bodyParser: false } }

async function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const t = Buffer.concat(chunks).toString("utf8")
      try { resolve(JSON.parse(t || "{}")) } catch { resolve({ raw: t.slice(0, 500) }) }
    })
    req.on("error", () => resolve({}))
  })
}

export default async function handler(req, res) {
  const body = await readJsonBody(req)
  console.log("[vonage-event]", JSON.stringify({
    status: body.status,
    detail: body.detail,
    reason: body.reason,
    uuid: body.uuid,
    conversation_uuid: body.conversation_uuid,
    to: body.to,
    from: body.from,
    direction: body.direction,
    timestamp: body.timestamp,
    sip_code: body.sip_code,
    disconnected_by: body.disconnected_by,
  }))
  res.status(204).end()
}
