export const TOKEN_STORAGE_KEY = "gcaAuthTokens";
export const AUTH_BASE_URL = "http://localhost:5000/api/auth"; 
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

// Gets tokens from storage
export async function getStoredTokens() {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] || null;
}

// Determines if token has expired
export function isAccessTokenExpired(expiry_date) {
  if (!expiry_date) return true;
  const now = Date.now();
  return now > expiry_date - TOKEN_EXPIRY_SAFETY_MARGIN_MS;
}

// Sends refresh token request
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

  const newTokens = {
    access_token: data.access_token,
    refresh_token,
    expiry_date: data.expiry_date,
  };

  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: newTokens,
  });

  return newTokens.access_token;
}

// Returns the stored token, if there is any available
// If the stored token is expired, the function refreshes the token before returning it
export async function getValidAccessTokenOrThrow() {
  const tokens = await getStoredTokens();

  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    throw new Error("NO_TOKENS");
  }

  if (!isAccessTokenExpired(tokens.expiry_date)) {
    return tokens.access_token;
  }

  return await refreshAccessToken(tokens.refresh_token);
}
