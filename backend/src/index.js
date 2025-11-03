import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import geminiRouter from "./routes/gemini.js";

// Load environment variables.
dotenv.config();

// Create the main application instance.
const app = express();

// Use middleware to parse incoming request bodies.
app.use(bodyParser.json());

// Mount the endpoint routers.
app.use("/api/gemini", geminiRouter);

// Define the port the server will listen on, or default to 5000 if not specified.
const PORT = process.env.PORT || 5000;

// Start the server and listen for connections.
app.listen(PORT, () => console.log(`Google Calendar Assistant server running on port ${PORT}`));
