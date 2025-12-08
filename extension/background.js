import {
  TOKEN_STORAGE_KEY,
  AUTH_BASE_URL,
  getValidAccessTokenOrThrow
} from "./scripts/tokenManager.js";

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Validate the request structure
  if (!request || !request.action) {
    console.warn("Background script: Invalid message received:", request);
    sendResponse({
      status: "error",
      message: "Invalid or missing 'action' field in request.",
    });
    return false;
  }

  // Auth related actions
  if (request.action === "START_GOOGLE_AUTH") {
    console.log("Background script: Starting Google OAuth flow");

    fetch(`${AUTH_BASE_URL}/authorize`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to get 'authUrl' from backend");
        }
        return res.json();
      })
      .then((data) => {
        const authUrl = data.authUrl;
        if (!authUrl) {
          throw new Error("Backend did not return 'authUrl'");
        }

        chrome.tabs.create({ url: authUrl });

        sendResponse({
          status: "success",
          message: "OAuth flow started.",
        });
      })
      .catch((err) => {
        console.error("Background script: Error starting OAuth flow:", err);
        sendResponse({
          status: "error",
          message: "Failed to start OAuth flow.",
        });
      });

    return true;
  }

  if (request.action === "GET_GCA_ACCESS_TOKEN") {
    getValidAccessTokenOrThrow()
      .then((accessToken) => {
        sendResponse({
          status: "success",
          access_token: accessToken,
        });
      })
      .catch((err) => {
        if (err.message === "NO_TOKENS" || err.message === "FAILED_REFRESH") {
          sendResponse({
            status: "need_auth",
          });
        } else {
          console.error("Background script: Error getting access token:", err);
          sendResponse({
            status: "error",
            message: err.message || "Unknown error",
          });
        }
      });

    return true;
  }

  if (request.action === "OAUTH_TOKENS_RECEIVED") {
    const { access_token, refresh_token, expiry_date } = request.payload || {};

    if (!access_token || !refresh_token) {
      console.error(
        "Background script: Missing 'access_token' or 'refresh_token' in OAUTH_TOKENS_RECEIVED:",
        request.payload
      );
      sendResponse({
        status: "error",
        message: "Missing access_token or refresh_token.",
      });
      return false;
    }

    // Store tokens in local storage
    chrome.storage.local
      .set({
        [TOKEN_STORAGE_KEY]: {
          access_token,
          refresh_token,
          expiry_date,
        },
      })
      .then(() => {
        console.log("Background script: OAuth tokens saved in chrome.storage.local");

        if (sender.tab && sender.tab.id) {
          chrome.tabs.remove(sender.tab.id, () => {
            console.log("Background script: Closed OAuth callback tab");
          });
        }

        sendResponse({
          status: "success",
          message: "OAuth tokens stored successfully.",
        });
      })
      .catch((error) => {
        console.error("Background script: Error saving OAuth tokens:", error);
        sendResponse({
          status: "error",
          message: "Failed to store OAuth tokens.",
        });
      });

    return true;
  }

  // Handle specific action types
  if (request.action === "GCA_PROCESS_INPUT") {
    console.log(
      "Background script: Message received from:",
      sender?.tab?.url || "unknown source"
    );
    console.log("Background script: Data received:", request.data);
    sendResponse({
      status: "received",
      message: "Message received and is now being processed.",
    });
    return false;
  }

  if (request.action === "SAVE_MESSAGES") {
    chrome.storage.session
      .set({ chatMessages: request.payload })
      .then(() => {
        sendResponse({
          status: "success",
          message: "Messages saved in extension session storage.",
        });
      })
      .catch((error) => {
        console.error("Error saving messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to save messages.",
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "LOAD_MESSAGES") {
    chrome.storage.session
      .get("chatMessages")
      .then((stored) => {
        sendResponse({
          status: "success",
          messages: stored.chatMessages || [],
        });
      })
      .catch((error) => {
        console.error("Error loading messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to load messages.",
          messages: [],
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "CLEAR_MESSAGES") {
    chrome.storage.session
      .remove("chatMessages")
      .then(() => {
        console.log("Chat messages cleared from session storage");
        sendResponse({
          status: "success",
          message: "Messages cleared from extension session storage.",
        });
      })
      .catch((error) => {
        console.error("Error clearing messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to clear messages.",
        });
      });
    return true; // Keep the message channel open for async response
  }

  // Handle unknown actions
  console.warn("Background script: Unknown action:", request.action);
  sendResponse({
    status: "error",
    message: `Unknown action: ${request.action}`,
  });

  return false;
});
