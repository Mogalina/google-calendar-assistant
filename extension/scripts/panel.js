/**
 * @fileoverview
 * Initializes and manages the chat panel interface for the Google Calendar Assistant.
 * It dynamically connects to the backend API, handles messages between the webpage and the
 * extension content script, manages chat interactions, and controls user interface behaviors like 
 * resizing, clearing, and closing the chat window.
 */

(async () => {
  // Prevent double initialization
  let isInitialized = false;

  // Request configuration data from the main window or content script
  window.postMessage({ type: "GET_CONFIG" }, "*");

  // Listen for configuration data being sent back
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const { type, data, payload } = event.data || {};

    if (type === "CONFIG_DATA") {
      // Prevent multiple initializations
      if (isInitialized) {
        return;
      }
      isInitialized = true;

      const CONFIG = data;

      if (!CONFIG || !CONFIG.API_URL) {
        console.error("Invalid CONFIG:", CONFIG);
        return;
      }

      // Attempt to locate the root shadow DOM where the chat UI is hosted
      let root = document.currentScript?.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        const host = document.querySelector("#assistant-chat-panel");
        root = host?.shadowRoot || host?._shadowRoot;
      }
      
      // If no shadow root is found, initialization fails
      if (!(root instanceof ShadowRoot)) {
        console.error("Panel.js: No valid shadow root found");
        throw new Error("Cannot initialize chat panel");
      }

      // Utility function for quick element selection inside the shadow root
      const get = (id) => root.getElementById(id);

      // Retrieve chat panel interface elements
      const chatInput = get("chat-input");
      const chatMessages = get("chat-messages");
      const chatForm = get("chat-form");
      const dropdown = get("mode-dropdown");
      const modeBtn = get("mode-btn");
      const closeChatButton = get("close-chat-button");
      const clearChatButton = get("clear-chat-button");
      const resizeChatButton = get("resize-chat-button");
      const initialTimeEl = get("initial-time");
      const microphoneButton = get("microphone-button");
      const microphoneTooltip = get("mic-tooltip-text");

      // State variables for Web Speech API
      let recognition = null;     
      let isRecording = false;   
      let finalTranscript = "";  

       // Set initial timestamp
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

      async function saveMessages(messages) {
        window.postMessage({ type: "SAVE_MESSAGES", payload: messages }, "*");
      }

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

      // Initialize chat by loading previous messages or showing welcome message
      async function initializeChat() {
        const messages = await loadMessages();

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
          // Show initial welcome message
          await appendMessage("ai", WELCOME_MESSAGE, {
            skipSave: false,
            timestamp: new Date().toISOString(),
          });
        }
      }

      /**
       * Formats conversation history for Gemini API
       * @returns {Array} Formatted history array
       */
      async function getConversationHistory() {
        const messages = await loadMessages();
        if (!messages || messages.length === 0) {
          return [];
        }

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
        const timeObj = new Date(timestamp);
        time.textContent = timeObj.toLocaleTimeString();

        content.append(bubble, time);
        msg.append(avatar, content);
        chatMessages.appendChild(msg);

        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: "smooth",
        });

        // Save to session storage
        if (!options.skipSave && text.trim() !== "") {
          const existing = (await loadMessages()) || [];
          existing.push({ sender, text, timestamp: timestamp });
          await saveMessages(existing);
        }
      }

      // Handle chat form submission when user sends message
      if (chatForm && chatInput && chatMessages) {
        chatForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          const msg = chatInput.value.trim();
          if (!msg) return;

          appendMessage("user", msg);
          chatInput.value = "";

          updateMicrophoneState();

          // Prepare assistant response bubble with loading pulse
          const history = await getConversationHistory();
          appendMessage("ai", "", { pulse: true });

          try {
            // Send user message to the assistant backend
            const response = await fetch(CONFIG.API_URL + "/api/gemini", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${CONFIG.ACCESS_TOKEN}`,
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

            // Parse assistant response and update chat
            const data = await response.json();
            const aiMessage = data.output || data.text || "(No response)";

            // Replace pulsing bubble with final assistant text response
            const lastAiBubble = chatMessages.querySelector(".message.ai .message-bubble.pulse");
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent = aiMessage;
              lastAiBubble.style.color = "inherit";

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
            console.error("Chat error:", error);
            const lastAiBubble = chatMessages.querySelector( ".message.ai .message-bubble.pulse");
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent = "Something went wrong. Please try again.";
              lastAiBubble.style.color = "inherit";
            } else {
              appendMessage("ai", "Something went wrong. Please try again.");
            }
          }
        });
      }

      // Close chat button: hides chat panel and notifies main window
      if (closeChatButton) {
        closeChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          sendMessageToMainWindow("CLOSE_CHAT_PANEL");
          root.host.style.display = "none";
        });
      }

      // Removes all messages except the first one
      if (clearChatButton) {
        clearChatButton.addEventListener("click", async (e) => {
          e.preventDefault();

          // Clear all messages from DOM
          chatMessages.querySelectorAll(".message").forEach((msg, i) => {
            msg.remove();
          });

          // Clear storage completely
          await saveMessages([]);

          // Also send explicit clear message to ensure storage is wiped
          window.postMessage({ type: "CLEAR_MESSAGES" }, "*");

          // Re-add welcome message
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
        modeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          dropdown.classList.toggle("open");
        });

        root.addEventListener("click", (e) => {
          if (!dropdown.contains(e.target)) dropdown.classList.remove("open");
        });
      }

      /* 
        * Initializes the Web Speech API for voice recognition
        * Creates the SpeechRecognition instance and sets basic configuration
      */
      function initializeSpeechRecognition() {

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        // If the API is not available, we disable the mic button 
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

        // We want partial results so we can show live text
        recognition.interimResults = true;

        // We only need one phrase per click, not continuous dictation
        recognition.continuous = false;

        recognition.addEventListener("result", handleSpeechResult);
        recognition.addEventListener("error", handleSpeechError);
        recognition.addEventListener("end", handleSpeechEnd);

        updateMicrophoneState();
      }

      /**
       * Handles speech recognition results
       * Builds final + interim transcripts and displays them in the textarea
       */
      function handleSpeechResult(event) {
        let interimTranscript = "";
        finalTranscript = "";

        // Iterate over all results from the recognizer
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;

          if (result.isFinal) {
            finalTranscript += text + " ";
          } else {
            interimTranscript += text + " ";
          }
        }

        // Show latest text in the chat input so the user can see what was heard
        if (chatInput) {
          chatInput.value = (finalTranscript || interimTranscript).trim();
        }
        updateMicrophoneState();
      }

      // Handles errors from the speech recognizer
      function handleSpeechError(event) {
        console.error("Speech recognition error:", event.error);
        isRecording = false;
        updateMicrophoneState();
      }

      // Called when the recognizer stops
      function handleSpeechEnd() {
        isRecording = false;

        // Use the final transcript if available, otherwise whatever is in the input
        const text = (finalTranscript || (chatInput ? chatInput.value : "")).trim();
        if (!text) {
          finalTranscript = "";
          updateMicrophoneState();
          return;
        }

        // Put the text into the chat input so the flow is the same as typed messages
        if (chatInput) {
          chatInput.value = text;
        }

        // Clear the stored transcript for the next recording
        finalTranscript = "";

        updateMicrophoneState();
      }

      /**
       * Updates microphone button depending on:
       * Web Speech support
       * whether user typed text
       * whether we are currently recording
       */
      function updateMicrophoneState() {
        if (!microphoneButton) return;

        const speechSupported = !!recognition;
        const hasText = chatInput && chatInput.value.trim().length > 0;

        // Hide microphone if speech is not supported or the user has typed text
        const shouldHide = !speechSupported || (hasText && !isRecording);

        microphoneButton.disabled = shouldHide;
        microphoneButton.classList.toggle("hidden", shouldHide);

        // When recording, keep the button visible and highlight it
        microphoneButton.classList.toggle(
          "recording",
          speechSupported && isRecording && !shouldHide
        );

        // Update tooltip text for clarity
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

      // Wire up microphone button to start/stop speech recognition
      if (microphoneButton) {
        microphoneButton.addEventListener("click", (e) => {
          e.preventDefault();

          // If recognition is not initialized or not supported, do nothing
          if (!recognition) return;

          if (microphoneButton.disabled) return;

          if (isRecording) {
            recognition.stop();
          } else {
            isRecording = true;
            finalTranscript = ""; // reset previous text
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
      initializeChat();
      updateMicrophoneState();

      // Add event containment logic for the shadow root to prevent event leakage
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
              if (chatInput && (active === chatInput || chatInput.contains(e.target))) {
                e.stopPropagation();
                e.stopImmediatePropagation();
              }
            },
            true
          );
        });
      } else {
        // If no shadow root found, skip containment setup
        console.info("Skipping event containment because no shadow root was found.");
      }
    }
  });
})();
