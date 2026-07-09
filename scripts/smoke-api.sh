#!/usr/bin/env bash
# A2B LIFT post-deploy smoke test.
# Run after every backend deploy, BEFORE building any mobile app:
#   bash scripts/smoke-api.sh https://a2blift.com
# Every check must PASS. A 500 anywhere means the deploy is broken — fix it
# before spending hours on a mobile build.

set -u
BASE="${1:-https://a2blift.com}"
FAIL=0

check() {
  local desc="$1" expected="$2" method="$3" path="$4" body="${5:-}"
  local code
  if [[ "$method" == "GET" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE$path")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X "$method" \
      -H "Content-Type: application/json" -d "$body" "$BASE$path")
  fi
  if [[ "$code" == "$expected" ]]; then
    echo "PASS  [$code] $desc"
  else
    echo "FAIL  [$code, wanted $expected] $desc  ($method $path)"
    FAIL=1
  fi
}

echo "Smoke testing $BASE"
echo "──────────────────────────────────────────────"

# Server up + core info endpoints
check "health endpoint"            200 GET  /api/health
check "app config endpoint"        200 GET  /api/config
check "version endpoint"           200 GET  /api/version

# Auth: wrong credentials must be a clean 401 — a 500 means DB/env is broken
check "login rejects bad creds cleanly" 401 POST /api/auth/login \
  '{"email":"smoke-test-nonexistent@example.com","password":"wrong-password-123"}'

# Auth: invalid registration must be a clean 400 validation error, not a 500
check "register validates input cleanly" 400 POST /api/auth/register \
  '{"email":"not-an-email"}'

# Session check without token must be a clean 401
check "auth/me without token"      401 GET  /api/auth/me

echo "──────────────────────────────────────────────"
if [[ "$FAIL" == "1" ]]; then
  echo "RESULT: FAILED — do NOT build mobile apps against this backend."
  exit 1
fi
echo "RESULT: ALL PASS — backend is safe to build against."
