import { executeOpenAi, describeImageWithOpenAi } from "./openai.js";

const OFFICIAL_QWEN_HOSTS = new Set([
  "dashscope.aliyuncs.com",
  "dashscope-intl.aliyuncs.com",
  "coding.dashscope.aliyuncs.com",
  "coding-intl.dashscope.aliyuncs.com",
]);

function isOfficialQwenEndpoint(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && OFFICIAL_QWEN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function qwenBody(body) {
  const extraBody = body?.extra_body && typeof body.extra_body === "object" && !Array.isArray(body.extra_body)
    ? { ...body.extra_body }
    : {};
  for (const key of ["enable_thinking", "thinking_budget", "incremental_output", "result_format"]) {
    if (body?.[key] !== undefined && extraBody[key] === undefined) extraBody[key] = body[key];
  }
  return { ...body, extra_body: Object.keys(extraBody).length ? extraBody : undefined };
}

export async function executeQwen({ provider, apiKey, body, model, messages, tools }) {
  if (!isOfficialQwenEndpoint(provider.baseUrl) && provider.officialApi === true) {
    throw new Error("Qwen official adapter requires an official Alibaba ModelStudio endpoint");
  }
  return executeOpenAi({ provider, apiKey, body: qwenBody(body), model, messages, tools });
}

export async function describeImageWithQwen({ provider, apiKey, model, image }) {
  return describeImageWithOpenAi({ provider, apiKey, model, image });
}

export const __testables = { isOfficialQwenEndpoint, qwenBody };
