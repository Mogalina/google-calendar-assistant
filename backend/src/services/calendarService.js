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
 * Creates a new event in the user's calendar.
 * Validates event structure and inserts it using Google Calendar API.
 * 
 * @param {string} accessToken - OAuth2 access token
 * @param {string} calendarId - Calendar identifier
 * @param {Object} eventData - Event details
 * @returns {Promise<Object>} Created event object
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
 * @param {string} accessToken - OAuth2 access token
 * @param {string} eventId - Identifier of the event to update
 * @param {string} calendarId - Calendar identifier
 * @param {Object} eventData - Updated event details
 * @param {string} sendUpdates - How updates are sent to attendees
 * @returns {Promise<Object>} Updated event object
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

  // Validate event before sending to Google Calendar
  const calendarEvent = new CalendarEvent(eventData);
  const validationError = calendarEvent.validate();
  if (validationError) {
    throw new Error(validationError);
  }

  // Update the event in Google Calendar
  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: calendarEvent.toObject(),
    sendUpdates,
  });

  return response.data;
}

/**
 * Deletes an event from the user's calendar.
 * 
 * @param {string} accessToken - OAuth2 access token
 * @param {string} eventId - Identifier of the event to delete
 * @param {string} calendarId - Calendar identifier
 * @param {string} sendUpdates - How updates are sent to attendees
 * @returns {Promise<Object>} Success confirmation
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
 * @param {string} accessToken - OAuth2 access token
 * @param {Object} options - Query options
 * @param {string} options.calendarId - Calendar identifier
 * @param {number} options.maxResults - Maximum events to return
 * @param {string} options.start - ISO string for interval start
 * @param {string} options.end - ISO string for interval end
 * @returns {Promise<Array>} Array of events
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
 * @param {string} accessToken - OAuth2 access token
 * @param {string} query - Search string (required)
 * @param {Object} options - Query options
 * @param {string} options.calendarId - Calendar identifier
 * @param {number} options.maxResults - Maximum events to return
 * @returns {Promise<Array>} Array of matching events
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
