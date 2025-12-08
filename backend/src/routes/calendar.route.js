import { Router } from "express";
import { handleGoogleApiError } from "../utils/utils.js";
import { requireAccessToken } from "../middleware/authMiddleware.js";
import * as calendarService from "../services/calendarService.js";

const router = Router();

/**
 * Creates a new event in the user's Google Calendar.
 */
router.post("/", requireAccessToken, async (req, res) => {
  try {
    const { calendarId = "primary", event } = req.body || {};
    const data = await calendarService.createEvent(
      req.accessToken,
      calendarId,
      event
    );
    return res.status(201).json(data);

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
    const { calendarId = "primary", event, sendUpdates = "all" } = req.body || {};
    const data = await calendarService.updateEvent(
      req.accessToken,
      eventId,
      calendarId,
      event,
      sendUpdates
    );
    return res.status(200).json(data);

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
    const { calendarId = "primary", sendUpdates = "all" } = req.body || {};
    await calendarService.deleteEvent(req.accessToken, eventId, calendarId, sendUpdates);
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
    const data = await calendarService.listEvents(req.accessToken, req.query);
    return res.status(200).json(data);

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Searches for calendar events matching a text query.
 * Returns a list of events whose summary, description, or location matches the query.
 */
router.get("/search", requireAccessToken, async (req, res) => {
  try {
    const { query } = req.query;
    const data = await calendarService.searchEvents(
      req.accessToken,
      query,
      req.query
    );
    return res.status(200).json(data);

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Commits changes from the shadow calendar back to the primary calendar.
 * Deletes the shadow calendar after syncing.
 */
router.post("/shadow/commit", requireAccessToken, async (req, res) => {
  try {
    const { shadowCalendarId } = req.body || {};

    if (!shadowCalendarId) {
      return res.status(400).json({
        error: "shadowCalendarId is required in request body.",
      });
    }

    // Sync shadow calendar to primary calendar
    const syncResult = await calendarService.syncShadowToPrimary(
      req.accessToken,
      shadowCalendarId
    );

    // Delete shadow calendar
    await calendarService.deleteCalendar(req.accessToken, shadowCalendarId);

    // Return sync summary
    return res.status(200).json({
      success: true,
      ...syncResult,
    });
    
  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

/**
 * Discards a shadow calendar session without syncing.
 * Permanently deletes the specified shadow calendar.
 */
router.delete("/shadow/:calendarId", requireAccessToken, async (req, res) => {
  try {
    const { calendarId } = req.params;
    
    // Call service to delete the calendar
    await calendarService.deleteCalendar(req.accessToken, calendarId);

    return res.status(204).end();

  } catch (err) {
    return handleGoogleApiError(res, err);
  }
});

export default router;
