import { google } from "googleapis";
import CalendarEvent from "../models/CalendarEvent.js";

/**
 * Creates a Google Calendar client instance.
 */
export function createCalendarClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function getEvent(accessToken, eventId, calendarId = "primary") {
  if (!eventId) {
    throw new Error("Event identifier is required.");
  }
  const calendar = createCalendarClient(accessToken);
  const response = await calendar.events.get({ calendarId, eventId });
  return response.data;
}

export async function createEvent(accessToken, calendarId = "primary", eventData) {
  const calendar = createCalendarClient(accessToken);
  const calendarEvent = new CalendarEvent(eventData);
  const validationError = calendarEvent.validate();
  if (validationError) throw new Error(validationError);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: calendarEvent.toObject(),
  });
  return response.data;
}

export async function updateEvent(accessToken, eventId, calendarId = "primary", eventData, sendUpdates = "all") {
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

export async function deleteEvent(accessToken, eventId, calendarId = "primary", sendUpdates = "all") {
  if (!eventId) throw new Error("Event identifier is required.");
  const calendar = createCalendarClient(accessToken);
  await calendar.events.delete({ calendarId, eventId, sendUpdates });
  return { success: true, eventId };
}

export async function listEvents(accessToken, { calendarId = "primary", maxResults = 20, start, end } = {}) {
  const calendar = createCalendarClient(accessToken);
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

export async function searchEvents(accessToken, query, { calendarId = "primary", maxResults = 10 } = {}) {
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

// MODIFIED: Accepts description to store session metadata
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

export async function cloneEvents(accessToken, sourceCalendarId, targetCalendarId, startInterval, endInterval) {
  if (!sourceCalendarId || !targetCalendarId || !startInterval || !endInterval) {
    throw new Error("Missing required parameters for cloneEvents.");
  }

  const startDate = new Date(startInterval);
  const endDate = new Date(endInterval);
  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();

  const calendar = createCalendarClient(accessToken);
  const allEvents = [];
  let pageToken;

  do {
    const response = await calendar.events.list({
      calendarId: sourceCalendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 30,
      pageToken,
    });
    const items = response.data.items || [];
    allEvents.push(...items);
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  const clonedEvents = [];

  for (const originalEvent of allEvents) {
    if (originalEvent.status === "cancelled") continue;

    const cloned = JSON.parse(JSON.stringify(originalEvent));
    if (!cloned.extendedProperties) cloned.extendedProperties = {};
    if (!cloned.extendedProperties.private) cloned.extendedProperties.private = {};

    cloned.extendedProperties.private.originalEventId = originalEvent.id;

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

// MODIFIED: Stores session bounds in description for reliable syncing
export async function initializeShadowSession(accessToken, startStr, endStr) {
  if (!startStr || !endStr) throw new Error("Both start and end date strings are required.");
  
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end.getTime() - start.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (diffMs > sevenDaysMs) {
    const error = new Error("Session interval cannot exceed 7 days.");
    error.statusCode = 400;
    throw error;
  }

  // Store metadata in description as JSON string
  const sessionMeta = JSON.stringify({ start: start.toISOString(), end: end.toISOString() });
  const shadowCalendar = await createCalendar(accessToken, "Shadow Session Calendar", sessionMeta);
  const shadowCalendarId = shadowCalendar.id;

  if (!shadowCalendarId) {
    const error = new Error("Failed to obtain shadow calendar id.");
    error.statusCode = 500;
    throw error;
  }

  const clonedEvents = await cloneEvents(
    accessToken,
    "primary",
    shadowCalendarId,
    start.toISOString(),
    end.toISOString()
  );

  return {
    shadowCalendarId,
    events: clonedEvents,
  };
}

// FIXED: Properly handles updates vs. creates by checking originalEventId
export async function syncShadowToPrimary(accessToken, shadowCalendarId) {
  if (!accessToken || !shadowCalendarId) throw new Error("Access token and shadow ID required.");

  const calendar = createCalendarClient(accessToken);

  // 1. Fetch Shadow Calendar Metadata to get Time Window
  let timeMin, timeMax;
  try {
    const calMeta = await calendar.calendars.get({ calendarId: shadowCalendarId });
    if (calMeta.data.description) {
        const meta = JSON.parse(calMeta.data.description);
        timeMin = meta.start;
        timeMax = meta.end;
    }
  } catch (e) {
    console.warn("Could not read session metadata, falling back to event bounds.", e);
  }

  // 2. Fetch All Shadow Events
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

  if (shadowEvents.length === 0 && !timeMin) {
    return { updated: 0, created: 0, deleted: 0 };
  }

  // 3. Fallback: Determine boundaries from events if metadata missing
  if (!timeMin || !timeMax) {
      let minStart = null;
      let maxEnd = null;
      for (const event of shadowEvents) {
        const startStr = event.start?.dateTime || event.start?.date;
        const endStr = event.end?.dateTime || event.end?.date || startStr;
        if (!startStr) continue;
        const s = new Date(startStr);
        const e = new Date(endStr);
        if (!minStart || s < minStart) minStart = s;
        if (!maxEnd || e > maxEnd) maxEnd = e;
      }
      if (minStart && maxEnd) {
          timeMin = minStart.toISOString();
          timeMax = maxEnd.toISOString();
      } else {
          return { updated: 0, created: 0, deleted: 0 };
      }
  }

  // 4. Fetch Primary Events using the FULL Session Window
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

  // 5. Index Shadow Events - FIXED: Separate tracking for linked and new events
  const shadowByOriginalId = new Map();
  const newShadowEvents = [];

  for (const shadow of shadowEvents) {
    const originalId = shadow.extendedProperties?.private?.originalEventId;
    if (originalId) {
      // This shadow event is linked to a primary event
      shadowByOriginalId.set(originalId, shadow);
    } else {
      // This is a genuinely new event created in shadow
      newShadowEvents.push(shadow);
    }
  }

  // 6. Create a set of all primary event IDs that exist in the window
  const primaryEventIds = new Set(primaryEvents.map(e => e.id));

  const stats = { updated: 0, created: 0, deleted: 0 };

  // 7. Process updates and deletions
  // For each primary event, check if it has a corresponding shadow event
  for (const primary of primaryEvents) {
    const primaryId = primary.id;
    const shadowMatch = shadowByOriginalId.get(primaryId);

    if (shadowMatch) {
      // Shadow event exists for this primary event - check for changes
      const sameStart = JSON.stringify(primary.start) === JSON.stringify(shadowMatch.start);
      const sameEnd = JSON.stringify(primary.end) === JSON.stringify(shadowMatch.end);
      const sameSummary = primary.summary === shadowMatch.summary;
      const sameDescription = primary.description === shadowMatch.description;
      const sameLocation = primary.location === shadowMatch.location;

      if (!sameStart || !sameEnd || !sameSummary || !sameDescription || !sameLocation) {
        // Update the primary event with shadow changes
        const updatedEventData = {
          summary: shadowMatch.summary,
          start: shadowMatch.start,
          end: shadowMatch.end,
          description: shadowMatch.description,
          location: shadowMatch.location,
          // Keep primary's extended properties (don't copy shadow's lineage tracking)
          extendedProperties: primary.extendedProperties,
        };
        
        await updateEvent(accessToken, primaryId, "primary", updatedEventData, "none");
        stats.updated += 1;
        console.log(`[Sync] Updated primary event: ${primary.summary} (${primaryId})`);
      }
    } else {
      // No shadow event for this primary event - it was deleted in shadow
      await deleteEvent(accessToken, primaryId, "primary", "none");
      stats.deleted += 1;
      console.log(`[Sync] Deleted primary event: ${primary.summary} (${primaryId})`);
    }
  }

  // 8. Process new event creations
  // Only create events for shadow events that have NO originalEventId
  for (const shadow of newShadowEvents) {
    const newEventData = {
      summary: shadow.summary,
      start: shadow.start,
      end: shadow.end,
      description: shadow.description,
      location: shadow.location,
      // Note: We deliberately don't copy attendees to avoid sending invites
    };
    
    await createEvent(accessToken, "primary", newEventData);
    stats.created += 1;
    console.log(`[Sync] Created new primary event: ${shadow.summary}`);
  }

  return stats;
}
