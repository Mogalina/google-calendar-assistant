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
  getEvent,
} from "./calendarService.js";

dotenv.config();

// Initializes the Gemini client
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
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
    model: "gemini-2.5-flash-lite",
    config: {
      systemInstruction: `You are an **Expert Google Calendar Optimization Assistant**. 
      Your sole purpose is to analyze the user's existing calendar events and their requests 
      to suggest the most efficient, conflict-free, and productive schedule changes.`,
      temperature: 0.7,
      maxOutputTokens: 800,
    },
  };
}

/**
 * Creates a new calendar event using the provided parameters.
 */
async function handleCreate(
  accessToken,
  params,
  userTimeZone,
  targetCalendarId
) {
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

  return await createEvent(accessToken, targetCalendarId, {
    summary: params.summary,
    start: params.start,
    end: params.end,
    description: params.description,
    location: params.location,
    attendees: params.attendees,
  });
}

/**
 * Lists upcoming events and appends a formatted list to the Gemini response.
 */
async function handleList(
  accessToken,
  params,
  geminiResponse,
  targetCalendarId
) {
  const calendarResult = await listEvents(accessToken, {
    calendarId: targetCalendarId,
    maxResults: params.maxResults || 10,
    start: params.start,
    end: params.end,
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult
      .map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        return `${i + 1}. ${event.summary} - ${new Date(
          start
        ).toLocaleString()} (ID: ${event.id})`;
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
async function handleSearch(
  accessToken,
  params,
  geminiResponse,
  targetCalendarId
) {
  if (!params.query) {
    throw new Error("Search query is required");
  }

  const calendarResult = await searchEvents(accessToken, params.query, {
    calendarId: targetCalendarId,
    maxResults: params.maxResults || 10,
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult
      .map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        return `${i + 1}. ${event.summary} - ${new Date(
          start
        ).toLocaleString()} (ID: ${event.id})`;
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
 * Fetches the current event first and merges with updates to preserve existing data.
 */
async function handleUpdate(
  accessToken,
  params,
  userTimeZone,
  targetCalendarId
) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for updates");
  }

  // Fetch the current event to preserve existing data
  const currentEvent = await getEvent(
    accessToken,
    params.eventId,
    targetCalendarId
  );

  // Merge updates with existing event data
  const updateData = {
    summary: params.summary ?? currentEvent.summary,
    start: params.start ?? currentEvent.start,
    end: params.end ?? currentEvent.end,
    description: params.description ?? currentEvent.description,
    location: params.location ?? currentEvent.location,
    attendees: params.attendees ?? currentEvent.attendees,
  };

  // Attach timezone to start and end if being updated and missing timezone
  if (
    params.start &&
    updateData.start?.dateTime &&
    !updateData.start.timeZone
  ) {
    updateData.start.timeZone = userTimeZone;
  }
  if (params.end && updateData.end?.dateTime && !updateData.end.timeZone) {
    updateData.end.timeZone = userTimeZone;
  }

  return await updateEvent(
    accessToken,
    params.eventId,
    targetCalendarId,
    updateData
  );
}

/**
 * Deletes an existing calendar event.
 */
async function handleDelete(accessToken, params, targetCalendarId) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for deletion");
  }

  return await deleteEvent(accessToken, params.eventId, targetCalendarId);
}

/**
 * Gathers calendar context by executing multiple search/list operations.
 * Returns formatted context string to be sent back to Gemini.
 */
async function handleGatherContext(accessToken, params, targetCalendarId) {
  const operations = params.operations || [];
  const contextResults = [];

  for (const op of operations) {
    try {
      if (op.type === "list") {
        const events = await listEvents(accessToken, {
          calendarId: targetCalendarId,
          maxResults: op.maxResults || 10,
          start: op.start,
          end: op.end,
        });

        if (events.length > 0) {
          const eventList = events
            .map((event) => {
              const start = event.start?.dateTime || event.start?.date;
              return `  - ${event.summary} at ${new Date(
                start
              ).toLocaleString()} (ID: ${event.id})`;
            })
            .join("\n");
          contextResults.push(
            `List results (${events.length} events):\n${eventList}`
          );
        } else {
          contextResults.push(
            "List results: No events found in the specified time range."
          );
        }
      } else if (op.type === "search") {
        const events = await searchEvents(accessToken, op.query, {
          calendarId: targetCalendarId,
          maxResults: op.maxResults || 10,
        });

        if (events.length > 0) {
          const eventList = events
            .map((event) => {
              const start = event.start?.dateTime || event.start?.date;
              return `  - ${event.summary} at ${new Date(
                start
              ).toLocaleString()} (ID: ${event.id})`;
            })
            .join("\n");
          contextResults.push(
            `Search results for "${op.query}" (${events.length} events):\n${eventList}`
          );
        } else {
          contextResults.push(
            `Search results for "${op.query}": No matching events found.`
          );
        }
      }
    } catch (error) {
      contextResults.push(`Error in ${op.type} operation: ${error.message}`);
    }
  }

  return contextResults.join("\n\n");
}

/**
 * Sends a message to Gemini, continuing a conversation based on the provided history.
 * Now supports two-phase execution for context gathering.
 *
 * @param {string} input - The new user prompt.
 * @param {Array<object>} history - The full conversation history sent by the client.
 * @param {string|null} accessToken - Optional OAuth2 access token for calendar operations.
 * @param {string} userTimeZone - The user's current timezone.
 * @param {string} targetCalendarId - The calendar id to operate on (shadow or primary).
 * @returns {Promise<{output: string, action?: string, calendarResult?: any}>}
 */
export async function continueChat(
  input,
  history = [],
  accessToken = null,
  userTimeZone = "UTC",
  targetCalendarId = "primary"
) {
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

  // Decide which calendar we actually operate on
  const effectiveCalendarId = targetCalendarId || "primary";

  console.log("[Gemini] Using calendar:", effectiveCalendarId);

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
      history: history,
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
      const cleanedText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "");
      geminiResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      // If parsing fails, treat as regular conversation
      console.warn(
        "Failed to parse Gemini response as JSON, treating as text:",
        text
      );
      return { output: text, action: "none" };
    }

    // Extract action and parameters
    const action = geminiResponse.action || "none";
    const params = geminiResponse.parameters || {};

    let calendarResult = null;

    // Handle context gathering specially - it needs a follow-up
    if (action === "gather_context") {
      const contextData = await handleGatherContext(
        accessToken,
        params,
        effectiveCalendarId
      );

      // Now make a second call to Gemini with the gathered context
      const followUpInput = `
        Based on the user's request: "${input}"
        
        Here is the calendar context you requested:
        ${contextData}
        
        Now, please provide the final action to take (create/update/delete/none) based on this context.
      `;

      const followUpResult = await chat.sendMessage({ message: followUpInput });
      const followUpText =
        followUpResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!followUpText) {
        throw new Error("Gemini returned empty response in follow-up");
      }

      // Parse the follow-up response
      const cleanedFollowUp = followUpText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "");
      const followUpResponse = JSON.parse(cleanedFollowUp);

      const finalAction = followUpResponse.action || "none";
      const finalParams = followUpResponse.parameters || {};

      // Execute the final action
      switch (finalAction) {
        case "create":
          calendarResult = await handleCreate(
            accessToken,
            finalParams,
            userTimeZone,
            effectiveCalendarId
          );
          break;
        case "update":
          calendarResult = await handleUpdate(
            accessToken,
            finalParams,
            userTimeZone,
            effectiveCalendarId
          );
          break;
        case "delete":
          calendarResult = await handleDelete(
            accessToken,
            finalParams,
            effectiveCalendarId
          );
          break;
        case "list":
          calendarResult = await handleList(
            accessToken,
            finalParams,
            followUpResponse,
            effectiveCalendarId
          );
          break;
        case "search":
          calendarResult = await handleSearch(
            accessToken,
            finalParams,
            followUpResponse,
            effectiveCalendarId
          );
          break;
        case "none":
        default:
          break;
      }

      return {
        output: followUpResponse.response,
        action: finalAction,
        calendarResult,
      };
    }

    // Execute single-phase actions as before
    switch (action) {
      case "create":
        console.log("[Gemini] Action=create on calendar:", effectiveCalendarId);
        calendarResult = await handleCreate(
          accessToken,
          params,
          userTimeZone,
          effectiveCalendarId
        );
        break;
      case "list":
        console.log("[Gemini] Action=list on calendar:", effectiveCalendarId);
        calendarResult = await handleList(
          accessToken,
          params,
          geminiResponse,
          effectiveCalendarId
        );
        break;
      case "search":
        console.log("[Gemini] Action=search on calendar:", effectiveCalendarId);
        calendarResult = await handleSearch(
          accessToken,
          params,
          geminiResponse,
          effectiveCalendarId
        );
        break;
      case "update":
        console.log("[Gemini] Action=update on calendar:", effectiveCalendarId);
        calendarResult = await handleUpdate(
          accessToken,
          params,
          userTimeZone,
          effectiveCalendarId
        );
        break;
      case "delete":
        console.log("[Gemini] Action=delete on calendar:", effectiveCalendarId);
        calendarResult = await handleDelete(
          accessToken,
          params,
          effectiveCalendarId
        );
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
