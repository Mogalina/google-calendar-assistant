import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import geminiRouter from "./routes/gemini.routes.js";
import calendarEventsRouter from "./routes/calendarEvents.route.js";

// Load environment variables
dotenv.config();

// Create the main application instance
const app = express();

// Use middleware to parse incoming request bodies
app.use(bodyParser.json());

// Mount the endpoint routers
app.use("/api/gemini", geminiRouter);
app.use("/api/events", calendarEventsRouter);

// Define the port the server will listen on
const PORT = process.env.PORT || 5000;

// Start the server and listen for connections
app.listen(PORT, () => console.log(`Google Calendar Assistant server running on port ${PORT}`));
