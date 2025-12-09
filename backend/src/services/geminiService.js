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
    model: "gemini-2.5-flash-lite",
    config: {
      systemInstruction: `You are an **Expert Google Calendar Optimization Assistant**. 
      Your sole purpose is to analyze the user's existing calendar events and their requests 
      to suggest the most efficient, conflict-free, and productive schedule changes.`,
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };
}

// Ensure the tools array exists in the configuration
if (!geminiConfig.tools) {
  geminiConfig.tools = [];
}

// Add the `init_shadow_session` tool
geminiConfig.tools.push({
  functionDeclarations: [
    {
      name: "init_shadow_session",
      description: "Initialize a shadow session for a specific time range.",
      parameters: {
        type: "OBJECT",
        properties: {
          start: {
            type: "STRING",
            description: "Start time of the shadow session (ISO datetime)."
          },
          end: {
            type: "STRING",
            description: "End time of the shadow session (ISO datetime)."
          }
        },
        required: ["start", "end"]
      }
    }
  ]
});

/**
 * Helper to enforce shadow calendar context.
 * If we are in a shadow session (targetCalendarId is not primary),
 * we override 'primary' or missing calendarId with the shadow ID.
 */
function resolveCalendarId(params, targetCalendarId) {
  if (!targetCalendarId || targetCalendarId === "primary") {
    return params.calendarId || "primary";
  }
  // If the tool execution tries to use 'primary' or nothing, force the shadow ID
  if (!params.calendarId || params.calendarId === "primary") {
    return targetCalendarId;
  }
  return params.calendarId;
}

/**
 * Creates a new calendar event using the provided parameters.
 */
