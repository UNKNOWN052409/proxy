# Provider research notes

Date: 2026-08-13

Sources reviewed:

- https://github.com/diegosouzapw/OmniRoute
- https://ollama.com/blog/openai-compatibility
- https://lmstudio.ai/docs/developer/openai-compat

Findings:

- OmniRoute documents a zero-configuration local gateway and names OpenCode Free and Felo as keyless free candidates. Its README also lists other free-tier candidates such as Pollinations, Qoder, Kilo, SiliconFlow, Z.AI GLM-Flash, and Baidu.
- The project’s free-tier claims are catalog/terms claims, not authorization to capture web-app traffic or session material. The gateway therefore records remote candidates as catalog-only and requires an explicitly documented endpoint before activation.
- Ollama officially documents an OpenAI-compatible local endpoint at http://localhost:11434/v1; the API key is required by some clients but unused by Ollama.
- LM Studio officially documents OpenAI-compatible local endpoints at http://localhost:1234/v1 and supports /v1/models, /v1/responses, /v1/chat/completions, /v1/embeddings, and /v1/completions.
- No cookie scraping, browser-session extraction, undocumented endpoint capture, MITM, or automatic remote no-auth traffic was added.
