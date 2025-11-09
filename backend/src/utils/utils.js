/**
 * Utility function to send standardized JSON error responses.
 * Ensures consistent error formatting across all routes.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {number} status - HTTP status code for the error.
 * @param {string} message - Human-readable error message explaining what went wrong.
 * @param {Object} [metadata] - Optional extra data to include for debugging or context.
 * @returns {import('express').Response} Returns the Express JSON response object.
 */
export function sendErrorResponse(res, status, message, metadata) {
  return res.status(status).json({
    error: {
      status, 
      message, 
      ...(metadata ? { metadata } : {}),
    },
  });
}

/**
 * Extracts the Bearer access token from the HTTP Authorization header.
 *
 * @param {import('express').Request} req - Express request object containing headers.
 * @returns {string|null} Returns the extracted token string if found, otherwise null.
 */
export function extractAccessToken(req) {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.split("Bearer ");
  return token?.trim() || null;
}

/**
 * Handles Google Calendar API errors in a unified and descriptive way.
 * Converts API errors into readable messages with proper HTTP status codes.
 *
 * @param {import('express').Response} res - Express response object used to send the response.
 * @param {Error|Object} err - Error object thrown.
 * @returns {import('express').Response} Returns a standardized JSON error response.
 */
export function handleGoogleApiError(res, err) {
  // Attempt to extract a meaningful HTTP status code
  const status = err?.code || err?.response?.status || err?.status || 500;

  // Extract the raw error message for debugging
  const rawMessage =
    err?.response?.data?.error?.message || err?.message || "Unknown error from Calendar API.";

  // Map common Google API errors to descriptive messages
  const messages = {
    401: "Unauthorized: Invalid or expired access token, or missing required scopes.",
    403: "Forbidden: Insufficient permissions or rate limit exceeded.",
    404: "Not Found: The requested calendar or event does not exist.",
    500: "Internal Error: Something went wrong with Google Calendar API.",
  };

  const message = messages[status] || messages[500];
  return sendErrorResponse(res, status, message, { raw: rawMessage });
}
