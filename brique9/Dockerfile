FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --only=production && npm cache clean --force

COPY src/ ./src/
RUN npm run build

FROM node:18-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 -S nodejs
RUN adduser -S molam -u 1001

COPY --from=builder --chown=molam:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=molam:nodejs /app/dist ./dist
COPY --from=builder --chown=molam:nodejs /app/package.json ./

USER molam

EXPOSE 8080

CMD ["node", "dist/index.js"]