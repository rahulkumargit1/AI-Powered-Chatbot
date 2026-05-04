from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routes import chat, conversations

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AI-Powered Chatbot", lifespan=lifespan)

app.include_router(conversations.router)
app.include_router(chat.router)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
