import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { importEncryptedCredentials, selectCredential, updateCredentialTokens } from "./credentials.js";

const STATE_PATH = path.join(process.cwd(), "data", "gateway-oauth-state.json");
const STATE_TTL_MS = 10 * 60 * 1000;

function readStates() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function writeStates(states) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const temp = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(states), { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, STATE_PATH);
}

function pruneStates(states) {
  const now = Date.now();
  for (const [state, value] of Object.entries(states)) {
    const createdAt = Date.parse(value?.createdAt || "");
    const expiresAt = Date.parse(value?.expiresAt || "");
    if (!value?.createdAt || !Number.isFinite(createdAt) || now - createdAt > STATE_TTL_MS || (Number.isFinite(expiresAt) && now >= expiresAt)) delete states[state];
  }
  return states;
}

function providerClientId(provider) {
  return (provider.oauthClientIdEnv ? process.env[provider.oauthClientIdEnv] : null) || provider.oauthClientId || null;
}

function providerClientSecret(provider) {
  return provider.oauthClientSecretEnv ? process.env[provider.oauthClientSecretEnv] : null;
}

async function requestOAuthToken(provider, payload, clientId, clientSecret) {
  if (!provider.oauthTokenUrl || !clientId) throw new Error(`Provider ${provider.id} does not have complete OAuth token metadata`);
  const requestPayload = { ...payload };
  if (provider.oauthTokenAuth !== "basic") requestPayload.client_id = clientId;
  if (clientSecret && provider.oauthTokenAuth !== "basic") requestPayload.client_secret = clientSecret;
  const headers = { Accept: "application/json" };
  let body;
  if (provider.oauthTokenAuth === "basic") headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret || ""}`).toString("base64")}`;
  if (provider.oauthTokenContentType === "json") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(requestPayload);
    if (provider.apiVersion) headers["Notion-Version"] = provider.apiVersion;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(requestPayload).toString();
  }
  const response = await fetch(provider.oauthTokenUrl, { method: "POST", headers, body });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { response, data };
}

function storeOAuthTokens(provider, data, importCredentials = importEncryptedCredentials) {
  if (!data?.access_token) throw new Error("OAuth response did not include an access token");
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null;
  const imported = importCredentials(provider.id, [{ apiKey: data.access_token, refreshToken: data.refresh_token || undefined, label: "oauth-access-token", expiresAt }]);
  return { imported, tokenType: data.token_type || "Bearer", expiresAt, hasRefreshToken: Boolean(data.refresh_token) };
}

export function createOAuthAuthorization({ provider, clientId, redirectUri, usePkce = provider.oauthPkce === true }) {
  if (!provider.oauthAuthUrl || !provider.oauthTokenUrl || !clientId) throw new Error(`Provider ${provider.id} does not have complete OAuth metadata`);
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = usePkce ? crypto.randomBytes(48).toString("base64url") : null;
  const codeChallenge = codeVerifier ? crypto.createHash("sha256").update(codeVerifier).digest("base64url") : null;
  const states = pruneStates(readStates());
  states[state] = { providerId: provider.id, createdAt: new Date().toISOString(), codeVerifier, flow: "authorization_code" };
  writeStates(states);
  const url = new URL(provider.oauthAuthUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri || provider.oauthRedirectUri || "");
  if (provider.oauthScopes?.length) url.searchParams.set("scope", provider.oauthScopes.join(" "));
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(provider.oauthQueryParams || {})) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { state, authorizationUrl: url.toString(), pkce: Boolean(codeVerifier) };
}

export async function exchangeOAuthCode({ provider, code, state, clientId, clientSecret, redirectUri, importCredentials }) {
  const states = pruneStates(readStates());
  const record = states[state];
  delete states[state];
  writeStates(states);
  if (!record || record.providerId !== provider.id || record.flow !== "authorization_code") throw new Error("OAuth state is invalid or expired");
  const resolvedClientId = clientId || providerClientId(provider);
  const resolvedClientSecret = clientSecret ?? providerClientSecret(provider);
  const { response, data } = await requestOAuthToken(provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri || provider.oauthRedirectUri || "", ...(record.codeVerifier ? { code_verifier: record.codeVerifier } : {}) }, resolvedClientId, resolvedClientSecret);
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `OAuth token exchange failed with HTTP ${response.status}`);
  return storeOAuthTokens(provider, data, importCredentials);
}

