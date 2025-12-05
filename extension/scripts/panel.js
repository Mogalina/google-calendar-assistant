/**
 * @fileoverview
 * Initializes and manages the chat panel interface for the Google Calendar Assistant.
 * It dynamically connects to the backend API, handles messages between the webpage and the
 * extension content script, manages chat interactions, and controls user interface behaviors like
 * resizing, clearing, and closing the chat window.
 */

(async () => {
  // Hardcoded configuration
  // The base endpoint for the backend server handling requests
  const API_URL = "http://localhost:8080";

  // Check if initialization has already happened to prevent attaching multiple listeners
  if (window.__panelInitialized) return;
  window.__panelInitialized = true;

  initializePanel();

  /**
   * Main setup function that encapsulates all panel logic, event listeners, and DOM manipulation to
   * ensure scope isolation.
   */
  function initializePanel() {
    const GCA_CONSENT_KEY = "gcaCalendarConsent";

    let smartReschedulingMode = false;
    let shadowCalendarId = null;

    /**
     * Retrieves the user's stored privacy consent decision.
     *
     * @returns {boolean} True if the user accepted calendar access, false otherwise.
     */
    function getCalendarConsent() {
      try {
        return window.localStorage.getItem(GCA_CONSENT_KEY) === "true";
      } catch (e) {
        return false;
      }
    }

    /**
     * Saves the user's privacy consent decision.
     *
     * @param {boolean} value - The user's consent decision (true = accepted, false = declined).
     */
    function setCalendarConsent(value) {
      try {
        window.localStorage.setItem(GCA_CONSENT_KEY, value ? "true" : "false");
      } catch (e) {}
    }

    /**
     * Requests a valid access token for Google Calendar Assistant.
     * The background script receives this and performs token retrieval or refresh.
     *
     * @returns {Promise<object>} The status and optional access token.
     */
    function requestGcaAccessToken() {
      return new Promise((resolve) => {
        function listener(event) {
          // Ensure security by checking the source
          if (event.source !== window) return;

          // Filter for the specific response type
          if (event.data?.type !== "GCA_ACCESS_TOKEN_RESPONSE") return;

          // Clean up listener to prevent memory leaks
          window.removeEventListener("message", listener);
          resolve(event.data.payload);
        }

        window.addEventListener("message", listener);
        window.postMessage({ type: "GCA_REQUEST_ACCESS_TOKEN" }, "*");
      });
    }

    // Initiates the Google OAuth flow by notifying the main window
    // This triggers a new tab opening in the background script
    function startGoogleAuthFlow() {
      window.postMessage({ type: "GCA_START_AUTH" }, "*");
    }

    // Detect when LLM response is a rescheduling suggestion
    function isReschedulingSuggestion(messageText) {
      return (
        messageText.includes("[RESCHEDULE]") ||
        messageText.includes("reschedule") ||
        messageText.toLowerCase().includes("proposed schedule") ||
        messageText.toLowerCase().includes("suggested arrangement")
      );
    }

    function disableInlineRescheduleButtons() {
      const buttons = root.querySelectorAll(".reschedule-link-button");
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add("disabled");
      });
    }

    /**
     * Attaches "Apply all | Ignore suggestion" inline next to the time
     * for the given AI message bubble.
     */
    function attachInlineRescheduleButtonsForBubble(bubbleEl) {
      if (!bubbleEl) return;

      // .message -> .message-content -> .message-time
      const messageEl = bubbleEl.closest(".message");
      if (!messageEl) return;

      const timeEl = messageEl.querySelector(".message-time");
      if (!timeEl) return;

      // Remove previous inline actions if any
      const old = messageEl.querySelector(".reschedule-actions-inline");
      if (old) old.remove();

      // Container <span> to hold the actions
      const actionsSpan = document.createElement("span");
      actionsSpan.className = "reschedule-actions-inline";

      // Apply button
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.textContent = "Apply all";
      applyBtn.className = "reschedule-link-button";
      applyBtn.addEventListener("click", commitShadowCalendar);

      // Ignore button
      const ignoreBtn = document.createElement("button");
      ignoreBtn.type = "button";
      ignoreBtn.textContent = "Ignore all";
      ignoreBtn.className = "reschedule-link-button";
      ignoreBtn.addEventListener("click", exitReschedulingMode);

      const separator = document.createTextNode(" | ");

      actionsSpan.appendChild(applyBtn);
      actionsSpan.appendChild(separator);
      actionsSpan.appendChild(ignoreBtn);

      timeEl.appendChild(actionsSpan);
    }

    async function commitShadowCalendar() {
      if (!shadowCalendarId) return;

      suggestionTag.style.display = "none";
      disableInlineRescheduleButtons();

      try {
        const gcaTokenResp = await requestGcaAccessToken();
        if (gcaTokenResp.status !== "success") {
          throw new Error("No access token");
        }

        const token = gcaTokenResp.access_token;

        const result = await fetch(API_URL + "/api/events/shadow/commit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ shadowCalendarId }),
        });

        if (!result.ok) {
          throw new Error("Commit failed: " + result.status);
        }

        await appendMessage("ai", "Your calendar has been updated successfully.");

        shadowCalendarId = null;
        smartReschedulingMode = false;
      } catch (err) {
        console.error(err);
        await appendMessage("ai", "Failed to apply changes. Please try again.");
      }
    }

    async function exitReschedulingMode() {
      suggestionTag.style.display = "none";
      disableInlineRescheduleButtons();
      try {
        if (shadowCalendarId) {
          const gcaTokenResp = await requestGcaAccessToken();
          if (gcaTokenResp.status === "success") {
            const token = gcaTokenResp.access_token;

            await fetch(API_URL + "/api/events/shadow/discard", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ shadowCalendarId }),
            });
          }
        }
      } catch (err) {
        console.warn("Failed to discard shadow calendar", err);
      } finally {
        shadowCalendarId = null;
        smartReschedulingMode = false;
      }
    }

    window.addEventListener("beforeunload", () => {
      if (!shadowCalendarId) return;

      try {
        navigator.sendBeacon(
          API_URL + "/api/events/shadow/discard",
          JSON.stringify({ shadowCalendarId })
        );
      } catch (e) {
        // ignore
        console.log("Error on tab close: ", e)
      }
    });

    // Attempt to locate the root shadow
    let root = document.currentScript?.getRootNode();
    if (!(root instanceof ShadowRoot)) {
      // Try to find the host element explicitly
      const host = document.querySelector("#assistant-chat-panel");
      root = host?.shadowRoot || host?._shadowRoot;
    }

    // If no shadow root is found, initialization fails because we cannot access UI elements
    if (!(root instanceof ShadowRoot)) {
      throw new Error("Cannot initialize chat panel");
    }

    // Utility function for quick element selection inside the shadow root
    const get = (id) => root.getElementById(id);

    // Retrieve chat panel interface elements
    const chatInput = get("chat-input");
    const chatMessages = get("chat-messages");
    const chatForm = get("chat-form");
    const dropdown = get("mode-dropdown");
    const dropdownMenu = get("dropdown-menu");
    const modeBtn = get("mode-btn");
    const closeChatButton = get("close-chat-button");
    const clearChatButton = get("clear-chat-button");
    const resizeChatButton = get("resize-chat-button");
    const initialTimeEl = get("initial-time");
    const smartSuggestionBtn = root.querySelector(".dropdown-item");
    const suggestionTag = get("suggestion-tag");
    const removeSuggestion = get("remove-suggestion");
    const consentOverlay = get("gca-consent-overlay");
    const consentAccept = get("gca-consent-accept");
    const consentDecline = get("gca-consent-decline");

    /**
     * Initializes and manages the privacy consent modal for the extension.
     *
     * Displays the consent dialog when no previous decision exists in localStorage, and attaches
     * event listeners to handle the user's choice.
     */
    async function initPrivacyConsent() {
      if (!consentOverlay || !consentAccept || !consentDecline) {
        return;
      }

      if (!getCalendarConsent()) {
        consentOverlay.classList.remove("hidden");
      } else {
        consentOverlay.classList.add("hidden");
      }

      consentAccept.addEventListener("click", () => {
        setCalendarConsent(true);
        consentOverlay.classList.add("hidden");
      });

      consentDecline.addEventListener("click", () => {
        setCalendarConsent(false);
        if (root && root.host) {
          root.host.style.display = "none";
        }
        sendMessageToMainWindow("CLOSE_CHAT_PANEL");
      });
    }

    // Set initial timestamp in the UI header
    if (initialTimeEl) {
      initialTimeEl.textContent = new Date().toLocaleTimeString();
    }

    /**
     * Sends a custom message from this script to the top-level window.
     * Used to communicate with other parts of the extension.
     *
     * @param {string} type - The message type identifier.
     */
    function sendMessageToMainWindow(type) {
      window.top.postMessage({ type }, "*");
    }

    /**
     * Saves messages to storage via content script.
     * Delegates the actual Chrome storage API call to the background script.
     *
     * @param {Array} messages
     */
    async function saveMessages(messages) {
      window.postMessage({ type: "SAVE_MESSAGES", payload: messages }, "*");
    }

    /**
     * Loads previously saved messages from storage.
     * Wraps the async message passing in a Promise.
     *
     * @returns {Promise<Array>}
     */
    async function loadMessages() {
      return new Promise((resolve) => {
        function listener(event) {
          if (event.source !== window) return;
          if (event.data?.type === "LOADED_MESSAGES") {
            window.removeEventListener("message", listener);
            resolve(event.data.payload);
          }
        }
        window.addEventListener("message", listener);
        window.postMessage({ type: "LOAD_MESSAGES" }, "*");
      });
    }

    const WELCOME_MESSAGE =
      "Hello! I'm your Google Calendar assistant. How can I help you today?";

    /**
     * Loads saved conversation and populates the chat.
     * If none exists, shows the welcome message.
     */
    async function initializeChat() {
      const messages = await loadMessages();

      // Ensure we don't render empty message objects
      const filteredMessages = messages?.filter((msg) => msg.text) || [];

      if (filteredMessages.length > 0) {
        // Clear existing messages first
        const existingMessages = chatMessages.querySelectorAll(".message");
        existingMessages.forEach((msg) => msg.remove());

        // Append all stored messages with their original timestamps
        for (const msg of filteredMessages) {
          await appendMessage(msg.sender, msg.text, {
            skipSave: true,
            timestamp: msg.timestamp,
          });
        }
      } else {
        // Show initial welcome message if history is empty
        await appendMessage("ai", WELCOME_MESSAGE, {
          skipSave: false,
          timestamp: new Date().toISOString(),
        });
      }
    }

    /**
     * Formats conversation history for Gemini API.
     * Translates local message format to the specific structure required by the backend LLM.
     *
     * @returns {Array} Formatted history array.
     */
    async function getConversationHistory() {
      const messages = await loadMessages();
      if (!messages || messages.length === 0) {
        return [];
      }

      // Remove welcome message from prompt to avoid confusing the AI context
      return messages
        .filter((msg) => msg.text !== WELCOME_MESSAGE)
        .map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        }));
    }

    /**
     * Appends a message to the chat interface.
     *
     * @param {string} sender - The sender of the message (user or assistant).
     * @param {string} text - The message content.
     * @param {object} [options] - Additional options.
     */
    async function appendMessage(sender, text, options = {}) {
      if (!chatMessages) {
        return;
      }

      // Create message container
      const msg = document.createElement("div");
      msg.classList.add("message", sender);

      // Create avatar element
      const avatar = document.createElement("div");
      avatar.classList.add("avatar", sender);

      // Create content wrapper
      const content = document.createElement("div");
      content.classList.add("message-content");

      // Create the text bubble
      const bubble = document.createElement("div");
      bubble.classList.add("message-bubble");

      if (options.pulse) {
        bubble.classList.add("pulse");
        const span = document.createElement("span");
        bubble.appendChild(span);
      } else {
        bubble.textContent = text;
      }

      // Add timestamp
      const time = document.createElement("div");
      time.classList.add("message-time");
      const timestamp = options.timestamp || new Date().toISOString();
      const timeObj = new Date(timestamp);
      time.textContent = timeObj.toLocaleTimeString();

      // Assemble DOM elements
      content.append(bubble, time);
      msg.append(avatar, content);
      chatMessages.appendChild(msg);

      // Auto-scroll to the newest message
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: "smooth",
      });

      // Save to session storage unless explicitly skipped
      if (!options.skipSave && text.trim() !== "") {
        const existing = (await loadMessages()) || [];
        existing.push({ sender, text, timestamp: timestamp });
        await saveMessages(existing);
      }
    }

    // Handle chat form submission when user sends message
    if (chatForm && chatInput && chatMessages) {
      // Allow to send message when pressing Enter (without Shift)
      chatInput.addEventListener("keydown", (e) => {
        if (e.key == "Enter" && !e.shiftKey) {
          e.preventDefault();
          chatForm.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true })
          );
        }
      });

      chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Get and validate input
        const msg = chatInput.value.trim();
        if (!msg) return;

        // Check for calendar consent
        if (!getCalendarConsent()) {
          if (consentOverlay) {
            consentOverlay.classList.remove("hidden");
          }
          return;
        }

        // Display user message
        appendMessage("user", msg);
        chatInput.value = "";

        // Prepare AI context (history)
        const history = await getConversationHistory();

        // Show loading indicator
        appendMessage("ai", "", { pulse: true });

        try {
          // Request access token from background script
          const gcaTokenResp = await requestGcaAccessToken();

          // Handle unauthenticated state
          if (gcaTokenResp.status === "need_auth") {
            // If user needs to authenticate, inform them in the chat and start auth flow
            const lastAiBubble = chatMessages.querySelector(
              ".message.ai .message-bubble.pulse"
            );
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent =
                "Please connect your Google account to use the Calendar Assistant.";
              lastAiBubble.style.color = "inherit";
            } else {
              await appendMessage(
                "ai",
                "Please connect your Google account to use the Calendar Assistant."
              );
            }

            startGoogleAuthFlow();
            return;
          }

          // Handle authenitication errors
          if (gcaTokenResp.status !== "success") {
            console.error("Could not obtain access token:", gcaTokenResp);
            const lastAiBubble = chatMessages.querySelector(
              ".message.ai .message-bubble.pulse"
            );
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent =
                "Something went wrong with Google authentication. Please try again.";
              lastAiBubble.style.color = "inherit";
            } else {
              await appendMessage(
                "ai",
                "Something went wrong with Google authentication. Please try again."
              );
            }
            return;
          }

          const gcaAccessToken = gcaTokenResp.access_token;

          // Send user response to the assistant backend
          const response = await fetch(API_URL + "/api/gemini", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${gcaAccessToken}`,
            },
            body: JSON.stringify({
              input: msg,
              history: history,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });

          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          // Process API Response
          const data = await response.json();
          const aiMessage = data.output || data.text || "(No response)";

          // Replace pulsing bubble with final assistant text response
          const lastAiBubble = chatMessages.querySelector(
            ".message.ai .message-bubble.pulse"
          );
          if (lastAiBubble) {
            lastAiBubble.classList.remove("pulse");
            lastAiBubble.textContent = aiMessage;
            lastAiBubble.style.color = "inherit";

            // Check if the AI produced a rescheduling suggestion
            if (smartReschedulingMode && isReschedulingSuggestion(aiMessage)) {
              // Your backend must return a shadow calendar ID
              shadowCalendarId = data.shadowCalendarId ?? "123";

              if (shadowCalendarId) {
                console.log("Shadow calendar created:", shadowCalendarId);
                attachInlineRescheduleButtonsForBubble(lastAiBubble);
              }
            }

            const existing = (await loadMessages()) || [];
            existing.push({
              sender: "ai",
              text: aiMessage,
              timestamp: new Date().toISOString(),
            });
            await saveMessages(existing);
          } else {
            appendMessage("ai", aiMessage);
          }
        } catch (error) {
          const lastAiBubble = chatMessages.querySelector(
            ".message.ai .message-bubble.pulse"
          );
          if (lastAiBubble) {
            lastAiBubble.classList.remove("pulse");
            lastAiBubble.textContent =
              "Something went wrong. Please try again.";
            lastAiBubble.style.color = "inherit";
          } else {
            appendMessage("ai", "Something went wrong. Please try again.");
          }
        }
      });
    }

    // Hides chat panel and notifies main window
    if (closeChatButton) {
      closeChatButton.addEventListener("click", (e) => {
        e.preventDefault();
        sendMessageToMainWindow("CLOSE_CHAT_PANEL");
        root.host.style.display = "none";
      });
    }

    // Clears chat history from UI and Storage
    if (clearChatButton) {
      clearChatButton.addEventListener("click", async (e) => {
        e.preventDefault();

        // Clear all messages from DOM
        chatMessages.querySelectorAll(".message").forEach((msg, i) => {
          msg.remove();
        });

        // Clear storage completely
        await saveMessages([]);

        // Also send explicit clear message to ensure storage is wiped in background
        window.postMessage({ type: "CLEAR_MESSAGES" }, "*");

        // Re-add welcome message to reset state
        await appendMessage("ai", WELCOME_MESSAGE, {
          skipSave: true,
          timestamp: new Date().toISOString(),
        });
      });
    }

    // Toggle panel size
    if (resizeChatButton) {
      resizeChatButton.addEventListener("click", (e) => {
        e.preventDefault();
        sendMessageToMainWindow("RESIZE_CHAT_PANEL");
      });
    }

    // Toggle secondary mode dropdown
    if (modeBtn && dropdown) {
      modeBtn.addEventListener("click", () => {
        dropdownMenu.style.display =
          dropdownMenu.style.display === "block" ? "none" : "block";
      });

      // Close dropdown when clicking outside
      root.addEventListener("click", (e) => {
        if (!document.getElementById("mode-dropdown").contains(e.target)) {
          dropdownMenu.style.display = "none";
        }
      });

      // Display suggestion instrument tag
      smartSuggestionBtn.addEventListener("click", () => {
        suggestionTag.style.display = "flex";
        dropdownMenu.style.display = "none";

        smartReschedulingMode = true;
        console.log("Smart rescheduling mode ON");
      });

      // Remove suggestion instrument tag
      removeSuggestion.addEventListener("click", () => {
        suggestionTag.style.display = "none";
        smartReschedulingMode = false;
        disableInlineRescheduleButtons()
        exitReschedulingMode()
      });
    }

    // Initialize privacy calendar consent modal
    initPrivacyConsent();

    // Boot up the chat (load history or welcome message)
    initializeChat();

    // Add event containment logic for the shadow root to prevent event leakage.
    // This stops events inside the chat from bubbling up to the host page (Google Calendar).
    if (root instanceof ShadowRoot) {
      const containmentEvents = [
        "keydown",
        "keyup",
        "input",
        "mousedown",
        "mouseup",
      ];

      // Stop propagation for these events outside of the shadow DOM
      containmentEvents.forEach((eventType) => {
        root.addEventListener(
          eventType,
          (e) => {
            if (!root.contains(e.target)) e.stopPropagation();
          },
          true
        );
      });

      // Prevent keyboard events in chat input from affecting the parent page
      const keyboardEvents = ["keydown", "keypress", "keyup"];

      keyboardEvents.forEach((type) => {
        root.addEventListener(
          type,
          (e) => {
            const active = root.activeElement || document.activeElement;

            if (
              chatInput &&
              (active === chatInput || chatInput.contains(e.target))
            ) {
              if (e.key == "Enter") return;
              e.stopPropagation();
              e.stopImmediatePropagation();
            }
          },
          true
        );
      });
    } else {
      // If no shadow root found, skip containment setup
      console.info(
        "Skipping event containment because no shadow root was found."
      );
    }
  }
})();
