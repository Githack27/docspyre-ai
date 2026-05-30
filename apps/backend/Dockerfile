FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend and database packages
COPY apps/database /app/database
COPY apps/backend /app/backend

# Install the packages in editable mode to register imports (app and db)
RUN pip install --no-cache-dir -e /app/database -e /app/backend

# Copy startup script
COPY apps/backend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000

ENTRYPOINT ["/app/start.sh"]