export async function startOAuthDeviceAuthorization({ provider, clientId, clientSecret }) {
  const resolvedClientId = clientId || providerClientId(provider);
  const resolvedClientSecret = clientSecret ?? providerClientSecret(provider);
  if (!provider.oauthDeviceCodeUrl || !provider.oauthTokenUrl || !resolvedClientId) throw new Error(`Provider ${provider.id} does not support configured device authorization`);
  const payload = { client_id: resolvedClientId };
  if (provider.oauthScopes?.length) payload.scope = provider.oauthScopes.join(" ");
  const headers = { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" };
  if (provider.oauthTokenAuth === "basic") headers.Authorization = `Basic ${Buffer.from(`${resolvedClientId}:${resolvedClientSecret || ""}`).toString("base64")}`;
  const response = await fetch(provider.oauthDeviceCodeUrl, { method: "POST", headers, body: new URLSearchParams(payload).toString() });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || !data?.device_code || !data?.user_code || !(data.verification_uri || data.verification_url)) throw new Error(data?.error_description || data?.error || `Device authorization failed with HTTP ${response.status}`);
  const intervalSeconds = Math.min(60, Math.max(2, Number(data.interval) || 5));
  const expiresIn = Math.min(Math.max(30, Number(data.expires_in) || 600), STATE_TTL_MS / 1000);
  const state = crypto.randomBytes(24).toString("base64url");
  const states = pruneStates(readStates());
  states[state] = { providerId: provider.id, flow: "device_code", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), deviceCode: data.device_code, intervalSeconds, nextPollAt: Date.now() + intervalSeconds * 1000 };
  writeStates(states);
  return { state, userCode: data.user_code, verificationUri: data.verification_uri || data.verification_url, verificationUriComplete: data.verification_uri_complete || null, expiresIn, interval: intervalSeconds };
}

export async function pollOAuthDeviceAuthorization({ provider, state, clientId, clientSecret, importCredentials }) {
  const states = pruneStates(readStates());
  const record = states[state];
  if (!record || record.providerId !== provider.id || record.flow !== "device_code") {
    writeStates(states);
    throw new Error("Device authorization state is invalid or expired");
  }
  const now = Date.now();
  if (Number(record.nextPollAt || 0) > now) {
    writeStates(states);
    return { authorized: false, pending: true, retryAfterSeconds: Math.max(1, Math.ceil((record.nextPollAt - now) / 1000)) };
  }
  const resolvedClientId = clientId || providerClientId(provider);
  const resolvedClientSecret = clientSecret ?? providerClientSecret(provider);
  const { response, data } = await requestOAuthToken(provider, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: record.deviceCode }, resolvedClientId, resolvedClientSecret);
  if (response.ok && data?.access_token) {
    delete states[state];
    writeStates(states);
    return { authorized: true, pending: false, ...storeOAuthTokens(provider, data, importCredentials) };
  }
  const errorCode = String(data?.error || "");
  if (errorCode === "authorization_pending" || errorCode === "slow_down") {
    const intervalSeconds = Math.min(60, Math.max(2, Number(record.intervalSeconds) + (errorCode === "slow_down" ? 5 : 0)));
    record.intervalSeconds = intervalSeconds;
    record.nextPollAt = Date.now() + intervalSeconds * 1000;
    states[state] = record;
    writeStates(states);
    return { authorized: false, pending: true, retryAfterSeconds: intervalSeconds };
  }
  delete states[state];
  writeStates(states);
  throw new Error(data?.error_description || errorCode || `Device token exchange failed with HTTP ${response.status}`);
}

export async function refreshOAuthCredential({ provider, clientId, clientSecret }) {
  const selected = selectCredential(provider.id);
  if (!selected?.refreshToken) throw new Error(`Provider ${provider.id} has no encrypted OAuth refresh token`);
  const { response, data } = await requestOAuthToken(provider, { grant_type: "refresh_token", refresh_token: selected.refreshToken }, clientId || providerClientId(provider), clientSecret ?? providerClientSecret(provider));
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `OAuth token refresh failed with HTTP ${response.status}`);
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : selected.expiresAt;
  updateCredentialTokens(provider.id, selected.credentialId, { apiKey: data.access_token, refreshToken: data.refresh_token || selected.refreshToken, expiresAt });
  return { credentialId: selected.credentialId, tokenType: data.token_type || "Bearer", expiresAt };
}

export const __testables = { pruneStates, STATE_PATH, requestOAuthToken, storeOAuthTokens };
