# Multi-stage build for Molam UI Storybook

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Storybook
RUN npm run build-storybook

# Stage 2: Production
FROM nginx:alpine AS production

# Copy custom nginx config
COPY deploy/nginx/storybook.conf /etc/nginx/conf.d/default.conf

# Copy built storybook from builder
COPY --from=builder /app/storybook-static /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
