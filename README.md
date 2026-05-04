# AI-Powered Chatbot

A full-fledged AI chatbot powered by **Anthropic Claude** (`claude-sonnet-4-6`) with a **FastAPI** backend that streams tokens via Server-Sent Events to a lightweight **vanilla HTML/CSS/JS** frontend served from the same process.

## Features

- Real-time token streaming (SSE) for fluid conversational feel
- Multi-turn conversation history persisted in SQLite
- Create, switch between, rename, and delete chats
- Configurable system prompt (persona) per conversation
- Auto-generated conversation titles
- Single-process: `uvicorn` runs both API and UI
- Docker-ready with CI/CD via GitHub Actions + Render.com

## Quick Start (Local)

```bash
# 1. Create virtualenv and install
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run
uvicorn app.main:app --reload --port 8000

# 4. Open
# http://localhost:8000
```

## Deploy to the Web (Render.com — Free Tier)

### One-time setup

1. **Fork / push this repo to GitHub** (already done if you're reading this there).

2. **Sign up at [render.com](https://render.com)** (free).

3. **New → Blueprint** → connect your GitHub repo → Render reads `render.yaml` and sets up the service automatically.

4. In the Render dashboard, go to your service → **Environment** tab → add:
   ```
   ANTHROPIC_API_KEY = sk-ant-<your-key>
   ```

5. Click **Deploy** — your app will be live at `https://ai-powered-chatbot.onrender.com` (or similar).

> **Note on free tier:** Render's free plan does not support persistent disks, so chat history is stored on the container's ephemeral filesystem and will reset whenever the service restarts (e.g. after ~15 min of inactivity, or on redeploy). For permanent persistence, upgrade the service to a paid plan and add a `disk:` block back to `render.yaml`, or swap `DATABASE_URL` to a hosted Postgres instance.

### Automatic deploys on push

Add your Render deploy hook URL as a GitHub secret:

1. Render dashboard → your service → **Settings** → copy the **Deploy Hook URL**.
2. GitHub repo → **Settings → Secrets → Actions** → add secret `RENDER_DEPLOY_HOOK` with that URL.

Now every push to `main` runs the test suite and, if green, triggers a Render redeploy automatically via `.github/workflows/deploy.yml`.

### Run with Docker locally

```bash
docker build -t chatbot .
docker run -p 8000:8000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v chatbot-data:/data \
  chatbot
```

## Project Layout

```
.
├── .github/workflows/
│   ├── ci.yml               Run tests on every push
│   └── deploy.yml           Deploy to Render on push to main
├── app/
│   ├── main.py              FastAPI app entry point
│   ├── config.py            Settings loader
│   ├── db.py                SQLAlchemy engine + session
│   ├── models.py            ORM models
│   ├── schemas.py           Pydantic request/response models
│   ├── claude_client.py     Anthropic streaming wrapper
│   └── routes/
│       ├── conversations.py CRUD endpoints
│       └── chat.py          SSE streaming endpoint
├── static/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/
│   └── test_smoke.py
├── Dockerfile
├── render.yaml              Render.com IaC blueprint
├── requirements.txt
├── .env.example
└── README.md
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serves the chat UI |
| GET | `/healthz` | Health check (used by Render) |
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/{id}` | Get conversation + messages |
| PATCH | `/api/conversations/{id}` | Update title or system prompt |
| DELETE | `/api/conversations/{id}` | Delete conversation |
| POST | `/api/chat` | Stream a Claude response (SSE) |

## Tests

```bash
pytest tests/
```

Smoke tests use a mocked Claude client and do not require an API key.
