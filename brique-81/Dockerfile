# =====================================================================
# Brique 81 — Billing Overages Dockerfile
# =====================================================================
# Multi-stage build for optimized production image
# =====================================================================

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY src ./src
COPY __tests__ ./__tests__

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy SQL schema for migrations
COPY sql ./sql

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/overages/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "dist/server.js"]
