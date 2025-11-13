/**
 * @fileoverview
 * Initializes and manages the chat panel interface for the Google Calendar Assistant.
 * It dynamically connects to the backend API, handles messages between the webpage and the
 * extension content script, manages chat interactions, and controls user interface behaviors like 
 * resizing, clearing, and closing the chat window.
 */

(async () => {
  // Request configuration data from the main window or content script
  window.postMessage({ type: "GET_CONFIG" }, "*");

  // Listen for configuration data being sent back
  window.addEventListener("message", (event) => {
    // Ensure message is from the same window context
    if (event.source !== window) {
      return;
    }

    // Process incoming configuration data
    if (event.data?.type === "CONFIG_DATA") {
      const CONFIG = event.data.data;
      if (!CONFIG || !CONFIG.API_URL) {
        console.error("Invalid configuration:", CONFIG);
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
        console.error("No valid shadow root found");
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

      // Set initial timestamp
      if (initialTimeEl) {
        initialTimeEl.textContent = new Date().toLocaleTimeString();
      }

      /**
       * Sends a custom message from this script to the top-level window.
       * Used to communicate with other parts of the extension.
       */
      function sendMessageToMainWindow(type) {
        window.top.postMessage({ type }, "*");
      }

      async function saveMessages(messages) {
        window.postMessage({ type: "SAVE_MESSAGES", payload: messages }, "*");
      }

      const existing = [];

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

        // Create DOM structure for message bubble
        const msg = document.createElement("div");
        msg.classList.add("message", sender);

        const avatar = document.createElement("div");
        avatar.classList.add("avatar", sender);

        const content = document.createElement("div");
        content.classList.add("message-content");

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");
        bubble.textContent = text;

        // Apply pulsing animation while waiting for assistant to respond
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
        time.textContent = new Date().toLocaleTimeString();

        // Combine elements into message DOM structure
        content.append(bubble, time);
        msg.append(avatar, content);
        chatMessages.appendChild(msg);

        // Auto-scroll chat view to the latest message
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

      // Handle chat form submission when user sends message
      if (chatForm && chatInput && chatMessages) {
        chatForm.addEventListener("submit", async (e) => {
          e.preventDefault();

          const msg = chatInput.value.trim();
          if (!msg) return;

          // Append user message to chat
          appendMessage("user", msg);
          chatInput.value = "";

          // Prepare assistant response bubble with loading pulse
          const history = "";
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
                history,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            });

            if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
            }

            // Parse assistant response and update chat
            const data = await response.json();
            const aiMessage = data.output || data.text || "(No response)";
            const lastAiBubble = chatMessages.querySelector(".message.ai .message-bubble.pulse");

            // Replace pulsing bubble with final assistant text response
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
            const lastAiBubble = chatMessages.querySelector(".message.ai .message-bubble.pulse");
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
        clearChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          chatMessages.querySelectorAll(".message").forEach((msg, i) => {
            if (i > 0) {
              msg.remove();
            }
          });
        });
      }

      // Resize button: toggles chat panel size
      if (resizeChatButton) {
        resizeChatButton.addEventListener("click", (e) => {
          e.preventDefault();
          sendMessageToMainWindow("RESIZE_CHAT_PANEL");
        });
      }

      // Toggle visibility when clicking the mode button
      if (modeBtn && dropdown) {
        modeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          dropdown.classList.toggle("open");
        });

        // Close dropdown when clicking outside of it
        root.addEventListener("click", (e) => {
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove("open");
          }
        });
      }

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
              if (!root.contains(e.target)) {
                e.stopPropagation();
              }
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
