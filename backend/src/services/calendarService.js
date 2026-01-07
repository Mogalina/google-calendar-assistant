import { google } from "googleapis";
import CalendarEvent from "../models/CalendarEvent.js";

/**
 * Creates and configures a Google Calendar API client.
 *
 * @param {string} accessToken - OAuth2 access token with calendar scope.
 * @returns {import('googleapis').calendar_v3.Calendar} Authenticated calendar client.
 */
export function createCalendarClient(accessToken) {
  // Create OAuth2 client without secret
  const oauth2Client = new google.auth.OAuth2();

  // Attach access token credentials
  oauth2Client.setCredentials({ access_token: accessToken });

  // Return Google Calendar API client
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Fetches a single calendar event by ID.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Unique identifier of the event.
 * @param {string} [calendarId="primary"] - Calendar identifier.
 * @returns {Promise<Object>} Event object.
 */
export async function getEvent(accessToken, eventId, calendarId = "primary") {
  if (!eventId) {
    throw new Error("Event identifier is required.");
  }

  const calendar = createCalendarClient(accessToken);
  const response = await calendar.events.get({ calendarId, eventId });
  return response.data;
}

/**
 * Creates a new calendar event after validation.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} [calendarId="primary"] - Calendar identifier.
 * @param {Object} eventData - Raw event input data.
 * @returns {Promise<Object>} Created event.
 */
export async function createEvent(accessToken, calendarId = "primary", eventData) {
  const calendar = createCalendarClient(accessToken);

  // Wrap raw data in domain model
  const calendarEvent = new CalendarEvent(eventData);

  // Validate event data before sending to API
  const validationError = calendarEvent.validate();
  if (validationError) throw new Error(validationError);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: calendarEvent.toObject(),
  });

  return response.data;
}

/**
 * Updates an existing calendar event.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Event identifier.
 * @param {string} [calendarId="primary"] - Calendar identifier.
 * @param {Object} eventData - Updated event data.
 * @param {string} [sendUpdates="all"] - Notification policy.
 * @returns {Promise<Object>} Updated event.
 */
export async function updateEvent(
  accessToken,
  eventId,
  calendarId = "primary",
  eventData,
  sendUpdates = "all"
) {
  if (!eventId) throw new Error("Event identifier is required.");

  const calendar = createCalendarClient(accessToken);
  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: eventData,
    sendUpdates,
  });

  return response.data;
}

/**
 * Deletes a calendar event.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} eventId - Event identifier.
 * @param {string} [calendarId="primary"] - Calendar identifier.
 * @param {string} [sendUpdates="all"] - Notification policy.
 * @returns {Promise<{success: boolean, eventId: string}>}
 */
export async function deleteEvent(
  accessToken,
  eventId,
  calendarId = "primary",
  sendUpdates = "all"
) {
  if (!eventId) throw new Error("Event identifier is required.");

  const calendar = createCalendarClient(accessToken);
  await calendar.events.delete({ calendarId, eventId, sendUpdates });

  return { success: true, eventId };
}

/**
 * Lists events in a given time interval.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {Object} options
 * @param {string} [options.calendarId="primary"]
 * @param {number} [options.maxResults=20]
 * @param {string} [options.start] - ISO start datetime.
 * @param {string} [options.end] - ISO end datetime.
 * @returns {Promise<Array<Object>>} List of events.
 */
export async function listEvents(
  accessToken,
  { calendarId = "primary", maxResults = 20, start, end } = {}
) {
  const calendar = createCalendarClient(accessToken);

  // Default interval: now → tomorrow
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const timeMin = start ? new Date(start).toISOString() : now.toISOString();
  const timeMax = end ? new Date(end).toISOString() : tomorrow.toISOString();

  if (start && end && new Date(start) >= new Date(end)) {
    throw new Error("Invalid interval: Start time must occur before end time.");
  }

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
 * Searches events by free-text query.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} query - Search keyword.
 * @param {Object} options
 * @param {string} [options.calendarId="primary"]
 * @param {number} [options.maxResults=10]
 * @returns {Promise<Array<Object>>}
 */
export async function searchEvents(
  accessToken,
  query,
  { calendarId = "primary", maxResults = 10 } = {}
) {
  if (!query) throw new Error("Search query is required.");

  const calendar = createCalendarClient(accessToken);
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
 * Creates a new calendar.
 * Description is used to store session metadata if needed.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} summary - Calendar name.
 * @param {string} [description=""] - Optional metadata.
 * @returns {Promise<Object>} Created calendar.
 */
