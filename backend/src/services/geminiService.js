import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import yaml from "js-yaml";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  searchEvents,
} from "./calendarService.js";

dotenv.config();

// Initializes the Gemini client
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Hold the model configuration loaded from file
let geminiConfig;

// Attempt to read and parse the external Gemini configuration file
try {
  const configFile = fs.readFileSync("src/config/gemini.yaml", "utf8");
  geminiConfig = yaml.load(configFile);

} catch (e) {
  console.error("Failed to load or parse `gemini.yaml` file:", e);

  // Set a fallback configuration if file reading fails
  geminiConfig = {
    model: "gemini-2.5-flash",
    config: { 
      systemInstruction: `You are an **Expert Google Calendar Optimization Assistant**. 
      Your sole purpose is to analyze the user's existing calendar events and their requests 
      to suggest the most efficient, conflict-free, and productive schedule changes.`,
      temperature: 0.7,
      maxOutputTokens: 600
    }
  };
}

/**
 * Creates a new calendar event using the provided parameters.
 */
async function handleCreate(accessToken, params, userTimeZone) {
  // Fallback for missing summary
  if (!params.summary || params.summary.trim() === "") {
    params.summary = "Untitled Event";
  }

  // Attach timezone to start and end if not present
  if (params.start?.dateTime && !params.start.timeZone) {
    params.start.timeZone = userTimeZone;
  }
  if (params.end?.dateTime && !params.end.timeZone) {
    params.end.timeZone = userTimeZone;
  }

  return await createEvent(
    accessToken,
    "primary",
    {
      summary: params.summary,
      start: params.start,
      end: params.end,
      description: params.description,
      location: params.location,
      attendees: params.attendees,
    }
  );
}

/**
 * Lists upcoming events and appends a formatted list to the Gemini response.
 */
async function handleList(accessToken, params, geminiResponse) {
  const calendarResult = await listEvents(accessToken, {
    maxResults: params.maxResults || 10
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult
      .map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()}`;
      })
      .join("\n");
    geminiResponse.response += `\n\n${eventList}`;

  } else {
    geminiResponse.response += "\n\nNo upcoming events found.";
  }

  return calendarResult;
}

/**
 * Searches events based on a query and appends results to the Gemini response.
 */
async function handleSearch(accessToken, params, geminiResponse) {
  if (!params.query) {
    throw new Error("Search query is required");
  }

  const calendarResult = await searchEvents(
    accessToken,
    params.query,
    {
      maxResults: params.maxResults || 10
    }
  );

  if (calendarResult?.length > 0) {
    const eventList = calendarResult
      .map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()} (ID: ${event.id})`;
      })
      .join("\n");
    geminiResponse.response += `\n\nFound ${calendarResult.length} events:\n${eventList}`;

  } else {
    geminiResponse.response += `\n\nNo events found matching "${params.query}".`;
  }

  return calendarResult;
}

/**
 * Updates an existing calendar event.
 */
async function handleUpdate(accessToken, params) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for updates");
  }

  return await updateEvent(
    accessToken,
    params.eventId,
    "primary",
    {
      summary: params.summary,
      start: params.start,
      end: params.end,
      description: params.description,
      location: params.location,
      attendees: params.attendees,
    }
  );
}

/**
 * Deletes an existing calendar event.
 */
async function handleDelete(accessToken, params) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for deletion");
  }

  return await deleteEvent(
    accessToken,
    params.eventId,
    "primary"
  );
}

/**
 * Sends a message to Gemini, continuing a conversation based on the provided history.
 * 
 * @param {string} input - The new user prompt.
 * @param {Array<object>} history - The full conversation history sent by the client.
 * @param {string|null} accessToken - Optional OAuth2 access token for calendar operations.
 * @param {string} userTimeZone - The user's current timezone.
 * @returns {Promise<{output: string, action?: string, calendarResult?: any}>} 
 */
export async function continueChat(input, history = [], accessToken = null, userTimeZone = "UTC") {
  // Require the `input` field to be present
  if (!input || typeof input !== "string") {
    throw new Error("Invalid user input for Gemini");
  }

  // Require access token for calendar operations
  if (!accessToken) {
    throw new Error(
      "Access token required. Gemini operates only under calendar context."
    );
  }

  try {
    // Add current date or time context for calendar operations
    const currentDateTime = new Date().toISOString();
    const contextualInput = `
      Current datetime: ${currentDateTime}
      User timezone: ${userTimeZone}
      User request: ${input}
    `;

    // Create a new, temporary chat session for this specific request
    const chat = client.chats.create({
      ...geminiConfig,
      // Pre-load the session with the history received from the client
      // This is what maintains the conversational context
      history: history 
    });

    // Send the new user message to the chat session
    const result = await chat.sendMessage({ message: contextualInput });
    
    // Extract text from Gemini response
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text === "") {
      console.log(JSON.stringify(result, null, 2));
      throw new Error("Gemini returned empty response");
    }

    // Parse Gemini JSON response and execute calendar actions
    let geminiResponse;
    try {
      // Remove markdown code blocks if present
      const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      geminiResponse = JSON.parse(cleanedText);

    } catch (parseError) {
      // If parsing fails, treat as regular conversation
      console.warn("Failed to parse Gemini response as JSON, treating as text:", text);
      return { output: text, action: "none" };
    }

    // Extract action and parameters
    const action = geminiResponse.action || "none";
    const params = geminiResponse.parameters || {};

    let calendarResult = null;
    
    // Execute the appropriate calendar action
    switch (action) {
      case "create":
        calendarResult = await handleCreate(accessToken, params, userTimeZone);
        break;
      case "list":
        calendarResult = await handleList(accessToken, params, geminiResponse);
        break;
      case "search":
        calendarResult = await handleSearch(accessToken, params, geminiResponse);
        break;
      case "update":
        calendarResult = await handleUpdate(accessToken, params);
        break;
      case "delete":
        calendarResult = await handleDelete(accessToken, params);
        break;
      case "none":
      default:
        break;
    }

    return {
      output: geminiResponse.response,
      action,
      calendarResult,
    };

  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to call Gemini API");
  }
}