async function handleCreate(accessToken, params, userTimeZone, targetCalendarId = "primary") {
  if (!params.summary || params.summary.trim() === "") {
    params.summary = "Untitled Event";
  }
  if (params.start?.dateTime && !params.start.timeZone) {
    params.start.timeZone = userTimeZone;
  }
  if (params.end?.dateTime && !params.end.timeZone) {
    params.end.timeZone = userTimeZone;
  }
  
  const calendarId = resolveCalendarId(params, targetCalendarId);
  console.log(`[GeminiService] Creating event in calendar: ${calendarId}`, params.summary);
  
  return await createEvent(accessToken, calendarId, {
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
async function handleList(accessToken, params, geminiResponse, targetCalendarId = "primary") {
  const calendarId = resolveCalendarId(params, targetCalendarId);
  console.log(`[GeminiService] Listing events for calendar: ${calendarId}`);
  
  const calendarResult = await listEvents(accessToken, {
    calendarId: calendarId,
    maxResults: params.maxResults || 10,
    start: params.start,
    end: params.end
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult.map((event, i) => {
      const start = event.start?.dateTime || event.start?.date;
      return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()} (ID: ${event.id})`;
    }).join("\n");
    geminiResponse.response += `\n\n${eventList}`;
  } else {
    geminiResponse.response += "\n\nNo upcoming events found.";
  }

  return calendarResult;
}

/**
 * Searches events based on a query and appends results to the Gemini response.
 */
async function handleSearch(accessToken, params, geminiResponse, targetCalendarId = "primary") {
  if (!params.query) {
    throw new Error("Search query is required");
  }
  const calendarId = resolveCalendarId(params, targetCalendarId);
  console.log(`[GeminiService] Searching events in calendar: ${calendarId} query: ${params.query}`);
  
  const calendarResult = await searchEvents(accessToken, params.query, {
    calendarId: calendarId,
    maxResults: params.maxResults || 10,
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult.map((event, i) => {
      const start = event.start?.dateTime || event.start?.date;
      return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()} (ID: ${event.id})`;
    }).join("\n");
    geminiResponse.response += `\n\nFound ${calendarResult.length} events:\n${eventList}`;
  } else {
    geminiResponse.response += `\n\nNo events found matching "${params.query}".`;
  }

  return calendarResult;
}

/**
 * Updates an existing calendar event.
 * Includes fallback logic to map Original IDs to Shadow IDs if a 404 occurs.
 */
async function handleUpdate(accessToken, params, userTimeZone, targetCalendarId = "primary") {
  if (!params.eventId) {
    throw new Error("Event identifier is required for updates");
  }
  
  const calendarId = resolveCalendarId(params, targetCalendarId);
  let eventId = params.eventId;
  let currentEvent;

  console.log(`[GeminiService] Updating event ${eventId} in calendar: ${calendarId}`);

  try {
    // Attempt to fetch the event directly
    currentEvent = await getEvent(accessToken, eventId, calendarId);
  } catch (error) {
    // Check if error is 404 (Not Found) and we are working on a shadow calendar
    // This happens when LLM uses the Primary Event ID to update the Shadow Calendar
    const isNotFound = error.code === 404 || error.response?.status === 404;
    
    if (isNotFound && calendarId !== "primary") {
      console.log(`[GeminiService] Event ${eventId} not found in shadow ${calendarId}. Checking lineage...`);
      
      // Fetch all events in the shadow calendar to find a match by originalEventId
      const shadowEvents = await listEvents(accessToken, { calendarId });
      const match = shadowEvents.find(
        (e) => e.extendedProperties?.private?.originalEventId === eventId
      );

      if (match) {
        console.log(`[GeminiService] Mapped original ID ${eventId} to shadow ID ${match.id}`);
        eventId = match.id;
        currentEvent = match; // We already have the event object from the list
      } else {
        console.error(`[GeminiService] No matching shadow event found for ID ${eventId}`);
        throw error; // Propagate if we really can't find it
      }
    } else {
      throw error;
    }
  }

  // Merge updates with existing event data
  const updateData = {
    summary: params.summary ?? currentEvent.summary,
    start: params.start ?? currentEvent.start,
    end: params.end ?? currentEvent.end,
    description: params.description ?? currentEvent.description,
    location: params.location ?? currentEvent.location,
    attendees: params.attendees ?? currentEvent.attendees,
  };

  if (params.start && updateData.start?.dateTime && !updateData.start.timeZone) {
    updateData.start.timeZone = userTimeZone;
  }
  if (params.end && updateData.end?.dateTime && !updateData.end.timeZone) {
    updateData.end.timeZone = userTimeZone;
  }

  return await updateEvent(accessToken, eventId, calendarId, updateData);
}

/**
 * Deletes an existing calendar event.
 */
async function handleDelete(accessToken, params, targetCalendarId = "primary") {
  if (!params.eventId) {
    throw new Error("Event identifier is required for deletion");
  }
  const calendarId = resolveCalendarId(params, targetCalendarId);
  console.log(`[GeminiService] Deleting event ${params.eventId} in calendar: ${calendarId}`);
  return await deleteEvent(accessToken, params.eventId, calendarId);
}

/**
 * Gathers calendar context by executing multiple search/list operations.
 */
async function handleGatherContext(accessToken, params, targetCalendarId = "primary") {
  const operations = params.operations || [];
  const contextResults = [];

  for (const op of operations) {
    try {
      if (op.type === "list") {
        const events = await listEvents(accessToken, {
          calendarId: resolveCalendarId(params, targetCalendarId),
          maxResults: op.maxResults || 10,
          start: op.start,
          end: op.end
        });
        if (events.length > 0) {
          const eventList = events.map((event, i) => {
            const start = event.start?.dateTime || event.start?.date;
            return `  - ${event.summary} at ${new Date(start).toLocaleString()} (ID: ${event.id})`;
          }).join("\n");
          contextResults.push(`List results (${events.length} events):\n${eventList}`);
        } else {
          contextResults.push("List results: No events found in the specified time range.");
        }

      } else if (op.type === "search") {
        const events = await searchEvents(accessToken, op.query, {
          calendarId: resolveCalendarId(params, targetCalendarId),
          maxResults: op.maxResults || 10
        });
        if (events.length > 0) {
          const eventList = events.map((event, i) => {
            const start = event.start?.dateTime || event.start?.date;
            return `  - ${event.summary} at ${new Date(start).toLocaleString()} (ID: ${event.id})`;
          }).join("\n");
          contextResults.push(`Search results for "${op.query}" (${events.length} events):\n${eventList}`);
        } else {
          contextResults.push(`Search results for "${op.query}": No matching events found.`);
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
 */
export async function continueChat(
  input, 
  history = [], 
  accessToken = null,
  userTimeZone = "UTC",
  calendarId = "primary"
) {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid user input for Gemini");
  }

  console.log(`[GeminiService] Processing input. Calendar context: ${calendarId}`);

  if (!accessToken) {
    throw new Error("Access token required. Gemini operates only under calendar context.");
  }

  try {
    const currentDateTime = new Date().toISOString();
    
    // Inject system context if we are in shadow mode
    let systemPreamble = "";
    if (calendarId !== "primary") {
      systemPreamble = `SYSTEM NOTICE: You are currently working on a Shadow Calendar (ID: ${calendarId}). All 'create', 'update', or 'delete' actions MUST be applied to this calendar ID. Do not use 'primary'.\n`;
    }

    const contextualInput = `
      ${systemPreamble}
      Current datetime: ${currentDateTime}
      User timezone: ${userTimeZone}
      User request: ${input}
    `;

    const chat = client.chats.create({
      ...geminiConfig,
      history: history 
    });

    const result = await chat.sendMessage({ message: contextualInput });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text === "") {
      console.log(JSON.stringify(result, null, 2));
      throw new Error("Gemini returned empty response");
    }

    let geminiResponse;
    try {
      const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      geminiResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.warn("Failed to parse Gemini response as JSON, treating as text:", text);
      return { output: text, action: "none" };
    }

    const action = geminiResponse.action || "none";
    const params = geminiResponse.parameters || {};

    let calendarResult = null;
    
    // --- HANDLE GATHER CONTEXT ---
    if (action === "gather_context") {
      const contextData = await handleGatherContext(accessToken, params, calendarId);
      
      const followUpInput = `
        Based on the user's request: "${input}"
        
        Here is the calendar context you requested:
        ${contextData}
        
        Now, please provide the final action to take (create/update/delete/none) based on this context.
        REMINDER: If modifying events, ensure you are acting on the correct calendar ID.
      `;

      const followUpResult = await chat.sendMessage({ message: followUpInput });
      const followUpText = followUpResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (!followUpText) {
        throw new Error("Gemini returned empty response in follow-up");
      }

      const cleanedFollowUp = followUpText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      const followUpResponse = JSON.parse(cleanedFollowUp);
      
      const finalAction = followUpResponse.action || "none";
      const finalParams = followUpResponse.parameters || {};

      switch (finalAction) {
        case "create":
          calendarResult = await handleCreate(accessToken, finalParams, userTimeZone, calendarId);
          break;
        case "update":
          calendarResult = await handleUpdate(accessToken, finalParams, userTimeZone, calendarId);
          break;
        case "delete":
          calendarResult = await handleDelete(accessToken, finalParams, calendarId);
          break;
        case "list":
          calendarResult = await handleList(accessToken, finalParams, followUpResponse, calendarId);
          break;
        case "search":
          calendarResult = await handleSearch(accessToken, finalParams, followUpResponse, calendarId);
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
    
    // --- HANDLE SHADOW SESSION INITIALIZATION ---
    if (action === "init_shadow_session") {
      console.log("[GeminiService] Initializing shadow session...");
      const { shadowCalendarId, events } = await initializeShadowSession(
        accessToken, 
        params.start, 
        params.end
      );

      const eventList = events.map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()} (ID: ${event.id})`;
      }).join("\n");

      // Loop to allow the model to perform multiple actions (updates) on the shadow calendar
      let currentLoopInput = `
        System Notification: Shadow session successfully initialized.
        Shadow Calendar ID: ${shadowCalendarId}
        
        Events cloned into this session (Originals have been copied):
        ${eventList}
        
        INSTRUCTIONS FOR RESCHEDULING:
        1. Analyze the user's original request ("${input}") and the cloned events above.
        2. If the user wants to reschedule/optimize, generate JSON actions to 'update' these events.
        3. CRITICAL: For every 'update' action, you MUST explicitly specify "calendarId": "${shadowCalendarId}" in the parameters.
        4. You can perform multiple updates sequentially. 
        5. If no changes are needed, or when finished, return a response with action "none" summarizing the session.
      `;

      let finalResponseText = "Shadow calendar created.";
      let loopCount = 0;
      const MAX_LOOPS = 8; 

      while (loopCount < MAX_LOOPS) {
          const loopResult = await chat.sendMessage({ message: currentLoopInput });
          const loopText = loopResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

          let loopResponse;
          try {
             const cleaned = loopText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
             loopResponse = JSON.parse(cleaned);
          } catch (e) {
             finalResponseText = loopText;
             break; 
          }

          if (loopResponse.action === "update") {
              console.log("[GeminiService] Shadow Loop: executing update.");
              // Force parameter override
              loopResponse.parameters.calendarId = shadowCalendarId;
              
              try {
                  await handleUpdate(accessToken, loopResponse.parameters, userTimeZone, shadowCalendarId);
                  currentLoopInput = `System: Event ${loopResponse.parameters.eventId} updated successfully. Next action? (action: 'none' to finish)`;
                  finalResponseText = loopResponse.response || "Updating schedule...";
              } catch (err) {
                  console.error("Error in shadow update loop:", err);
                  currentLoopInput = `System: Error updating event: ${err.message}. Try again or finish.`;
              }
              
          } else if (loopResponse.action === "none") {
              finalResponseText = loopResponse.response;
              break;
          } else {
              finalResponseText = loopResponse.response || "Session created.";
              break;
          }
          loopCount++;
      }

      return {
        output: finalResponseText,
        action: "init_shadow_session",
        calendarResult: {
          shadowCalendarId,
          events
        },
      };
    }

    // --- HANDLE STANDARD ACTIONS ---
    switch (action) {
      case "create":
        calendarResult = await handleCreate(accessToken, params, userTimeZone, calendarId);
        break;
      case "list":
        calendarResult = await handleList(accessToken, params, geminiResponse, calendarId);
        break;
      case "search":
        calendarResult = await handleSearch(accessToken, params, geminiResponse, calendarId);
        break;
      case "update":
        calendarResult = await handleUpdate(accessToken, params, userTimeZone, calendarId);
        break;
      case "delete":
        calendarResult = await handleDelete(accessToken, params, calendarId);
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