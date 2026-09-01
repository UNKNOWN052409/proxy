#!/usr/bin/env python3
"""Cookie Import Converter — cookies file -> platform detect -> accounts.

Input formats: (a) cookie-editor JSON array export, (b) Netscape
cookies.txt, (c) raw 'Cookie:' header string.

Platform fingerprint (domain + cookie names) — Rev.git/universal_bridge
connectors + proxy.git AccountCard se proven names:
  chat.qwen.ai       token (JWT)
  notion.so          token_v2
  chat.deepseek.com  userToken
  chatgpt.com        __Secure-next-auth.session-token
  huggingface.co     token / auth
  claude.ai          sessionKey
  kimi (moonshot)    Kimi_Session or @kimi cookies

Output: state/accounts.json — MERGE semantics (naye accounts ADD,
existing update, kabhi delete nahi). Backup .bak har write pe.
Single-user tool: user apne accounts import karta hai.
NO scraping, NO anti-bot bypass, NO multi-account quota rotation.

Usage:
    python3 cookie_import.py <file> [--dry-run]
"""
import argparse
import json
import os
import re
import shutil
import sys
import time

STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "state")
ACCOUNTS = os.path.join(STATE_DIR, "accounts.json")

# ------------------------------------------------ detection rules

def _looks_jwt(v):
    return bool(v) and v.count(".") == 2 and len(v) > 40

RULES = [
    # (provider, domain substr, cookie name, validator)
    ("qwen", "qwen.ai", "token", _looks_jwt),
    ("notion", "notion.so", "token_v2", None),
    ("deepseek", "deepseek.com", "userToken", None),
    ("chatgpt", "chatgpt.com", "__Secure-next-auth.session-token", None),
    ("claude", "claude.ai", "sessionKey", None),
    ("huggingface", "huggingface.co", "token", None),
    ("kimi", "kimi.moonshot.cn", "Kimi_Session", None),
    ("kimi", "kimi.com", "Kimi_Session", None),
]

# static model maps — rev-serving/universal_bridge se (single source)
def load_model_maps():
    maps = {}
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "..", "rev-serving", "universal_bridge.py")
    try:
        text = open(src, encoding="utf-8").read()
        import ast
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(
                    node.targets[0], ast.Name):
                nm = node.targets[0].id
                if nm in ("NOTION_MODELS",):
                    try:
                        maps["notion"] = ast.literal_eval(node.value)
                    except Exception:
                        pass
    except Exception:
        pass
    # qwen/deepseek aliases chhote hain — inline
    maps["qwen"] = {"qwen": "qwen3.7-plus", "qwen-plus": "qwen3.7-plus",
                    "qwen-max": "qwen3.8-max"}
    maps["deepseek"] = {"deepseek": "default",
                        "deepseek-expert": "expert",
                        "deepseek-think": "deep_think",
                        "deepseek-search": "search"}
    return maps


def detect(cookies):
    """cookies: list of {name, value, domain}. -> provider or None."""
    for prov, dom, cname, validator in RULES:
        for c in cookies:
            if (dom in (c.get("domain") or "").lower()
                    and c.get("name") == cname):
                v = c.get("value") or ""
                if validator and not validator(v):
                    continue
                return prov, c
    return None, None


# ------------------------------------------------ parsers

def parse_file(path):
    raw = open(path, encoding="utf-8", errors="replace").read().strip()
    # (a) JSON array
    if raw.startswith("[") or raw.startswith("{"):
        try:
            j = json.loads(raw)
            if isinstance(j, list):
                out = []
                for c in j:
                    if isinstance(c, dict) and c.get("name"):
                        out.append(c)
                if out:
                    return out, "cookie-editor json"
            elif isinstance(j, dict):
                # {domain: {name: value}} ya {name: value}
                out = []
                for dom, pairs in j.items():
                    if isinstance(pairs, dict):
                        for nm, val in pairs.items():
                            out.append({"name": nm, "value": val,
                                        "domain": dom})
                if out:
                    return out, "json dict"
        except json.JSONDecodeError:
            pass
    # (b) Netscape cookies.txt
    lines = [l for l in raw.splitlines()
             if l.strip() and not l.startswith("#")]
    if lines and all(l.count("\t") >= 6 for l in lines[:3]):
        out = []
        for l in lines:
            p = l.split("\t")
            if len(p) >= 7:
                out.append({"domain": p[0], "name": p[5],
                            "value": p[6]})
        if out:
            return out, "netscape"
    # (c) raw Cookie: header
    if "=" in raw and ";" in raw:
        out = []
        for pair in raw.replace("Cookie:", "").split(";"):
            if "=" in pair:
                nm, _, val = pair.strip().partition("=")
                out.append({"name": nm, "value": val,
                            "domain": ""})
        if out:
            return out, "raw header (domain unknown — name se detect)"
    raise SystemExit("[!] format pehchana nahi gaya")


# ------------------------------------------------ merge

def merge(accounts, entry):
    """identity = provider + primary credential value. ADD ya UPDATE,
    kabhi DELETE nahi."""
    ident = (entry["provider"], entry["credentials"]["primary"])
    for i, a in enumerate(accounts):
        if (a["provider"], a["credentials"].get("primary")) == ident:
            entry["added_at"] = a.get("added_at")  # original time bacha
            accounts[i] = entry
            return "updated", accounts
    accounts.append(entry)
    return "added", accounts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cookies, fmt = parse_file(args.file)
    prov, primary = detect(cookies)
    print(f"[parse] format={fmt} cookies={len(cookies)}")

    if not prov:
        print("[!] provider UNKNOWN — koi rule match nahi hua.")
        names = sorted({c.get("name") for c in cookies})[:10]
        doms = sorted({c.get("domain") for c in cookies
                       if c.get("domain")})[:5]
        print(f"    names: {names}\n    domains: {doms}")
        sys.exit(2)

    print(f"[detect] provider={prov} cookie={primary['name']} "
          f"({'JWT ok' if _looks_jwt(primary['value']) else 'value '
             + str(len(primary['value'])) + ' chars'})")

    maps = load_model_maps()
    models = sorted(set(maps.get(prov, {}).keys()))

    entry = {
        "provider": prov,
        "credentials": {
            "primary": primary["value"],
            "cookie_name": primary["name"],
            "raw_cookies": {c["name"]: c["value"] for c in cookies},
        },
        "status": "unknown",
        "status_note": "validated by adapter on first use",
        "models": models,
        "added_at": int(time.time()),
    }

    if args.dry_run:
        print("[dry-run] entry:")
        safe = dict(entry)
        safe["credentials"] = {**entry["credentials"],
                               "primary": entry["credentials"]["primary"][:12] + "..."}
        safe["credentials"]["raw_cookies"] = "<hidden>"
        print(json.dumps(safe, indent=2))
        return

    os.makedirs(STATE_DIR, exist_ok=True)
    accounts = []
    if os.path.exists(ACCOUNTS):
        try:
            accounts = json.load(open(ACCOUNTS, encoding="utf-8"))
        except Exception:
            shutil.copy2(ACCOUNTS, ACCOUNTS + ".corrupt")
            accounts = []
    action, accounts = merge(accounts, entry)
    if os.path.exists(ACCOUNTS):
        shutil.copy2(ACCOUNTS, ACCOUNTS + ".bak")
    json.dump(accounts, open(ACCOUNTS, "w", encoding="utf-8"),
              indent=2)
    print(f"[merge] {action} -> state/accounts.json "
          f"({len(accounts)} accounts total)")


if __name__ == "__main__":
    main()
