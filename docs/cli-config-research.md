# CLI configuration research

## OpenCode

Official provider documentation: https://opencode.ai/docs/providers/

OpenCode uses JSON/JSONC configuration with a `provider` object. A provider can override `options.baseURL`, which is the field needed for a gateway/proxy URL. The documentation states that credentials configured through `/connect` are stored in `~/.local/share/opencode/auth.json`; the gateway wizard must not write or extract that credential file. The safe wizard output should therefore generate `opencode.json` provider metadata and a separate environment-variable/API-key template, leaving `/connect` and auth storage to the user.

Example shape:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "gateway": {
      "options": {
        "baseURL": "https://api.example.com/v1"
      }
    }
  }
}
```

## Codex CLI

Primary source: https://github.com/openai/codex/blob/main/docs/config.md

The repository points users to the official Codex basic, advanced, and reference configuration pages for the actual TOML schema. The repository confirms that user configuration is TOML-based and distinguishes `config.toml` from managed `requirements.toml`. The wizard should link or export a TOML preview rather than assume undocumented fields; API credentials should remain in environment variables or the CLI's own login flow, not be embedded in generated config.
