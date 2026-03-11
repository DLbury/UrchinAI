"""AI memory API — stores context notes that persist across conversations."""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

MEMORY_FILE = Path.home() / ".nanobot" / "memory.json"
router = APIRouter(prefix="/api/memory")


def _load() -> list[dict]:
    if MEMORY_FILE.exists():
        try:
            return json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save(data: list[dict]) -> None:
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    MEMORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class MemoryItem(BaseModel):
    content: str


@router.get("")
def list_memory():
    return _load()


@router.post("")
def add_memory(item: MemoryItem):
    data = _load()
    entry = {"id": str(int(time.time() * 1000)), "content": item.content.strip(), "createdAt": int(time.time())}
    data.append(entry)
    _save(data)
    return entry


@router.delete("/{item_id}")
def delete_memory(item_id: str):
    data = _load()
    data = [m for m in data if m.get("id") != item_id]
    _save(data)
    return {"ok": True}


@router.delete("")
def clear_memory():
    _save([])
    return {"ok": True}
