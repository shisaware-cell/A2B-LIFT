#!/usr/bin/env bash
# Safely ensure DreamHost email DNS records exist in the Cloudflare zone.
#
# The script is read-only by default. Pass --apply to create exact missing
# records. It never changes nameservers, website/API records, or unrelated TXT
# records, and it stops instead of overwriting a conflicting mail record.

set -euo pipefail

ZONE_NAME="a2blift.com"
API="https://api.cloudflare.com/client/v4"
MODE="dry-run"

SPF_VALUE="v=spf1 mx include:netblocks.dreamhost.com include:relay.mailchannels.net -all"
DMARC_VALUE="v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:support@a2blift.com"
DKIM_VALUE="v=DKIM1; k=rsa; h=sha256; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxBUJc4BSEgWaDe7IhlsI79muSsDgqqf79q8pOgWhh0Xv7tvRcm1QQN9swlxIw9xPgqvioFmMewvWOHLi8zt5WZrLFmzJcsTOaNj5YUdlFWP61bSgi3ZBupv4QpuDaFInxVlX2hssaJhqKCrq3RiT3tLIZChlPnZErX2IBbsCZYE/KOdXvOvj9acUxnYyat67CQg0C3mhMniFFHZu2u2I39Ju6i+T4+JjL/Vyp0wieKnon40MgoX9NKhCTg+nn8FnpjDThLKi9Z6VdFAlV6AjyTmUGxtBCWHJ61zFeMHtME57vLOXN1TAbqNx5WJJ0WVVgy9cAbWsBPgVb0sZPBRjkwIDAQAB"

usage() {
  cat <<'EOF'
Usage:
  CF_API_TOKEN=... bash scripts/cloudflare-dreamhost-email-dns.sh
  CF_API_TOKEN=... bash scripts/cloudflare-dreamhost-email-dns.sh --apply

The first command audits and prints proposed additions. The second creates only
exact missing DreamHost email records. Conflicts must be reviewed manually.
EOF
}

case "${1:-}" in
  "")
    ;;
  --apply)
    MODE="apply"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

: "${CF_API_TOKEN:?Set CF_API_TOKEN first (export CF_API_TOKEN=...)}"

auth=(
  -H "Authorization: Bearer ${CF_API_TOKEN}"
  -H "Content-Type: application/json"
)

api_result() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local response

  if [[ -n "$body" ]]; then
    response=$(curl -sS -X "$method" "${auth[@]}" "$url" --data "$body")
  else
    response=$(curl -sS -X "$method" "${auth[@]}" "$url")
  fi

  python3 -c '
import json
import sys

payload = json.load(sys.stdin)
if not payload.get("success"):
    print("Cloudflare API error: " + json.dumps(payload.get("errors", [])), file=sys.stderr)
    raise SystemExit(1)
print(json.dumps(payload.get("result")))
' <<<"$response"
}

