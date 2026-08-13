# Official CLI installation research

## Claude Code

Source: https://code.claude.com/docs/en/setup

The official Linux installation command is `curl -fsSL https://claude.ai/install.sh | bash`. The documented verification commands are `claude --version` and `claude doctor`. Claude Code supports Linux including Ubuntu 20.04+, requires an internet connection, and supports authentication through an Anthropic account or API key. The setup documentation states that an API key can be supplied through `ANTHROPIC_API_KEY`; the CLI may prompt once to approve it. The official setup page should be used rather than an unverified npm package.

Source: https://code.claude.com/docs/en/cli-reference

The CLI commands include `claude`, `claude -p`, `claude auth login`, `claude auth status`, and `claude doctor`. A custom gateway configuration must be checked against the current Claude Code environment/configuration documentation; the CLI's own account authentication is distinct from an OpenAI-compatible model adapter.

## Prime CLI / Prime Agent distinction

Sources: https://app.primeintellect.ai/dashboard/home/quickstart and https://github.com/PrimeIntellect-ai/prime

The official Prime CLI is installed with `uv tool install -U prime`, authenticated with `prime login`, and initialized with `prime lab setup`. The official repository documents `prime config set-api-key`, `PRIME_API_KEY`, and `prime config view`. Prime CLI is primarily the Prime Intellect infrastructure/evaluation/training CLI; it is not evidence of a generic third-party coding-agent API client or an arbitrary OpenAI-compatible base-URL client. Any Prime Agent setup must therefore be tested as the official Prime CLI workflow, not assumed to be a model-routing client.

The official Prime quickstart shows a real Prime evaluation command such as `prime eval run primeintellect/reverse-text -m openai/gpt-oss-20b -p prime -n 1 -r 1 -t 512 -s -A`. This uses Prime's own authenticated service and should not be redirected to an unrelated gateway unless Prime documents a supported endpoint override.
