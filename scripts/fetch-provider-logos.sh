#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/provider-logos"
mkdir -p "$OUT"

declare -A SLUGS=(
  [openai]=openai
  [anthropic]=anthropic
  [qwen]=qwen
  [kimi]=moonshot
  [grok]=xai
  [gitlab]=gitlab
  [lovable]=lovable
  [opencode]=opencode
  [kiro]=kiro
)

for provider in "${!SLUGS[@]}"; do
  slug="${SLUGS[$provider]}"
  url="https://cdn.simpleicons.org/${slug}"
  target="$OUT/${provider}.svg"
  if curl --fail --silent --show-error --location --max-time 15 "$url" -o "$target"; then
    if ! grep -q '<svg' "$target"; then
      rm -f "$target"
      printf '%s\n' "missing-svg $provider $url"
    else
      printf '%s\n' "fetched $provider $url"
    fi
  else
    rm -f "$target"
    printf '%s\n' "missing $provider $url"
  fi
done

printf '%s\n' "Logo sources: Simple Icons CDN (https://simpleicons.org/)" > "$OUT/SOURCES.txt"
