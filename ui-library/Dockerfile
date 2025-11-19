# Stage 1: build storybook
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps (use npm ci for repeatability)
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy sources and build storybook
COPY . .
RUN npm run build-storybook

# Stage 2: serve with nginx
FROM nginx:stable-alpine AS runner
LABEL maintainer="Molam Ops <ops@molam.example>"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built storybook
COPY --from=builder /app/storybook-static /usr/share/nginx/html

# Add simple nginx config to enable SPA fallback and cache headers
COPY ./deploy/nginx/storybook.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

