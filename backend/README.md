# Google Calendar Assistant - Backend

The backend service for the Google Calendar Assistant, built with **Node.js** and **Express**. This server acts as the secure orchestration layer between the Chrome Extension client, Google's Gemini AI, and the Google Calendar API.

## Features

- **OAuth 2.0 Management**: Handles secure token exchange and authentication flows for Google APIs.

- **AI Integration**: Interfaces with Google Gemini (via `@google/genai`) to process natural language requests.

- **Calendar Orchestration**: Manages complex calendar operations including Shadow Sessions, event cloning, and conflict detection.

- **API Proxy**: Provides secure endpoints for the extension to communicate with external services.

## Prerequisites

- **Node.js**: Version 20.0.0 or higher.

- **Google Cloud Project**: You need a project with the **Google Calendar API** and **Generative Language API** enabled.

- **API Keys**: A valid Gemini API key and OAuth 2.0 credentials (Client ID & Secret).

## Installation

1. Navigate to the backend directory:

    ```bash
    cd backend
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

## Configuration

Create a `.env` file in the root of the `backend` directory (copy from `.env.example` if available) and add the following variables:

```env
# Server Configuration
PORT=5000

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

# Auth Redirect URI (Must match Google Cloud Console settings)
REDIRECT_URI=http://localhost:8080/api/auth/callback
```

## Running the Server

### Development Mode

Runs the server with `nodemon` for hot-reloading:

  ```bash
  npm run dev
  ```

### Production Mode

```bash
npm start
```

### Docker

You can also run the backend using Docker Compose:

  ```bash
  # For development
  docker-compose -f docker-compose.dev.yml up --build

  # For production
  docker-compose -f docker-compose.prod.yml up --build
  ```

## API Endpoints

- **POST** `/api/gemini`: Main endpoint for processing user chat messages.

- **GET** `/api/auth/authorize`: Initiates the Google OAuth flow.

- **GET** `/api/auth/callback`: Handles the OAuth callback code exchange.

- **POST** `/api/events/*`: Direct access to calendar operations (internal use).

## Testing

Run the test suite using Jest:

  ```bash
  npm test
  ```
