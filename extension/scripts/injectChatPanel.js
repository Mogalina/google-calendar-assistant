/**
 * @fileoverview
 * Dynamically injects a chat panel user interface into the current webpage.
 * Runs as an immediately invoked function to prevent global namespace pollution.
 */

(async () => {
  // Prevents multiple injections of the chat panel on the same page load
  if (window.__assistantChatPanelInjected) {
    return;
  }
  window.__assistantChatPanelInjected = true;

  // Tracks the current height state of the panel
  let isFullHeight = true;
  
  // Reference to the main container div of the panel
  let panelHost = null;

  /**
   * Main Event Listener for Window Messages.
   * It listens for specific message types dispatched from other parts of the content script or the 
   * injected panel itself, and routes them to the appropriate handler functions.
   */
  window.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    
    // Ignore messages without a type identifier
    if (!type) {
      return;
    }

    switch (type) {
      // Triggered when the floating action button is clicked
      case "ASSISTANT_BUTTON_CLICK":
        showChatPanel();
        break;
      
      // Requests closing the panel
      case "CLOSE_CHAT_PANEL":
        closeChatPanel();
        break;
      
      // Requests toggling the panel height
      case "RESIZE_CHAT_PANEL":
        resizeChatPanel();
        break;
      
      // Request to save chat history
      case "SAVE_MESSAGES":
        saveMessages(payload);
        break;
      
      // Request to retrieve chat history
      case "LOAD_MESSAGES":
        loadMessages();
        break;
      
      // Request to wipe chat history
      case "CLEAR_MESSAGES":
        clearMessages();
        break;
      
      // Request an OAuth token
      case "GCA_REQUEST_ACCESS_TOKEN":
        getAccessToken();
        break;
      
      // Trigger the Google Sign-In flow
      case "GCA_START_AUTH":
        startAuth();
        break;
    }
  });

  /**
   * Sends a message to the background script to save the current conversation history.
   * 
   * @param {Array<Object>} messages - The array of message objects to persist.
   */
  async function saveMessages(messages) {
    chrome.runtime.sendMessage({ action: "SAVE_MESSAGES", payload: messages });
  }

  /**
   * Requests stored messages from the background script.
   * 
   * @returns {Promise<Array>} A promise that resolves with the messages array.
   */
  async function loadMessages() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "LOAD_MESSAGES" }, (response) => {
        if (response?.status === "success") {
          // Send the loaded messages back
          window.postMessage(
            {
              type: "LOADED_MESSAGES",
              payload: response.messages || [],
            },
            "*"
          );
          resolve(response.messages || []);
        } else {
          // Handle failure or empty state by sending an empty array
          window.postMessage(
            {
              type: "LOADED_MESSAGES",
              payload: [],
            },
            "*"
          );
          resolve([]);
        }
      });
    });
  }

  /**
   * Sends a command to the background script to clear all stored messages.
   */
  async function clearMessages() {
    chrome.runtime.sendMessage({ action: "CLEAR_MESSAGES" }, (response) => {
      if (response?.status === "success") {
        console.log("Messages cleared successfully");
      } else {
        console.error("Failed to clear messages:", response?.message);
      }
    });
  }

  /**
   * Bridges the request for an Access Token.
   * It asks the background script for a token, then forwards the response
   * back to the window so panel.js can use it.
   */
  async function getAccessToken() {
    chrome.runtime.sendMessage({ action: "GET_GCA_ACCESS_TOKEN" }, (response) => {
      window.postMessage({ type: "GCA_ACCESS_TOKEN_RESPONSE", payload: response }, "*");
    });
  }

  /**
   * Triggers the OAuth flow via the background script.
   */
  async function startAuth() {
    chrome.runtime.sendMessage({ action: "START_GOOGLE_AUTH" });
  }

  /**
   * Creates and injects the chat panel host element and shadow root.
   * Loads assets from the extension package, ensuring valid paths.
   *
   * @returns {HTMLElement} The chat panel host element.
   */
  function createChatPanel() {
    if (panelHost) {
      return panelHost;
    }

    // Create host div and apply initial styles for positioning and layout
    panelHost = document.createElement("div");
    panelHost.id = "assistant-chat-panel";
    Object.assign(panelHost.style, {
      position: "fixed",
      top: "0",
      right: "0",
      width: "500px",
      height: "100%",
      zIndex: "999999",
      borderLeft: "1px solid #ccc",
      boxShadow: "0 0 12px rgba(0,0,0,0.2)",
      background: "#fff",
      transition:
        "transform 0.35s ease-out, opacity 0.35s ease-out, height 0.3s ease," +
        " top 0.3s ease, bottom 0.3s ease",
      display: "flex",
      overflow: "hidden",
    });

    isFullHeight = true;

    // Create a shadow root to encapsulate styles and structure.
    // This prevents page CSS from bleeding into the chat panel and vice-versa.
    const shadow = panelHost.attachShadow({ mode: "open" });
    panelHost._shadowRoot = shadow;
    document.body.appendChild(panelHost);

    // Hide assistant button while panel is open
    toggleAssistantButton(false);

    // Fetch the raw HTML template and inject it
    fetch(chrome.runtime.getURL("components/chat-panel/panel.html"))
      .then((r) => r.text())
      .then((html) => injectPanelHTML(html, shadow))
      .catch((err) => console.error("Failed to inject chat panel:", err));

    return panelHost;
  }

  /**
   * Injects HTML panel content into the Shadow DOM.
   *
   * @param {string} html - Raw HTML content of the panel.
   * @param {ShadowRoot} shadow - Shadow root of the panel.
   */
  async function injectPanelHTML(html, shadow) {
    const temp = document.createElement("div");
    temp.innerHTML = html.trim();

    // Update image sources to point to Chrome extension URLs
    temp.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src && !src.startsWith("chrome-extension://")) {
        const cleanSrc = src.replace(/^(\.\.\/)+/, "");
        img.src = chrome.runtime.getURL(cleanSrc);
      }
    });

    // Append processed HTML into shadow root
    shadow.appendChild(temp);
    shadow._contentRoot = temp.querySelector("html") || temp;

    // Manually append required CSS files
    [
      "components/chat-panel/global.css",
      "components/chat-panel/panel.css",
    ].forEach((file) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL(file);
      shadow.appendChild(link);
    });

    // Assign a unique identifier for this panel instance
    panelHost.setAttribute("data-panel-id", Date.now().toString());
    
    shadow.aiAvatarUrl = chrome.runtime.getURL("assets/images/gemini-chat-bot-logo.png");

    // Inject the main panel logic script
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("scripts/panel.js");
    script.setAttribute("data-panel-id", panelHost.getAttribute("data-panel-id"));

    script.onload = () => console.log("Panel script loaded successfully");
    script.onerror = (err) => console.error("Failed to load panel script:", err);

    shadow.appendChild(script);
  }

  /**
   * Shows the chat panel and resets it to full height.
   * Ensures the display properties and transforms are set to visible states.
   */
  function showChatPanel() {
    createChatPanel();

    if (!panelHost) {
      return;
    }

    panelHost.style.display = "flex";
    Object.assign(panelHost.style, {
      transform: "translateY(0)",
      opacity: "1",
      height: "100%",
      top: "0",
      bottom: "auto",
    });

    // Ensure internal chat container fills viewport inside Shadow DOM
    const shadow = panelHost.shadowRoot || panelHost._shadowRoot;
    const chatContainer = shadow?.querySelector(".chat-container");
    if (chatContainer) chatContainer.style.height = "100vh";

    isFullHeight = true;

    // Hide the trigger button when the panel is active
    toggleAssistantButton(false);
  }

  /**
   * Closes the chat panel and restores the assistant button.
   */
  function closeChatPanel() {
    if (!panelHost) {
      return;
    }

    panelHost.style.display = "none";
    panelHost.style.transform = "translateY(100%)";
    panelHost.style.opacity = "0";

    // Bring back the floating trigger button
    toggleAssistantButton(true);
    isFullHeight = true;
  }

  /**
   * Toggles panel height between full screen and half screen.
   */
  function resizeChatPanel() {
    if (!panelHost) {
      return;
    }

    const shadow = panelHost.shadowRoot || panelHost._shadowRoot;
    if (!shadow) {
      return;
    }

    const chatContainer = shadow.querySelector(".chat-container");

    if (isFullHeight) {
      // Shrink to bottom half
      panelHost.style.height = "50vh";
      chatContainer && (chatContainer.style.height = "50vh");
      panelHost.style.top = "auto";
      panelHost.style.bottom = "0";
      isFullHeight = false;
    } else {
      // Expand to full height
      panelHost.style.height = "100%";
      chatContainer && (chatContainer.style.height = "100vh");
      panelHost.style.top = "0";
      panelHost.style.bottom = "auto";
      isFullHeight = true;
    }
  }

  /**
   * Sends a message to toggle the assistant button visibility.
   * Used to coordinate between the chat panel state and the floating button state.
   * 
   * * @param {boolean} show - True to show the button, false to hide the button.
   */
  function toggleAssistantButton(show) {
    window.postMessage({ type: "TOGGLE_ASSISTANT_BUTTON", show }, "*");
  }
})();
