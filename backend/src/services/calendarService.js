import { google } from "googleapis";
import CalendarEvent from "../models/CalendarEvent.js";

/**
 * Creates a Google Calendar client instance using the user's access token.
 * Returns an authenticated client for performing calendar operations.
 * 
 * @param {string} accessToken - OAuth2 access token for Google API.
 * @returns {import('googleapis').calendar_v3.Calendar} Authenticated client.
 */
export function createCalendarClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Gets a single event by identifier.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Identifier of the event.
 * @param {string} calendarId - Calendar identifier.
 * @returns {Promise<Object>} Event object.
 */
export async function getEvent(accessToken, eventId, calendarId = "primary") {
  if (!eventId) {
    throw new Error("Event identifier is required.");
  }

  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);
  
  const response = await calendar.events.get({
    calendarId,
    eventId
  });

  return response.data;
}

/**
 * Creates a new event in the user's calendar.
 * Validates event structure and inserts it using Google Calendar API.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} calendarId - Calendar identifier.
 * @param {Object} eventData - Event details.
 * @returns {Promise<Object>} Created event object.
 */
export async function createEvent(accessToken, calendarId = "primary", eventData) {
  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);

  // Validate event before sending to Google Calendar
  const calendarEvent = new CalendarEvent(eventData);
  const validationError = calendarEvent.validate();
  if (validationError) {
    throw new Error(validationError);
  }

  // Insert the event in Google Calendar
  const response = await calendar.events.insert({
    calendarId,
    requestBody: calendarEvent.toObject(),
  });

  return response.data;
}

/**
 * Updates an existing event in the user's calendar.
 * Validates the updated event data and applies changes using the API.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Identifier of the event to update.
 * @param {string} calendarId - Calendar identifier.
 * @param {Object} eventData - Updated event details.
 * @param {string} sendUpdates - How updates are sent to attendees.
 * @returns {Promise<Object>} Updated event object.
 */
export async function updateEvent(
  accessToken,
  eventId,
  calendarId = "primary",
  eventData,
  sendUpdates = "all"
) {
  if (!eventId) {
    throw new Error("Event identifier is required.");
  }

  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);

  // Update the event in Google Calendar
  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: eventData,
    sendUpdates,
  });

  return response.data;
}

/**
 * Deletes an event from the user's calendar.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Identifier of the event to delete.
 * @param {string} calendarId - Calendar identifier.
 * @param {string} sendUpdates - How updates are sent to attendees.
 * @returns {Promise<Object>} Success confirmation.
 */
export async function deleteEvent(
  accessToken,
  eventId,
  calendarId = "primary",
  sendUpdates = "all"
) {
  if (!eventId) {
    throw new Error("Event identifier is required.");
  }

  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);

  // Delete the event using Google Calendar API
  await calendar.events.delete({ calendarId, eventId, sendUpdates });

  return { success: true, eventId };
}

/**
 * Lists events in a given time interval.
 * Defaults to the next 24 hours if no start or end is provided.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {Object} options - Query options.
 * @param {string} options.calendarId - Calendar identifier.
 * @param {number} options.maxResults - Maximum events to return.
 * @param {string} options.start - ISO string for interval start.
 * @param {string} options.end - ISO string for interval end.
 * @returns {Promise<Array>} Array of events.
 */
