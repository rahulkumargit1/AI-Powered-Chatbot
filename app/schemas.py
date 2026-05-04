from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    updated_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    system_prompt: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut]


class ChatRequest(BaseModel):
    conversation_id: int
    message: str = Field(min_length=1, max_length=8192)
