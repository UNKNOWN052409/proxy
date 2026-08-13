# Official Gemini Capability Notes

Sources retrieved on 2026-08-13:

1. https://ai.google.dev/gemini-api/docs/image-generation
2. https://ai.google.dev/gemini-api/docs/oauth

The official image-generation documentation describes the Gemini Interactions API at `POST https://generativelanguage.googleapis.com/v1beta/interactions`, authenticated with the `x-goog-api-key` header for API-key mode. The request includes a `model` such as `gemini-3.1-flash-image` and `input` containing a text block; image editing can include an image block with MIME type and base64 data. Generated image bytes are returned through an `output_image` object whose `data` field is base64. Current named image models documented include `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, and legacy `gemini-2.5-flash-image`.

The official OAuth quickstart states that Gemini API-key authentication is easiest, while OAuth is supported for stricter access control. It documents Google Cloud project setup, enabling the Generative Language API, OAuth client IDs, Application Default Credentials, bearer-token REST calls, and token refresh through official Google credential libraries. OAuth requires a project ID and appropriate Google Cloud scopes; a generic ChatGPT web login or browser cookie is not an API credential.

Implementation implication: a native Gemini adapter may safely support documented API-key and bearer OAuth token environments, with explicit provider capability flags and no browser-session capture. Image output should be normalized into the gateway's OpenAI-compatible `data` array without storing image bytes server-side.
