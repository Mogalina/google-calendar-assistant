/**
 * This script powers the in-page chat panel for the Chrome extension.
 * It runs inside the panel’s Shadow DOM, manages chat UI logic, and communicates
 * with the main window using `postMessage`.
 */

(async () => {
  // Ask the content script for config
  window.postMessage({ type: "GET_CONFIG" }, "*");

  // Wait for the config
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const { type, data, payload } = event.data || {};

    if (type === "CONFIG_DATA") {
      const CONFIG = data;

      if (!CONFIG || !CONFIG.API_URL) {
        console.error("Invalid CONFIG:", CONFIG);
        return;
      }

      console.log("Panel.js initializing...");

      /**
       * Attempts to locate the ShadowRoot of the chat panel.
       */
      let root = document.currentScript?.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        const host = document.querySelector("#assistant-chat-panel");
        root = host?.shadowRoot || host?._shadowRoot;
      }

      if (!(root instanceof ShadowRoot)) {
        console.error("Panel.js: No valid shadow root found");
        throw new Error("Cannot initialize chat panel");
      }

      /**
       * Retrieves an element within the Shadow DOM by ID.
       * @param {string} id - The ID of the target element.
       * @returns {HTMLElement | null} The found element or null.
       */
      const get = (id) => root.getElementById(id);

      // Core UI Elements
      const chatInput = get("chat-input");
      const chatMessages = get("chat-messages");
      const chatForm = get("chat-form");
      const dropdown = get("mode-dropdown");
      const modeBtn = get("mode-btn");
      const closeChatButton = get("close-chat-button");
      const clearChatButton = get("clear-chat-button");
      const resizeChatButton = get("resize-chat-button");
      const initialTimeEl = get("initial-time");

      /**
       * Initializes the time display in the chat header.
       */
      if (initialTimeEl) {
        initialTimeEl.textContent = new Date().toLocaleTimeString();
      }

      /**
       * Sends a structured message to the main window for extension communication.
       * @param {string} type - The message type identifier.
       */
      function sendMessageToMainWindow(type) {
        console.log("Sending message:", type);
        window.top.postMessage({ type }, "*");
      }

      async function saveMessages(messages) {
        window.postMessage({ type: "SAVE_MESSAGES", payload: messages }, "*");
      }

      const existing = [];

      /**
       * Creates and appends a chat message bubble to the chat log.
       * @param {"user" | "ai"} sender - The sender type ("user" or "ai").
       * @param {string} text - The message text content.
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
        bubble.textContent = text;

        if (options.pulse) {
          bubble.classList.add("pulse");

          const span = document.createElement("span");
          bubble.appendChild(span);
        } else {
          bubble.textContent = text;
        }

        const time = document.createElement("div");
        time.classList.add("message-time");
        time.textContent = new Date().toLocaleTimeString();

        content.append(bubble, time);
        msg.append(avatar, content);
        chatMessages.appendChild(msg);

        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: "smooth",
        });

        // Save to session storage
        if (text.trim() !== "") {
          existing.push({ sender, text });
          await saveMessages(existing);
        }
      }

      /**
       * Attaches event listeners to the chat form for message submission.
       */
      if (chatForm && chatInput && chatMessages) {
        chatForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          const msg = chatInput.value.trim();
          if (!msg) return;

          appendMessage("user", msg);
          chatInput.value = "";

          const history = "";
          appendMessage("ai", "", { pulse: true });

          try {
            const response = await fetch(CONFIG.API_URL + "/api/gemini", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${CONFIG.ACCESS_TOKEN}`,
              },
              body: JSON.stringify({
                input: msg,
                history,
                timezone: "Europe/Bucharest",
              }),
            });

            if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            const aiMessage = data.output || data.text || "(No response)";

            const lastAiBubble = chatMessages.querySelector(
              ".message.ai .message-bubble.pulse"
            );
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent = aiMessage;
              lastAiBubble.style.color = "inherit";
              existing.push({ sender: "ai", text: aiMessage });
              await saveMessages(existing);
            } else {
              appendMessage("ai", aiMessage);
            }
          } catch (error) {
            console.error("Chat error:", error);
            const lastAiBubble = chatMessages.querySelector(
              ".message.ai .message-bubble.pulse"
            );
            if (lastAiBubble) {
              lastAiBubble.classList.remove("pulse");
              lastAiBubble.textContent = "Hmmm...Something went wrong!";
              lastAiBubble.style.color = "inherit";
            } else {
              appendMessage("ai", "Hmmm...Something went wrong!");
            }
          }
        });
      }

      /**
       * Handles closing of the chat panel.
       */
      if (closeChatButton) {
        closeChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("Close button clicked");
          sendMessageToMainWindow("CLOSE_CHAT_PANEL");
          root.host.style.display = "none";
        });
      }

      /**
       * Clears chat messages except for the initial one.
       */
      if (clearChatButton) {
        clearChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("Clear chat clicked");
          chatMessages.querySelectorAll(".message").forEach((msg, i) => {
            if (i > 0) msg.remove();
          });
        });
      }

      /**
       * Sends a resize request to the main window.
       */
      if (resizeChatButton) {
        resizeChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("Resize clicked");
          sendMessageToMainWindow("RESIZE_CHAT_PANEL");
        });
      }

      /**
       * Toggles the mode dropdown visibility.
       */
      if (modeBtn && dropdown) {
        modeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          dropdown.classList.toggle("open");
        });

        root.addEventListener("click", (e) => {
          if (!dropdown.contains(e.target)) dropdown.classList.remove("open");
        });
      }

      /**
       * Activates event containment within the ShadowRoot.
       * Prevents chat events from leaking to the main document context.
       */
      if (root instanceof ShadowRoot) {
        const containmentEvents = [
          "keydown",
          "keyup",
          "input",
          "mousedown",
          "mouseup",
        ];

        containmentEvents.forEach((eventType) => {
          root.addEventListener(
            eventType,
            (e) => {
              if (!root.contains(e.target)) e.stopPropagation();
            },
            true
          );
        });

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
                e.stopPropagation();
                e.stopImmediatePropagation();
              }
            },
            true
          );
        });
      } else {
        console.info(
          "Panel.js: skipping event containment because no ShadowRoot was found."
        );
      }
    }
  });
})();