export async function listEvents(
  accessToken,
  { calendarId = "primary", maxResults = 20, start, end } = {}
) {
  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  // Determine time interval for query
  const timeMin = start ? new Date(start).toISOString() : now.toISOString();
  const timeMax = end ? new Date(end).toISOString() : tomorrow.toISOString();

  // Validate interval if both start and end provided
  if (start && end && new Date(start) >= new Date(end)) {
    throw new Error("Invalid interval: Start time must occur before end time.");
  }

  // Fetch events in the specified interval
  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults: Number(maxResults),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

/**
 * Searches events by a query text in summary, description, or location.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} query - Search string (required).
 * @param {Object} options - Query options.
 * @param {string} options.calendarId - Calendar identifier.
 * @param {number} options.maxResults - Maximum events to return.
 * @returns {Promise<Array>} Array of matching events.
 */
export async function searchEvents(
  accessToken,
  query,
  { calendarId = "primary", maxResults = 10 } = {}
) {
  if (!query) {
    throw new Error("Search query is required.");
  }

  // Create an authenticated Google Calendar client using user's access token
  const calendar = createCalendarClient(accessToken);

  // Search events in Google Calendar using the query string
  const response = await calendar.events.list({
    calendarId,
    q: query,
    maxResults: Number(maxResults),
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

/**
 * Creates a new calendar for the user.
 * Uses Google Calendar API to generate a standalone calendar container which can later hold
 * temporary or generated events.
 * 
 * @param {string} accessToken - OAuth2 access token for Google API.
 * @param {string} summary - Display name of the new calendar.
 * @returns {Promise<Object>} Created calendar object (contains calendarId).
 * @throws {Error} If calendar creation fails.
 */
export async function createCalendar(accessToken, summary) {
  try {
    // Create an authenticated Google Calendar client
    const calendar = createCalendarClient(accessToken);

    // Insert a new calendar using Google Calendar API
    const response = await calendar.calendars.insert({
      requestBody: { summary },
    });

    return response.data;

  } catch (error) {
    console.error("Error creating calendar:", error.response?.data || error);
    throw new Error("Failed to create calendar");
  }
}

/**
 * Deletes a calendar owned by the user.
 * This permanently removes the calendar and its events from Google Calendar.
 * 
 * @param {string} accessToken - OAuth2 access token for Google API.
 * @param {string} calendarId - Identifier of the calendar to delete.
 * @returns {Promise<Object>} Success confirmation object.
 * @throws {Error} If calendar deletion fails.
 */
export async function deleteCalendar(accessToken, calendarId) {
  try {
    // Create an authenticated Google Calendar client
    const calendar = createCalendarClient(accessToken);

    // Remove the calendar using Google Calendar API
    await calendar.calendars.delete({
      calendarId,
    });

    return { success: true };

  } catch (error) {
    console.error("Error deleting calendar:", error.response?.data || error);
    throw new Error("Failed to delete calendar");
  }
}

/**
 * Clones events from one calendar to another within a given time interval.
 * For each cloned event, stores the original event id in 
 * `extendedProperties.private.originalEventId` so we can track lineage later.
 * 
 * Events are fetched from `sourceCalendarId` between `startInterval` and `endInterval`, then
 * re-inserted into `targetCalendarId` without attendees and with adjusted metadata.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} sourceCalendarId - Identifier of the source calendar.
 * @param {string} targetCalendarId - Identifier of the target (shadow) calendar.
 * @param {string} startInterval - ISO date-time string for interval start.
 * @param {string} endInterval - ISO date-time string for interval end.
 * @returns {Promise<Array>} Array of cloned events created in the target calendar.
 */
export async function cloneEvents(
  accessToken,
  sourceCalendarId,
  targetCalendarId,
  startInterval,
  endInterval
) {
  if (!sourceCalendarId) {
    throw new Error("Source calendar identifier is required.");
  }

  if (!targetCalendarId) {
    throw new Error("Target calendar identifier is required.");
  }

  if (!startInterval || !endInterval) {
    throw new Error("Both startInterval and endInterval are required.");
  }

  const startDate = new Date(startInterval);
  const endDate = new Date(endInterval);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date format for startInterval or endInterval.");
  }

  if (startDate >= endDate) {
    throw new Error("Invalid interval: startInterval must be before endInterval.");
  }

  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();

  // Create an authenticated Google Calendar client
  const calendar = createCalendarClient(accessToken);

  // List all events from source calendar in the given interval
  const allEvents = [];
  let pageToken;

  do {
    const response = await calendar.events.list({
      calendarId: sourceCalendarId,
      timeMin,
      timeMax,
      singleEvents: true, // Doesn't return recurring event containers
      orderBy: "startTime",
      maxResults: 30,
      pageToken,
    });

    const items = response.data.items || [];
    allEvents.push(...items);
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  const clonedEvents = [];

  // Clone each event into the target calendar
  for (const originalEvent of allEvents) {
    // Skip cancelled events
    if (originalEvent.status === "cancelled") {
      continue;
    }

    // Deep clone the original event object
    const cloned = JSON.parse(JSON.stringify(originalEvent));

    // Ensure `extendedProperties.private` exists
    if (!cloned.extendedProperties) {
      cloned.extendedProperties = {};
    }
    if (!cloned.extendedProperties.private) {
      cloned.extendedProperties.private = {};
    }

    // Store lineage information
    cloned.extendedProperties.private.originalEventId = originalEvent.id;

    // Remove fields that must not be reused on insert
    delete cloned.id;
    delete cloned.htmlLink;
    delete cloned.iCalUID;
    delete cloned.etag;
    delete cloned.created;
    delete cloned.updated;
    delete cloned.sequence;
    delete cloned.recurringEventId;
    delete cloned.originalStartTime;
    delete cloned.status;
    delete cloned.attendees;
    delete cloned.hangoutLink;
    delete cloned.conferenceData;

    // Insert the cloned event into the target calendar
    const insertResponse = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: cloned,
      sendUpdates: "none", // Prevent email spam
    });

    clonedEvents.push(insertResponse.data);
  }

  return clonedEvents;
}

/**
 * Initializes a shadow session for a given time interval.
 * 
 * - Parses and validates the requested interval.
 * - Guards against intervals longer than 7 days.
 * - Creates a new shadow calendar.
 * - Clones events from the primary calendar into the shadow calendar, keeping lineage via 
 *   `extendedProperties.private.originalEventId`.
 * 
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} startStr - ISO date-time string for interval start.
 * @param {string} endStr - ISO date-time string for interval end.
 * @returns {Promise<{ shadowCalendarId: string, events: Array }>} The shadow calendar id and the cloned events.
 * 
 * @throws {Error} If the interval is invalid or longer than 7 days.
 */
export async function initializeShadowSession(accessToken, startStr, endStr) {
  if (!startStr || !endStr) {
    const error = new Error("Both start and end date strings are required.");
    error.statusCode = 400;
    throw error;
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const error = new Error("Invalid date format for start or end.");
    error.statusCode = 400;
    throw error;
  }

  if (start >= end) {
    const error = new Error("Invalid interval: start must be before end.");
    error.statusCode = 400;
    throw error;
  }

  // Guard: interval must not exceed 7 days
  const diffMs = end.getTime() - start.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (diffMs > sevenDaysMs) {
    const error = new Error("Session interval cannot exceed 7 days.");
    error.statusCode = 400;
    throw error;
  }

  // Create a shadow calendar
  const summary = "Shadow Session Calendar";
  const shadowCalendar = await createCalendar(accessToken, summary);
  const shadowCalendarId = shadowCalendar.id;

  if (!shadowCalendarId) {
    const error = new Error("Failed to obtain shadow calendar id.");
    error.statusCode = 500;
    throw error;
  }

  // Clone events from primary into the shadow calendar
  const clonedEvents = await cloneEvents(
    accessToken,            // User's access token
    "primary",              // Source calendar id
    shadowCalendarId,       // Shadow calendar id
    start.toISOString(),    // Start time of interval
    end.toISOString()       // End time of interval
  );

  // Return the shadow calendar id and the initial state of events
  return {
    shadowCalendarId,
    events: clonedEvents,
  };
}
