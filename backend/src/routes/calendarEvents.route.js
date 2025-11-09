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

export default router;
