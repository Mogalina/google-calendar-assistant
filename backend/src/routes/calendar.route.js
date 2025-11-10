import { Router } from "express";
import { google } from "googleapis";
import CalendarEvent from "../models/CalendarEvent.js";
import { sendErrorResponse, handleGoogleApiError } from "../utils/utils.js";
import { requireAccessToken } from "../middleware/authMiddleware.js";

const router = Router();

/**
 * Creates a Google Calendar client instance using the user's access token.
 * The client is authenticated and ready to perform calendar operations.
 * 
 * @param {string} accessToken - OAuth2 access token for Google API.
 * @returns {import('googleapis').calendar_v3.Calendar} Authenticated Google Calendar client.
 */
function createCalendarClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Creates a new event in the user's Google Calendar.
 */
router.post("/", requireAccessToken, async (req, res) => {
  try {
    const { calendarId = "primary", event } = req.body || {};

    // Validate event structure
    const calendarEvent = new CalendarEvent(event);
    const validationError = calendarEvent.validate();
    if (validationError) {
      return sendErrorResponse(res, 400, validationError);
    }

    // Create Google Calendar client using the token from middleware
    const calendar = createCalendarClient(req.accessToken);
    const response = await calendar.events.insert({
      calendarId,
      requestBody: calendarEvent.toObject(),
    });

    // Return the created event data
    return res.status(201).json(response.data);

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Updates an existing Google Calendar event.
 */
router.put("/:eventId", requireAccessToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return sendErrorResponse(res, 400, 'Event identifier parameter is required.');
    }

    const { calendarId = "primary", event, sendUpdates = "all" } = req.body || {};

    // Validate event structure
    const calendarEvent = new CalendarEvent(event);
    const validationError = calendarEvent.validate();
    if (validationError) {
      return sendErrorResponse(res, 400, validationError);
    }

    // Create authenticated Google Calendar client
    const calendar = createCalendarClient(req.accessToken);

    // Update the event in Google Calendar
    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: calendarEvent.toObject(),
      sendUpdates,
    });

    // Return the updated event data
    return res.status(200).json(response.data);

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Deletes an existing Google Calendar event.
 */
router.delete("/:eventId", requireAccessToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return sendErrorResponse(res, 400, 'Event identifier parameter is required.');
    }

    const { calendarId = "primary", sendUpdates = "all" } = req.body || {};

    // Create authenticated Google Calendar client
    const calendar = createCalendarClient(req.accessToken);

    // Delete the event in Google Calendar
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates,
    });

    // Respond with no content to indicate success of deletion
    return res.status(204).end();

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Lists upcoming events from the user's primary calendar.
 * Returns an array of upcoming events sorted by start time.
 */
router.get("/list", requireAccessToken, async (req, res) => {
  try {
    const { calendarId = "primary", maxResults = 20, start, end } = req.query;

    // Compute default time window from now to next 24 hours
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    // Use provided interval if available, otherwise default
    const timeMin = start ? new Date(start).toISOString() : now.toISOString();
    const timeMax = end ? new Date(end).toISOString() : tomorrow.toISOString();

    // Validate custom interval if both are provided
    if (start && end && new Date(start) >= new Date(end)) {
      return sendErrorResponse(res, 400, "Invalid interval: Start time must occur before end time.");
    }

    // Create authenticated Google Calendar client
    const calendar = createCalendarClient(req.accessToken);

    // Fetch events in the given time range
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults: Number(maxResults),
      singleEvents: true,
      orderBy: "startTime",
    });

    return res.status(200).json(response.data.items || []);

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Searches for calendar events matching a text query.
 * Returns a list of events whose summary, description, or location matches the provided 
 * search query.
 */
router.get("/search", requireAccessToken, async (req, res) => {
  try {
    const { query, calendarId = "primary", maxResults = 10 } = req.query;

    // Ensure that a query parameter was provided
    if (!query) {
      return sendErrorResponse(res, 400, "Search query parameter is required.");
    }

    // Create an authenticated Google Calendar client
    const calendar = createCalendarClient(req.accessToken);

    // Perform the search across event summaries, descriptions, and locations
    const response = await calendar.events.list({
      calendarId,
      query,
      maxResults: Number(maxResults),
      singleEvents: true,
      orderBy: "startTime",
    });

    // Return matching events
    return res.status(200).json(response.data.items || []);
    
  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

export default router;
