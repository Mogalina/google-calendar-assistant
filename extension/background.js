chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action === "GCA_PROCESS_INPUT") {
            console.log("Background Script: Message received from:", sender.tab.url);
            console.log("Background Script: Data received:", request.data);
            sendResponse({ 
                status: "received", 
                message: "Message received and is now being processed." 
            });
            return true; 
        }
    }
);