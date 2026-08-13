const FORBIDDEN_KEYS = new Set([
  "apikey", "api_key", "key", "token", "access_token", "refresh_token", "cookie", "cookies", "authorization", "password", "secret",
]);

function rejectSecrets(value, path = "config") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) rejectSecrets(value[index], `${path}[${index}]`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) throw new Error(`OpenCode import cannot include secret field: ${path}.${key}`);
    rejectSecrets(child, `${path}.${key}`);
  }
}

function safeId(value, fallback) {
  const id = String(value || fallback || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id)) throw new Error(`Invalid OpenCode provider id: ${id || "empty"}`);
  return id;
}

function safeUrl(value, field) {
  if (!value) return null;
  const parsed = new URL(String(value));
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`${field} must be an HTTP(S) URL`);
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(`${field} must use HTTPS unless it targets loopback`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function modelEntries(value) {
  const entries = Array.isArray(value) ? value : [];
  return entries.map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object') return null;
    const id = String(entry.id || entry.model || '').trim();
    if (!id) return null;
    const result = { id };
    for (const field of ['name', 'alias', 'contextWindow', 'supportsTools', 'supportsVision']) {
      if (entry[field] !== undefined) result[field] = entry[field];
    }
    return result;
  }).filter(Boolean).slice(0, 1000);
}

export function normalizeOpenCodeImport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('OpenCode import must be a JSON object');
  rejectSecrets(input);
  const providers = Array.isArray(input.providers) ? input.providers : (input.provider ? [input.provider] : []);
  if (!providers.length) throw new Error('OpenCode import requires a provider or providers array');
  if (providers.length > 50) throw new Error('At most 50 OpenCode providers may be imported at once');
  return providers.map((provider, index) => {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) throw new Error(`OpenCode provider ${index + 1} must be an object`);
    const id = safeId(provider.id || provider.name, `opencode-${index + 1}`);
    const baseUrl = safeUrl(provider.baseUrl || provider.options?.baseURL, `${id}.baseUrl`);
    if (!baseUrl) throw new Error(`${id}.baseUrl is required`);
    const type = String(provider.type || provider.api || 'openai').trim().toLowerCase();
    if (!['openai', 'anthropic'].includes(type)) throw new Error(`${id} must use openai or anthropic compatibility`);
    const models = modelEntries(provider.models || provider.modelIds || provider.options?.models);
    return {
      id,
      label: String(provider.label || provider.name || id).trim().slice(0, 120),
      type,
      adapter: type,
      baseUrl,
      prefix: String(provider.prefix || '').trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64) || undefined,
      models,
      defaultModel: String(provider.defaultModel || models[0]?.id || models[0] || '').trim() || undefined,
      supportsTools: provider.supportsTools === true,
      supportsVision: provider.supportsVision === true,
      docsUrl: provider.docsUrl ? safeUrl(provider.docsUrl, `${id}.docsUrl`) : undefined,
      officialApi: false,
      importSource: 'opencode-safe-config',
    };
  });
}

export function describeOpenCodeImport(input) {
  const providers = normalizeOpenCodeImport(input);
  return providers.map(({ id, label, type, baseUrl, prefix, models }) => ({
    id, label, type, baseUrl, prefix: prefix || null, modelCount: models.length,
  }));
}
