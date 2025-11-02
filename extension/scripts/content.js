/**
 * Sends user input to the background script for processing.
 * @param {string} textInput - The user input text to be processed.
 */
function sendInputToBackground(textInput) {
  try {
    // Validate input before sending
    if (!textInput || typeof textInput !== "string") {
      console.warn("Content script: Invalid text input:", textInput);
      return;
    }

    const message = {
      action: "GCA_PROCESS_INPUT", 
      data: textInput 
    };
    console.log("Content script: Sending message to background:", message);

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        // Handle case where background script is unavailable
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

/**
 * Runs once the content script is fully loaded.
 * Ensures script executes only in the top frame, not inside iframes.
 */
window.addEventListener("load", () => {
  try {
    // Prevent running inside iframes
    if (window.self !== window.top) {
      return; 
    }

    console.log("Content script: Script fully loaded.");
    
    const testCommand = "Create an event tomorrow at 3 PM for the GCA meeting.";
    sendInputToBackground(testCommand);
    
  } catch (error) {
    console.error("Content script: Error during load event handling:", error);
  }
});
