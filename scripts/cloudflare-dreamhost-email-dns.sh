#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Add DreamHost email DNS records to Cloudflare for a2blift.com
#
# Your nameservers point to Cloudflare, so DreamHost cannot create its own
# email records — they must be added here. This script does that via the
# Cloudflare API.
#
# NOTHING here touches your existing A/CNAME records for the API/website,
# so a2blift.com (Railway), /admin, /r/CODE and /driver keep working.
#
# ── SETUP ──────────────────────────────────────────────────────────────────
# 1. Create a Cloudflare API token:
#      Cloudflare dashboard → My Profile → API Tokens → Create Token
#      → template "Edit zone DNS" → Zone Resources: a2blift.com → Create
#
# 2. Fill in the values below from the DreamHost panel:
#      Manage Websites → (⋮) → DNS Settings
#
# 3. Run:
#      export CF_API_TOKEN="your-token"
#      bash scripts/cloudflare-dreamhost-email-dns.sh
# ---------------------------------------------------------------------------

set -euo pipefail

ZONE_NAME="a2blift.com"

# ── FILL THESE IN FROM THE DREAMHOST DNS SETTINGS PAGE ─────────────────────
# MX: if Spam filtering is ENABLED, DreamHost uses mailchannels; if not, dreamhost.com
MX1="mx1.dreamhost.com"          # or mx1.mailchannels.net
MX2="mx2.dreamhost.com"          # or mx2.mailchannels.net

# SPF — copy the exact TXT value shown in your DreamHost panel.
SPF_VALUE="v=spf1 mx include:netblocks.dreamhost.com include:relay.mailchannels.net -all"

# DKIM — copy the long value of the dreamhost._domainkey TXT record.
DKIM_VALUE="PASTE_YOUR_DKIM_VALUE_HERE"

# A records — copy the IPs shown in your DreamHost panel (these are examples).
MAIL_IP="64.90.62.162"
WEBMAIL_IP="69.163.136.138"
MAILBOXES_IP="69.163.136.97"
# ───────────────────────────────────────────────────────────────────────────

: "${CF_API_TOKEN:?Set CF_API_TOKEN first (export CF_API_TOKEN=...)}"

API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

echo "→ Looking up zone ${ZONE_NAME}…"
ZONE_ID=$(curl -s "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" | python3 -c \
  'import sys,json; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')

if [[ -z "$ZONE_ID" ]]; then
  echo "ERROR: could not find zone ${ZONE_NAME}. Check the token has access to it." >&2
  exit 1
fi
echo "  zone id: ${ZONE_ID}"

# Create (or update) a DNS record. All records are DNS-only (never proxied) —
# Cloudflare's proxy only handles HTTP and would break mail.
upsert() {
  local type="$1" name="$2" content="$3" prio="${4:-}" extra="${5:-}"
  local fqdn="$name"
  [[ "$name" == "@" ]] && fqdn="$ZONE_NAME"

  local body
  body=$(python3 - "$type" "$fqdn" "$content" "$prio" "$extra" <<'PY'
import json,sys
t,name,content,prio,extra = sys.argv[1:6]
rec = {"type": t, "name": name, "ttl": 1, "proxied": False}
if t == "SRV":
    rec["data"] = json.loads(extra)
else:
    rec["content"] = content
if prio:
    rec["priority"] = int(prio)
print(json.dumps(rec))
PY
)

  # Is there an existing record of this type+name?
  local existing
  existing=$(curl -s "${auth[@]}" "${API}/zones/${ZONE_ID}/dns_records?type=${type}&name=${fqdn}" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); r=d.get("result") or []; print(r[0]["id"] if r else "")')

  local resp
  if [[ -n "$existing" ]]; then
    resp=$(curl -s -X PUT "${auth[@]}" "${API}/zones/${ZONE_ID}/dns_records/${existing}" --data "$body")
    echo -n "  updated "
  else
    resp=$(curl -s -X POST "${auth[@]}" "${API}/zones/${ZONE_ID}/dns_records" --data "$body")
    echo -n "  created "
  fi

  python3 -c 'import sys,json
d=json.load(sys.stdin)
if d.get("success"): print("OK   '"$type"' '"$fqdn"'")
else: print("FAIL '"$type"' '"$fqdn"' →", d.get("errors"))' <<<"$resp"
}

echo "→ Adding mail records (all DNS-only, never proxied)…"
upsert MX  "@"                    "$MX1" 0
upsert MX  "@"                    "$MX2" 10
upsert TXT "@"                    "$SPF_VALUE"

if [[ "$DKIM_VALUE" != "PASTE_YOUR_DKIM_VALUE_HERE" ]]; then
  upsert TXT "dreamhost._domainkey" "$DKIM_VALUE"
else
  echo "  SKIPPED DKIM — paste the value from DreamHost into DKIM_VALUE first."
fi

upsert CNAME "autoconfig"  "autoconfig.dreamhost.com"
upsert A     "mail"        "$MAIL_IP"
upsert A     "webmail"     "$WEBMAIL_IP"
upsert A     "mailboxes"   "$MAILBOXES_IP"
upsert SRV   "_autodiscover._tcp" "" "" \
  '{"service":"_autodiscover","proto":"_tcp","name":"'"$ZONE_NAME"'","priority":5,"weight":0,"port":443,"target":"autoconfig.dreamhost.com"}'

echo
echo "Done. Verify with:"
echo "  dig +short MX  ${ZONE_NAME}"
echo "  dig +short TXT ${ZONE_NAME}"
echo
echo "Note: only ONE SPF TXT record may exist. If you later verify Resend on"
echo "this domain, merge its include into the single SPF line above."
