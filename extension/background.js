
// Asculta mesajele trimise de Content Scripts

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        
        // Verificam actiunea noastra
        if (request.action === "GCA_PROCESS_INPUT") {
            
            console.log("Background Script: Mesaj primit din tab-ul:", sender.tab.url);
            console.log("Background Script: Datele primite:", request.data);
            
            // Logica GCA-71: De adaugat apelul catre API-ul Node.js din backend
            // Momentan doar log in si trimitere confirmare
            
            // Trimitem raspunsul inapoi catre Content Script
            sendResponse({ 
                status: "received", 
                message: "Mesaj primit si in curs de procesare." 
            });
            
            // Returnam true pentru a pastra portul deschis pentru sendResponse asincron
            return true; 
        }
    }
);