// Key used to store Google Chat API auth tokens in Chrome's local storage
export const TOKEN_STORAGE_KEY = "gcaAuthTokens";

// Base URL for your authentication backend endpoints
export const AUTH_BASE_URL = "http://localhost:8080/api/auth"; 

// Safety margin subtracted from the actual token expiry time
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * Retrieves stored Google Chat authentication tokens from Chrome local storage.
 *
 * @returns {Promise<Object|null>} Token object or null if not found.
 */
export async function getStoredTokens() {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] || null;
}

/**
 * Determines whether the access token is expired, with a 60s safety window.
 *
 * @param {number} expiry_date - Unix timestamp (ms) when token expires.
 * @returns {boolean} True if the token is expired or missing.
 */
export function isAccessTokenExpired(expiry_date) {
  if (!expiry_date) return true;
  const now = Date.now();
  return now > expiry_date - TOKEN_EXPIRY_SAFETY_MARGIN_MS;
}

/**
 * Requests a new access token from the backend using the stored refresh token.
 * Saves the newly returned tokens into Chrome local storage.
 *
 * @param {string} refresh_token - Valid refresh token.
 * @returns {Promise<string>} The newly refreshed access token.
 * @throws {Error} "FAILED_REFRESH" if the backend refuses the refresh request.
 */
export async function refreshAccessToken(refresh_token) {
  const res = await fetch(`${AUTH_BASE_URL}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });

  if (!res.ok) {
    throw new Error("FAILED_REFRESH");
  }

  const data = await res.json();

  // Construct new token set using backend response
  const newTokens = {
    access_token: data.access_token,
    refresh_token,
    expiry_date: data.expiry_date,
  };

  // Persist updated token set
  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: newTokens,
  });

  return newTokens.access_token;
}

/**
 * Retrieves an access token that is guaranteed to be valid.
 *
 * @returns {Promise<string>} A valid access token.
 * @throws {Error} "NO_TOKENS" if tokens are missing.
 */
export async function getValidAccessTokenOrThrow() {
  const tokens = await getStoredTokens();

  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    throw new Error("NO_TOKENS");
  }

  // If token still valid then return directly
  if (!isAccessTokenExpired(tokens.expiry_date)) {
    return tokens.access_token;
  }

  // If expired then refresh and return new token
  return await refreshAccessToken(tokens.refresh_token);
}
