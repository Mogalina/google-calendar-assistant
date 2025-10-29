# === Build ===
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Omit development dependencies
RUN npm install --omit=dev

# Copy backend source code
COPY backend/src ./src

# Copy environment files
COPY backend/.env* ./

# === Run final minimal image ===
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy built app and dependencies from builder stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/.env* ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the app port
EXPOSE 8080

# Start the backend
CMD ["node", "src/index.js"]
