#!/usr/bin/env bash
# Populate the dumps that Anchor.toml's [[test.validator.account]] and [[test.genesis]]
# entries reference, so localnet starts from local files instead of cloning at boot. Anchor.toml
# is the only source of truth: both the addresses and the destination paths are read
# from it, so the two cannot drift.
set -euo pipefail

RPC="${LOCALNET_ACCOUNTS_RPC:-https://api.mainnet-beta.solana.com}"
ATTEMPTS="${LOCALNET_ACCOUNTS_ATTEMPTS:-5}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PAIRS="$(mktemp)"
trap 'rm -f "$PAIRS"' EXIT
python3 - > "$PAIRS" <<'PY'
import tomllib
t = tomllib.load(open("Anchor.toml", "rb"))["test"]
# account entries are raw account dumps; genesis entries are program .so dumps, which
# the validator preloads properly rather than leaving to the program cache.
for a in t["validator"].get("account", []):
    print("account", a["address"], a["filename"])
for g in t.get("genesis", []):
    print("program", g["address"], g["program"])
PY

total=$(wc -l < "$PAIRS" | tr -d ' ')
if [ "$total" -eq 0 ]; then
  echo "no [[test.validator.account]] entries in Anchor.toml; nothing to fetch" >&2
  exit 0
fi

fetched=0; cached=0
while read -r kind addr file; do
  [ -n "$addr" ] || continue
  if [ -s "$file" ]; then cached=$((cached+1)); continue; fi
  mkdir -p "$(dirname "$file")"
  ok=0
  attempt=1
  while [ "$attempt" -le "$ATTEMPTS" ]; do
    # stdin is this loop's pair list, so keep the fetch off it
    if [ "$kind" = "program" ]; then
      solana program dump -u "$RPC" "$addr" "$file" < /dev/null >/dev/null 2>&1 || true
    else
      solana account -u "$RPC" "$addr" --output json --output-file "$file" \
        < /dev/null >/dev/null 2>&1 || true
    fi
    if [ -s "$file" ]; then
      ok=1; break
    fi
    rm -f "$file"
    echo "  attempt $attempt/$ATTEMPTS failed for $addr" >&2
    sleep $((attempt * 3))
    attempt=$((attempt+1))
  done
  if [ "$ok" -ne 1 ]; then
    echo "ERROR: could not fetch $addr from $RPC after $ATTEMPTS attempts" >&2
    exit 1
  fi
  fetched=$((fetched+1))
done < "$PAIRS"

# A missing file makes the validator fail at boot with a far less obvious message, so
# confirm every entry resolved before handing over.
missing=0
while read -r kind addr file; do
  [ -n "$file" ] || continue
  [ -s "$file" ] || { echo "ERROR: $file missing for $addr" >&2; missing=1; }
done < "$PAIRS"
[ "$missing" -eq 0 ] || exit 1

echo "localnet accounts ready: $total total, $fetched fetched, $cached already present"
