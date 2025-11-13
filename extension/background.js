chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Validate the request structure
  if (!request || !request.action) {
    console.warn("Background script: Invalid message received:", request);
    sendResponse({
      status: "error",
      message: "Invalid or missing 'action' field in request.",
    });
    return false;
  }

  // Handle specific action types
  if (request.action === "GCA_PROCESS_INPUT") {
    console.log(
      "Background script: Message received from:",
      sender?.tab?.url || "unknown source"
    );
    console.log("Background script: Data received:", request.data);
    sendResponse({
      status: "received",
      message: "Message received and is now being processed.",
    });
    return false;
  }

  if (request.action === "SAVE_MESSAGES") {
    chrome.storage.session
      .set({ chatMessages: request.payload })
      .then(() => {
        sendResponse({
          status: "success",
          message: "Messages saved in extension session storage.",
        });
      })
      .catch((error) => {
        console.error("Error saving messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to save messages.",
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "LOAD_MESSAGES") {
    chrome.storage.session
      .get("chatMessages")
      .then((stored) => {
        sendResponse({
          status: "success",
          messages: stored.chatMessages || [],
        });
      })
      .catch((error) => {
        console.error("Error loading messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to load messages.",
          messages: [],
        });
      });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "CLEAR_MESSAGES") {
    chrome.storage.session
      .remove("chatMessages")
      .then(() => {
        console.log("Chat messages cleared from session storage");
        sendResponse({
          status: "success",
          message: "Messages cleared from extension session storage.",
        });
      })
      .catch((error) => {
        console.error("Error clearing messages:", error);
        sendResponse({
          status: "error",
          message: "Failed to clear messages.",
        });
      });
    return true; // Keep the message channel open for async response
  }

  // Handle unknown actions
  console.warn("Background script: Unknown action:", request.action);
  sendResponse({
    status: "error",
    message: `Unknown action: ${request.action}`,
  });

  return false;
});
