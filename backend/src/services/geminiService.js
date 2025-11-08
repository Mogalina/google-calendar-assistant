import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import yaml from "js-yaml";

dotenv.config();

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Hold the model configuration loaded from file.
let geminiConfig;

// Attempt to read and parse the external Gemini configuration file.
try {
  const configFile = fs.readFileSync("src/config/gemini.yaml", "utf8");
  geminiConfig = yaml.load(configFile);

} catch (e) {
  console.error("Failed to load or parse `gemini.yaml` file:", e);

  // Set a fallback configuration if file reading fails.
  geminiConfig = {
    model: "gemini-2.5-flash",
    config: { 
      systemInstruction: "You are a helpful assistant.", 
      temperature: 0.7,
      maxOutputTokens: 200
    }
  };
}

/**
 * Sends a message to Gemini, continuing a conversation based on the provided history.
 * @param {string} input - The new user prompt.
 * @param {Array<object>} history - The full conversation history (messages) sent by the client.
 * @returns {Promise<{output: string}>} - A promise that resolves to an object containing the 
 *     Gemini output text.
 */
export async function continueChat(input, history = []) {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid input for Gemini");
  }

  try {
    // Create a new, temporary chat session for this specific request.
    const chat = client.chats.create({
        ...geminiConfig,
        // Pre-load the session with the history received from the client. 
        // This is what maintains the conversational context.
        history: history 
    });

    // Send the new user message to the chat session.
    const result = await chat.sendMessage({ message: input });

    const text = result?.text?.trim();
    if (!text || text === "") {
      throw new Error("Gemini returned empty response");
    }

    return { output: text };

  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to call Gemini API");
  }
}
