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
  initializeShadowSession
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
      systemInstruction:`You are an **Expert Google Calendar Optimization Assistant**. 
      Your sole purpose is to analyze the user's existing calendar events and their requests 
      to suggest the most efficient, conflict-free, and productive schedule changes.

      When asked to reschedule:
      - Infer 'start' and 'end' ISO times based on user prompt and current datetime.
      - If user says 'this week' and it is Wednesday, start from NOW, not Monday.
      - The interval MUST NOT exceed 7 days.
      - You MUST call init_shadow_session first with parameters {start, end} before proposing moves.
      Respond only with a single JSON object as described in the YAML config.`,
      temperature: 0.7,
      maxOutputTokens: 800,
    },
  };
}

async function applyProposedReschedule(accessToken, shadowCalendarId, moves = [], userTimeZone = "UTC") {
  if (!shadowCalendarId) {
    throw new Error("shadowCalendarId is required for applying reschedule moves.");
  }
  if (!Array.isArray(moves) || moves.length === 0) {
    return [];
  }

  const results = [];
  for (const move of moves) {
    try {
      if (!move.eventId || !move.newStart || !move.newEnd) {
        throw new Error("Each move must include eventId, newStart and newEnd.");
      }

      // Build update payload similar to handleUpdate
      const updateData = {
        start: { dateTime: move.newStart, timeZone: userTimeZone },
        end: { dateTime: move.newEnd, timeZone: userTimeZone },
      };

      const updated = await updateEvent(accessToken, move.eventId, shadowCalendarId, updateData);
      results.push({ eventId: move.eventId, updated });
    } catch (err) {
      results.push({ eventId: move?.eventId || null, error: err.message || String(err) });
    }
  }
  return results;
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

  return await createEvent(accessToken, "primary", {
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
async function handleList(accessToken, params, geminiResponse) {
  const calendarResult = await listEvents(accessToken, {
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
async function handleSearch(accessToken, params, geminiResponse) {
  if (!params.query) {
    throw new Error("Search query is required");
  }

  const calendarResult = await searchEvents(accessToken, params.query, {
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
async function handleUpdate(accessToken, params, userTimeZone) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for updates");
  }

  // Fetch the current event to preserve existing data
  const currentEvent = await getEvent(accessToken, params.eventId);

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

  return await updateEvent(accessToken, params.eventId, "primary", updateData);
}

/**
 * Deletes an existing calendar event.
 */
async function handleDelete(accessToken, params) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for deletion");
  }

  return await deleteEvent(accessToken, params.eventId, "primary");
}

/**
 * Gathers calendar context by executing multiple search/list operations.
 * Returns formatted context string to be sent back to Gemini.
 */
async function handleGatherContext(accessToken, params) {
  const operations = params.operations || [];
  const contextResults = [];

  for (const op of operations) {
    try {
      if (op.type === "list") {
        const events = await listEvents(accessToken, {
          maxResults: op.maxResults || 10,
          start: op.start,
          end: op.end,
        });

        if (events.length > 0) {
          const eventList = events
            .map((event, i) => {
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
          maxResults: op.maxResults || 10,
        });

        if (events.length > 0) {
          const eventList = events
            .map((event, i) => {
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
 * @returns {Promise<{output: string, action?: string, calendarResult?: any, needsFollowup?: boolean}>}
 */
export async function continueChat(
  input,
  history = [],
  accessToken = null,
  userTimeZone = "UTC"
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

    if (action === "init_shadow_session") {
      // Validate params.start / params.end
      const { start, end } = params;
      if (!start || !end) {
        throw new Error("init_shadow_session requires 'start' and 'end' parameters.");
      }

      // Create shadow session using calendar service
      const shadowResult = await initializeShadowSession(accessToken, start, end);

      // Build a short human-readable summary of shadow events for the model follow-up
      const eventsSummary = (shadowResult.events || [])
        .map((ev, i) => {
          const s = ev.start?.dateTime || ev.start?.date || "unknown";
          const e = ev.end?.dateTime || ev.end?.date || "unknown";
          const title = ev.summary || ev.description || "(no title)";
          const id = ev.id || "(no-id)";
          return `${i + 1}. ${title} — ${s} → ${e} (ID: ${id})`;
        })
        .join("\n");

      // Ask Gemini to propose reschedule moves for the shadow session.
      // Reuse the current chat session so the model keeps conversation context.
      const followUpPrompt = `
        The user requested rescheduling within the interval ${start} - ${end}.
        Here are the cloned events in the shadow calendar:
        ${eventsSummary || "No events in interval."}

        Based on the user's original request and the shadow events above, propose a reschedule plan that frees up the requested interval.
        Respond with a single JSON object using this schema:
        {
          "action": "propose_reschedule",
          "parameters": {
            "shadowCalendarId": "<shadowCalendarId>",
            "moves": [
              { "eventId": "<eventId>", "newStart": "<ISO>", "newEnd": "<ISO>" }
            ]
          },
          "response": "Human-readable explanation"
        }
      `;

      const followUpResult = await chat.sendMessage({ message: followUpPrompt });
      const followUpText = followUpResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!followUpText) {
        return {
          output: geminiResponse.response || `Initialized shadow session ${shadowResult.shadowCalendarId}`,
          action: "init_shadow_session",
          calendarResult: shadowResult,
        };
      }
      // Parse model JSON (strip code fences if present)
      let followUpJson;
      try {
        const cleaned = followUpText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        followUpJson = JSON.parse(cleaned);
      } catch (err) {
        // Parsing failed — return the shadow session info so client can inspect
        console.warn("Failed to parse follow-up JSON from Gemini:", err);
        return {
          output: geminiResponse.response || `Initialized shadow session ${shadowResult.shadowCalendarId}`,
          action: "init_shadow_session",
          calendarResult: shadowResult,
          followUpText,
        };
      }

      // If model proposed reschedule moves, apply them to the shadow calendar
      if (followUpJson.action === "propose_reschedule") {
        const finalParams = followUpJson.parameters || {};
        const shadowCalendarId = finalParams.shadowCalendarId || shadowResult.shadowCalendarId;
        const moves = finalParams.moves || [];
        const applied = await applyProposedReschedule(accessToken, shadowCalendarId, moves, userTimeZone);

        return {
          output: followUpJson.response || "Proposed reschedule applied to shadow calendar.",
          action: "propose_reschedule",
          calendarResult: { shadowResult, appliedMoves: applied },
        };
      }

      // Fallback: return the created shadow session and the model follow-up as text
      return {
        output: followUpJson.response || geminiResponse.response || `Initialized shadow session ${shadowResult.shadowCalendarId}`,
        action: followUpJson.action || "init_shadow_session",
        calendarResult: { shadowResult, followUp: followUpJson },
      };
    }
    


    // Handle context gathering specially - it needs a follow-up
    if (action === "gather_context") {
      const contextData = await handleGatherContext(accessToken, params);

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

      //Parse the follow-up response with fallback
      let followUpResponse;
      try{
        const cleanedFollowUp = followUpText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "");
        followUpResponse = JSON.parse(cleanedFollowUp);
      } catch (parseErr) {
        console.warn("Failed to parse Gemini follow-up JSON, returning text response:", parseErr)
        // Return the raw text as a conversational fallback
        return { output: followUpText, action: "none" };
      }

      const finalAction = followUpResponse.action || "none";
      const finalParams = followUpResponse.parameters || {};

      // Execute the final action
      switch (finalAction) {
        case "create":
          calendarResult = await handleCreate(
            accessToken,
            finalParams,
            userTimeZone
          );
          break;
        case "update":
          calendarResult = await handleUpdate(
            accessToken,
            finalParams,
            userTimeZone
          );
          break;
        case "delete":
          calendarResult = await handleDelete(accessToken, finalParams);
          break;
        case "list":
          calendarResult = await handleList(
            accessToken,
            finalParams,
            followUpResponse
          );
          break;
        case "search":
          calendarResult = await handleSearch(
            accessToken,
            finalParams,
            followUpResponse
          );
          break;
        case "propose_reschedule":
          {
            const shadowCalendarId = finalParams.shadowCalendarId;
            const moves = finalParams.moves || [];
            if (!shadowCalendarId || !Array.isArray(moves)) {
              throw new Error("propose_reschedule requires shadowCalendarId and moves array");
            }
            calendarResult = await applyProposedReschedule(
              accessToken,
              shadowCalendarId,
              moves,
              userTimeZone
            );
          }
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

    // Execute single-phase actions as before,extended with propose reschedule
    switch (action) {
      case "create":
        calendarResult = await handleCreate(accessToken, params, userTimeZone);
        break;
      case "list":
        calendarResult = await handleList(accessToken, params, geminiResponse);
        break;
      case "search":
        calendarResult = await handleSearch(
          accessToken,
          params,
          geminiResponse
        );
        break;
      case "update":
        calendarResult = await handleUpdate(accessToken, params, userTimeZone);
        break;
      case "delete":
        calendarResult = await handleDelete(accessToken, params);
        break;
      case "propose_reschedule": // new single-phase handler 
        {
          const shadowCalendarId = params.shadowCalendarId;
          const moves = params.moves || [];
          if(!shadowCalendarId || !Array.isArray(moves))
            throw new Error("propose_reschedule requires shadowCalendarId and moves array")
          calendarResult = await applyProposedReschedule(accessToken, shadowCalendarId, moves, userTimeZone);
        }
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
