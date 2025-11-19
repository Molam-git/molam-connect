# Brique 113: SIRA Inference Service Docker Image
# Multi-stage build for optimized production image

FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================================================
# Production image
# ============================================================================

FROM node:18-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tini

# Create models directory
RUN mkdir -p /models && chown -R node:node /models

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built code from builder
COPY --from=builder /app/dist ./dist

# Use non-root user
USER node

# Environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    MODELS_DIR=/models \
    LOG_LEVEL=info

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start service
CMD ["node", "dist/server.js"]
