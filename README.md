# Google Calendar Assistant

## Project Overview

Google Calendar Assistant is a Chrome Extension designed to integrate a conversational AI interface directly into the Google Calendar web application. It utilizes Google's Gemini AI to interpret natural language requests, allowing users to manage their schedule through chat. The system supports complex reasoning, such as finding time slots, rescheduling conflicts, and managing events across timezones.

## Key Features

### Natural Language Interface

* **Conversational Interaction**: Users can type requests like "Schedule a meeting with the backend team next Tuesday at 2 PM" directly into a side panel overlay.
* **Contextual Awareness**: The AI understands relative time references (e.g., "tomorrow", "next week") and the user's current timezone.

### Calendar Management

* **CRUD Operations**: Full support for Creating, Reading, Updating, and Deleting calendar events.
* **Intelligent Search**: Users can search for events using semantic queries rather than just exact keywords.

### Smart Reschedule Mode (Shadow Sessions)

* **Safety Layer**: For complex changes, the system initiates a "Shadow Session." This creates a temporary calendar copy where the AI can propose multiple changes.
* **Simulation**: Changes are visualized on the shadow calendar first, preventing accidental corruption of the user's primary schedule.
* **Lineage Tracking**: The system tracks the relationship between the original events and the shadow events to ensure accurate final updates.

## Technology Stack

### Backend

* **Runtime**: Node.js (v20+)
* **Framework**: Express.js
* **AI Model**: Google Gemini (gemini-2.5-flash-lite)
* **APIs**: Google Calendar API (v3), Google GenAI SDK
* **Authentication**: OAuth 2.0
* **Containerization**: Docker Support

### Extension (Frontend)

* **Type**: Chrome Extension (Manifest V3)
* **Interaction**: Content Scripts injected into `calendar.google.com`
* **State Management**: Chrome Storage API
* **Communication**: Message Passing (Content Script to Background to Backend)

## Installation and Setup

### Prerequisites

1. Node.js (version 20 or higher)

2. Google Cloud Platform project with:
    * Google Calendar API enabled
    * Generative Language API (Gemini) enabled
    * OAuth 2.0 credentials configured

### Backend Setup

1. Navigate to the `backend` directory.

2. Install dependencies:

    ```bash
    npm install
    ```

3. Create a `.env` file in the `backend` folder with the following variables:

    ```env
    PORT=5000
    GEMINI_API_KEY=your_gemini_api_key
    GOOGLE_CLIENT_ID=your_oauth_client_id
    GOOGLE_CLIENT_SECRET=your_oauth_client_secret
    REDIRECT_URI=http://localhost:8080/api/auth/callback
    ```

4. Start the server:

    ```bash
    npm run dev
    ```

### Extension Setup

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" in the top right corner.
3. Click "Load unpacked".
4. Select the `extension` folder from the project directory.
5. Navigate to Google Calendar (calendar.google.com) to see the assistant interface.

## Contributors

* **Eric Moghioros** - Project Lead / DevOps Engineer
* **Andreea Bianca Croitoru** - Frontend Engineer
* **Bianca Pulpa** - Backend Engineer
* **Dragos Marinescu** - AI Engineer
* **Alexandra Cristina Puscas** - Frontend Engineer
* **Bogdan Rebeles** - Backend Engineer

## License

This project is licensed under the [MIT License](LICENSE).
