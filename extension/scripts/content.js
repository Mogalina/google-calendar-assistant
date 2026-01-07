/**
 * Sends user input to the background script for processing.
 * @param {string} textInput - The user input text to be processed.
 */
function sendInputToBackground(textInput) {
  try {
    if (!textInput || typeof textInput !== "string") {
      console.warn("Content script: Invalid text input:", textInput);
      return;
    }
    const message = { action: "GCA_PROCESS_INPUT", data: textInput };
    console.log("Content script: Sending message to background:", message);
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Content script: Message failed:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.status === "received") {
        console.log("Content script: Background confirmed receipt of message.");
      } else {
        console.warn("Content script: Unexpected response from background:", response);
      }
    });
  } catch (error) {
    console.error("Content script: Error sending message to background:", error);
  }
}

// Listener for messages from the chat panel (UI)
window.addEventListener("message", (event) => {
  // Security check: only accept messages from same window
  if (event.source !== window) return;

  if (event.data?.type === "GCA_CALENDAR_CREATED") {
    const { shadowCalendarId } = event.data.payload;
    console.log("Content script: Received GCA_CALENDAR_CREATED. Reloading to focus on:", shadowCalendarId);

    if (shadowCalendarId) {
      // Use the 'cid' parameter to focus Google Calendar on the specific shadow calendar
      const targetUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(shadowCalendarId)}`;
      window.location.href = targetUrl;
    }
  }

  // Handle switching back to primary calendar view
  if (event.data?.type === "GCA_SWITCH_CONTEXT_PRIMARY") {
    console.log("Content script: Switching back to primary calendar view.");
    window.location.href = "https://calendar.google.com/calendar/u/0/r";
  }
});

/**
 * Runs once the content script is fully loaded.
 */
window.addEventListener("load", () => {
  try {
    if (window.self !== window.top) return; 
    console.log("Content script: Script fully loaded.");
  } catch (error) {
    console.error("Content script: Error during load event handling:", error);
  }
});