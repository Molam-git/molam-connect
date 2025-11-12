# Brique 69 - Analytics Dashboard
# Multi-stage Docker build

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Install dependencies and build
RUN npm ci --only=production && \
    npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/migrations ./migrations

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S analytics -u 1001 && \
    chown -R analytics:nodejs /app

USER analytics

EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8082/health || exit 1

CMD ["node", "dist/server.js"]
