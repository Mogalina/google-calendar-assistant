function sendInputToBackground(textInput) {
    const message = {
        action: "GCA_PROCESS_INPUT", 
        data: textInput 
    };
    console.log("Content Script: Sending message:", message);
    chrome.runtime.sendMessage(message, (response) => {
        if (response && response.status === "received") {
            console.log("Content Script: Confirmation from Background.");
        }
    });
}
window.addEventListener('load', () => {
    if (window.self !== window.top) {
        return; 
    }
    console.log("Content Script fully loaded.");
    const testCommand = "Create an event tomorrow at 3 PM for the GCA meeting.";
    sendInputToBackground(testCommand);
});