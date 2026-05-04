"""Smoke tests for the chatbot API. Use a temp SQLite DB and a mocked Claude client."""
import os
import tempfile
from collections.abc import AsyncIterator

import pytest

# Configure before app import so settings pick up the temp DB.
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"
os.environ["ANTHROPIC_API_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

from app import claude_client  # noqa: E402
from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402


class _FakeClient:
    async def stream_completion(self, system, messages) -> AsyncIterator[str]:
        for chunk in ["Hello", " ", "world", "!"]:
            yield chunk

    async def summarize_title(self, user_message: str, assistant_reply: str) -> str:
        return "Greeting"


@pytest.fixture(autouse=True)
def fake_claude(monkeypatch):
    monkeypatch.setattr(claude_client, "get_claude_client", lambda: _FakeClient())
    from app.routes import chat as chat_route

    monkeypatch.setattr(chat_route, "get_claude_client", lambda: _FakeClient())


@pytest.fixture(scope="module", autouse=True)
def _init_db():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_root_serves_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "<html" in r.text.lower()


def test_conversation_crud(client):
    r = client.post("/api/conversations", json={})
    assert r.status_code == 200
    convo = r.json()
    assert convo["title"] == "New chat"
    cid = convo["id"]

    r = client.get("/api/conversations")
    assert r.status_code == 200
    assert any(c["id"] == cid for c in r.json())

    r = client.patch(f"/api/conversations/{cid}", json={"title": "Renamed"})
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed"

    r = client.delete(f"/api/conversations/{cid}")
    assert r.status_code == 204

    r = client.get(f"/api/conversations/{cid}")
    assert r.status_code == 404


def test_chat_stream(client):
    convo = client.post("/api/conversations", json={"system_prompt": "be brief"}).json()
    cid = convo["id"]

    with client.stream(
        "POST", "/api/chat", json={"conversation_id": cid, "message": "hi"}
    ) as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes()).decode()

    assert "Hello" in body
    assert "world" in body
    assert "event: done" in body

    refreshed = client.get(f"/api/conversations/{cid}").json()
    roles = [m["role"] for m in refreshed["messages"]]
    assert roles == ["user", "assistant"]
    assert refreshed["messages"][1]["content"] == "Hello world!"
    assert refreshed["title"] == "Greeting"


def test_chat_unknown_conversation(client):
    r = client.post("/api/chat", json={"conversation_id": 999999, "message": "hi"})
    assert r.status_code == 404
