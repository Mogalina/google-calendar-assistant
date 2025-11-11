import { extractAccessToken, sendErrorResponse } from "../utils/utils.js";

/**
 * Middleware to verify that a valid OAuth2 access token is present in the Authorization header.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 */
export function requireAccessToken(req, res, next) {
  const accessToken = extractAccessToken(req);
  if (!accessToken) {
    return sendErrorResponse(res, 401, 'Missing or invalid Authorization header.'
    );
  }
  
  // Attach the token to the request object for use in route handlers
  req.accessToken = accessToken;
  next();
}
