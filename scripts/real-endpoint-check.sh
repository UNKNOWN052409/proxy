#!/usr/bin/env bash
set -euo pipefail
BASE_URL="https://vip.prexzyapis.com"
API_KEY="${PREXZY_API_KEY:?set PREXZY_API_KEY in the environment}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

request_models() {
  local label="$1" auth="$2"
  local out="$TMP_DIR/$label.json" headers="$TMP_DIR/$label.headers"
  if [[ "$auth" == "yes" ]]; then
    curl -sS --max-time 8 --connect-timeout 5 -D "$headers" -o "$out" \
      -H "Authorization: Bearer ${API_KEY}" -H 'Accept: application/json' \
      "$BASE_URL/v1/models" || true
  else
    curl -sS --max-time 8 --connect-timeout 5 -D "$headers" -o "$out" \
      -H 'Accept: application/json' "$BASE_URL/v1/models" || true
  fi
  local status content_type
  status="$(awk 'NR==1 {print $2}' "$headers" 2>/dev/null || true)"
  content_type="$(awk -F': ' 'tolower($1)=="content-type" {print $2}' "$headers" | tr -d '\r' | tail -1)"
  printf '%s_status=%s\n%s_content_type=%s\n' "$label" "${status:-request_failed}" "$label" "${content_type:-unknown}"
  python3 - "$out" "$label" <<'PY'
import json, sys
path, label = sys.argv[1:]
try:
    data = json.load(open(path))
except Exception:
    print(f"{label}_models=[]")
    raise SystemExit
items = data.get("data") if isinstance(data, dict) else None
if not isinstance(items, list):
    items = data.get("models") if isinstance(data, dict) else []
ids=[]
for item in items[:20] if isinstance(items, list) else []:
    value = item if isinstance(item, str) else item.get("id") if isinstance(item, dict) else None
    if isinstance(value, str): ids.append(value[:160])
print(f"{label}_models=" + json.dumps(ids))
PY
}

request_models anonymous no
ANON_STATUS="$(awk 'NR==1 {print $2}' "$TMP_DIR/anonymous.headers" 2>/dev/null || true)"
if [[ "$ANON_STATUS" == "401" || "$ANON_STATUS" == "403" ]]; then
  request_models authenticated yes
  MODELS_FILE="$TMP_DIR/authenticated.json"
else
  MODELS_FILE="$TMP_DIR/anonymous.json"
fi

MODEL="$(python3 - "$MODELS_FILE" <<'PY'
import json, sys
try:
    data=json.load(open(sys.argv[1]))
except Exception:
    print("")
    raise SystemExit
items=data.get("data") if isinstance(data,dict) else None
if not isinstance(items,list): items=data.get("models") if isinstance(data,dict) else []
for item in items:
    value=item if isinstance(item,str) else item.get("id") if isinstance(item,dict) else None
    if isinstance(value,str) and value:
        print(value[:160]); break
PY
)"
if [[ -z "$MODEL" ]]; then
  printf 'one_request=skipped\nreason=no_model_catalog\n'
  exit 0
fi
printf 'selected_model=%s\n' "$MODEL"
python3 - "$MODEL" "$TMP_DIR/request.json" <<'PY'
import json, sys
model, path=sys.argv[1:]
json.dump({"model": model, "messages":[{"role":"user","content":"Reply with exactly: gateway-test-ok"}],"stream":False}, open(path,"w"))
PY
curl -sS --max-time 10 --connect-timeout 5 -D "$TMP_DIR/completion.headers" -o "$TMP_DIR/completion.json" \
  -H "Authorization: Bearer ${API_KEY}" -H 'Content-Type: application/json' \
  --data-binary @"$TMP_DIR/request.json" "$BASE_URL/v1/chat/completions" || true
STATUS="$(awk 'NR==1 {print $2}' "$TMP_DIR/completion.headers" 2>/dev/null || true)"
python3 - "$TMP_DIR/completion.json" "$STATUS" <<'PY'
import json, sys
path,status=sys.argv[1:]
try: data=json.load(open(path))
except Exception: data={}
text=""
try: text=data["choices"][0]["message"]["content"]
except Exception: text=data.get("error",{}).get("message","") if isinstance(data,dict) else ""
text=str(text).replace("\n"," ")[:240]
for term in ["authorization","bearer","api_key","apikey","token","password"]:
    text=text.replace(term, "[REDACTED]")
print(f"one_request_status={status or 'request_failed'}")
print(f"one_request_response_preview={text}")
print(f"one_request_shape={json.dumps(list(data)[:20] if isinstance(data,dict) else [])}")
PY
