#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/provider-logos"
mkdir -p "$OUT"

# Preferred source for mature technology brands.
declare -A SIMPLE_ICON_SLUGS=(
  [openai]=openai
  [anthropic]=anthropic
  [qwen]=qwen
  [kimi]=moonshot
  [grok]=xai
  [gitlab]=gitlab
  [lovable]=lovable
  [opencode]=opencode
  [kiro]=kiro
  [deepseek]=deepseek
  [groq]=groq
  [perplexity]=perplexity
  [mistral]=mistral
  [cohere]=cohere
  [huggingface]=huggingface
  [vertex-ai]=googlecloud
  [azure-openai]=microsoftazure
  [openrouter]=openrouter
  [together]=together
  [fireworks]=fireworks
  [cerebras]=cerebras
  [sambanova]=sambanova
  [nvidia]=nvidia
  [cloudflare]=cloudflare
  [vercel]=vercel
  [ollama]=ollama
  [lmstudio]=lmstudio
  [duckduckgo]=duckduckgo
  [aws-bedrock]=amazonaws
  [notion]=notion
  [windsurf]=codeium
)

# Pinned fallback source for AI provider brands that Simple Icons does not publish.
# @lobehub/icons-static-svg is MIT licensed; retain source attribution below.
LOBE_VERSION="1.94.0"
declare -A LOBE_ICON_SLUGS=(
  [openai]=openai
  [kimi]=moonshot
  [grok]=xai
  [groq]=groq
  [mistral]=mistral
  [cohere]=cohere
  [azure-openai]=azureai
  [aws-bedrock]=bedrock
  [together]=together
  [fireworks]=fireworks
  [cerebras]=cerebras
  [sambanova]=sambanova
  [lovable]=lovable
  [windsurf]=windsurf
  [kiro]=kiro
  [qoder]=qoder
  [kilo]=kilocode
  [pollinations]=pollinations
)

fetch_svg() {
  local provider="$1"
  local url="$2"
  local target="$OUT/${provider}.svg"
  local temporary="${target}.tmp"
  rm -f "$temporary"
  if curl --fail --silent --show-error --location --max-time 20 "$url" -o "$temporary" && grep -q '<svg' "$temporary"; then
    mv "$temporary" "$target"
    printf '%s\n' "fetched $provider $url"
    return 0
  fi
  rm -f "$temporary"
  return 1
}

for provider in "${!SIMPLE_ICON_SLUGS[@]}"; do
  slug="${SIMPLE_ICON_SLUGS[$provider]}"
  fetch_svg "$provider" "https://cdn.simpleicons.org/${slug}" || true
done

for provider in "${!LOBE_ICON_SLUGS[@]}"; do
  target="$OUT/${provider}.svg"
  if [[ -f "$target" ]] && grep -q '<svg' "$target"; then
    continue
  fi
  slug="${LOBE_ICON_SLUGS[$provider]}"
  fetch_svg "$provider" "https://unpkg.com/@lobehub/icons-static-svg@${LOBE_VERSION}/icons/${slug}.svg" || printf '%s\n' "missing $provider"
done

cat > "$OUT/SOURCES.txt" <<'EOF'
Logo sources:
- Simple Icons CDN (https://simpleicons.org/)
- LobeHub static SVG icon set, version 1.94.0 (https://github.com/lobehub/lobe-icons), MIT License

The dashboard displays these marks only to identify configured third-party providers. It does not imply endorsement, partnership, or sponsorship.
EOF
