/**
 * @fileoverview
 * Initializes and manages the chat panel interface for the Google Calendar Assistant.
 * Handles chat interactions, voice input, smart rescheduling logic, and state management
 * within a Shadow DOM environment.
 */

(async () => {
  const API_URL = "http://localhost:8080";

  // Tracks the current shadow calendar used during a smart reschedule session.
  // A shadow calendar is a temporary calendar used to propose changes before committing them.
  let currentShadowCalendarId = null;

  // Check if initialization has already happened to prevent attaching multiple listeners.
  // This ensures the script is idempotent if injected multiple times.
  if (window.__panelInitialized) return;
  window.__panelInitialized = true;

  initializePanel();

  /**
   * Main initialization function that encapsulates all panel logic and state.
   */
  function initializePanel() {
    // LocalStorage keys for persisting user preferences and state
    const GCA_CONSENT_KEY = "gcaCalendarConsent";
    const GCA_RESCHEDULE_MODE_KEY = "gcaReschedulingMode";
    const GCA_SHADOW_CALENDAR_KEY = "gcaShadowCalendarId";

    // State variables for the current session
    let smartReschedulingMode = false;
    let shadowCalendarId = null;

    /** 
     * Retrieves privacy consent status. 
     */
    function getCalendarConsent() {
      try {
        return window.localStorage.getItem(GCA_CONSENT_KEY) === "true";
      } catch (e) {
        return false;
      }
    }

    /** 
     * Saves privacy consent status. 
     */
    function setCalendarConsent(value) {
      try {
        window.localStorage.setItem(GCA_CONSENT_KEY, value ? "true" : "false");
      } catch (e) {}
    }

    /** 
     * Checks if smart rescheduling mode is active. 
     */
    function getReschedulingMode() {
      try {
        return window.localStorage.getItem(GCA_RESCHEDULE_MODE_KEY) === "true";
      } catch (e) {
        return false;
      }
    }

    /** 
     * Persists the rescheduling mode state.
     */
    function setReschedulingMode(value) {
      try {
        window.localStorage.setItem(
          GCA_RESCHEDULE_MODE_KEY,
          value ? "true" : "false"
        );
      } catch (e) {}
    }

    /** 
     * Retrieves the ID of the active shadow calendar, if any. 
     */
    function getShadowCalendarId() {
      try {
        return window.localStorage.getItem(GCA_SHADOW_CALENDAR_KEY);
      } catch (e) {
        return null;
      }
    }

    /** 
     * Saves or clears the shadow calendar ID.
     */
    function setShadowCalendarId(value) {
      try {
        if (value) window.localStorage.setItem(GCA_SHADOW_CALENDAR_KEY, value);
        else window.localStorage.removeItem(GCA_SHADOW_CALENDAR_KEY);
      } catch (e) {}
    }

    /**
     * Requests an OAuth access token from the parent window/extension context.
     * 
     * @returns {Promise<Object>} The token payload or error status.
     */
    function requestGcaAccessToken() {
      return new Promise((resolve) => {
        function listener(event) {
          if (event.source !== window) return;
          if (event.data?.type !== "GCA_ACCESS_TOKEN_RESPONSE") return;
          window.removeEventListener("message", listener);
          resolve(event.data.payload);
        }
        window.addEventListener("message", listener);
        window.postMessage({ type: "GCA_REQUEST_ACCESS_TOKEN" }, "*");
      });
    }

    /** 
     * Triggers the Google OAuth flow in the parent context. 
     */
    function startGoogleAuthFlow() {
      window.postMessage({ type: "GCA_START_AUTH" }, "*");
    }

    /**
     * Disables "Apply/Ignore" buttons from previous messages to prevent actions on stale states.
     */
    function disableAllPreviousButtons() {
      const allButtons = root.querySelectorAll(".reschedule-link-button");
      allButtons.forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("disabled");
      });
    }

    /**
     * Dynamically adds "Apply all" and "Ignore all" buttons to a specific chat bubble.
     * Used when the AI proposes calendar changes.
     * 
     * @param {HTMLElement} bubbleEl - The message bubble element to attach buttons to.
     */
    function attachInlineRescheduleButtonsForBubble(bubbleEl) {
      if (!bubbleEl) return;

      const messageEl = bubbleEl.closest(".message");
      if (!messageEl) return;
      
      const timeEl = messageEl.querySelector(".message-time");
      if (!timeEl) return;

      const old = messageEl.querySelector(".reschedule-actions-inline");
      if (old) old.remove();

      const actionsSpan = document.createElement("span");
      actionsSpan.className = "reschedule-actions-inline";

      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.textContent = "Apply all";
      applyBtn.className = "reschedule-link-button";
      applyBtn.addEventListener("click", commitShadowCalendar);

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

    /**
     * Commits changes from the shadow calendar to the real calendar.
     * Calls the backend API and cleans up session state on success.
     */
    async function commitShadowCalendar() {
      if (!shadowCalendarId) return;
      suggestionTag.style.display = "none";
      disableAllPreviousButtons();

      try {
        const gcaTokenResp = await requestGcaAccessToken();
        if (gcaTokenResp.status !== "success") throw new Error("No access token");
        const token = gcaTokenResp.access_token;

        const result = await fetch(API_URL + "/api/events/shadow/commit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ shadowCalendarId }),
        });

        if (!result.ok) throw new Error("Commit failed: " + result.status);

        await appendMessage("ai", "Your calendar has been updated successfully.");

        // Cleanup and Redirect
        shadowCalendarId = null;
        currentShadowCalendarId = null;
        smartReschedulingMode = false;
        setShadowCalendarId(null);
        setReschedulingMode(false);

        window.postMessage({ type: "GCA_SWITCH_CONTEXT_PRIMARY" }, "*");

      } catch (err) {
        console.error(err);
        await appendMessage("ai", "Failed to apply changes. Please try again.");
      }
    }

    /**
     * Discards the shadow calendar and exits rescheduling mode.
     * @param {boolean} refresh - Whether to trigger a context switch (refresh) on the host.
     */
    async function exitReschedulingMode(refresh = true) {
      suggestionTag.style.display = "none";
      disableAllPreviousButtons();

      const wasActiveSession = !!shadowCalendarId;

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
        currentShadowCalendarId = null;
        smartReschedulingMode = false;
        setShadowCalendarId(null);
        setReschedulingMode(false);

        // Only trigger the context switch if we actually had a shadow calendar active
        if (wasActiveSession && refresh) {
          window.postMessage({ type: "GCA_SWITCH_CONTEXT_PRIMARY" }, "*");
        }
      }
    }

    window.addEventListener("beforeunload", () => {});

    // Locate the ShadowRoot to access isolated DOM elements
    let root = document.currentScript?.getRootNode();
    if (!(root instanceof ShadowRoot)) {
      const host = document.querySelector("#assistant-chat-panel");
      root = host?.shadowRoot || host?._shadowRoot;
    }
    if (!(root instanceof ShadowRoot)) throw new Error("Cannot initialize chat panel");

    // Helper to get element by ID from ShadowRoot
    const get = (id) => root.getElementById(id);

    // UI Element References
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
    const microphoneButton = get("microphone-button");
    const microphoneTooltip = get("mic-tooltip-text");

    /** 
     * Initializes the privacy consent overlay logic. 
     */
    async function initPrivacyConsent() {
      if (!consentOverlay) return;
      if (!getCalendarConsent()) consentOverlay.classList.remove("hidden");
      else consentOverlay.classList.add("hidden");

      consentAccept.addEventListener("click", () => {
        setCalendarConsent(true);
        consentOverlay.classList.add("hidden");
      });
      consentDecline.addEventListener("click", () => {
        setCalendarConsent(false);
        if (root && root.host) root.host.style.display = "none";
        sendMessageToMainWindow("CLOSE_CHAT_PANEL");
      });
    }

    // Speech recognition state
    let recognition = null;
    let isRecording = false;
    let finalTranscript = "";

    if (initialTimeEl) {
      updateMicrophoneState();
      initialTimeEl.textContent = new Date().toLocaleTimeString();
    }

    function sendMessageToMainWindow(type) {
      window.top.postMessage({ type }, "*");
    }

    async function saveMessages(messages) {
      window.postMessage({ type: "SAVE_MESSAGES", payload: messages }, "*");
    }

    /** 
     * Loads chat history via message passing with the host. 
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

    const WELCOME_MESSAGE = "Hello! I'm your Google Calendar assistant. How can I help you today?";

    /** 
     * Restores chat state and previous messages on load. 
     */
    async function initializeChat() {
      const messages = await loadMessages();
      const filteredMessages = messages?.filter((msg) => msg.text) || [];

      if (filteredMessages.length > 0) {
        const existingMessages = chatMessages.querySelectorAll(".message");
        existingMessages.forEach((msg) => msg.remove());

        for (const msg of filteredMessages) {
          await appendMessage(msg.sender, msg.text, {
            skipSave: true,
            timestamp: msg.timestamp,
          });
        }
      } else {
        await appendMessage("ai", WELCOME_MESSAGE, {
          skipSave: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Restore rescheduling session if it was active
      const wasReschedulingActive = getReschedulingMode();
      const savedShadowId = getShadowCalendarId();

      if (wasReschedulingActive) {
        smartReschedulingMode = true;
        if (savedShadowId) {
          shadowCalendarId = savedShadowId;
          currentShadowCalendarId = savedShadowId;

          // Re-attach buttons to the last AI message
          const aiMessages = chatMessages.querySelectorAll(".message.ai");
          if (aiMessages.length > 0) {
            const lastAi = aiMessages[aiMessages.length - 1];
            const lastBubble = lastAi.querySelector(".message-bubble");
            attachInlineRescheduleButtonsForBubble(lastBubble);
          }
        }
        if (suggestionTag) suggestionTag.style.display = "flex";
      }
    }

    /** 
     * Formats history for the Gemini API.
     */
    async function getConversationHistory() {
      const messages = await loadMessages();
      if (!messages || messages.length === 0) return [];
      return messages
        .filter((msg) => msg.text !== WELCOME_MESSAGE)
        .map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        }));
    }

    /**
     * Appends a message bubble to the chat UI.
     * 
     * @param {string} sender - 'user' or 'ai'.
     * @param {string} text - Message content.
     * @param {Object} options - Config like {pulse, skipSave, timestamp}.
     */
    async function appendMessage(sender, text, options = {}) {
      if (!chatMessages) return;
      const msg = document.createElement("div");
      msg.classList.add("message", sender);
      const avatar = document.createElement("div");
      avatar.classList.add("avatar", sender);
      const content = document.createElement("div");
      content.classList.add("message-content");
      const bubble = document.createElement("div");
      bubble.classList.add("message-bubble");

      if (options.pulse) {
        bubble.classList.add("pulse");
        const span = document.createElement("span");
        bubble.appendChild(span);
      } else {
        bubble.textContent = text;
      }

      const time = document.createElement("div");
      time.classList.add("message-time");
      const timestamp = options.timestamp || new Date().toISOString();
      time.textContent = new Date(timestamp).toLocaleTimeString();

      content.append(bubble, time);
      msg.append(avatar, content);
      chatMessages.appendChild(msg);

      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });

      if (!options.skipSave && text.trim() !== "") {
        const existing = (await loadMessages()) || [];
        existing.push({ sender, text, timestamp: timestamp });
        await saveMessages(existing);
      }
    }

    if (chatForm && chatInput && chatMessages) {
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
        const msg = chatInput.value.trim();
        if (!msg) return;
        if (!getCalendarConsent()) {
          if (consentOverlay) consentOverlay.classList.remove("hidden");
          return;
        }

        appendMessage("user", msg);
        chatInput.value = "";
        const history = await getConversationHistory();
        appendMessage("ai", "", { pulse: true });

        try {
          // Authentication Check
          const gcaTokenResp = await requestGcaAccessToken();
          if (gcaTokenResp.status === "need_auth") {
            startGoogleAuthFlow();
            return;
          }
          if (gcaTokenResp.status !== "success") throw new Error("Auth failed");

          const gcaAccessToken = gcaTokenResp.access_token;

          // Context Injection: Inform backend if smart mode is active
          let backendInput = msg;
          if (smartReschedulingMode) {
            backendInput = `[Smart Reschedule Mode Active] ${msg}`;
          }

          const requestBody = {
            input: backendInput,
            history: history,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

          if (currentShadowCalendarId) {
            requestBody.shadowCalendarId = currentShadowCalendarId;
          }

          const response = await fetch(API_URL + "/api/gemini", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${gcaAccessToken}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) throw new Error(`Server error: ${response.status}`);
          const data = await response.json();

          let shouldTriggerRefresh = false;

          // Check if backend initiated a new shadow session
          if (data.action === "init_shadow_session") {
            const shadowId =
              data.shadowCalendarId || data.calendarResult?.shadowCalendarId;
            if (shadowId && shadowId !== currentShadowCalendarId) {
              currentShadowCalendarId = shadowId;
              shadowCalendarId = shadowId;
              setShadowCalendarId(shadowId);
              shouldTriggerRefresh = true;
            }
          }

          if (shouldTriggerRefresh) {
            console.log("New shadow session detected. Refreshing view.");
            window.postMessage(
              {
                type: "GCA_CALENDAR_CREATED",
                payload: { shadowCalendarId: currentShadowCalendarId },
              },
              "*"
            );
          }

          const aiMessage = data.output || data.text || "(No response)";

          // Update UI with AI response
          const lastAiBubble = chatMessages.querySelector(
            ".message.ai .message-bubble.pulse"
          );
          if (lastAiBubble) {
            lastAiBubble.classList.remove("pulse");
            lastAiBubble.textContent = aiMessage;
            lastAiBubble.style.color = "inherit";

            // If in mode and calendar was modified, attach action buttons
            const isModification = [
              "update",
              "create",
              "delete",
              "init_shadow_session",
            ].includes(data.action);

            if (smartReschedulingMode && isModification) {
              disableAllPreviousButtons();
              if (shadowCalendarId) {
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
          console.error(error);
          const lastAiBubble = chatMessages.querySelector(
            ".message.ai .message-bubble.pulse"
          );
          if (lastAiBubble) {
            lastAiBubble.classList.remove("pulse");
            lastAiBubble.textContent = "Something went wrong. Please try again.";
            lastAiBubble.style.color = "inherit";
          }
        }
      });
    }

    if (closeChatButton) {
      closeChatButton.addEventListener("click", (e) => {
        e.preventDefault();
        sendMessageToMainWindow("CLOSE_CHAT_PANEL");
        root.host.style.display = "none";
      });
    }

    if (clearChatButton) {
      clearChatButton.addEventListener("click", async (e) => {
        e.preventDefault();

        // Ensure backend cleans up shadow session before clearing UI
        if (shadowCalendarId) {
          await exitReschedulingMode();
        }

        chatMessages.querySelectorAll(".message").forEach((msg) => msg.remove());
        await saveMessages([]);
        window.postMessage({ type: "CLEAR_MESSAGES" }, "*");

        smartReschedulingMode = false;
        shadowCalendarId = null;
        currentShadowCalendarId = null;
        setReschedulingMode(false);
        setShadowCalendarId(null);
        if (suggestionTag) suggestionTag.style.display = "none";
        disableAllPreviousButtons();

        await appendMessage("ai", WELCOME_MESSAGE, {
          skipSave: true,
          timestamp: new Date().toISOString(),
        });
      });
    }

    if (resizeChatButton) {
      resizeChatButton.addEventListener("click", (e) => {
        e.preventDefault();
        sendMessageToMainWindow("RESIZE_CHAT_PANEL");
      });
    }

    if (modeBtn && dropdown) {
      modeBtn.addEventListener("click", () => {
        dropdownMenu.style.display =
          dropdownMenu.style.display === "block" ? "none" : "block";
      });
      root.addEventListener("click", (e) => {
        if (!document.getElementById("mode-dropdown").contains(e.target)) {
          dropdownMenu.style.display = "none";
        }
      });

      smartSuggestionBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        suggestionTag.style.display = "flex";
        dropdownMenu.style.display = "none";
        smartReschedulingMode = true;
        setReschedulingMode(true);
        console.log("Smart rescheduling mode ON");
      });

      removeSuggestion.addEventListener("click", () => {
        suggestionTag.style.display = "none";
        smartReschedulingMode = false;
        disableAllPreviousButtons();
        exitReschedulingMode(false);
      });
    }

    /**
     * Initializes SpeechRecognition if supported by the browser.
     */
    function initializeSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      // Check browser support
      if (!SpeechRecognition) {
        console.warn("Web Speech API is not supported in this browser.");
        recognition = null;

        if (microphoneButton) {
          microphoneButton.disabled = true;
          microphoneButton.classList.add("hidden");
        }
        if (microphoneTooltip) {
          microphoneTooltip.textContent = "Voice input not supported";
        }

        updateMicrophoneState();
        return;
      }

      recognition = new SpeechRecognition();
      recognition.interimResults = true; // Show text as user speaks
      recognition.continuous = true; // Keep recording until stopped

      recognition.addEventListener("result", handleSpeechResult);
      recognition.addEventListener("error", handleSpeechError);
      recognition.addEventListener("end", handleSpeechEnd);

      updateMicrophoneState();
    }

    /**
     * Processes speech results, separating final and interim transcripts.
     */
    function handleSpeechResult(event) {
      let interimTranscript = "";
      finalTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += text + " ";
        } else {
          interimTranscript += text + " ";
        }
      }

      // Display live transcript in the input field
      if (chatInput) {
        chatInput.value = (finalTranscript || interimTranscript).trim();
      }
      updateMicrophoneState();
    }

    /** 
     * Log errors and update state.
     */
    function handleSpeechError(event) {
      console.error("Speech recognition error:", event.error);
      isRecording = false;
      updateMicrophoneState();
    }

    /** 
     * Handles the end of a speech session (or restarts if continuous). 
     */
    function handleSpeechEnd() {
      if (isRecording && recognition) {
        try {
          recognition.start();
        } catch (err) {
          console.warn("Could not restart recognition:", err);
          isRecording = false;
        }
        updateMicrophoneState();
        return;
      }

      const text = (finalTranscript || (chatInput ? chatInput.value : "")).trim();
      if (!text) {
        finalTranscript = "";
        updateMicrophoneState();
        return;
      }

      if (chatInput) {
        chatInput.value = text;
      }

      finalTranscript = "";
      updateMicrophoneState();
    }

    /**
     * Toggles microphone button visibility and styling based on state.
     */
    function updateMicrophoneState() {
      if (!microphoneButton) return;

      const speechSupported = !!recognition;
      const hasText = chatInput && chatInput.value.trim().length > 0;

      // Only show mic if supported
      const shouldHide = !speechSupported || (hasText && !isRecording);

      microphoneButton.disabled = shouldHide;
      microphoneButton.classList.toggle("hidden", shouldHide);

      microphoneButton.classList.toggle(
        "recording",
        speechSupported && isRecording && !shouldHide
      );

      if (microphoneTooltip) {
        if (!speechSupported) {
          microphoneTooltip.textContent = "Voice input not supported";
        } else if (isRecording) {
          microphoneTooltip.textContent = "Stop recording";
        } else if (hasText) {
          microphoneTooltip.textContent = "Clear text to use microphone";
        } else {
          microphoneTooltip.textContent = "Start voice message";
        }
      }
    }

    if (microphoneButton) {
      microphoneButton.addEventListener("click", (e) => {
        e.preventDefault();

        if (!recognition) return;
        if (microphoneButton.disabled) return;

        if (isRecording) {
          isRecording = false;
          recognition.stop();
        } else {
          isRecording = true;
          finalTranscript = "";
          recognition.start();
        }

        updateMicrophoneState();
      });
    }

    if (chatInput) {
      chatInput.addEventListener("input", () => {
        updateMicrophoneState();
      });
    }

    initializeSpeechRecognition();
    initPrivacyConsent();
    initializeChat();
    updateMicrophoneState();

    // Prevent chat interactions from bubbling up and affecting the host page
    if (root instanceof ShadowRoot) {
      ["keydown", "keyup", "input", "mousedown", "mouseup"].forEach(
        (eventType) => {
          root.addEventListener(
            eventType,
            (e) => {
              if (!root.contains(e.target)) e.stopPropagation();
            },
            true
          );
        }
      );
      ["keydown", "keypress", "keyup"].forEach((type) => {
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
    }
  }
})();
