/**
 * This defines the expected structure of a Google Calendar event.
 * Only the most relevant fields are required for performing operations.
 */
class CalendarEvent {
  /**
   * @param {Object} data - Raw event data from request.
   * @param {string} data.summary - The title or summary of the event.
   * @param {Object} data.start - The start time or date object.
   * @param {string} [data.start.dateTime] - RFC3339 timestamp for specific time events.
   * @param {string} [data.start.date] - Date string for all-day events.
   * @param {Object} data.end - The end time or date object.
   * @param {string} [data.end.dateTime] - RFC3339 timestamp for specific time events.
   * @param {string} [data.end.date] - Date string for all-day events.
   * @param {string} [data.description] - Optional description.
   * @param {Array<Object>} [data.attendees] - Optional attendees.
   * @param {string} [data.location] - Optional location.
   */
  constructor(data = {}) {
    this.summary = data.summary;
    this.start = data.start;
    this.end = data.end;
    this.description = data.description;
    this.attendees = data.attendees;
    this.location = data.location;
  }

  /**
   * Validates the event instance according to Google Calendar requirements.
   * @returns {string|null} Returns a descriptive error message or null if valid.
   */
  validate() {
    // Ensure the event has a title
    if (!this.summary || typeof this.summary !== "string" || !this.summary.trim()) {
      return "An event title is required.";
    }

    // Ensure the start object is defined
    if (!this.start || typeof this.start !== "object") {
      return "Every event must include a start time or date.";
    }

    // Ensure the end object is defined
    if (!this.end || typeof this.end !== "object") {
      return "Every event must include an end time or date.";
    }

    const hasStart = this.start.dateTime || this.start.date;
    const hasEnd = this.end.dateTime || this.end.date;

    // Check for both start and end temporal values
    if (!hasStart && !hasEnd) {
      return "Events must have both a start and end time or date.";
    }

    // Check start time occurs before end time
    if (this.start.dateTime && this.end.dateTime) {
      const startDate = new Date(this.start.dateTime);
      const endDate = new Date(this.end.dateTime);
      if (startDate >= endDate) {
        return "The event's start time must occur before its end time.";
      }
    }

    return null;
  }

  /**
   * Converts the class instance into a plain object suitable for Google API.
   * @returns {Object} Plain object representation of the event.
   */
  toObject() {
    return {
      summary: this.summary,
      start: this.start,
      end: this.end,
      description: this.description,
      attendees: this.attendees,
      location: this.location,
    };
  }
}

export default CalendarEvent;
