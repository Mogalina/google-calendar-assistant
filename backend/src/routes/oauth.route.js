import { Router } from "express";
import { google } from "googleapis";
import { sendErrorResponse } from "../utils/utils.js";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Initializes a new OAuth2 client instance from Google's API library
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Required scopes for calendar access.
 * Scopes define what permissions your app is requesting from the user.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
];

/**
 * Initiates the OAuth2 flow by redirecting to Google's authorization page.
 */
router.get("/authorize", (_req, res) => {
  // Build Google OAuth URL with required parameters
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI
  });
  
  res.json({ authUrl });
});

/**
 * Handles the callback from Google after the user grants permission.
 */
router.get("/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return sendErrorResponse(res, 400, "Authorization code missing");
  }

  try {
    // Exchange authorization code for access and refresh tokens
    const { tokens } = await oauth2Client.getToken({
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });
    
    // Respond with the tokens to the client
    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });
    
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    return sendErrorResponse(res, 500, "Failed to obtain access token");
  }
});

/**
 * Refreshes an expired access token using the user's stored refresh token.
 * This prevents the need to reauthorize each time a token expires.
 */
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return sendErrorResponse(res, 500, "Refresh token required");
  }

  try {
    // Attach the existing refresh token to OAuth2 client
    oauth2Client.setCredentials({ refresh_token });

    // Request a new access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Return the new access token and its expiration time
    res.json({
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date
    });
    
  } catch (error) {
    console.error("Error refreshing token:", error);
    return sendErrorResponse(res, 500, "Failed to refresh access token");
  }
});

export default router;
