(() => {
  // Initializes the Google Calendar Assistant floating action button
  function initAssistantButton() {
    if (window.__assistantButtonInjected) {
      // Prevent multiple injections per page
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

    // Create host and attach shadow document object model to isolate styles
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    // Load external styles
    const stylesheetPaths = [
      "components/assistant-button/assistantActionButton.css",
    ];
    stylesheetPaths.forEach((path) =>
      shadowRoot.appendChild(createStylesheet(path))
    );

    // Create the floating assistant button wrapper
    const assistantButtonWrapper = document.createElement("div");
    assistantButtonWrapper.className = "assistant-button-container";
    shadowRoot.appendChild(assistantButtonWrapper);

    // Create the assistant action button
    const assistantButton = document.createElement("button");
    assistantButton.className = "assistant-button";
    assistantButton.setAttribute("aria-label", "Calendar Assistant");

    // Add the assistant icon inside the button
    const assistantIconImage = document.createElement("img");
    assistantIconImage.src = chrome.runtime.getURL("icons/icon-128.png");
    assistantIconImage.alt = "Assistant Icon";
    assistantIconImage.className = "assistant-icon";
    assistantButton.appendChild(assistantIconImage);

    assistantButtonWrapper.appendChild(assistantButton);

    // Variables to track dragging state
    let isMoving = false;
    let hasMoved = false;
    let startX, startY;
    let offsetX, offsetY;

    const MOVE_THRESHOLD = 5;

    // Store position as percentages for responsive behavior
    let positionPercentX = null;
    let positionPercentY = null;

    /**
     * Update button position based on stored percentages.
     */
    const updatePositionFromPercentages = () => {
      if (positionPercentX !== null && positionPercentY !== null) {
        const rect = assistantButtonWrapper.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        const newLeft = Math.max(0, Math.min(positionPercentX * window.innerWidth, maxX));
        const newTop = Math.max(0, Math.min(positionPercentY * window.innerHeight, maxY));

        assistantButtonWrapper.style.left = `${newLeft}px`;
        assistantButtonWrapper.style.top = `${newTop}px`;
        assistantButtonWrapper.style.bottom = "unset";
        assistantButtonWrapper.style.right = "unset";
      }
    };

    window.addEventListener("resize", updatePositionFromPercentages);

    /**
     * Handles the 'pointerdown' event to initiate a drag.
     * @param {PointerEvent} e - The pointer event object.
     */
    const onPointerDown = (e) => {
      if (e.button !== 0) {
        return;
      }

      isMoving = false;
      hasMoved = false;

      startX = e.clientX;
      startY = e.clientY;

      const rect = assistantButtonWrapper.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      assistantButtonWrapper.style.bottom = "unset";
      assistantButtonWrapper.style.right = "unset";

      assistantButtonWrapper.style.left = `${rect.left}px`;
      assistantButtonWrapper.style.top = `${rect.top}px`;

      assistantButtonWrapper.style.cursor = "grabbing";
      assistantButtonWrapper.style.userSelect = "none";

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    };

    /**
     * Handles the 'pointermove' event to update the element's position while dragging.
     * @param {PointerEvent} e - The pointer event object.
     */
    const onPointerMove = (e) => {
      e.preventDefault();

      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);

      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        isMoving = true;
        hasMoved = true;
      }

      if (hasMoved) {
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        const rect = assistantButtonWrapper.getBoundingClientRect();
        newLeft = Math.max(0,Math.min(newLeft, window.innerWidth - rect.width));
        newTop = Math.max(0,Math.min(newTop, window.innerHeight - rect.height));

        assistantButtonWrapper.style.left = `${newLeft}px`;
        assistantButtonWrapper.style.top = `${newTop}px`;

        positionPercentX = newLeft / window.innerWidth;
        positionPercentY = newTop / window.innerHeight;
      }
    };

    // Handles the 'pointerup' event to stop the drag and clean up listeners
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);

      assistantButtonWrapper.style.cursor = "grab";
      assistantButtonWrapper.style.userSelect = "unset";

      if (hasMoved) {
        const rect = assistantButtonWrapper.getBoundingClientRect();
        positionPercentX = rect.left / window.innerWidth;
        positionPercentY = rect.top / window.innerHeight;
      }

      setTimeout(() => {
        isMoving = false;
      }, 0);
    };

    assistantButtonWrapper.addEventListener("pointerdown", onPointerDown);
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

    // Handles assistant button click events
    function handleButtonClick() {
      if (isMoving) {
        return;
      }
      const eventName = "AssistantButton:click";
      window.dispatchEvent(new CustomEvent(eventName));
      window.postMessage({ type: "ASSISTANT_BUTTON_CLICK" }, "*");
    }
  }

  initAssistantButton();
})();
