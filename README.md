# Genestac CRM

This repository contains the Genestac CRM application, divided into a `frontend` (Next.js) and a `backend` (FastAPI).

## Prerequisites

- **Node.js**: Required to run the frontend locally.
- **Docker & Docker Compose**: Recommended for running the backend (and optionally the frontend) in containers.

## Starting the Backend

The backend is built with Python and FastAPI. The easiest way to run it is using Docker.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Start the backend services using the development Docker Compose file:
   ```bash
   docker compose -f docker-compose.dev.yml up
   ```
   *(Note: Depending on your Docker version, you might need to use `docker-compose` instead of `docker compose`.)*

The backend API will now be running and accessible at `http://localhost:8000`.

## Starting the Frontend

The frontend is a Next.js application. It can be run using Node.js locally or via Docker.

### Option 1: Running Locally (Recommended for Development)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install the necessary dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend application will be available at `http://localhost:3000`.

### Option 2: Running with Docker

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Start the frontend container:
   ```bash
   docker compose up
   ```

## Exposing the Backend with ngrok (Required for AI Voice Calls)

Exotel needs a publicly accessible HTTPS URL to stream audio to the backend WebSocket (`/api/webhooks/exotel/stream`). Use **ngrok** to expose your local backend during development.

### Static Domain (Recommended)

If you have a reserved ngrok domain (e.g. `gap-harsh-scheming.ngrok-free.dev`), use:

```bash
ngrok http --url=gap-harsh-scheming.ngrok-free.dev 8000
```

### Dynamic Domain (Quick Start)

For a one-off tunnel without a reserved domain:

```bash
ngrok http 8000
```

> **Note:** With a dynamic domain the URL changes every restart — you'll need to update `BACKEND_PUBLIC_URL` in `backend/.env` each time.

### Update the Environment Variable

After starting ngrok, copy the HTTPS forwarding URL and set it in `backend/.env`:

```env
BACKEND_PUBLIC_URL="https://<your-ngrok-domain>"
```

Then restart the backend container so it picks up the new URL:

```bash
cd backend
docker compose -f docker-compose.dev.yml up
```
