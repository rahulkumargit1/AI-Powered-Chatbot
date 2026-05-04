import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..claude_client import get_claude_client
from ..db import SessionLocal, get_db
from ..models import Conversation, Message
from ..schemas import ChatRequest

router = APIRouter(prefix="/api", tags=["chat"])


def _sse(data: dict, event: str | None = None) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data)}\n\n"


def _persist_user_message(conversation_id: int, content: str) -> list[dict]:
    db = SessionLocal()
    try:
        convo = db.get(Conversation, conversation_id)
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        db.add(Message(conversation_id=conversation_id, role="user", content=content))
        db.commit()
        history = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.id)
            .all()
        )
        return [{"role": m.role, "content": m.content} for m in history]
    finally:
        db.close()


def _get_system_prompt(conversation_id: int) -> tuple[str, bool]:
    db = SessionLocal()
    try:
        convo = db.get(Conversation, conversation_id)
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        is_first = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.role == "assistant")
            .count()
            == 0
        )
        return convo.system_prompt or "", is_first
    finally:
        db.close()


def _persist_assistant_message(conversation_id: int, content: str) -> None:
    db = SessionLocal()
    try:
        db.add(Message(conversation_id=conversation_id, role="assistant", content=content))
        convo = db.get(Conversation, conversation_id)
        if convo:
            convo.updated_at = convo.updated_at  # bumps via onupdate when committed
        db.commit()
    finally:
        db.close()


def _set_title(conversation_id: int, title: str) -> None:
    db = SessionLocal()
    try:
        convo = db.get(Conversation, conversation_id)
        if convo:
            convo.title = title
            db.commit()
    finally:
        db.close()


async def _stream_response(payload: ChatRequest) -> AsyncIterator[str]:
    try:
        client = get_claude_client()
    except RuntimeError as e:
        yield _sse({"message": str(e)}, event="error")
        return

    try:
        history = _persist_user_message(payload.conversation_id, payload.message)
        system_prompt, is_first_turn = _get_system_prompt(payload.conversation_id)
    except HTTPException as e:
        yield _sse({"message": e.detail}, event="error")
        return

    assembled: list[str] = []
    try:
        async for chunk in client.stream_completion(system_prompt, history):
            assembled.append(chunk)
            yield _sse({"text": chunk})
    except Exception as e:
        yield _sse({"message": f"Claude API error: {e}"}, event="error")
        return

    full_reply = "".join(assembled)
    _persist_assistant_message(payload.conversation_id, full_reply)

    if is_first_turn and full_reply.strip():
        try:
            title = await client.summarize_title(payload.message, full_reply)
            _set_title(payload.conversation_id, title)
            yield _sse({"title": title}, event="title")
        except Exception:
            pass

    yield _sse({"done": True}, event="done")


@router.post("/chat")
async def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    if not db.get(Conversation, payload.conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return StreamingResponse(
        _stream_response(payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
