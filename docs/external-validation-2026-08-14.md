# External Validation Record — 2026-08-14

## Gemini native image generation

The official Gemini image-generation documentation confirms that the **Interactions API** is generally available and recommends `POST https://generativelanguage.googleapis.com/v1beta/interactions` for native image generation. The documented REST payload uses a model ID and `input` blocks, for example `{"model":"gemini-3.1-flash-image","input":[{"type":"text","text":"..."}]}`, authenticated with `x-goog-api-key`. The documented response exposes generated base64 image data at `interaction.output_image.data`. The gateway's `providers/gemini.js` adapter matches that contract, including Bearer authentication for configured OAuth credentials. [1]

The same source lists the current Nano Banana image model family used in the dedicated provider catalog: `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, and `gemini-2.5-flash-image`. Every generated image is documented as carrying SynthID watermarking. [1]

## Local provider logo provenance

Provider cards now obtain local SVG assets from two public, versioned sources. The primary source is Simple Icons. Where Simple Icons does not publish a specific AI provider mark, the project uses the MIT-licensed LobeHub static SVG package pinned to `@lobehub/icons-static-svg@1.94.0`; only individual files are vendored. The repository documentation identifies the collection as a set of optimized brand SVGs and the package as MIT licensed. [2]

OpenAI's brand guidelines allow use only when directly related to OpenAI services, prohibit implication of endorsement, and require displaying marks as provided. The dashboard therefore uses small provider-identification marks, retains fallback monograms when no local asset is available, and records that no partnership is implied. [3]

Mistral's brand page provides a brand kit and instructs users not to stretch, recolor, or use unofficial/old marks. The local mark is consumed unchanged from the icon source and constrained within the dashboard's neutral provider-card container. [4]

## Sources

[1]: https://ai.google.dev/gemini-api/docs/image-generation
[2]: https://github.com/lobehub/lobe-icons
[3]: https://openai.com/brand/
[4]: https://mistral.ai/brand/
