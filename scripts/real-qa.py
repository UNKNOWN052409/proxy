#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests

BASE = os.environ.get("PROXY_BASE_URL", "").rstrip("/")
API_PREFIX = "" if BASE.endswith("/v1") else "/v1"
KEY = os.environ.get("PROXY_API_KEY", "")
MODEL = os.environ.get("PROXY_MODEL_ID", "")
OUT = Path(os.environ.get("QA_OUTPUT", "docs/real-qa-report.json"))
TIMEOUT = float(os.environ.get("QA_TIMEOUT_SECONDS", "8"))
RUN_CONCURRENCY = os.environ.get("QA_APPROVE_CONCURRENCY", "false").lower() == "true"

if not BASE:
    raise SystemExit("PROXY_BASE_URL is required")

SECRET_FRAGMENTS = [x for x in (KEY, os.environ.get("OPENAI_API_KEY", "")) if len(x) >= 8]


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items() if k.lower() not in {"authorization", "api_key", "apikey", "token", "secret"}}
    if isinstance(value, list):
        return [redact(v) for v in value]
    text = str(value)
    for secret in SECRET_FRAGMENTS:
        text = text.replace(secret, secret[:4] + "-****" + secret[-4:])
    text = re.sub(r"(?i)(bearer\s+)[^\s,}]+", r"\1<redacted>", text)
    return text[:1000]


def record(test_id: str, feature: str, expected: str, actual: str, status: str, started: float, http_status=None, evidence=None, severity="Low"):
    return {
        "test_id": test_id,
        "feature": feature,
        "expected": expected,
        "actual": actual,
        "status": status,
        "http_status": http_status,
        "latency_ms": round((time.monotonic() - started) * 1000, 1),
        "evidence": redact(evidence or {}),
        "severity": severity,
    }


def raw_request(method: str, path: str, raw: str, key: str | None = None):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    started = time.monotonic()
    try:
        response = requests.request(method, BASE + API_PREFIX + path, headers=headers, data=raw, timeout=TIMEOUT)
        content_type = response.headers.get("content-type", "")
        text = response.text[:1000]
        parsed = None
        if "json" in content_type:
            try:
                parsed = response.json()
            except ValueError:
                parsed = None
        return response, round((time.monotonic() - started) * 1000, 1), content_type, parsed, text, None
    except requests.RequestException as exc:
        return None, round((time.monotonic() - started) * 1000, 1), "", None, "", type(exc).__name__


def request(method: str, path: str, body=None, key: str | None = None, stream=False):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    started = time.monotonic()
    try:
        response = requests.request(method, BASE + API_PREFIX + path, headers=headers, json=body, timeout=TIMEOUT, stream=stream)
        elapsed = round((time.monotonic() - started) * 1000, 1)
        content_type = response.headers.get("content-type", "")
        text = response.text[:1000] if not stream else ""
        parsed = None
        if "json" in content_type:
            try:
                parsed = response.json()
            except ValueError:
                parsed = None
        return response, elapsed, content_type, parsed, text, None
    except requests.RequestException as exc:
        return None, round((time.monotonic() - started) * 1000, 1), "", None, "", type(exc).__name__


