(() => {
  // Initializes the Google Calendar Assistant floating action button.
  function initAssistantButton() {
    if (window.__assistantButtonInjected) {
      // Prevent multiple injections per page.
      return;
    }
    window.__assistantButtonInjected = true;

    /**
     * Creates a <link> element for loading a stylesheet from the extension.
     * @param {string} href - Relative path to the stylesheet inside the extension.
     * @returns {HTMLLinkElement} - The created link element.
     */
    const createStylesheet = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL(href);
      return link;
    };

    // Create host and attach shadow document object model to isolate styles.
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    // Load external styles.
    const stylesheetPaths = [
      "components/assistant-button/assistantActionButton.css",
    ];
    stylesheetPaths.forEach((path) =>
      shadowRoot.appendChild(createStylesheet(path))
    );

    // Create the floating assistant button wrapper.
    const assistantButtonWrapper = document.createElement("div");
    assistantButtonWrapper.className = "assistant-button-container";
    shadowRoot.appendChild(assistantButtonWrapper);

    // Create the assistant action button.
    const assistantButton = document.createElement("button");
    assistantButton.className = "assistant-button";
    assistantButton.setAttribute("aria-label", "Calendar Assistant");

    // Add the assistant icon inside the button.
    const assistantIconImage = document.createElement("img");
    assistantIconImage.src = chrome.runtime.getURL("icons/icon-128.png");
    assistantIconImage.alt = "Assistant Icon";
    assistantIconImage.className = "assistant-icon";
    assistantButton.appendChild(assistantIconImage);

    assistantButtonWrapper.appendChild(assistantButton);
    assistantButton.addEventListener("click", handleButtonClick);

    // Listen for messages to toggle button visibility
    window.addEventListener("message", (event) => {
      if (event.data.type === "TOGGLE_ASSISTANT_BUTTON") {
        if (event.data.show) {
          assistantButtonWrapper.style.display = "";
        } else {
          assistantButtonWrapper.style.display = "none";
        }
      }
    });

    // Handles assistant button click events.
    function handleButtonClick() {
      const eventName = "AssistantButton:click";
      window.dispatchEvent(new CustomEvent(eventName));
      window.postMessage({ type: "ASSISTANT_BUTTON_CLICK" }, "*");
    }
  }

  initAssistantButton();
})();
