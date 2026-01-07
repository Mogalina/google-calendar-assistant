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

// Load environment variables
dotenv.config();

// Initialize Gemini AI client using API key from environment
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Gemini configuration loaded from YAML or fallback default
let geminiConfig;

/**
 * Attempt to load Gemini configuration from YAML file.
 * Falls back to default configuration if loading fails.
 */
try {
  const configFile = fs.readFileSync("src/config/gemini.yaml", "utf8");
  geminiConfig = yaml.load(configFile);

} catch (e) {
  console.error("Failed to load or parse `gemini.yaml` file:", e);

  // Default Gemini configuration used when YAML loading fails
  geminiConfig = {
    model: "gemini-2.5-flash-lite",
    config: {
      systemInstruction: `You are an **Expert Google Calendar Optimization Assistant**. 
      
      ### MODES OF OPERATION:
      
      1. **NORMAL MODE** (Default):
         - You can create, update, or delete events on the user's 'primary' calendar directly.
      
      2. **SMART RESCHEDULE MODE**:
         - Uses a shadow calendar to simulate changes safely.
      
      Your goal is to suggest efficient, conflict-free schedule changes.`,
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };
}

// Ensure Gemini tools array exists
if (!geminiConfig.tools) {
  geminiConfig.tools = [];
}

// Register Gemini tool for initializing a shadow calendar session
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
 * Resolve which calendar ID should be used for an operation.
 * Enforces shadow calendar usage when required.
 *
 * @param {Object} params - Gemini action parameters.
 * @param {string} targetCalendarId - Enforced calendar context.
 * @returns {string} - Final calendar ID to use.
 */
function resolveCalendarId(params, targetCalendarId) {
  if (!targetCalendarId || targetCalendarId === "primary") {
    return params.calendarId || "primary";
  }
  if (!params.calendarId || params.calendarId === "primary") {
    console.log(
      `[GeminiService] Enforcing shadow context: ${targetCalendarId} ` +
      `(was ${params.calendarId})`
    );
    return targetCalendarId;
  }
  return params.calendarId;
}

/**
 * Create a new calendar event.
 *
 * @param {string} accessToken - OAuth access token.
 * @param {Object} params - Event creation parameters.
 * @param {string} userTimeZone - User's timezone.
 * @param {string} targetCalendarId - Calendar context.
 * @returns {Promise<Object>} - Created event.
 */
async function handleCreate(
  accessToken,
  params,
  userTimeZone,
  targetCalendarId = "primary"
) {
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
  console.log(
    `[GeminiService] Creating event in calendar: ${calendarId}`,
    params.summary
  );

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
 * List calendar events and append results to Gemini response.
 *
 * @param {string} accessToken - OAuth token.
 * @param {Object} params - List parameters.
 * @param {Object} geminiResponse - Mutable Gemini response object.
 * @param {string} targetCalendarId - Calendar context.
 * @returns {Promise<Array>} - Retrieved events.
 */
async function handleList(
  accessToken,
  params,
  geminiResponse,
  targetCalendarId = "primary"
) {
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
      return `${i + 1}. ${event.summary} - ` +
        `${new Date(start).toLocaleString()} (ID: ${event.id})`;
    }).join("\n");

    geminiResponse.response += `\n\n${eventList}`;
  } else {
    geminiResponse.response += "\n\nNo upcoming events found.";
  }

  return calendarResult;
}

/**
 * Search calendar events by query string.
 *
 * @param {string} accessToken - OAuth token.
 * @param {Object} params - Search parameters.
 * @param {Object} geminiResponse - Mutable Gemini response.
 * @param {string} targetCalendarId - Calendar context.
 * @returns {Promise<Array>} - Matching events.
 */
