/**
 * Dynamically injects a chat panel user interface into the current webpage.
 * Runs as an immediately invoked function to prevent global namespace pollution.
 */
(async () => {
  // Prevents multiple injections of the chat panel
  if (window.__assistantChatPanelInjected) {
    return;
  }
  window.__assistantChatPanelInjected = true;

  let isFullHeight = true;
  let panelHost = null;

  // Listen for messages from extension or host page
  window.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (!type) {
      return;
    }

    switch (type) {
      case "GET_CONFIG":
        useConfig();
        break;
      case "ASSISTANT_BUTTON_CLICK":
        toggleChatPanel();
        break;
      case "CLOSE_CHAT_PANEL":
        closeChatPanel();
        break;
      case "RESIZE_CHAT_PANEL":
        resizeChatPanel();
        break;
      case "SAVE_MESSAGES":
        saveMessages(payload);
        break;
      case "LOAD_MESSAGES":
        loadMessages();
        break;
      case "CLEAR_MESSAGES":
        clearMessages();
        break;
    }
  });

  async function saveMessages(messages) {
    chrome.runtime.sendMessage({ action: "SAVE_MESSAGES", payload: messages });
  }

  async function loadMessages() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "LOAD_MESSAGES" }, (response) => {
        if (response?.status === "success") {
          // Send the loaded messages back to panel.js
          window.postMessage(
            {
              type: "LOADED_MESSAGES",
              payload: response.messages || [],
            },
            "*"
          );
          resolve(response.messages || []);
        } else {
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

  async function clearMessages() {
    chrome.runtime.sendMessage({ action: "CLEAR_MESSAGES" }, (response) => {
      if (response?.status === "success") {
        console.log("Messages cleared successfully");
      } else {
        console.error("Failed to clear messages:", response?.message);
      }
    });
  }

  async function useConfig() {
    try {
      const configUrl = chrome.runtime.getURL(
        "components/chat-panel/config.json"
      );
      const config = await fetch(configUrl).then((r) => r.json());

      // Send it back to the page
      window.postMessage({ type: "CONFIG_DATA", data: config }, "*");
    } catch (err) {
      console.error("Failed to load CONFIG:", err);
    }
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

    // Create host div and apply initial styles
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

    // Create a shadow root to encapsulate styles and structure
    const shadow = panelHost.attachShadow({ mode: "open" });
    panelHost._shadowRoot = shadow;
    document.body.appendChild(panelHost);

    // Hide assistant button while panel is open
    toggleAssistantButton(false);

    // Fetch and inject panel
    fetch(chrome.runtime.getURL("components/chat-panel/panel.html"))
      .then((r) => r.text())
      .then((html) => injectPanelHTML(html, shadow))
      .catch((err) => console.error("Failed to inject chat panel:", err));

    return panelHost;
  }

  /**
   * Injects HTML panel content.
   *
   * @param {string} html - Raw HTML content of the panel.
   * @param {ShadowRoot} shadow - Shadow root of the panel.
   */
  async function injectPanelHTML(html, shadow) {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Update stylesheet links to point to Chrome extension URLs
    temp.querySelectorAll("link[rel='stylesheet']").forEach((link) => {
      const href = link.getAttribute("href");
      if (href && !href.startsWith("chrome-extension://")) {
        link.href = chrome.runtime.getURL("components/chat-panel/" + href);
      }
    });

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

    // Append required CSS files from extension
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
    shadow.aiAvatarUrl = chrome.runtime.getURL(
      "assets/images/gemini-chat-bot-logo.png"
    );

    // Load config from the extension
    const configUrl = chrome.runtime.getURL(
      "components/chat-panel/config.json"
    );
    const config = await fetch(configUrl).then((res) => res.json());

    shadow.host.CONFIG = config;

    // Inject panel script
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("scripts/panel.js");
    script.setAttribute(
      "data-panel-id",
      panelHost.getAttribute("data-panel-id")
    );

    script.onload = () => console.log("Panel script loaded successfully");
    script.onerror = (err) =>
      console.error("Failed to load panel script:", err);

    shadow.appendChild(script);
  }

  /**
   * Toggles the chat panel’s visibility.
   * Creates the panel on first use, then alternates showing and hiding.
   */
  async function toggleChatPanel() {
    const panel = createChatPanel();
    if (panel.style.display === "none") {
      showChatPanel();
    } else {
      hideChatPanel();
    }
  }

  /**
   * Shows the chat panel and resets it to full height.
   */
  function showChatPanel() {
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

    // Ensure internal chat container fills viewport
    const shadow = panelHost.shadowRoot || panelHost._shadowRoot;
    const chatContainer = shadow?.querySelector(".chat-container");
    if (chatContainer) chatContainer.style.height = "100vh";

    isFullHeight = true;
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
      panelHost.style.height = "50vh";
      chatContainer && (chatContainer.style.height = "50vh");
      panelHost.style.top = "auto";
      panelHost.style.bottom = "0";
      isFullHeight = false;
    } else {
      panelHost.style.height = "100%";
      chatContainer && (chatContainer.style.height = "100vh");
      panelHost.style.top = "0";
      panelHost.style.bottom = "auto";
      isFullHeight = true;
    }
  }

  /**
   * Sends a message to toggle the assistant button visibility.
   * @param {boolean} show - True to show the button, false to hide the button.
   */
  function toggleAssistantButton(show) {
    window.postMessage({ type: "TOGGLE_ASSISTANT_BUTTON", show }, "*");
  }
})();
