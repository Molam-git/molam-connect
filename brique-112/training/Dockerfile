# Brique 112: Training Job Docker Image

FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgomp1 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy training code
COPY features.py .
COPY train.py .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV MODEL_NAME=sira-fraud-detector
ENV PRODUCT=wallet

# Default command (override with as_of_date)
CMD ["python", "train.py", "2024-01-01"]
