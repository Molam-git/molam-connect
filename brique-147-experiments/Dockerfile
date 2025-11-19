# Multi-stage Dockerfile for production
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-alpine AS runtime

LABEL maintainer="Molam Platform Engineering <engineering@molam.io>"
LABEL org.opencontainers.image.source="https://github.com/molam/molam-connect"
LABEL org.opencontainers.image.description="Molam Experiments - A/B Testing Platform"

WORKDIR /app

# Install runtime dependencies for PostgreSQL client
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    postgresql-client \
    curl \
    ca-certificates && \
    rm -rf /var/cache/apk/*

# Copy built application
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node database/migrations ./migrations
COPY --chown=node:node package.json ./

# Create necessary directories
RUN mkdir -p /app/.cache /tmp && \
    chown -R node:node /app/.cache /tmp

# Environment
ENV NODE_ENV=production \
    PORT=8080 \
    NODE_OPTIONS="--max-old-space-size=1024"

# Switch to non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

EXPOSE 8080

CMD ["node", "dist/server.js"]