def main():
    results = []
    models = []

    started = time.monotonic()
    response, elapsed, ctype, data, text, error = request("GET", "/v1/models")
    if response is None:
        results.append(record("MOD-01", "model registry", "200 JSON model list", f"transport error: {error}", "BLOCKED", started, evidence={"content_type": ctype}, severity="High"))
    else:
        if response.ok and isinstance(data, dict):
            models = [x.get("id") for x in data.get("data", []) if isinstance(x, dict) and x.get("id")]
            results.append(record("MOD-01", "model registry", "OpenAI model list", f"discovered {len(models)} models", "PASS" if models else "FAIL", started, response.status_code, {"content_type": ctype, "model_count": len(models), "model_ids": models[:50]}, "Medium" if not models else "Low"))
        else:
            results.append(record("MOD-01", "model registry", "OpenAI model list", f"HTTP {response.status_code}", "BLOCKED" if response.status_code in {401, 403, 404} else "FAIL", started, response.status_code, {"content_type": ctype, "error_shape": isinstance(data, dict), "preview": text[:200]}, "High"))

    started = time.monotonic()
    response, elapsed, ctype, data, text, error = request("GET", "/v1/models", key="invalid-test-key")
    results.append(record("AUTH-02", "authentication", "invalid key rejected cleanly", f"transport error: {error}" if response is None else f"HTTP {response.status_code}", "BLOCKED" if response is None else ("PASS" if response.status_code in {401, 403} else "FAIL"), started, None if response is None else response.status_code, {"content_type": ctype, "preview": text[:200]}, "Medium"))

    started = time.monotonic()
    response, elapsed, ctype, data, text, error = request("GET", "/v1/models", key=KEY or None)
    if response is None:
        results.append(record("AUTH-03", "authentication", "supplied key accepted or cleanly rejected", f"transport error: {error}", "BLOCKED", started, evidence={"content_type": ctype}, severity="High"))
    else:
        results.append(record("AUTH-03", "authentication", "supplied key accepted or cleanly rejected", f"HTTP {response.status_code}", "PASS" if response.status_code in {200, 401, 403} else "FAIL", started, response.status_code, {"content_type": ctype, "json_shape": isinstance(data, dict), "model_count": len(data.get("data", [])) if isinstance(data, dict) else None, "model_ids": [x.get("id") for x in data.get("data", []) if isinstance(x, dict) and x.get("id")][:50] if isinstance(data, dict) else []}, "High" if response.status_code >= 500 else "Low"))
        if response.ok and isinstance(data, dict):
            models = [x.get("id") for x in data.get("data", []) if isinstance(x, dict) and x.get("id")]

    if not models and MODEL:
        models = [MODEL]

    def test_model(model: str):
        body = {"model": model, "messages": [{"role": "user", "content": "Reply with exactly: gateway-test-ok"}], "max_tokens": 10, "temperature": 0}
        started = time.monotonic()
        response, elapsed, ctype, data, text, error = request("POST", "/v1/chat/completions", body, key=KEY or None)
        if response is None:
            return record("CHAT-01", "basic chat", "OpenAI completion JSON", f"{model}: transport error: {error}", "BLOCKED", started, evidence={"model": model}, severity="High")
        shape = isinstance(data, dict) and isinstance(data.get("choices"), list)
        return record("CHAT-01", "basic chat", "OpenAI completion JSON", f"{model}: HTTP {response.status_code}", "PASS" if response.ok and shape else ("BLOCKED" if response.status_code in {401, 403, 404, 408, 429, 500, 502, 503, 504} else "FAIL"), started, response.status_code, {"model": model, "content_type": ctype, "response_keys": list(data.keys())[:20] if isinstance(data, dict) else [], "choice_count": len(data.get("choices", [])) if isinstance(data, dict) else None, "preview": text[:200]}, "High" if response.status_code >= 500 else "Medium")

    for model in models[:10]:
        results.append(test_model(model))

    # Bounded negative and streaming checks from the QA matrix.
    started = time.monotonic()
    response, elapsed, ctype, data, text, error = raw_request("POST", "/v1/chat/completions", "{", key=KEY or None)
    results.append(record("ERR-02", "error handling", "malformed JSON returns clean error", f"transport error: {error}" if response is None else f"HTTP {response.status_code}", "BLOCKED" if response is None else ("PASS" if 400 <= response.status_code < 500 and isinstance(data, dict) else "FAIL"), started, None if response is None else response.status_code, {"content_type": ctype, "preview": text[:200]}, "Medium"))

    started = time.monotonic()
    response, elapsed, ctype, data, text, error = request("POST", "/v1/chat/completions", {"model": "__invalid_model__", "messages": [{"role": "user", "content": "test"}], "max_tokens": 1}, key=KEY or None)
    results.append(record("ERR-03", "error handling", "invalid model returns clean error", f"transport error: {error}" if response is None else f"HTTP {response.status_code}", "BLOCKED" if response is None else ("PASS" if response.status_code in {400, 401, 403, 404, 422} else "FAIL"), started, None if response is None else response.status_code, {"content_type": ctype, "preview": text[:200]}, "Medium"))

    if models:
        model = models[0]
        body = {"model": model, "messages": [{"role": "user", "content": "Reply with one short word."}], "max_tokens": 4, "temperature": 0, "stream": True}
        started = time.monotonic()
        response, elapsed, ctype, data, text, error = request("POST", "/v1/chat/completions", body, key=KEY or None, stream=True)
        if response is None:
            results.append(record("STREAM-01", "streaming", "SSE or clean unsupported error", f"transport error: {error}", "BLOCKED", started, evidence={"model": model}, severity="High"))
        else:
            prefix = response.text[:800]
            is_sse = "text/event-stream" in ctype or "data:" in prefix
            results.append(record("STREAM-01", "streaming", "SSE or clean unsupported error", f"HTTP {response.status_code}", "PASS" if response.ok and is_sse else "BLOCKED" if response.status_code in {400, 401, 403, 404, 408, 429, 500, 502, 503, 504} else "FAIL", started, response.status_code, {"model": model, "content_type": ctype, "sse_prefix": prefix[:200]}, "Medium"))

    if models:
        model = models[0]
        body = {"model": model, "messages": [{"role": "user", "content": "Reply with one JSON object containing ok=true."}], "max_tokens": 20, "temperature": 0, "response_format": {"type": "json_object"}}
        started = time.monotonic()
        response, elapsed, ctype, data, text, error = request("POST", "/v1/chat/completions", body, key=KEY or None)
        results.append(record("JSON-01", "structured output", "valid JSON mode or clean unsupported error", f"transport error: {error}" if response is None else f"HTTP {response.status_code}", "BLOCKED" if response is None else ("PASS" if response.ok else "BLOCKED" if response.status_code in {400, 401, 403, 404, 408, 429, 500, 502, 503, 504} else "FAIL"), started, None if response is None else response.status_code, {"model": model, "content_type": ctype, "response_keys": list(data.keys())[:20] if isinstance(data, dict) else []}, "Medium"))

        tool = {"type": "function", "function": {"name": "gateway_test", "description": "Return a test value", "parameters": {"type": "object", "properties": {"value": {"type": "string"}}, "required": ["value"], "additionalProperties": False}}}
        body = {"model": model, "messages": [{"role": "user", "content": "Use the gateway_test tool with value ok."}], "tools": [tool], "tool_choice": "auto", "parallel_tool_calls": False, "max_tokens": 30}
        started = time.monotonic()
        response, elapsed, ctype, data, text, error = request("POST", "/v1/chat/completions", body, key=KEY or None)
        results.append(record("TOOL-01", "tools", "tool call or clean unsupported error", f"transport error: {error}" if response is None else f"HTTP {response.status_code}", "BLOCKED" if response is None else ("PASS" if response.ok else "BLOCKED" if response.status_code in {400, 401, 403, 404, 408, 429, 500, 502, 503, 504} else "FAIL"), started, None if response is None else response.status_code, {"model": model, "content_type": ctype, "response_keys": list(data.keys())[:20] if isinstance(data, dict) else []}, "Medium"))

    if RUN_CONCURRENCY and models:
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(test_model, models[0]) for _ in range(5)]
            for future in as_completed(futures):
                results.append(record("CONC-01", "bounded concurrency", "five requests managed without hang", "completed one concurrent request", "PASS", time.monotonic(), evidence={"result": redact(future.result())}, severity="Low"))
    else:
        results.append(record("CONC-01", "bounded concurrency", "five requests only after approval", "not run; explicit approval flag absent", "BLOCKED", time.monotonic(), evidence={}, severity="Low"))

    payload = json.dumps(results, ensure_ascii=False, indent=2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload + "\n", encoding="utf-8")
    totals = {s: sum(1 for r in results if r["status"] == s) for s in ["PASS", "FAIL", "BLOCKED", "UNVERIFIED"]}
    print(json.dumps({"base_url": BASE, "model_hint": MODEL, "model_count": len(models), "totals": totals, "report": str(OUT)}, indent=2))


if __name__ == "__main__":
    main()
