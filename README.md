# KrishiSahay 2.0 – AI Voice Assistant (Prototype)

Minimal full‑stack prototype demonstrating multilingual voice, crop and fertilizer recommendation, irrigation advice with weather, and mock disease detection.

## Features
- Multilingual voice assistant (English, Hindi, Marathi)
- Crop recommendation by land area and soil type
- Fertilizer suggestion from pH, moisture, NPK
- Irrigation advice using soil moisture and OpenWeatherMap forecast
- Disease detection (mock based on filename) with language advice

## Tech Stack
- Backend: Node.js + Express
- Frontend: Static HTML/CSS/JS (Web Speech API)
- TTS: google-tts-api
- Weather: OpenWeatherMap (optional; falls back to stub)

## Setup
1. Install Node.js (v18+ recommended).
2. Copy environment template and set your key (optional):
   - Create `.env` from `.env.example` and set `OPENWEATHER_API_KEY`.
3. Install dependencies and start:

```powershell
npm install
npm start
```

The app serves on http://localhost:3000

## Deploy

### Docker
Build and run locally:

```bash
docker build -t krishisahay:latest .
docker run -p 3000:3000 --env-file .env krishisahay:latest
```

Deploy to any container host (Render, Railway, Fly.io, Azure Web App for Containers, etc.). Ensure environment variables are configured.

### Without Docker (Node)
Use Node 18+ on your server:

```bash
npm ci --omit=dev || npm install --omit=dev
npm start
```

Set `PORT` and `OPENWEATHER_API_KEY` in the environment or `.env`.

### Netlify (Recommended for static + functions)
This project is configured for Netlify with Functions to serve the Express API.

1) Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2) In Netlify:
   - New Site from Git → select your repo
   - Build settings:
     - Publish directory: `public`
     - Functions directory: `netlify/functions`
     - No build command is required (static)
   - Environment variables (optional):
     - `OPENWEATHER_API_KEY` = your key
3) Deploy. The backend is served at `/.netlify/functions/api/*` and is proxied via `/api/*` (see `netlify.toml`).

## Endpoints (quick reference)
- POST `/api/tts` { text, lang }
- POST `/api/crop/recommend` { landArea, unit, soilType, language }
- POST `/api/soil/fertilizer` { pH, moisture, N, P, K, crop }
- GET `/api/weather?city=...` or `?lat=..&lon=..`
- POST `/api/irrigation/advice` { moisture, city | lat/lon }
- POST `/api/disease/detect` form-data: image, language

## Notes
- STT uses browser Web Speech API; availability varies by browser (Chrome recommended).
- Disease detection is a stub; replace with a CNN model (TensorFlow.js/TF‑Serving) later.
- If no OpenWeather key, weather/irrigation uses safe stub values.
