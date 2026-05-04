from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Conversation
from ..schemas import (
    ConversationCreate,
    ConversationOut,
    ConversationSummary,
    ConversationUpdate,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
def list_conversations(db: Session = Depends(get_db)):
    return (
        db.query(Conversation)
        .order_by(desc(Conversation.updated_at))
        .all()
    )


@router.post("", response_model=ConversationOut)
def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db)):
    settings = get_settings()
    convo = Conversation(
        title=payload.title or "New chat",
        system_prompt=payload.system_prompt
        if payload.system_prompt is not None
        else settings.default_system_prompt,
    )
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    convo = db.get(Conversation, conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return convo


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
):
    convo = db.get(Conversation, conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if payload.title is not None:
        convo.title = payload.title
    if payload.system_prompt is not None:
        convo.system_prompt = payload.system_prompt
    db.commit()
    db.refresh(convo)
    return convo


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    convo = db.get(Conversation, conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(convo)
    db.commit()
    return None
