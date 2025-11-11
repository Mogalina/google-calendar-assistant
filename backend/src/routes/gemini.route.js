import express from "express";
import { continueChat } from "../services/geminiService.js";
import { sendErrorResponse, extractAccessToken } from "../utils/utils.js";

const router = express.Router();

/**
 * Handles incoming chat messages from the client. This endpoint is stateless, meaning the client 
 * sends the entire conversation history with each request.
 */
router.post("/", async (req, res) => {
  try {
    // Destructure the user's new message `input` and the conversation history `history` from the 
    // request body
    const { input, history } = req.body;

    // Require the `input` field to be present
    if (!input || input === "") {
      return sendErrorResponse(res, 400, "Missing or empty input field");
    }

    // Require access token for calendar operations
    const accessToken = extractAccessToken(req);
    if (!accessToken) {
      return sendErrorResponse(res, 401, "Access token required.");
    }

    // Pass the input and history to the service to be processed by Gemini
    // `history` can be undefined or an empty array for the first message
    const response = await continueChat(input, history || [], accessToken);

    // Send the structured response from the Gemini service back to the client
    res.json(response);
    
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return sendErrorResponse(res, 500, "Failed to call Gemini API", { raw: error.message });
  }
});

export default router;
