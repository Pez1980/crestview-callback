#!/usr/bin/env bash
# Switch the crestview-callback form's voice provider and redeploy.
#
#   ./scripts/switch-voice-provider.sh vonage
#   ./scripts/switch-voice-provider.sh telnyx
#
# Vercel env changes only take effect on a new deployment, so this always
# redeploys production after flipping VOICE_PROVIDER.
#
# NOTE: this switch is independent of LeadTracker's DIALER_PROVIDER on EC2.
# "Switch the whole system" = flip both.
set -euo pipefail

PROVIDER="${1:-}"
if [[ "$PROVIDER" != "telnyx" && "$PROVIDER" != "vonage" ]]; then
  echo "usage: $0 telnyx|vonage" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

vercel env rm VOICE_PROVIDER production --yes >/dev/null 2>&1 || true
printf '%s' "$PROVIDER" | vercel env add VOICE_PROVIDER production >/dev/null
echo "VOICE_PROVIDER=$PROVIDER set on production; deploying…"
vercel deploy --prod --yes

echo
echo "Smoke test (expects \"provider\": \"$PROVIDER\"; the fake number is refused by carriers, that's fine):"
curl -s -X POST https://crestview-callback.vercel.app/api/request-callback \
  -H "Content-Type: application/json" \
  -d '{"name":"Switch Smoke Test","phone":"+15005550006","email":"test@example.com","state":"NY","language":"en"}'
echo
