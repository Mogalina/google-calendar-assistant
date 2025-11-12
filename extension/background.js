chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
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
      console.log(
        "Background script: Message received from:",
        sender?.tab?.url || "unknown source"
      );
      console.log("Background script: Data received:", request.data);
      sendResponse({
        status: "received",
        message: "Message received and is now being processed.",
      });
      return true;
    }

    if (request.action === "SAVE_MESSAGES") {
      await chrome.storage.session.set({ chatMessages: request.payload });
      sendResponse({
        status: "success",
        message: "Messages saved in extension session storage.",
      });
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
