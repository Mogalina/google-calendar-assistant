// background.js

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        
        if (request.action === "GCA_PROCESS_INPUT") {
            
            //Logica GCA-71: Definim URL-ul catre API-ul Node.js
            // Folosim http://localhost:8080 pentru a testa in mediul de dezvoltare
            const API_ENDPOINT = 'http://localhost:8080/api/v1/process-command'; 
            
            // Definim datele pe care le trimitem catre backend
            const payload = {
                command: request.data // textul primit de la content script
            };

            // Facem apelul asincron catre Backend API
            fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(response => response.json())
            .then(data => {
                console.log('Background Script: Raspuns de la Backend:', data);
                // 3. Trimitem rezultatul de la backend inapoi catre Content Script
                sendResponse({ 
                    status: "processed", 
                    result: data.calendarEvent || "N/A"
                });
            })
            .catch(error => {
                console.error('Background Script: Eroare la apelul Backend:', error);
                sendResponse({ 
                    status: "error", 
                    message: "A apărut o eroare la procesarea comenzii." 
                });
            });
            
            return true; 
        }
    }
);