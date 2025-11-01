FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev || npm install --omit=dev

COPY src ./src
COPY .env* ./

FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/.env* ./
COPY --from=build /app/package*.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/index.js"]
