// Vonage event webhook — receives call status updates (ringing, answered, etc.)
// Just acknowledges receipt; no action needed.

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  res.status(204).end()
}
