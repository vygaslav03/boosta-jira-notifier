/**
 * === authManager.js ===
 * Boosta Jira Notifier - Authentication Manager
 * 
 * Multi-mode authentication coordinator for:
 * 1. Jira Server / Data Center Personal Access Tokens (Bearer <token>)
 * 2. Jira Server / Data Center Basic Auth (Basic base64(username:password))
 * 3. Jira Cloud Personal Access Tokens (Basic base64(email:apiToken))
 * 4. Atlassian OAuth 2.0 Framework
 * 
 * @module background/authManager
 */

export class BaseAuthHandler {
  async getAuthHeaders() {
    throw new Error('Method getAuthHeaders() must be implemented by subclass.');
  }

  isValid() {
    throw new Error('Method isValid() must be implemented by subclass.');
  }
}

/**
 * Jira Server / Data Center Personal Access Token Handler.
 * Format: Bearer <token>
 */
export class ServerPatAuthHandler extends BaseAuthHandler {
  /**
   * @param {string} token Personal Access Token generated in Jira Server profile settings.
   */
  constructor(token) {
    super();
    this.token = token ? token.trim() : '';
  }

  isValid() {
    return this.token.length > 0;
  }

  async getAuthHeaders() {
    if (!this.isValid()) {
      throw new Error('Jira Server Personal Access Token is required.');
    }
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }
}

/**
 * Jira Server / Data Center HTTP Basic Authentication Handler.
 * Format: Basic base64(username:password)
 */
export class ServerBasicAuthHandler extends BaseAuthHandler {
  /**
   * @param {string} username Jira Server login username.
   * @param {string} password Jira Server password or token.
   */
  constructor(username, password) {
    super();
    this.username = username ? username.trim() : '';
    this.password = password ? password.trim() : '';
  }

  isValid() {
    return this.username.length > 0 && this.password.length > 0;
  }

  async getAuthHeaders() {
    if (!this.isValid()) {
      throw new Error('Jira Server Username and Password/Token are required.');
    }
    const tokenString = `${this.username}:${this.password}`;
    const encodedToken = btoa(tokenString);
    return {
      'Authorization': `Basic ${encodedToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }
}

/**
 * Jira Cloud Personal Access Token / API Token Handler.
 * Format: Basic base64(email:apiToken)
 */
export class CloudBasicAuthHandler extends BaseAuthHandler {
  /**
   * @param {string} email Jira user email address.
   * @param {string} apiToken Jira Cloud API Token from id.atlassian.com.
   */
  constructor(email, apiToken) {
    super();
    this.email = email ? email.trim() : '';
    this.apiToken = apiToken ? apiToken.trim() : '';
  }

  isValid() {
    return this.email.length > 0 && this.apiToken.length > 0;
  }

  async getAuthHeaders() {
    if (!this.isValid()) {
      throw new Error('Jira Cloud Email and API Token are required.');
    }
    const tokenString = `${this.email}:${this.apiToken}`;
    const encodedToken = btoa(tokenString);
    return {
      'Authorization': `Basic ${encodedToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }
}

/**
 * Pluggable OAuth 2.0 Authentication Handler for Atlassian Cloud.
 */
export class OAuth2Handler extends BaseAuthHandler {
  constructor(oauthConfig = {}) {
    super();
    this.clientId = oauthConfig.clientId || '';
    this.clientSecret = oauthConfig.clientSecret || '';
    this.tokenData = oauthConfig.tokenData || null;
    this.authorizeEndpoint = 'https://auth.atlassian.com/authorize';
    this.tokenEndpoint = 'https://auth.atlassian.com/oauth/token';
  }

  isValid() {
    return Boolean(this.tokenData && this.tokenData.accessToken);
  }

  async getAuthHeaders() {
    if (!this.isValid()) {
      throw new Error('OAuth 2.0 session not established.');
    }

    if (this.tokenData.expiresAt && Date.now() >= (this.tokenData.expiresAt - 60000)) {
      await this.refreshAccessToken();
    }

    return {
      'Authorization': `Bearer ${this.tokenData.accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  getAuthorizationUrl(redirectUri, scopes = ['read:jira-user', 'read:jira-work']) {
    const scopeString = encodeURIComponent(scopes.join(' '));
    const encodedRedirect = encodeURIComponent(redirectUri);
    return `${this.authorizeEndpoint}?audience=api.atlassian.com&client_id=${this.clientId}&scope=${scopeString}&redirect_uri=${encodedRedirect}&response_type=code&prompt=consent`;
  }

  async exchangeCodeForToken(code, redirectUri) {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      throw new Error(`OAuth token exchange failed with status ${response.status}`);
    }

    const data = await response.json();
    this.tokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
    return this.tokenData;
  }

  async refreshAccessToken() {
    if (!this.tokenData || !this.tokenData.refreshToken) {
      throw new Error('No refresh token available to renew session.');
    }

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.tokenData.refreshToken
      })
    });

    if (!response.ok) {
      throw new Error(`OAuth token refresh failed with status ${response.status}`);
    }

    const data = await response.json();
    this.tokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokenData.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
    return this.tokenData;
  }
}

/**
 * Unified AuthManager factory and coordinator.
 */
export class AuthManager {
  /**
   * Resolves appropriate AuthHandler based on configuration.
   * 
   * @param {Object} state Storage state containing jiraType, authType, and credentials.
   * @returns {BaseAuthHandler} Concrete AuthHandler instance.
   */
  static getHandler(state) {
    const jiraType = state.jiraType || 'server';
    const authType = state.authType || 'pat';

    if (jiraType === 'server') {
      if (authType === 'pat' && state.apiToken && !state.username) {
        // Bearer Token mode
        return new ServerPatAuthHandler(state.apiToken);
      }
      // Server Basic Auth mode (username + password/token)
      return new ServerBasicAuthHandler(state.username || state.email, state.apiToken);
    } else {
      // Jira Cloud Mode
      if (authType === 'oauth' && state.oauthToken) {
        return new OAuth2Handler({ tokenData: state.oauthToken });
      }
      return new CloudBasicAuthHandler(state.email, state.apiToken);
    }
  }

  /**
   * Sanitizes and normalizes the Jira server base URL.
   * 
   * @param {string} rawUrl User-provided URL input.
   * @returns {string} Standardized HTTPS/HTTP base URL without trailing slash.
   */
  static normalizeServerUrl(rawUrl) {
    if (!rawUrl) return '';
    let cleaned = rawUrl.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `https://${cleaned}`;
    }
    // Enforce HTTPS unless testing against localhost / 127.0.0.1
    if (cleaned.startsWith('http://') && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
      cleaned = cleaned.replace(/^http:\/\//i, 'https://');
    }
    return cleaned.replace(/\/+$/, '');
  }
}
