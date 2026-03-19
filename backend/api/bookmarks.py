"""Bookmarks API — stores/retrieves bookmarks from ~/.nanobot/bookmarks.json"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.category import get_all_categories
from agent.categorizer import categorize_bookmark

logger = logging.getLogger(__name__)

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
    category: str = ""  # Optional, user can manually specify


class BookmarkCategorize(BaseModel):
    url: str
    title: str = ""


@router.get("")
def list_bookmarks():
    """List all bookmarks."""
    return _load()


async def _async_categorize_and_update(url: str, title: str) -> None:
    """Background task to categorize a bookmark and update it."""
    try:
        categories = get_all_categories()
        category = await categorize_bookmark(url, title, categories)

        # Update the bookmark with the new category
        data = _load()
        for bm in data:
            if bm.get("url") == url:
                bm["category"] = category
                break
        _save(data)
        logger.info("Auto-categorized '%s' as '%s'", url, category)
    except Exception as e:
        logger.error("Failed to auto-categorize '%s': %s", url, e)


@router.post("")
async def add_bookmark(bm: BookmarkCreate):
    """
    Add a bookmark.
    - If category is specified, use it directly
    - Otherwise, save with empty category first, then auto-categorize in background
    """
    data = _load()

    # Check if already exists - if so, just return (no duplicate)
    for existing in data:
        if existing.get("url") == bm.url:
            return {"ok": True, "category": existing.get("category", ""), "exists": True}

    # Determine initial category
    category = bm.category if bm.category else ""

    bookmark = {
        "url": bm.url,
        "title": bm.title,
        "favicon": bm.favicon,
        "category": category,
        "createdAt": int(time.time()),
    }
    data.append(bookmark)
    _save(data)

    # If no category specified, trigger background categorization
    if not category:
        asyncio.create_task(_async_categorize_and_update(bm.url, bm.title))

    return {"ok": True, "category": category, "exists": False}


@router.delete("")
def remove_bookmark(url: str = Query(...)):
    """Remove a bookmark by URL."""
    data = _load()
    data = [b for b in data if b.get("url") != url]
    _save(data)
    return {"ok": True}


@router.post("/categorize")
async def categorize_bookmark_endpoint(body: BookmarkCategorize):
    """
    Categorize a URL without saving it.
    Useful for previewing the category before adding.
    """
    categories = get_all_categories()
    category = await categorize_bookmark(body.url, body.title, categories)
    return {"category": category}


class CategoryUpdate(BaseModel):
    category: str


@router.put("/{url:path}/category")
async def update_bookmark_category(url: str, body: CategoryUpdate):
    """Update the category of an existing bookmark."""
    decoded_url = unquote(url)

    data = _load()
    for bm in data:
        if bm.get("url") == decoded_url:
            bm["category"] = body.category
            _save(data)
            return {"ok": True}

    raise HTTPException(status_code=404, detail="Bookmark not found")


@router.post("/recategorize-all")
async def recategorize_all_bookmarks():
    """Re-categorize all bookmarks that have no category."""
    data = _load()
    categories = get_all_categories()

    updated = 0
    for bm in data:
        if not bm.get("category"):
            try:
                bm["category"] = await categorize_bookmark(
                    bm.get("url", ""), bm.get("title", ""), categories
                )
                updated += 1
            except Exception as e:
                logger.error("Failed to categorize '%s': %s", bm.get("url"), e)

    if updated > 0:
        _save(data)

    return {"ok": True, "updated": updated}