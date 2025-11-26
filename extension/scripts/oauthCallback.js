/**
 * @fileoverview
 * Handles the OAuth2 callback page for the Google Calendar Assistant.
 * It reads the JSON with access/refresh tokens rendered in the page body
 * and forwards them to the background script via chrome.runtime.sendMessage.
 */

(function () {
  console.log("oauthCallback.js: content script loaded on /api/auth/callback");

  if (window.self !== window.top) {
    console.log("oauthCallback.js: running inside iframe, abort.");
    return;
  }

  function readTokensFromPage() {
    try {
      const rawText = (document.body && document.body.innerText || "").trim();

      if (!rawText) {
        console.error("oauthCallback.js: body is empty, no JSON to parse.");
        return;
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        console.error("oauthCallback.js: failed to parse JSON from body:", parseError);
        console.log("oauthCallback.js: body content was:", rawText);
        return;
      }

      const { access_token, refresh_token, expiry_date } = data;

      // Basic validation of required fields
      if (!access_token || !refresh_token) {
        console.error("oauthCallback.js: missing access_token or refresh_token in JSON:", data);
        return;
      }

      console.log("oauthCallback.js: tokens read from callback page:", {
        access_token_preview: access_token.slice(0, 10) + "...",
        has_refresh_token: !!refresh_token,
        expiry_date,
      });

      // Sending tokens to background script
      chrome.runtime.sendMessage(
        {
          action: "OAUTH_TOKENS_RECEIVED",
          payload: {
            access_token,
            refresh_token,
            expiry_date,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "oauthCallback.js: error sending message to background:",
              chrome.runtime.lastError.message
            );
            return;
          }

          console.log("oauthCallback.js: background responded:", response);
        }
      );
    } catch (err) {
      console.error("oauthCallback.js: unexpected error:", err);
    }
  }

  // Run token reading logic as soon as the DOM is ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    readTokensFromPage();
  } else {
    window.addEventListener("DOMContentLoaded", readTokensFromPage);
  }
})();
