// Grab DOM elements for chat input and send button
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");

// Grab microphone button and its icon
const micButton = document.getElementById("mic-button");
const micIcon = micButton.querySelector(".mic-button-icon");

// Grab dropdown elements
const dropdown = document.getElementById("mode-dropdown");
const modeBtn = document.getElementById("mode-btn");
const menuButtons = dropdown.querySelectorAll(".dropdown-menu button");
const dropdownMenu = document.getElementById("drawer-menu");
const modeOptions = dropdownMenu.querySelectorAll("[data-mode]");

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

// Listen for input in the textarea
chatInput.addEventListener("input", () => {
  if (chatInput.value.trim().length > 0) {
    // Disable microphone button and change icon if there is text
    micButton.classList.add("disabled");
    micButton.disabled = true;
    micIcon.src = "./assests/images/microphone-off-icon.png";
  } else {
    // Re-enable microphone button and restore original icon if input is empty
    micButton.classList.remove("disabled");
    micButton.disabled = false;
    micIcon.src = "./assests/images/microphone-icon.png";
  }
});