async function handleSearch(
  accessToken,
  params,
  geminiResponse,
  targetCalendarId = "primary"
) {
  if (!params.query) {
    throw new Error("Search query is required");
  }

  const calendarId = resolveCalendarId(params, targetCalendarId);
  console.log(
    `[GeminiService] Searching events in calendar: ${calendarId} ` +
    `query: ${params.query}`
  );

  const calendarResult = await searchEvents(accessToken, params.query, {
    calendarId: calendarId,
    maxResults: params.maxResults || 10,
  });

  if (calendarResult?.length > 0) {
    const eventList = calendarResult.map((event, i) => {
      const start = event.start?.dateTime || event.start?.date;
      return `${i + 1}. ${event.summary} - ` +
        `${new Date(start).toLocaleString()} (ID: ${event.id})`;
    }).join("\n");

    geminiResponse.response +=
      `\n\nFound ${calendarResult.length} events:\n${eventList}`;
  } else {
    geminiResponse.response +=
      `\n\nNo events found matching "${params.query}".`;
  }

  return calendarResult;
}

/**
 * Update an existing calendar event.
 * Handles shadow-calendar lineage mapping when needed.
 *
 * @param {string} accessToken - OAuth token.
 * @param {Object} params - Update parameters.
 * @param {string} userTimeZone - User timezone.
 * @param {string} targetCalendarId - Calendar context.
 * @returns {Promise<Object>} - Updated event.
 */
