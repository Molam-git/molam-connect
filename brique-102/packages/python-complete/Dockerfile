# Molam Python SDK - Docker Image
# Optimized for production deployments

# Build stage
FROM python:3.11-slim as builder

WORKDIR /build

# Install poetry
RUN pip install --no-cache-dir poetry==1.7.1

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-dev --no-interaction --no-ansi

# Copy source code
COPY molam_sdk ./molam_sdk
COPY examples ./examples

# Runtime stage
FROM python:3.11-slim

LABEL maintainer="Molam Labs <dev@molam.io>"
LABEL description="Molam Python SDK - Production Runtime"

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /build/molam_sdk ./molam_sdk
COPY --from=builder /build/examples ./examples

# Create non-root user
RUN useradd -m -u 1000 molam && chown -R molam:molam /app
USER molam

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "from molam_sdk import MolamClient; print('OK')" || exit 1

# Default command
CMD ["python", "examples/quickstart.py"]
