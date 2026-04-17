"""Chat Sessions API — stores/retrieves AI conversation sessions from ~/.nanobot/chat_sessions.json"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils import atomic_write_json

router = APIRouter(prefix="/api/chat-sessions")

CHAT_SESSIONS_FILE = Path.home() / ".nanobot" / "chat_sessions.json"


class ChatMessage(BaseModel):
    id: str
    role: str
    content: str = ""
    toolCalls: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    createdAt: int


class ChatSessionItem(BaseModel):
    id: str
    name: str
    createdAt: int
    messages: list[ChatMessage] = []


class ChatSessionsState(BaseModel):
    sessions: list[ChatSessionItem]
    currentSessionId: str


def _load() -> ChatSessionsState:
    if CHAT_SESSIONS_FILE.exists():
        try:
            data = json.loads(CHAT_SESSIONS_FILE.read_text(encoding="utf-8"))
            state = ChatSessionsState.model_validate(data)
            # Default currentSessionId to first session if empty
            if not state.currentSessionId and state.sessions:
                state.currentSessionId = state.sessions[0].id
            return state
        except Exception:
            pass
    return ChatSessionsState(sessions=[], currentSessionId="")


def _save(state: ChatSessionsState) -> None:
    atomic_write_json(CHAT_SESSIONS_FILE, state.model_dump())


@router.get("", response_model=ChatSessionsState)
def get_chat_sessions() -> ChatSessionsState:
    """Get all chat sessions and current session ID."""
    return _load()


@router.put("", response_model=ChatSessionsState)
def save_chat_sessions(state: ChatSessionsState) -> ChatSessionsState:
    """Save all chat sessions (full state replacement)."""
    _save(state)
    return state
