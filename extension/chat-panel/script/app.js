// Grab DOM elements for chat input and send button
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");

// Grab elements for chat messages
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");

// Grab microphone button and its icon
const micButton = document.getElementById("mic-button");

// Grab dropdown elements
const dropdown = document.getElementById("mode-dropdown");
const modeBtn = document.getElementById("mode-btn");
const menuButtons = dropdown.querySelectorAll(".dropdown-menu button");
const dropdownMenu = document.getElementById("drawer-menu");
const modeOptions = dropdownMenu.querySelectorAll("[data-mode]");

const actionButton = document.getElementById("action-button");
const actionIcon = document.getElementById("action-icon");
const tooltipText = document.getElementById("tooltip-text");

// Set initial time in the chat
document.getElementById("initial-time").textContent = new Date().toLocaleTimeString();

// Listen for the form submission event
chatForm.addEventListener("submit", (e) => {
  e.preventDefault(); 

  const message = chatInput.value.trim(); 
  if (!message) return;

  appendMessage("user", message); 
  chatInput.value = ""; 

  // Reset action button to mic
  isSendMode = false;
  actionIcon.src = chrome.runtime.getURL("./assets/images/microphone-icon.png");
  tooltipText.textContent = "Dictate";
  actionIcon.classList.remove("send");
  actionIcon.classList.add("mic");

  // Simulate an AI response after a short delay (demo behavior)
  setTimeout(() => appendMessage("ai", "Got it! (demo response)"), 800);
});

// Function to append a new chat message to the message list
function appendMessage(sender, text) {
  const msg = document.createElement("div"); 
  msg.classList.add("message", sender);

  // Set the message’s HTML structure dynamically
  msg.innerHTML = `
    <div class="avatar ${sender}">
      ${
        sender === "ai"
          ? `<img class="chat-icon" src="./assets/images/gemini-chat-bot-logo.png"/>`
          : `` 
      }
    </div>
    <div class="message-content">
      <div class="message-bubble">${text}</div> <!-- The message text -->
      <div class="message-time">${new Date().toLocaleTimeString()}</div> <!-- Timestamp -->
    </div>`;

  // Add the new message to the chat container
  chatMessages.appendChild(msg);

  // Scroll to the bottom so the latest message is visible
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle dropdown open/close when clicking the button
modeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

// Close dropdown when clicking outside of it
window.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

// Handle selecting an option inside dropdown
modeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const selectedMode = option.dataset.mode;
    console.log("Selected mode:", selectedMode);
    dropdown.classList.remove("open");
  });
});

let isSendMode = false;

// Detect input changes
chatInput.addEventListener("input", () => {
  const hasText = chatInput.value.trim().length > 0;

  if (hasText && !isSendMode) {
    // Switch to send mode
    isSendMode = true;
    actionIcon.src = chrome.runtime.getURL("./assets/images/arrow-up-icon.png");
    // actionIcon.src = "./assets/images/arrow-up-icon.png";
    tooltipText.textContent = "Send";
    actionIcon.classList.remove("mic");
    actionIcon.classList.add("send");
  } else if (!hasText && isSendMode) {
    // Switch back to mic mode
    isSendMode = false;
    // actionIcon.src = "./assets/images/microphone-icon.png";
    actionIcon.src = chrome.runtime.getURL("./assets/images/microphone-icon.png");
    tooltipText.textContent = "Dictate";
    actionIcon.classList.remove("send");
    actionIcon.classList.add("mic");
  }
});



//  "chat-panel/style/index.css",
//  "chat-panel/style/global.css"
// "chat-panel/script/app.js"