export async function createCalendar(accessToken, summary, description = "") {
  try {
    const calendar = createCalendarClient(accessToken);
    const response = await calendar.calendars.insert({
      requestBody: { summary, description },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating calendar:", error.response?.data || error);
    throw new Error("Failed to create calendar");
  }
}

/**
 * Deletes an existing calendar.
 *
 * @param {string} accessToken - OAuth2 access token.
 * @param {string} calendarId - Calendar identifier.
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteCalendar(accessToken, calendarId) {
  try {
    const calendar = createCalendarClient(accessToken);
    await calendar.calendars.delete({ calendarId });
    return { success: true };
  } catch (error) {
    console.error("Error deleting calendar:", error.response?.data || error);
    throw new Error("Failed to delete calendar");
  }
}

/**
 * Clones events from one calendar to another within a time interval.
 * Stores lineage via 'extendedProperties.private.originalEventId'.
 *
 * @param {string} accessToken
 * @param {string} sourceCalendarId
 * @param {string} targetCalendarId
 * @param {string} startInterval - ISO datetime.
 * @param {string} endInterval - ISO datetime.
 * @returns {Promise<Array<Object>>} Cloned events.
 */
export async function cloneEvents(
  accessToken,
  sourceCalendarId,
  targetCalendarId,
  startInterval,
  endInterval
) {
  if (!sourceCalendarId || !targetCalendarId || !startInterval || !endInterval) {
    throw new Error("Missing required parameters for cloneEvents.");
  }

  const calendar = createCalendarClient(accessToken);
  const allEvents = [];
  let pageToken;

  // Paginated fetch of source events
  do {
    const response = await calendar.events.list({
      calendarId: sourceCalendarId,
      timeMin: new Date(startInterval).toISOString(),
      timeMax: new Date(endInterval).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 30,
      pageToken,
    });

    allEvents.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  const clonedEvents = [];

  // Clone each event, stripping system-managed fields
  for (const originalEvent of allEvents) {
    if (originalEvent.status === "cancelled") continue;

    const cloned = JSON.parse(JSON.stringify(originalEvent));

    cloned.extendedProperties ??= {};
    cloned.extendedProperties.private ??= {};

    // Track lineage to primary event
    cloned.extendedProperties.private.originalEventId = originalEvent.id;

    // Remove fields that cannot be reused
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

    const insertResponse = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: cloned,
      sendUpdates: "none",
    });

    clonedEvents.push(insertResponse.data);
  }

  return clonedEvents;
}

/**
 * Initializes a "shadow session" calendar.
 * Used for isolated editing and later syncing.
 *
 * @param {string} accessToken
 * @param {string} startStr - ISO datetime.
 * @param {string} endStr - ISO datetime.
 * @returns {Promise<{shadowCalendarId: string, events: Array<Object>}>}
 */
export async function initializeShadowSession(accessToken, startStr, endStr) {
  if (!startStr || !endStr) {
    throw new Error("Both start and end date strings are required.");
  }

  const start = new Date(startStr);
  const end = new Date(endStr);

  // Enforce maximum session duration (7 days)
  if (end.getTime() - start.getTime() > 7 * 24 * 60 * 60 * 1000) {
    const error = new Error("Session interval cannot exceed 7 days.");
    error.statusCode = 400;
    throw error;
  }

  // Store session bounds as JSON metadata in calendar description
  const sessionMeta = JSON.stringify({
    start: start.toISOString(),
    end: end.toISOString(),
  });

  const shadowCalendar = await createCalendar(
    accessToken,
    "Shadow Session Calendar",
    sessionMeta
  );

  const clonedEvents = await cloneEvents(
    accessToken,
    "primary",
    shadowCalendar.id,
    start.toISOString(),
    end.toISOString()
  );

  return {
    shadowCalendarId: shadowCalendar.id,
    events: clonedEvents,
  };
}

/**
 * Synchronizes shadow calendar changes back to primary calendar.
 * Handles updates, creations, and deletions.
 *
 * @param {string} accessToken
 * @param {string} shadowCalendarId
 * @returns {Promise<{updated:number, created:number, deleted:number}>}
 */
export async function syncShadowToPrimary(accessToken, shadowCalendarId) {
  if (!accessToken || !shadowCalendarId) {
    throw new Error("Access token and shadow ID required.");
  }

  const calendar = createCalendarClient(accessToken);

  // Fetch shadow calendar metadata to determine sync window
  let timeMin, timeMax;
  try {
    const calMeta = await calendar.calendars.get({ calendarId: shadowCalendarId });
    if (calMeta.data.description) {
      const meta = JSON.parse(calMeta.data.description);
      timeMin = meta.start;
      timeMax = meta.end;
    }
  } catch {
    console.warn("Metadata unavailable, falling back to event bounds.");
  }

  // Fetch all shadow events
  const shadowEvents = [];
  let pageToken;
  do {
    const response = await calendar.events.list({
      calendarId: shadowCalendarId,
      singleEvents: true,
      maxResults: 50,
      pageToken,
    });
    shadowEvents.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  // Map shadow events by `originalEventId`
  const shadowByOriginalId = new Map();
  const newShadowEvents = [];

  for (const shadow of shadowEvents) {
    const originalId = shadow.extendedProperties?.private?.originalEventId;
    originalId
      ? shadowByOriginalId.set(originalId, shadow)
      : newShadowEvents.push(shadow);
  }

  // Fetch primary events in the same interval
  const primaryEvents = [];
  pageToken = undefined;
  do {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      maxResults: 50,
      pageToken,
    });
    primaryEvents.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  const stats = { updated: 0, created: 0, deleted: 0 };

  // Apply updates and deletions
  for (const primary of primaryEvents) {
    const shadow = shadowByOriginalId.get(primary.id);

    if (shadow) {
      // Compare significant fields
      if (
        JSON.stringify(primary.start) !== JSON.stringify(shadow.start) ||
        JSON.stringify(primary.end) !== JSON.stringify(shadow.end) ||
        primary.summary !== shadow.summary ||
        primary.description !== shadow.description ||
        primary.location !== shadow.location
      ) {
        await updateEvent(accessToken, primary.id, "primary", {
          summary: shadow.summary,
          start: shadow.start,
          end: shadow.end,
          description: shadow.description,
          location: shadow.location,
        }, "none");

        stats.updated++;
      }
    } else {
      // Deleted in shadow, then delete in primary
      await deleteEvent(accessToken, primary.id, "primary", "none");
      stats.deleted++;
    }
  }

  // Create new events from shadow
  for (const shadow of newShadowEvents) {
    await createEvent(accessToken, "primary", {
      summary: shadow.summary,
      start: shadow.start,
      end: shadow.end,
      description: shadow.description,
      location: shadow.location,
    });
    stats.created++;
  }

  return stats;
}
