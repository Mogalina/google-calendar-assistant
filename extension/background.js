import { BASE_URL, API_VERSION, PROCESS_COMMAND_PATH } from './apiConfig.js';
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    // Validate the request structure
    if (!request || !request.action) {
      console.warn("Background script: Invalid message received:", request);
      sendResponse({
        status: "error",
        message: "Invalid or missing 'action' field in request.",
      });
      return;
    }

    // Handle specific action types
    if (request.action === "GCA_PROCESS_INPUT") {
      console.log("Background script: Message received from:", sender?.tab?.url || "unknown source");
      console.log("Background script: Data received:", request.data);
      

      const API_ENDPOINT = BASE_URL+API_VERSION+PROCESS_COMMAND_PATH
      const payload = {command: request.data};
      fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      })
      .then(response => response.json())//request.data could contain: status,calendarEvent,eventId
      .then(data => {
          console.log('Background Script: Answer from Backend:', data);
          sendResponse({ 
              status: "processed", 
              result: data.calendarEvent || "N/A"
          });
      })
      return true; 
    }

    // Handle unknown actions
    console.warn("Background script: Unknown action:", request.action);
    sendResponse({
      status: "error",
      message: `Unknown action: ${request.action}`,
    });

  } catch (error) {
    console.error("Background script: Error processing message:", error);
    sendResponse({
      status: "error",
      message: "An unexpected error occurred in the background script.",
    });
  }

  // Return false for synchronous handling
  return false;
});
