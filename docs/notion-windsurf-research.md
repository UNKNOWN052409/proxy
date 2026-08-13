# Notion and Windsurf integration research

## Notion

Official authorization documentation: https://developers.notion.com/guides/get-started/authorization

Official overview: https://developers.notion.com/guides/get-started/overview

Notion supports internal connections with static installation tokens, personal access tokens without OAuth, and public connections using OAuth 2.0. Public OAuth authorization uses `https://api.notion.com/v1/oauth/authorize`, requires `client_id`, `redirect_uri`, `response_type=code`, and `owner=user`, and returns a code for token exchange. Workspace/page access is explicitly granted by the user during installation or by sharing pages with the connection. Notion API requests use a bearer token and the `Notion-Version` header. This is a workspace/data connector, not an OpenAI-compatible AI model provider; Notion AI access must not be inferred from the REST API.

## Windsurf

Official API reference: https://docs.windsurf.com/windsurf/accounts/api-reference/api-introduction

The available official documentation describes an enterprise usage/configuration API using service keys, with a base URL of `https://server.codeium.com/api/v1/` and service keys supplied in request bodies for analytics/configuration endpoints. It does not document a general OAuth flow for using Windsurf's internal AI models as an external model provider. A third-party CData document describes OAuth for connecting Windsurf to an MCP server, but that is client-side MCP authorization and not evidence of a Windsurf model-provider OAuth API: https://docs.cloud.cdata.com/en/Clients/Windsurf-Client

## Safe implementation boundary

Implement Notion as an official workspace connector with OAuth/PAT/token support, encrypted credential storage, scoped page/database operations, and dashboard status. Do not expose Notion AI as a model unless Notion publishes an official model API. Implement Windsurf only through documented service-key analytics/configuration or a user-provided documented MCP/server endpoint. Do not use cookies, browser session scraping, hidden endpoints, DevTools interception, or MITM traffic capture.
