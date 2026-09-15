# Automedi 360 — Frontend + Backend

This splits the original single-file prototype into a real client/server app:

```
automedi360-fullstack/
  backend/     Node.js + Express API — the dual engine, patient roster, audit log, stats
  frontend/    Static HTML/CSS/JS client that talks to the API over fetch()
```

## Run it (fastest path)

```
cd backend
npm install
npm start
```

Open **http://localhost:4000** — Express serves the frontend and the API from the
same origin, so there's nothing else to configure.

## Run frontend and backend separately

You can also host them apart (e.g. frontend on GitHub Pages / Netlify, backend on
Render / Railway / Fly.io):

1. Deploy `backend/` anywhere that runs Node (`npm install && npm start`, respects
   the `PORT` env var). CORS is already enabled, so it can be called from any origin.
2. Deploy `frontend/` as static files anywhere.
3. Edit `frontend/config.js` and point it at the backend's public URL:
   ```js
   window.AUTOMEDI_API_BASE = "https://your-backend.example.com/api";
   ```

## Why the engine is split the way it is

This project's own hackathon story is the reason for the architecture: the first
version called an AI model on every keystroke and it fell over (overlapping
requests, rate limits, ~3s latency). The fix was a fast client-side engine for the
live UI and the heavy processing behind an explicit "Run Engine" button.

The frontend/backend split here keeps that lesson intact:

- **`GET /api/keywords`** is called **once**, when the page loads. The frontend
  caches that list and uses it to do cheap, instant, purely client-side regex
  highlighting in the note editor as the doctor types (`✨ Live Entity Linker`).
  No network call happens per keystroke.
- **`POST /api/engine/run`** is the one authoritative computation — codes,
  AI confidence, NABH/TPA compliance checks, the patient summary, and the
  financial breakdown. It only runs when "Run Engine" is clicked, exactly like
  the original single-file version, except now the logic lives in one place on
  the server (`backend/src/engine.js`) instead of being duplicated in every
  client.

## API reference

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/api/patients`          | List the full roster (seed + registered) |
| GET    | `/api/patients/:id`      | Fetch one patient |
| POST   | `/api/patients`          | Register a new IPD/OPD/ER patient |
| PATCH  | `/api/patients/:id`      | Update note / consultant / location / tpa |
| DELETE | `/api/patients/:id`      | Remove a patient (seed patients are protected) |
| POST   | `/api/engine/run`        | Run the dual engine on `{ patientId, note }` |
| GET    | `/api/audit?limit=25`    | HITL audit log, newest first |
| POST   | `/api/audit/approve`     | Log a code approval `{ patientId, code, fee }` |
| GET    | `/api/stats`             | Roster size, cumulative revenue/codes/approvals, revenue by department |
| GET    | `/api/keywords`          | The keyword → code/fee/jargon table the engine matches against |
| GET    | `/api/health`            | Liveness check |

## Persistence

The backend stores its state in `backend/data/store.json` — created automatically
on first run from the four seed patients, so the app always starts in a populated,
realistic state. It's a plain JSON file on disk, which is intentional for a
prototype: zero setup, and it survives a server restart. Swap `backend/src/store.js`
for a real database before this carries real traffic or concurrent writers.

## Deploying to GitHub

Push this whole folder to a repo as-is. `backend/.gitignore` already excludes
`node_modules/` and the generated `data/store.json`. If you want a live demo
link rather than "clone and run," deploy `backend/` to a Node host (Render's
free tier works well) and, if you split the frontend out, point
`frontend/config.js` at that host's URL as described above.
