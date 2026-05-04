# AI-Powered Chatbot

A full-fledged AI chatbot powered by **Anthropic Claude** (`claude-sonnet-4-6`) with a **FastAPI** backend that streams tokens via Server-Sent Events to a lightweight **vanilla HTML/CSS/JS** frontend served from the same process.

## Features

- Real-time token streaming (SSE) for fluid conversational feel
- Multi-turn conversation history persisted in SQLite
- Create, switch between, rename, and delete chats
- Configurable system prompt (persona) per conversation
- Auto-generated conversation titles
- Single-process: `uvicorn` runs both API and UI

## Quick Start

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

## Project Layout

```
.
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
├── requirements.txt
├── .env.example
└── README.md
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serves the chat UI |
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
