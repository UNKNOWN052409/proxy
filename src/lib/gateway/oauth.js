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
    if (!value?.createdAt || now - Date.parse(value.createdAt) > STATE_TTL_MS) delete states[state];
  }
  return states;
}

export function createOAuthAuthorization({ provider, clientId, redirectUri, usePkce = provider.oauthPkce === true }) {
  if (!provider.oauthAuthUrl || !provider.oauthTokenUrl || !clientId) throw new Error(`Provider ${provider.id} does not have complete OAuth metadata`);
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = usePkce ? crypto.randomBytes(48).toString("base64url") : null;
  const codeChallenge = codeVerifier ? crypto.createHash("sha256").update(codeVerifier).digest("base64url") : null;
  const states = pruneStates(readStates());
  states[state] = { providerId: provider.id, createdAt: new Date().toISOString(), codeVerifier };
  writeStates(states);
  const url = new URL(provider.oauthAuthUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri || provider.oauthRedirectUri || "");
  if (provider.oauthScopes?.length) url.searchParams.set("scope", provider.oauthScopes.join(" "));
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(provider.oauthQueryParams || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { state, authorizationUrl: url.toString(), pkce: Boolean(codeVerifier) };
}

export async function exchangeOAuthCode({ provider, code, state, clientId, clientSecret, redirectUri }) {
  const states = pruneStates(readStates());
  const record = states[state];
  delete states[state];
  writeStates(states);
  if (!record || record.providerId !== provider.id) throw new Error("OAuth state is invalid or expired");
  if (!provider.oauthTokenUrl || !clientId) throw new Error(`Provider ${provider.id} does not have complete OAuth token metadata`);
  const payload = { grant_type: "authorization_code", code, redirect_uri: redirectUri || provider.oauthRedirectUri || "" };
  if (provider.oauthTokenAuth !== "basic") payload.client_id = clientId;
  if (clientSecret && provider.oauthTokenAuth !== "basic") payload.client_secret = clientSecret;
  if (record.codeVerifier) payload.code_verifier = record.codeVerifier;
  const headers = { Accept: "application/json" };
  let body;
  if (provider.oauthTokenAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret || ""}`).toString("base64")}`;
  }
  if (provider.oauthTokenContentType === "json") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
    if (provider.apiVersion) headers["Notion-Version"] = provider.apiVersion;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(payload).toString();
  }
  const response = await fetch(provider.oauthTokenUrl, { method: "POST", headers, body });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `OAuth token exchange failed with HTTP ${response.status}`);
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null;
  const imported = importEncryptedCredentials(provider.id, [{ apiKey: data.access_token, refreshToken: data.refresh_token || undefined, label: "oauth-access-token", expiresAt }]);
  return { imported, tokenType: data.token_type || "Bearer", expiresAt, hasRefreshToken: Boolean(data.refresh_token) };
}

export async function refreshOAuthCredential({ provider, clientId, clientSecret }) {
  if (!provider.oauthTokenUrl || !clientId) throw new Error(`Provider ${provider.id} does not have complete OAuth token metadata`);
  const selected = selectCredential(provider.id);
  if (!selected?.refreshToken) throw new Error(`Provider ${provider.id} has no encrypted OAuth refresh token`);
  const payload = { grant_type: "refresh_token", refresh_token: selected.refreshToken };
  if (provider.oauthTokenAuth !== "basic") payload.client_id = clientId;
  if (clientSecret && provider.oauthTokenAuth !== "basic") payload.client_secret = clientSecret;
  const headers = { Accept: "application/json" };
  let body;
  if (provider.oauthTokenAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret || ""}`).toString("base64")}`;
  }
  if (provider.oauthTokenContentType === "json") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
    if (provider.apiVersion) headers["Notion-Version"] = provider.apiVersion;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(payload).toString();
  }
  const response = await fetch(provider.oauthTokenUrl, { method: "POST", headers, body });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `OAuth token refresh failed with HTTP ${response.status}`);
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : selected.expiresAt;
  updateCredentialTokens(provider.id, selected.credentialId, { apiKey: data.access_token, refreshToken: data.refresh_token || selected.refreshToken, expiresAt });
  return { credentialId: selected.credentialId, tokenType: data.token_type || "Bearer", expiresAt };
}

export const __testables = { pruneStates, STATE_PATH };
