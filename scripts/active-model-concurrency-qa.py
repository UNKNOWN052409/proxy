#!/usr/bin/env python3
"""Bounded real concurrency audit for one user-authorized OpenAI-compatible model.

The script records only aggregate status, timing, and response-shape information. It never
writes authorization headers, API keys, or completion content to the report.
"""

import json
import os
import statistics
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

BASE = os.environ.get("PROXY_BASE_URL", "").rstrip("/")
API_PREFIX = "" if BASE.endswith("/v1") else "/v1"
KEY = os.environ.get("PROXY_API_KEY", "")
MODEL = os.environ.get("QA_MODEL_ID", "gpt-5.6-sol")
TIMEOUT = float(os.environ.get("QA_TIMEOUT_SECONDS", "20"))
LEVELS_RAW = os.environ.get("QA_CONCURRENCY_LEVELS", "1,2,5,10")
OUT = Path(os.environ.get("QA_OUTPUT", "docs/active-model-concurrency.json"))

try:
    LEVELS = [max(1, int(value.strip())) for value in LEVELS_RAW.split(",") if value.strip()]
except ValueError as exc:
    raise SystemExit("QA_CONCURRENCY_LEVELS must contain comma-separated positive integers") from exc

if not BASE:
    raise SystemExit("PROXY_BASE_URL is required")
if not KEY:
    raise SystemExit("PROXY_API_KEY is required")
if not LEVELS:
    raise SystemExit("At least one concurrency level is required")


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * fraction)))
    return round(ordered[index], 1)


def invoke(request_number):
    started = time.monotonic()
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 4,
        "temperature": 0,
    }
    try:
        response = requests.post(
            BASE + API_PREFIX + "/chat/completions",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {KEY}",
            },
            json=body,
            timeout=TIMEOUT,
        )
        latency = round((time.monotonic() - started) * 1000, 1)
        try:
            data = response.json()
        except ValueError:
            data = None
        valid_completion = (
            response.status_code == 200
            and isinstance(data, dict)
            and isinstance(data.get("choices"), list)
            and len(data["choices"]) > 0
        )
        return {
            "request_number": request_number,
            "status": str(response.status_code),
            "latency_ms": latency,
            "valid_completion": valid_completion,
            "content_type": response.headers.get("content-type", "")[:120],
        }
    except requests.RequestException as exc:
        return {
            "request_number": request_number,
            "status": f"transport:{type(exc).__name__}",
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
            "valid_completion": False,
            "content_type": "",
        }


def run_level(concurrency):
    started = time.monotonic()
    records = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(invoke, position + 1) for position in range(concurrency)]
        for future in as_completed(futures):
            records.append(future.result())
    wall_ms = round((time.monotonic() - started) * 1000, 1)
    latencies = [record["latency_ms"] for record in records]
    statuses = Counter(record["status"] for record in records)
    valid = sum(1 for record in records if record["valid_completion"])
    return {
        "concurrency": concurrency,
        "attempted_requests": len(records),
        "valid_completions": valid,
        "failed_or_incompatible": len(records) - valid,
        "status_counts": dict(sorted(statuses.items())),
        "wall_time_ms": wall_ms,
        "effective_requests_per_second": round((len(records) / wall_ms) * 1000, 3) if wall_ms else None,
        "latency_ms": {
            "min": round(min(latencies), 1) if latencies else None,
            "median": round(statistics.median(latencies), 1) if latencies else None,
            "p95": percentile(latencies, 0.95),
            "max": round(max(latencies), 1) if latencies else None,
        },
    }


def main():
    report = {
        "model": MODEL,
        "endpoint_has_v1_suffix": BASE.endswith("/v1"),
        "timeout_seconds": TIMEOUT,
        "levels": [],
        "safety": {
            "bounded_requests": sum(LEVELS),
            "completion_content_stored": False,
            "authorization_stored": False,
        },
    }
    for index, level in enumerate(LEVELS):
        report["levels"].append(run_level(level))
        if index < len(LEVELS) - 1:
            time.sleep(2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"model": MODEL, "levels": report["levels"], "report": str(OUT)}, indent=2))


if __name__ == "__main__":
    main()
