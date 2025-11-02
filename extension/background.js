import { BASE_URL, API_VERSION, PROCESS_COMMAND_PATH } from './apiConfig.js';
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {        
        if (request.action === "GCA_PROCESS_INPUT") {
            const API_ENDPOINT = BASE_URL+API_VERSION+PROCESS_COMMAND_PATH
            const payload = {
                command: request.data 
            };
            fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(response => response.json())
            .then(data => {
                console.log('Background Script: Answer from Backend:', data);
                sendResponse({ 
                    status: "processed", 
                    result: data.calendarEvent || "N/A"
                });
            })
            .catch(error => {
                console.error('Background Script: Erorr when calling Backend:', error);
                sendResponse({ 
                    status: "error", 
                    message: "An error occurred when processing the command" 
                });
            });
            return true; 
        }
    }
);