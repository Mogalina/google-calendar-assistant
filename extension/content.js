
function sendInputToBackground(textInput) {
    
    const message = {
        action: "GCA_PROCESS_INPUT", 
        data: textInput 
    };

    console.log("Content Script: Trimit mesajul:", message);

    chrome.runtime.sendMessage(message, (response) => {
        // confirmarea (Task GCA-71)
        if (response && response.status === "received") {
            console.log("Content Script: Confirmare primita de la Background.");
        }
    });
}

// Simulam detectarea inputului la incarcarea initiala a paginii
window.addEventListener('load', () => {
    // De fapt vom atasa functia sendInputToBackground la un eveniment (click pe buton, input, etc.)

    //trebuie sa rulam doar in frame ul principal nu in iframe daca exista
    if (window.self !== window.top) {
        return; 
    }

    console.log("Content Script s-a incarcat complet.");
    
    // Test: comanda basic in engleza
    const testCommand = "Create an event tomorrow at 3 PM for the GCA-58 check-in meeting.";
    sendInputToBackground(testCommand);
});