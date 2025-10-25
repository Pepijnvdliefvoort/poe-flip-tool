# Backend Dockerfile for PoE Flip Tool
# Build: docker build -t poe-flip-backend:latest -f backend/Dockerfile .
# Run (dev/test): docker run --env-file backend/.env -p 8000:8000 poe-flip-backend:latest

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy entire project root (for backend imports to work)
WORKDIR /app/backend
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Expose FastAPI port
EXPOSE 8000

# Healthcheck (optional)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -f http://localhost:8000/ || exit 1

# Entrypoint
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
