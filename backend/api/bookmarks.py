"""Bookmarks API — stores/retrieves bookmarks from ~/.nanobot/bookmarks.json"""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import APIRouter, Query
from pydantic import BaseModel

BOOKMARKS_FILE = Path.home() / ".nanobot" / "bookmarks.json"
router = APIRouter(prefix="/api/bookmarks")


def _load() -> list[dict]:
    if BOOKMARKS_FILE.exists():
        try:
            return json.loads(BOOKMARKS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save(data: list[dict]) -> None:
    BOOKMARKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    BOOKMARKS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


class BookmarkCreate(BaseModel):
    url: str
    title: str = ""
    favicon: str = ""


@router.get("")
def list_bookmarks():
    return _load()


@router.post("")
def add_bookmark(bm: BookmarkCreate):
    data = _load()
    data = [b for b in data if b.get("url") != bm.url]
    data.append(
        {
            "url": bm.url,
            "title": bm.title,
            "favicon": bm.favicon,
            "createdAt": int(time.time()),
        }
    )
    _save(data)
    return {"ok": True}


@router.delete("")
def remove_bookmark(url: str = Query(...)):
    data = _load()
    data = [b for b in data if b.get("url") != url]
    _save(data)
    return {"ok": True}
