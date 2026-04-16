/**
 * Telnyx Dynamic Variables Webhook Handler
 *
 * Deploy this as a serverless function (Vercel, AWS Lambda, etc.)
 * Telnyx POSTs here at conversation start to inject lead context.
 *
 * The form submission should store lead data in your DB keyed by phone number.
 * This handler looks it up and returns the variables the assistant needs.
 */

// Example: Vercel serverless function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { telnyx_end_user_target, call_control_id } = req.body

  if (!telnyx_end_user_target) {
    return res.status(200).json({
      dynamic_variables: {
        full_name: 'Valued Customer',
        first_name: 'there',
        state: 'your state',
        email: '',
      },
    })
  }

  // --- Replace with your actual DB lookup ---
  // Look up the lead by phone number (E.164 format)
  const lead = await lookupLeadByPhone(telnyx_end_user_target)

  if (!lead) {
    return res.status(200).json({
      dynamic_variables: {
        full_name: 'Valued Customer',
        first_name: 'there',
        state: 'your state',
        email: '',
      },
    })
  }

  const firstName = lead.name?.split(' ')[0] || 'there'

  return res.status(200).json({
    dynamic_variables: {
      full_name: lead.name || 'Valued Customer',
      first_name: firstName,
      state: lead.state || 'your state',
      email: lead.email || '',
    },
    // Optional: inject memory context for returning callers
    memory: lead.previousInteractions
      ? `This caller previously contacted us on ${lead.previousInteractions.lastDate}. They were interested in ${lead.previousInteractions.intent}.`
      : undefined,
  })
}

/**
 * Replace this stub with your actual database query.
 * Phone number comes in E.164 format: +13025551234
 */
async function lookupLeadByPhone(phone) {
  // Example with PostgreSQL:
  //
  // const { rows } = await pool.query(
  //   'SELECT name, email, state FROM leads WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
  //   [phone]
  // )
  // return rows[0] || null

  return null // stub
}
