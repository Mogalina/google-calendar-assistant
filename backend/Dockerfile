# === Build ===
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Omit development dependencies
RUN npm install --omit=dev

# Copy application code
COPY src ./src

# === Run final minimal image ===
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy built app and dependencies from builder stage
COPY --from=build /app /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the app port
EXPOSE 8080

# Start the backend
CMD ["node", "src/index.js"]
