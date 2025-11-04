// Grab DOM elements for chat input and send button
const chatInput = document.getElementById("chat-input");
const chatForm = document.getElementById("chat-form");
const sendButton = document.getElementById("send-button");

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
const chatMessages = document.getElementById("chat-messages");
const tooltipText = document.getElementById("tooltip-text");

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
    actionIcon.src = "./assets/images/arrow-up-icon.png";
    tooltipText.textContent = "Send";
    actionIcon.classList.remove("mic");
    actionIcon.classList.add("send");
  } else if (!hasText && isSendMode) {
    // Switch back to mic mode
    isSendMode = false;
    actionIcon.src = "./assets/images/microphone-icon.png";
    tooltipText.textContent = "Dictate";
    actionIcon.classList.remove("send");
    actionIcon.classList.add("mic");
  }
});
