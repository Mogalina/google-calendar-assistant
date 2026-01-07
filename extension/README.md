# Google Calendar Assistant - Chrome Extension

The frontend interface for the Google Calendar Assistant. This extension injects a conversational AI sidebar directly into the Google Calendar web interface (`calendar.google.com`), allowing users to manage their schedule using natural language.

## Features

- **In-Page Integration**: Adds a non-intrusive "Smart Assistant" button and chat panel to the Google Calendar UI.

- **Interactive Chat**: Sends user queries to the backend and displays AI responses.

- **Context Aware**: Automatically captures the user's focus (e.g., specific dates) to provide relevant context to the AI.

- **Shadow Session Visualizer**: Automatically reloads and redirects the view when the AI creates a "Shadow Calendar" for safe rescheduling.

## Project Structure

- **`manifest.json`**: V3 Manifest configuration defining permissions and resources.

- **`background.js`**: Service worker handling OAuth token storage and cross-origin communication.

- **`scripts/content.js`**: The bridge script that mediates between the injected UI and the background worker.

- **`components/`**:

  - `chat-panel/`: Contains the HTML, CSS, and JS for the chat interface.

  - `assistant-button/`: Logic for the floating launch button.

## Installation

Since this is a developer build, it must be loaded as an "unpacked" extension.

1. **Build the Project**: Ensure you have the source code downloaded. No build step is required for the vanilla JS implementation.

2. **Open Chrome Extensions**: Navigate to `chrome://extensions/` in your browser.

3. **Enable Developer Mode**: Toggle the switch in the top-right corner.

4. **Load Unpacked**:

    - Click the **Load unpacked** button.

    - Select the **`extension`** folder from this project.

5. **Verify**: You should see "Google Calendar Assistant" in your list of extensions.

## Usage

1. Ensure the **Backend** server is running (default: `http://localhost:5000`).

2. Open [Google Calendar](https://calendar.google.com).

3. Click the **Assistant Button** (brain icon) in the bottom right or sidebar.

4. **First Run**: Click "Sign in with Google" in the chat panel to authorize the application.

5. Start chatting! (e.g., *"Clear my schedule for Friday afternoon"*).

## Permissions

This extension requires the following permissions (defined in `manifest.json`):

- `storage`: To securely store OAuth access tokens locally.

- `activeTab` / `scripting`: To inject the chat interface into the active Google Calendar tab.

- `host_permissions`:

  - `*://calendar.google.com/*`: To operate on the calendar page.

  - `http://localhost:5000/*`: To communicate with the local backend server.
