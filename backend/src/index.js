import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import geminiRouter from "./routes/gemini.route.js";
import calendarRouter from "./routes/calendar.route.js";
import oauthRouter from "./routes/oauth.route.js";

// Load environment variables
dotenv.config();

// Create the main application instance
const app = express();

// Allow the server to accept requests from different origins
app.use(cors({ origin: "*" }));

// Use middleware to parse incoming request bodies
app.use(bodyParser.json());

// Mount the endpoint routers
app.use("/api/auth", oauthRouter);
app.use("/api/gemini", geminiRouter);
app.use("/api/events", calendarRouter);

// Define the port the server will listen on
const PORT = process.env.PORT || 5000;

// Start the server and listen for connections
app.listen(PORT, () =>
  console.log(`Google Calendar Assistant server running on port ${PORT}`)
);
