"""
Categories API — manages preset and custom bookmark categories.

Categories are stored in ~/.nanobot/categories.json.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent.categorizer import DEFAULT_CATEGORIES
from utils import atomic_write_json

CATEGORIES_FILE = Path.home() / ".nanobot" / "categories.json"
router = APIRouter(prefix="/api/categories", tags=["categories"])


def _load() -> dict:
    """Load categories configuration."""
    if CATEGORIES_FILE.exists():
        try:
            return json.loads(CATEGORIES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"custom": []}


def _save(data: dict) -> None:
    """Save categories configuration."""
    atomic_write_json(CATEGORIES_FILE, data)


def get_all_categories() -> list[dict]:
    """Get all categories (preset + custom)."""
    data = _load()
    custom = data.get("custom", [])
    # Preset categories first, then custom ones
    return DEFAULT_CATEGORIES + custom


@router.get("")
def list_categories():
    """List all available categories (preset + custom)."""
    return get_all_categories()


class CategoryCreate(BaseModel):
    name: str
    icon: str = "📌"
    name_en: str = ""


@router.post("")
def add_category(body: CategoryCreate):
    """Add a custom category."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Category name cannot be empty")

    data = _load()
    custom = data.get("custom", [])

    # Generate unique ID
    existing_ids = {c["id"] for c in DEFAULT_CATEGORIES + custom}
    base_id = body.name.lower().replace(" ", "_")[:20]
    cat_id = base_id
    counter = 1
    while cat_id in existing_ids:
        cat_id = f"{base_id}_{counter}"
        counter += 1

    new_cat = {
        "id": cat_id,
        "name": body.name.strip(),
        "name_en": body.name_en.strip() or body.name.strip(),
        "icon": body.icon or "📌",
    }
    custom.append(new_cat)
    data["custom"] = custom
    _save(data)

    return new_cat


class CategoryUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    name_en: str | None = None


@router.put("/{cat_id}")
def update_category(cat_id: str, body: CategoryUpdate):
    """Update a custom category."""
    data = _load()
    custom = data.get("custom", [])

    # Find the category
    for i, cat in enumerate(custom):
        if cat["id"] == cat_id:
            if body.name is not None:
                name = body.name.strip()
                if not name:
                    raise HTTPException(status_code=400, detail="Category name cannot be empty")
                custom[i]["name"] = name
            if body.icon is not None:
                custom[i]["icon"] = body.icon
            if body.name_en is not None:
                custom[i]["name_en"] = body.name_en.strip()
            data["custom"] = custom
            _save(data)
            return custom[i]

    # Check if it's a default category (cannot modify)
    if any(c["id"] == cat_id for c in DEFAULT_CATEGORIES):
        raise HTTPException(status_code=400, detail="Cannot modify preset categories")

    raise HTTPException(status_code=404, detail="Category not found")


@router.delete("/{cat_id}")
def delete_category(cat_id: str):
    """Delete a custom category."""
    data = _load()
    custom = data.get("custom", [])

    # Check if it's a default category (cannot delete)
    if any(c["id"] == cat_id for c in DEFAULT_CATEGORIES):
        raise HTTPException(status_code=400, detail="Cannot delete preset categories")

    # Find and remove
    for i, cat in enumerate(custom):
        if cat["id"] == cat_id:
            custom.pop(i)
            data["custom"] = custom
            _save(data)
            return {"ok": True}

    raise HTTPException(status_code=404, detail="Category not found")