async function handleUpdate(
  accessToken,
  params,
  userTimeZone,
  targetCalendarId = "primary"
) {
  if (!params.eventId) {
    throw new Error("Event identifier is required for updates");
  }

  const calendarId = resolveCalendarId(params, targetCalendarId);
  let eventId = params.eventId;
  let currentEvent;

  console.log(
    `[GeminiService] Updating event ${eventId} in calendar: ${calendarId}`
  );

  /**
   * Attempt to fetch event. If not found in shadow calendar,
   * try to map original event ID to cloned shadow event.
   */
  try {
    currentEvent = await getEvent(accessToken, eventId, calendarId);
  } catch (error) {
    const isNotFound = error.code === 404 || error.response?.status === 404;

    if (isNotFound && calendarId !== "primary") {
      console.log(
        `[GeminiService] Event ${eventId} not found in shadow ${calendarId}.`
      );

      const shadowEvents = await listEvents(accessToken, { calendarId });
      const match = shadowEvents.find(
        (e) => e.extendedProperties?.private?.originalEventId === eventId
      );

      if (match) {
        console.log(
          `[GeminiService] Mapped original ID ${eventId} to shadow ID ${match.id}`
        );
        eventId = match.id;
        currentEvent = match;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  // Merge provided update parameters with existing event field
  const updateData = {
    summary: params.summary ?? currentEvent.summary,
    start: params.start ?? currentEvent.start,
    end: params.end ?? currentEvent.end,
    description: params.description ?? currentEvent.description,
    location: params.location ?? currentEvent.location,
    attendees: params.attendees ?? currentEvent.attendees,
    extendedProperties: currentEvent.extendedProperties,
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
 * Delete a calendar event.
 * Supports lineage resolution when deleting events from a shadow calendar.
 *
 * @param {string} accessToken - OAuth access token.
 * @param {Object} params - Deletion parameters (must include eventId).
 * @param {string} targetCalendarId - Calendar context (primary or shadow).
 * @returns {Promise<Object>} - Result of deletion.
 */
async function handleDelete(accessToken, params, targetCalendarId = "primary") {
  if (!params.eventId) {
    throw new Error("Event identifier is required for deletion");
  }

  const calendarId = resolveCalendarId(params, targetCalendarId);
  let eventId = params.eventId;

  console.log(
    `[GeminiService] Deleting event ${eventId} in calendar: ${calendarId}`
  );

  try {
    return await deleteEvent(accessToken, eventId, calendarId);
  } catch (error) {
    const isNotFound = error.code === 404 || error.response?.status === 404;

    // If the event does not exist in a shadow calendar, attempt to locate the 
    // cloned version using lineage metadata
    if (isNotFound && calendarId !== "primary") {
      console.log(
        `[GeminiService] Event ${eventId} not found in shadow ${calendarId}. ` +
        `Checking lineage...`
      );

      const shadowEvents = await listEvents(accessToken, { calendarId });
      const match = shadowEvents.find(
        (e) => e.extendedProperties?.private?.originalEventId === eventId
      );

      if (match) {
        console.log(
          `[GeminiService] Mapped original ID ${eventId} to shadow ID ` +
          `${match.id} for deletion`
        );
        return await deleteEvent(accessToken, match.id, calendarId);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
}

/**
 * Perform multiple read-only calendar operations to gather contextual data.
 * Used by Gemini before deciding on a final action.
 *
 * @param {string} accessToken - OAuth access token.
 * @param {Object} params - Context parameters (list/search operations).
 * @param {string} targetCalendarId - Calendar context.
 * @returns {Promise<string>} - Aggregated context summary.
 */
async function handleGatherContext(
  accessToken,
  params,
  targetCalendarId = "primary"
) {
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
          const eventList = events.map((event) => {
            const start = event.start?.dateTime || event.start?.date;
            return `  - ${event.summary} at ` +
              `${new Date(start).toLocaleString()} (ID: ${event.id})`;
          }).join("\n");

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
          calendarId: resolveCalendarId(params, targetCalendarId),
          maxResults: op.maxResults || 10
        });

        if (events.length > 0) {
          const eventList = events.map((event) => {
            const start = event.start?.dateTime || event.start?.date;
            return `  - ${event.summary} at ` +
              `${new Date(start).toLocaleString()} (ID: ${event.id})`;
          }).join("\n");

          contextResults.push(
            `Search results for "${op.query}" (${events.length} events):\n` +
            `${eventList}`
          );
        } else {
          contextResults.push(
            `Search results for "${op.query}": No matching events found.`
          );
        }
      }
    } catch (error) {
      contextResults.push(
        `Error in ${op.type} operation: ${error.message}`
      );
    }
  }

  return contextResults.join("\n\n");
}

/**
 * Identify potential calendar events that match a user's natural language request.
 * Uses phrase extraction and fuzzy word matching.
 *
 * @param {Array<Object>} events - Calendar events.
 * @param {string} userRequest - Original user input.
 * @returns {Array<Object>} - Sorted match candidates with scores and reasons.
 */
function findPotentialMatches(events, userRequest) {
  const matches = [];
  const lower = userRequest.toLowerCase();

  const keyPhrases = extractKeyPhrases(lower);

  for (const event of events) {
    if (!event.summary) continue;
    const eventLower = event.summary.toLowerCase();

    for (const phrase of keyPhrases) {
      const phraseLower = phrase.toLowerCase();

      // Strong match: phrase fully contains event title or vice versa
      if (
        eventLower.includes(phraseLower) ||
        phraseLower.includes(eventLower)
      ) {
        matches.push({
          event,
          matchedPhrase: phrase,
          score: 100,
          reason:
            `Event summary "${event.summary}" matches phrase "${phrase}"`
        });
        break;
      }

      // Partial word-level fuzzy matching
      const phraseWords = phraseLower.split(/\s+/).filter(w => w.length > 2);
      const eventWords = eventLower.split(/\s+/).filter(w => w.length > 2);

      let matchCount = 0;
      for (const pw of phraseWords) {
        for (const ew of eventWords) {
          if (ew.includes(pw) || pw.includes(ew)) {
            matchCount++;
            break;
          }
        }
      }

      if (matchCount >= Math.min(2, phraseWords.length)) {
        matches.push({
          event,
          matchedPhrase: phrase,
          score: (matchCount / phraseWords.length) * 80,
          reason:
            `${matchCount} matching words between "${phrase}" ` +
            `and "${event.summary}"`
        });
        break;
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Extract meaningful action phrases from user input.
 * Uses regex patterns and stop-word filtering.
 *
 * @param {string} text - Lowercase user request.
 * @returns {Array<string>} - Unique key phrases.
 */
function extractKeyPhrases(text) {
  const phrases = [];

  const want = text.match(
    /(?:want to|need to|have to|going to)\s+([^.!?,]+?)/ +
    /(?:\s+in|\s+at|\s+on|\s+for|$)/
  );
  if (want) phrases.push(want[1].trim());

  const activity = text.match(
    /\b([a-z\s]{3,}?)\s+(?:in the|at|on|for)/
  );
  if (activity) phrases.push(activity[1].trim());

  const words = text.split(/\s+/);
  const stopWords = [
    'i', 'want', 'to', 'the', 'a', 'an', 'in', 'at', 'on', 'for',
    'tomorrow', 'today', 'morning', 'afternoon', 'evening', 'night'
  ];

  const meaningfulWords = words.filter(
    w => w.length > 3 && !stopWords.includes(w)
  );

  if (meaningfulWords.length > 0) {
    phrases.push(meaningfulWords.join(' '));
  }

  return [...new Set(phrases)].filter(p => p.length > 0);
}

/**
 * Continues a conversational session with Gemini while managing calendar actions.
 *
 * @param {string} input - User natural language request
 * @param {Array} history - Gemini chat history
 * @param {string|null} accessToken - OAuth token for calendar access
 * @param {string} userTimeZone - User timezone (default UTC)
 * @param {string} calendarId - Target calendar ID (default primary)
 * @returns {Promise<{output: string, action: string, calendarResult: any}>}
 */
export async function continueChat(
  input, 
  history = [], 
  accessToken = null,
  userTimeZone = "UTC",
  calendarId = "primary"
) {
  // Validate user input early to avoid undefined Gemini behavior
  if (!input || typeof input !== "string") {
    throw new Error("Invalid user input for Gemini");
  }

  console.log(`[GeminiService] Processing input. Calendar context: ${calendarId}`);

  // Gemini operations require an authenticated calendar context
  if (!accessToken) {
    throw new Error("Access token required. Gemini operates only under calendar context.");
  }

  try {
    // Used for temporal grounding in Gemini prompts
    const currentDateTime = new Date().toISOString();
    
    // Injects safety instructions when operating on non-primary calendars
    let systemPreamble = "";
    if (calendarId !== "primary") {
      systemPreamble = `SYSTEM NOTICE: You are currently working on a Shadow Calendar (ID: ${calendarId}). All 'create', 'update', or 'delete' actions MUST be applied to this calendar ID. Do not use 'primary'.\n`;
    }

    // Full contextual payload sent to Gemini
    const contextualInput = `
      ${systemPreamble}
      Current datetime: ${currentDateTime}
      User timezone: ${userTimeZone}
      User request: ${input}
    `;

    // Initialize Gemini chat with preserved history
    const chat = client.chats.create({
      ...geminiConfig,
      history: history 
    });

    // Send initial message to Gemini
    const result = await chat.sendMessage({ message: contextualInput });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // Defensive check against empty Gemini responses
    if (!text || text === "") {
      console.log(JSON.stringify(result, null, 2));
      throw new Error("Gemini returned empty response");
    }

    let geminiResponse;
    try {
      // Strip markdown code fences before JSON parsing
      const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      geminiResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      // Fallback: treat Gemini output as plain text
      console.warn("Failed to parse Gemini response as JSON, treating as text:", text);
      return { output: text, action: "none" };
    }

    // Extract structured action and parameters
    const action = geminiResponse.action || "none";
    const params = geminiResponse.parameters || {};

    let calendarResult = null;
    
    // Gemini requests additional context before deciding final action
    if (action === "gather_context") {
      const contextData = await handleGatherContext(accessToken, params, calendarId);
      
      // Follow-up prompt includes fetched calendar data
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

      // Execute final calendar operation
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
    
    // Initializes a shadow calendar session for safe multi-step reasoning
    if (action === "init_shadow_session") {
      console.log("[GeminiService] Initializing shadow session with smart analysis...");
      
      const { shadowCalendarId, events } = await initializeShadowSession(
        accessToken, 
        params.start, 
        params.end
      );

      // Heuristic matching between user request and existing events
      const potentialMatches = findPotentialMatches(events, input);
      
      console.log(`[GeminiService] Found ${potentialMatches.length} potential matches for: "${input}"`);
      potentialMatches.forEach(m => {
        console.log(`  - ${m.event.summary} (score: ${m.score}): ${m.reason}`);
      });

      // Build readable event list for Gemini reasoning
      const eventList = events.map((event, i) => {
        const start = event.start?.dateTime || event.start?.date;
        const match = potentialMatches.find(m => m.event.id === event.id);
        const marker = match ? ` ⭐ MATCH (${Math.round(match.score)}% - ${match.matchedPhrase})` : "";
        return `${i + 1}. ${event.summary} - ${new Date(start).toLocaleString()} (ID: ${event.id})${marker}`;
      }).join("\n");

      let intelligentHint = "";
      if (potentialMatches.length > 0) {
        const topMatch = potentialMatches[0];
        intelligentHint = `
    ⚠️  CRITICAL INSTRUCTION - READ CAREFULLY:

    The user's request: "${input}"
    Appears to match an EXISTING event: "${topMatch.event.summary}" (ID: ${topMatch.event.id})

    REASONING: ${topMatch.reason}

    YOU MUST:
    1. Use the 'update' action with eventId: "${topMatch.event.id}"
    2. DO NOT create a new event (this would create a duplicate!)
    3. Extract the new time from user's request and update the event
    `;
      } else {
        intelligentHint = `
    ANALYSIS: No existing events match the user's request.
    This appears to be a request to CREATE a new event.
    `;
      }

      let currentLoopInput = `
    System Notification: Shadow session successfully initialized.
    Shadow Calendar ID: ${shadowCalendarId}

    Events cloned into this session:
    ${eventList}
    ${intelligentHint}

    Original User Request: "${input}"
    `;

      let finalResponseText = "Analyzing your schedule...";
      let loopCount = 0;
      const MAX_LOOPS = 8;

      // Iterative reasoning loop until Gemini resolves the task
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
              loopResponse.parameters.calendarId = shadowCalendarId;
              const updatedEvent = await handleUpdate(
                accessToken, 
                loopResponse.parameters, 
                userTimeZone, 
                shadowCalendarId
              );
              currentLoopInput = `System: Successfully updated "${updatedEvent.summary}".`;
              finalResponseText = loopResponse.response;
              
          } else if (loopResponse.action === "create") {
              loopResponse.parameters.calendarId = shadowCalendarId;
              const newEvt = await handleCreate(
                accessToken, 
                loopResponse.parameters, 
                userTimeZone, 
                shadowCalendarId
              );
              currentLoopInput = `System: Created "${newEvt.summary}".`;
              finalResponseText = loopResponse.response;

          } else if (loopResponse.action === "delete") {
              loopResponse.parameters.calendarId = shadowCalendarId;
              await handleDelete(accessToken, loopResponse.parameters, shadowCalendarId);
              currentLoopInput = `System: Event deleted.`;
              finalResponseText = loopResponse.response;

          } else if (loopResponse.action === "none") {
              finalResponseText = loopResponse.response;
              break;
          } else {
              finalResponseText = loopResponse.response;
              break;
          }
          loopCount++;
      }

      return {
        output: finalResponseText,
        action: "init_shadow_session",
        calendarResult: { shadowCalendarId, events },
      };
    }

    // Direct execution for simple one-shot actions
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
