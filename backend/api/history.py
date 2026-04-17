"""Browsing history API — stores/retrieves visit records from ~/.nanobot/history.json"""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from utils import atomic_write_json

HISTORY_FILE = Path.home() / ".nanobot" / "history.json"
MAX_ENTRIES = 2000
router = APIRouter(prefix="/api/history")


def _load() -> list[dict]:
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save(data: list[dict]) -> None:
    atomic_write_json(HISTORY_FILE, data)


class HistoryEntry(BaseModel):
    url: str
    title: str = ""
    favicon: str = ""


@router.get("")
def list_history(limit: int = 200):
    data = _load()
    return list(reversed(data[-limit:]))


@router.post("")
def add_history(entry: HistoryEntry):
    url = (entry.url or "").strip()
    if not url or url.startswith("about:") or url.startswith("devtools:"):
        return {"ok": True}
    data = _load()
    data.append(
        {
            "url": url,
            "title": entry.title,
            "favicon": entry.favicon,
            "visitedAt": int(time.time()),
        }
    )
    if len(data) > MAX_ENTRIES:
        data = data[-MAX_ENTRIES:]
    _save(data)
    return {"ok": True}


@router.delete("")
def clear_history():
    _save([])
    return {"ok": True}
