import { Router } from "express";
import { google } from "googleapis";

const router = Router();

function sendError(res, status, message, details) {
  return res.status(status).json({
    error: { status, message, ...(details ? { details } : {}) },
  });
}

function validateEvent(event) {
  if (!event || typeof event !== "object") {
    return 'Body must include an "event" object (Google Calendar Event resource).';
  }
  if (
    !event.summary ||
    typeof event.summary !== "string" ||
    !event.summary.trim()
  ) {
    return "event.summary (string) is required.";
  }

  const hasStart = !!event.start && (event.start.dateTime || event.start.date);
  const hasEnd = !!event.end && (event.end.dateTime || event.end.date);
  if (!hasStart || !hasEnd) {
    return "event.start and event.end are required (with either dateTime or date).";
  }
  return null;
}

router.post("/events", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const [, accessToken] = authHeader.split("Bearer ");
    if (!accessToken) {
      return sendError(
        res,
        401,
        "Missing or invalid Authorization header. Expected: Bearer <ACCESS_TOKEN>."
      );
    }

    const { calendarId = "primary", event } = req.body || {};

    const sanity = validateEvent(event);
    if (sanity) {
      return sendError(res, 400, sanity);
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return res.status(201).json(response.data);
  } catch (err) {
    const status = err?.code || err?.response?.status || err?.status || 500;

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Calendar API error";

    if (status === 401) {
      return sendError(
        res,
        401,
        "Unauthorized — invalid/expired access token or insufficient scopes.",
        { raw: message }
      );
    }
    if (status === 403) {
      return sendError(
        res,
        403,
        "Forbidden — insufficient permissions for this calendar or rate limit.",
        { raw: message }
      );
    }
    if (status === 404) {
      return sendError(
        res,
        404,
        "Not Found — invalid calendarId or resource.",
        { raw: message }
      );
    }
    return sendError(res, 500, "Internal error while creating event.", {
      raw: message,
    });
  }
});

router.put("/events/:eventId", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const [, accessToken] = authHeader.split("Bearer ");
    if (!accessToken) {
      return sendError(
        res,
        401,
        "Missing or invalid Authorization header. Expected: Bearer <ACCESS_TOKEN>."
      );
    }

    const { eventId } = req.params || {};
    if (!eventId) {
      return sendError(res, 400, 'Param "eventId" is required.');
    }

    const {
      calendarId = "primary",
      event,
      sendUpdates = "all",
    } = req.body || {};

    const sanity = validateEvent(event);
    if (sanity) {
      return sendError(res, 400, sanity);
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
      sendUpdates,
    });

    return res.status(200).json(response.data);
  } catch (err) {
    const status = err?.code || err?.response?.status || err?.status || 500;

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Calendar API error";

    if (status === 401) {
      return sendError(
        res,
        401,
        "Unauthorized — invalid/expired access token or insufficient scopes.",
        { raw: message }
      );
    }
    if (status === 403) {
      return sendError(
        res,
        403,
        "Forbidden — insufficient permissions for this calendar or rate limit.",
        { raw: message }
      );
    }
    if (status === 404) {
      return sendError(res, 404, "Not Found — invalid calendarId or eventId.", {
        raw: message,
      });
    }
    return sendError(res, 500, "Internal error while updating event.", {
      raw: message,
    });
  }
});

export default router;
