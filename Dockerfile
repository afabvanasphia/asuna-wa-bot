# Multi-stage Dockerfile for WAssist (Asuna AI Agent)
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist
COPY assets/ ./assets/

# Volumes for persistent session and database
VOLUME ["/app/auth_info_baileys", "/app/data"]

CMD ["node", "dist/index.js"]
