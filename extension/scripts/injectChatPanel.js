/**
 * This script dynamically injects a chat panel UI into the current webpage.
 * It runs as an immediately invoked function to prevent global namespace pollution.
 */

(() => {
  if (window.__assistantChatPanelInjected) return;
  window.__assistantChatPanelInjected = true;

  let isFullHeight = true;
  let panelHost = null;

  /**
   * Handles messages from other parts of the extension or host page.
   */
  window.addEventListener("message", (event) => {
    const { type } = event.data || {};
    if (!type) return;

    console.log("Message received:", type);

    switch (type) {
      case "ASSISTANT_BUTTON_CLICK":
        toggleChatPanel();
        break;
      case "CLOSE_CHAT_PANEL":
        closeChatPanel();
        break;
      case "RESIZE_CHAT_PANEL":
        resizeChatPanel();
        break;
    }
  });

  /**
   * Creates and injects the chat panel host element and shadow root.
   * Loads HTML, CSS, and script assets from the extension package.
   * Ensures all resource URLs are resolved to valid chrome-extension:// paths.
   */
  function createChatPanel() {
    if (panelHost) return panelHost;

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
        "transform 0.35s ease-out, opacity 0.35s ease-out, height 0.3s ease, top 0.3s ease, bottom 0.3s ease",
      display: "flex",
      overflow: "hidden",
    });

    isFullHeight = true;

    const shadow = panelHost.attachShadow({ mode: "open" });
    panelHost._shadowRoot = shadow;
    document.body.appendChild(panelHost);
    toggleAssistantButton(false);

    fetch(chrome.runtime.getURL("components/chat-panel/panel.html"))
      .then((r) => r.text())
      .then((html) => {
        const temp = document.createElement("div");
        temp.innerHTML = html;

        temp.querySelectorAll("link[rel='stylesheet']").forEach((link) => {
          const href = link.getAttribute("href");
          if (href && !href.startsWith("chrome-extension://")) {
            link.href = chrome.runtime.getURL("components/chat-panel/" + href);
          }
        });

        temp.querySelectorAll("img").forEach((img) => {
          const src = img.getAttribute("src");
          if (src && !src.startsWith("chrome-extension://")) {
            const cleanSrc = src.replace(/^(\.\.\/)+/, "");
            img.src = chrome.runtime.getURL(cleanSrc);
          }
        });

        shadow.appendChild(temp);
        const innerRoot = temp.querySelector("html") || temp;
        shadow._contentRoot = innerRoot;

        const cssFiles = [
          "components/chat-panel/global.css",
          "components/chat-panel/panel.css",
        ];
        cssFiles.forEach((file) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = chrome.runtime.getURL(file);
          shadow.appendChild(link);
        });

        panelHost.setAttribute("data-panel-id", Date.now().toString());

        const aiAvatarPath = chrome.runtime.getURL(
          "assets/images/gemini-chat-bot-logo.png"
        );
        shadow.aiAvatarUrl = aiAvatarPath;

        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("scripts/panel.js");
        script.setAttribute(
          "data-panel-id",
          panelHost.getAttribute("data-panel-id")
        );
        panelHost._shadowRoot = shadow;

        script.onload = () => {
          console.log("Panel script loaded successfully");
        };
        script.onerror = (err) => {
          console.error("Failed to load panel script:", err);
        };

        shadow.appendChild(script);

        return panelHost;
      })
      .catch((err) => console.error("Failed to inject chat panel:", err));
  }

  /**
   * Toggles the chat panel’s visibility.
   * Creates the panel on first use, then alternates between showing and hiding.
   */
  async function toggleChatPanel() {
    const panel = await createChatPanel();
    if (panel.style.display === "none") {
      showChatPanel();
    } else {
      hideChatPanel();
    }
  }

  /**
   * Displays the chat panel and resets it to full height.
   * Ensures chat container fills the viewport height.
   */
  function showChatPanel() {
    if (!panelHost) return;

    panelHost.style.display = "flex";
    Object.assign(panelHost.style, {
      transform: "translateY(0)",
      opacity: "1",
      height: "100%",
      top: "0",
      bottom: "auto",
    });

    const shadow = panelHost.shadowRoot || panelHost._shadowRoot;
    if (shadow) {
      const chatContainer = shadow.querySelector(".chat-container");
      if (chatContainer) chatContainer.style.height = "100vh";
    }

    isFullHeight = true;
    toggleAssistantButton(false);
    console.log("Chat panel shown ✅");
  }

  /**
   * Closes the chat panel, hides it from view, and restores the assistant button.
   * Resets height state to full height for the next opening.
   */
  function closeChatPanel() {
    if (!panelHost) return;
    console.log("Closing panel...");
    panelHost.style.display = "none";
    panelHost.style.transform = "translateY(100%)";
    panelHost.style.opacity = "0";
    panelHost.style.display = "none";
    toggleAssistantButton(true);
    isFullHeight = true;
    console.log("Panel closed successfully");
  }

  /**
   * Toggles panel height between full and half screen.
   * Adjusts both the container and internal chat layout accordingly.
   */
  function resizeChatPanel() {
    if (!panelHost) return;

    const shadow = panelHost.shadowRoot || panelHost._shadowRoot;
    if (!shadow) return;

    const chatContainer = shadow.querySelector(".chat-container");

    if (isFullHeight) {
      panelHost.style.height = "50vh";
      if (chatContainer) {
        chatContainer.style.height = "50vh";
      }
      panelHost.style.top = "auto";
      panelHost.style.bottom = "0";
      isFullHeight = false;
    } else {
      panelHost.style.height = "100%";
      if (chatContainer) {
        chatContainer.style.height = "100vh";
      }
      panelHost.style.top = "0";
      panelHost.style.bottom = "auto";
      isFullHeight = true;
    }
  }

  /**
   * Sends a message to toggle the assistant button visibility.
   * When the panel is open, the button is hidden; when closed, it reappears.
   */
  function toggleAssistantButton(show) {
    window.postMessage(
      {
        type: "TOGGLE_ASSISTANT_BUTTON",
        show: show,
      },
      "*"
    );
  }
})();
