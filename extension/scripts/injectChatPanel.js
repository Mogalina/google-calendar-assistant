(() => {
  if (window.__assistantChatPanelInjected) return;
  window.__assistantChatPanelInjected = true;

  window.addEventListener("message", (event) => {
    if (event.data.type === "ASSISTANT_BUTTON_CLICK") {
      toggleChatPanel();
    }
  });

  function toggleChatPanel() {
    const existingPanel = document.querySelector("#assistant-chat-panel");
    if (existingPanel) return existingPanel.remove();

    const panelHost = document.createElement("div");
    panelHost.id = "assistant-chat-panel";
    panelHost.style.position = "fixed";
    panelHost.style.top = "0";
    panelHost.style.right = "0";
    panelHost.style.width = "500px";
    panelHost.style.height = "100%";
    panelHost.style.zIndex = "999999";
    panelHost.style.borderLeft = "1px solid #ccc";
    panelHost.style.boxShadow = "0 0 12px rgba(0,0,0,0.2)";
    panelHost.style.background = "#fff";

    const shadow = panelHost.attachShadow({ mode: "open" });
    document.body.appendChild(panelHost);

    // Load HTML
    fetch(chrome.runtime.getURL("chat-panel/index.html"))
      .then((r) => r.text())
      .then((html) => {
        shadow.innerHTML = html;

        const baseUrl = chrome.runtime.getURL("chat-panel/");
        const baseTag = `<base href="${baseUrl}">`;
        shadow.innerHTML = baseTag + html;

        // Fix CSS <link> tags to load from extension
        const cssFiles = [
          "chat-panel/style/index.css",
          "chat-panel/style/global.css",
        ];
        cssFiles.forEach((file) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = chrome.runtime.getURL(file);
          shadow.appendChild(link);
        });

        // Run your chat logic after HTML loads
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("chat-panel/script/app.js");
        shadow.appendChild(script);
      });
  }
})();