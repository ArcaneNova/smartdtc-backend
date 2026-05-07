# backend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
# Note: Render injects $PORT — server.js already reads process.env.PORT
