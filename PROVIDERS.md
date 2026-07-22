# New MITM Providers - Quick Reference

This document provides setup instructions for all OAuth + MITM and NO AUTH providers added to Kiro Proxy.

## OAuth + MITM Providers

### Hugging Face (OAuth Optional, Free Tier)
**No authentication required for free tier** - rate limited but functional.

**Optional token for higher limits:**
```bash
# Set environment variable
HUGGINGFACE_TOKEN=hf_xxxxx

# Or pass in request header
X-API-Key: hf_xxxxx
```

**Models:** Llama-3.2, Mistral-7B, Phi-2, and 10+ more (auto-fetched from HF API)

---

### GitHub Copilot (OAuth + MITM)
**Requires GitHub Copilot subscription.**

```bash
# Set environment variable
GITHUB_COPILOT_TOKEN=ghc_xxxxx

# Or pass in request header
X-GitHub-Token: ghc_xxxxx
```

**Models:** GPT-4, GPT-3.5-turbo

---

### Azure OpenAI (OAuth + MITM)
**Requires Azure subscription with OpenAI resource.**

```bash
# Required environment variables
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=xxxxx
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Or pass in request headers
X-Azure-Endpoint: https://your-resource.openai.azure.com
X-API-Key: xxxxx
```

**Models:** GPT-4, GPT-4-Turbo, GPT-3.5-Turbo (deployment-based)

---

### Google Vertex AI (OAuth + MITM)
**Requires GCP project with Vertex AI enabled.**

```bash
# Required environment variables
VERTEX_PROJECT_ID=your-project-id
VERTEX_LOCATION=us-central1  # optional, defaults to us-central1
VERTEX_ACCESS_TOKEN=ya29.xxxxx

# Or pass in request headers
X-GCP-Project: your-project-id
Authorization: Bearer ya29.xxxxx
```

**Models:** Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 1.5 Pro

---

## NO AUTH Providers (Local)

### Ollama (NO AUTH, Local)
**Runs locally, no authentication needed.**

**Setup:**
1. Install Ollama: https://ollama.ai/download
2. Start Ollama: `ollama serve`
3. Pull models: `ollama pull llama3`

**Default URL:** `http://localhost:11434`

**Override:**
```bash
OLLAMA_URL=http://localhost:11434
```

**Auto-detects installed models** - use model refresh button in dashboard.

---

### LM Studio (NO AUTH, Local)
**Runs locally, no authentication needed.**

**Setup:**
1. Download LM Studio: https://lmstudio.ai
2. Load a model in LM Studio
3. Start local server (port 1234)

**Default URL:** `http://localhost:1234`

**Override:**
```bash
LMSTUDIO_URL=http://localhost:1234
```

**Auto-detects loaded models** - use model refresh button in dashboard.

---

## Testing

Use the validation endpoint to test model availability:

```bash
# Test Ollama model
curl -X POST http://localhost:3000/api/models/validate \
  -H "Content-Type: application/json" \
  -d '{"provider":"ollama","model":"llama3"}'

# Test Hugging Face model
curl -X POST http://localhost:3000/api/models/validate \
  -H "Content-Type: application/json" \
  -d '{"provider":"huggingface","model":"meta-llama/Llama-3.2-3B-Instruct"}'
```

---

## Summary

**Total Providers:** 24
- **OAuth + MITM:** 6 (Kiro, Hugging Face, GitHub Copilot, Azure OpenAI, Vertex AI, Gemini)
- **NO AUTH:** 3 (OpenCode, Ollama, LM Studio)  
- **API Key:** 15 (Grok, Groq, DeepSeek, Qwen, Perplexity, Cohere, Mistral, etc.)

**All providers integrated with:**
- ✅ MITM handlers
- ✅ Dynamic model fetching (where supported)
- ✅ Rate limiting
- ✅ Pricing configurations
- ✅ Dashboard colors
- ✅ Model validation endpoint
