/**
 * Kiro AI OAuth Service — AWS SSO OIDC + Social Auth
 * 
 * Handles all Kiro auth methods matching 9router's implementation:
 *   - AWS Builder ID (via OIDC device code flow)
 *   - IAM Identity Center (IDC) (via regional OIDC device code flow)
 *   - Social login (Google/GitHub via kiro.dev)
 *   - External IdP (Microsoft Entra / enterprise)
 *   - API key (direct CodeWhisperer credential)
 * 
 * Endpoints (from 9router's kiro.js registry):
 *   OIDC:       oidc.us-east-1.amazonaws.com/client/register, /device_authorization, /token
 *   Social:     prod.us-east-1.auth.desktop.kiro.dev/login, /oauth/token, /refreshToken
 *   Runtime:    runtime.us-east-1.kiro.dev/generateAssistantResponse
 *   CodeWhisperer: codewhisperer.us-east-1.amazonaws.com
 */

import { KIRO_CONFIG } from "./config";

function assertValidAwsRegion(region) {
  if (!region || typeof region !== "string") {
    throw new Error(`Invalid AWS region: ${region}`);
  }
}

export class KiroOAuthService {
  /**
   * Register OIDC client with AWS SSO
   * POST /client/register → returns clientId + clientSecret
   */
  async registerClient(region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/client/register`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: KIRO_CONFIG.oauth.clientName,
        clientType: KIRO_CONFIG.oauth.clientType,
        scopes: KIRO_CONFIG.oauth.scopes,
        grantTypes: KIRO_CONFIG.oauth.grantTypes,
        issuerUrl: KIRO_CONFIG.oauth.issuerUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register OIDC client: ${error.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      clientSecretExpiresAt: data.clientSecretExpiresAt,
    };
  }

  /**
   * Start device authorization — returns user_code + verification URI
   * POST /device_authorization
   */
  async startDeviceAuthorization(clientId, clientSecret, startUrl, region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/device_authorization`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl: startUrl || "https://view.awsapps.com/start",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device auth failed: ${error.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      deviceCode: data.deviceCode,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      verificationUriComplete: data.verificationUriComplete,
      expiresIn: data.expiresIn,
      interval: data.interval || 5,
    };
  }

  /**
   * Poll for token using device code
   * POST /token with grant_type=device_code
   */
  async pollDeviceToken(clientId, clientSecret, deviceCode, region = "us-east-1") {
    assertValidAwsRegion(region);
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode,
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const pending = data.error === "authorization_pending" || data.error === "slow_down";
      return {
        success: false,
        error: data.error,
        errorDescription: data.error_description,
        pending,
        ...(data.error === "slow_down" ? { interval: (data.interval || 5) + 5 } : {}),
      };
    }

    return {
      success: true,
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        idToken: data.idToken,
        expiresIn: data.expiresIn,
        profileArn: data.profileArn || null,
      },
    };
  }

  /**
   * Refresh token — handles all auth methods
   * Three paths matching 9router's refreshKiroToken():
   *   1. External IdP → form-encoded token endpoint
   *   2. IDC/OIDC → regional oidc.amazonaws.com/token
   *   3. Social → kiro.dev/refreshToken
   */
  async refreshToken(refreshToken, providerSpecificData = {}) {
    const { authMethod, clientId, clientSecret, region } = providerSpecificData;

    // Path 1: External IdP (Microsoft Entra enterprise)
    if (authMethod === "external_idp") {
      return this._refreshExternalIdpToken(refreshToken, providerSpecificData);
    }

    // Path 2: IDC or OIDC-based token → regional AWS endpoint
    if (clientId && clientSecret) {
      return this._refreshIdcToken(refreshToken, clientId, clientSecret, region || "us-east-1");
    }

    // Path 3: Social/Builder ID → kiro.dev social refresh
    return this._refreshSocialToken(refreshToken);
  }

  /**
   * Refresh via AWS OIDC token endpoint (IDC + Builder ID)
   */
  async _refreshIdcToken(refreshToken, clientId, clientSecret, region) {
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        refreshToken,
        grantType: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`IDC token refresh failed: ${error.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn || 3600,
      profileArn: data.profileArn || null,
    };
  }

  /**
   * Refresh via Kiro social auth endpoint
   */
  async _refreshSocialToken(refreshToken) {
    const response = await fetch(KIRO_CONFIG.oauth.socialRefreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "kiro-cli/1.0.0",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Social token refresh failed: ${error.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn || 3600,
      profileArn: data.profileArn || null,
    };
  }

  /**
   * Refresh via External IdP (Microsoft Entra)
   * Uses form-encoded body matching 9router's buildExternalIdpRefreshParams
   */
  async _refreshExternalIdpToken(refreshToken, providerSpecificData) {
    const tokenEndpoint = providerSpecificData.oidcTokenEndpoint
      || providerSpecificData.tokenEndpoint
      || "https://login.microsoftonline.com/common/oauth2/v2.0/token";

    const clientId = providerSpecificData.clientId || "";
    const clientSecret = providerSpecificData.clientSecret || "";
    const scope = providerSpecificData.scope || "https://codewhisperer.aws.dev/.default";

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);
    params.append("client_id", clientId);
    if (clientSecret) params.append("client_secret", clientSecret);
    params.append("scope", scope);

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`External IdP refresh failed: ${error.slice(0, 200)}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in || 3600,
      providerSpecificData: {
        ...providerSpecificData,
        tokenEndpoint,
        scope,
      },
    };
  }

  /**
   * Get social login URL (Google/GitHub)
   */
  getSocialLoginUrl(provider) {
    const base = KIRO_CONFIG.oauth.socialLoginUrl;
    const redirectUri = `${typeof window !== "undefined" ? window.location.origin : ""}/api/oauth/kiro/callback`;
    return `${base}?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  /**
   * Exchange social auth code for tokens
   */
  async exchangeSocialCode(code, provider) {
    const response = await fetch(KIRO_CONFIG.oauth.socialTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        provider,
        redirectUri: `${typeof window !== "undefined" ? window.location.origin : ""}/api/oauth/kiro/callback`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Social token exchange failed: ${error.slice(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Extract email from JWT access token
   */
  extractEmailFromJWT(token) {
    try {
      const payload = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      return decoded.email || decoded.preferred_username || null;
    } catch {
      return null;
    }
  }
}

// Singleton
export const kiroOAuth = new KiroOAuthService();
