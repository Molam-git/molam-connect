# SOUS-BRIQUE 140quater-1 — Simulator Docker Image
# Image pour exécuter simulations Node.js en sandbox

FROM node:20-alpine

# Security: non-root user
RUN addgroup -g 1001 -S simulator && \
    adduser -u 1001 -S simulator -G simulator

# Working directory
WORKDIR /app

# Copy simulation harness
COPY run_simulation.js /app/run_simulation.js

# Install minimal dependencies (tar-fs for container)
RUN npm install --no-save tar-fs

# Switch to non-root
USER simulator

# Create work volume
VOLUME /work

# Default command (overridden by orchestrator)
CMD ["node", "/app/run_simulation.js", "/work/scenario.json"]