echo "Looking up Cloudflare zone ${ZONE_NAME}..."
zone_result=$(api_result GET "${API}/zones?name=${ZONE_NAME}&status=active")
ZONE_ID=$(python3 -c '
import json
import sys

zones = json.load(sys.stdin)
print(zones[0]["id"] if len(zones) == 1 else "")
' <<<"$zone_result")

if [[ -z "$ZONE_ID" ]]; then
  echo "ERROR: expected one active Cloudflare zone named ${ZONE_NAME}." >&2
  exit 1
fi

record_body() {
  local type="$1"
  local fqdn="$2"
  local content="$3"
  local priority="$4"

  python3 -c '
import json
import sys

record_type, name, content, priority = sys.argv[1:5]
record = {"type": record_type, "name": name, "ttl": 1}

if record_type == "SRV":
    record["data"] = {
        "service": "_autodiscover",
        "proto": "_tcp",
        "name": "a2blift.com",
        "priority": 5,
        "weight": 0,
        "port": 443,
        "target": "autoconfig.dreamhost.com",
    }
else:
    record["content"] = content
    if record_type in {"A", "CNAME"}:
        record["proxied"] = False
    if record_type == "MX":
        record["priority"] = int(priority)

print(json.dumps(record))
' "$type" "$fqdn" "$content" "$priority"
}

ensure_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local priority="${4:-}"
  local conflict_scope="${5:-unique}"
  local fqdn="$name"
  local current
  local state

  [[ "$name" == "@" ]] && fqdn="$ZONE_NAME"
  current=$(api_result GET "${API}/zones/${ZONE_ID}/dns_records?type=${type}&name=${fqdn}&per_page=100")

  state=$(python3 -c '
import json
import sys

records = json.load(sys.stdin)
record_type, content, priority, scope = sys.argv[1:5]

def host(value):
    return (value or "").rstrip(".").lower()

def is_exact(record):
    if record_type == "SRV":
        data = record.get("data") or {}
        return (
            data.get("service") == "_autodiscover"
            and data.get("proto") == "_tcp"
            and int(data.get("priority", -1)) == 5
            and int(data.get("weight", -1)) == 0
            and int(data.get("port", -1)) == 443
            and host(data.get("target")) == "autoconfig.dreamhost.com"
        )
    existing = record.get("content", "")
    if record_type in {"A", "CNAME", "MX"}:
        if host(existing) != host(content):
            return False
    elif existing != content:
        return False
    if record_type == "MX":
        return int(record.get("priority", -1)) == int(priority)
    return True

exact = any(is_exact(record) for record in records)

conflicts = []
for record in records:
    existing = record.get("content", "")
    if scope == "spf":
        if existing.strip().lower().startswith("v=spf1") and not is_exact(record):
            conflicts.append(record)
    elif scope == "dreamhost-mx":
        allowed = {
            ("mx1.dreamhost.com", 0),
            ("mx2.dreamhost.com", 0),
        }
        candidate = (host(existing), int(record.get("priority", -1)))
        if candidate not in allowed:
            conflicts.append(record)
    elif not is_exact(record):
        conflicts.append(record)

if conflicts:
    print("conflict:" + json.dumps(conflicts, separators=(",", ":")))
elif exact:
    print("present")
else:
    print("missing")
' "$type" "$content" "$priority" "$conflict_scope" <<<"$current")

  case "$state" in
    present)
      printf '  OK       %-5s %-32s %s\n' "$type" "$name" "$content"
      ;;
    missing)
      if [[ "$MODE" == "dry-run" ]]; then
        printf '  WOULD ADD %-5s %-32s %s\n' "$type" "$name" "$content"
      else
        local body
        body=$(record_body "$type" "$fqdn" "$content" "$priority")
        api_result POST "${API}/zones/${ZONE_ID}/dns_records" "$body" >/dev/null
        printf '  CREATED  %-5s %-32s %s\n' "$type" "$name" "$content"
      fi
      ;;
    conflict:*)
      echo "ERROR: refusing to overwrite conflicting ${type} record(s) for ${fqdn}." >&2
      echo "${state#conflict:}" >&2
      return 1
      ;;
    *)
      echo "ERROR: unexpected record state for ${type} ${fqdn}: ${state}" >&2
      return 1
      ;;
  esac
}

echo "Auditing DreamHost email DNS records (${MODE})..."

ensure_record A "mail" "64.90.62.162"
ensure_record A "mailboxes" "69.163.136.97"
ensure_record A "webmail" "69.163.136.138"
ensure_record A "www.mailboxes" "69.163.136.97"
ensure_record A "www.webmail" "69.163.136.138"
ensure_record CNAME "autoconfig" "autoconfig.dreamhost.com"

ensure_record MX "@" "mx1.dreamhost.com" 0 dreamhost-mx
ensure_record MX "@" "mx2.dreamhost.com" 0 dreamhost-mx
ensure_record MX "mail" "mx1.dreamhost.com" 0 dreamhost-mx
ensure_record MX "mail" "mx2.dreamhost.com" 0 dreamhost-mx

ensure_record TXT "@" "$SPF_VALUE" "" spf
ensure_record TXT "dreamhost._domainkey" "$DKIM_VALUE"
ensure_record TXT "_dmarc" "$DMARC_VALUE"
ensure_record SRV "_autodiscover._tcp" "autoconfig.dreamhost.com"

echo
if [[ "$MODE" == "dry-run" ]]; then
  echo "Dry run complete. Re-run with --apply only after reviewing the output."
else
  echo "DreamHost email DNS records are present. Verify with:"
  echo "  dig +short MX ${ZONE_NAME}"
  echo "  dig +short TXT ${ZONE_NAME}"
  echo "  dig +short TXT dreamhost._domainkey.${ZONE_NAME}"
fi
