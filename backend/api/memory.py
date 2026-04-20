"""AI memory API — unified management for L1/L2/L3 memory layers."""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent.memory import get_prompt_memory, get_session_archive, get_skill_memory
from utils import atomic_write_text

MAX_SKILL_CONTENT_SIZE = 2 * 1024 * 1024  # 2 MB

router = APIRouter(prefix="/api/memory")

_prompt_memory = get_prompt_memory()
_session_archive = get_session_archive()
_skill_memory = get_skill_memory()

_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _sanitize_name(name: str) -> str:
    name = name.strip()
    if not _SAFE_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid name: only a-z, A-Z, 0-9, _, - are allowed")
    return name


# ── L1 Prompt Memory ─────────────────────────────────────────────────────────

class MemoryItem(BaseModel):
    content: str


@router.get("/prompt")
def list_prompt_memory():
    return _prompt_memory.list_all()


@router.post("/prompt")
def add_prompt_memory(item: MemoryItem):
    return _prompt_memory.add(item.content.strip())


@router.delete("/prompt/{item_id}")
def delete_prompt_memory(item_id: str):
    _prompt_memory.remove(item_id)
    return {"ok": True}


@router.delete("/prompt")
def clear_prompt_memory():
    _prompt_memory.clear()
    return {"ok": True}


# ── L2 Session Archive ───────────────────────────────────────────────────────

class SearchHistoryRequest(BaseModel):
    query: str
    limit: int = 10


@router.get("/archive/sessions")
def list_archive_sessions():
    """Return distinct session IDs present in the archive."""
    rows = _session_archive.list_sessions()
    return {"sessions": rows}


@router.post("/archive/search")
def search_archive(req: SearchHistoryRequest):
    clamped = max(1, min(req.limit, 100))
    results = _session_archive.search(req.query, limit=clamped)
    return {"results": results}


@router.delete("/archive/session/{session_id}")
def clear_archive_session(session_id: str):
    _session_archive.clear_session(session_id)
    return {"ok": True}


@router.delete("/archive")
def clear_all_archive():
    _session_archive.clear_all()
    return {"ok": True}


# ── L3 Skill Memory ──────────────────────────────────────────────────────────

class SkillItem(BaseModel):
    name: str
    content: str


@router.get("/skills")
def list_skills():
    return {"skills": _skill_memory.list_skills()}


@router.get("/skills/{name}")
def get_skill(name: str):
    return {"name": name, "content": _skill_memory.load_skill(name)}


@router.post("/skills")
def save_skill(item: SkillItem):
    from pathlib import Path

    name = _sanitize_name(item.name)
    content = item.content or ""
    if len(content) > MAX_SKILL_CONTENT_SIZE:
        raise HTTPException(status_code=413, detail="Skill content too large")
    skills_dir = _skill_memory._skills_dir
    skills_dir.mkdir(parents=True, exist_ok=True)
    path = skills_dir / f"{name}.md"
    atomic_write_text(path, content, encoding="utf-8")
    return {"ok": True, "name": name}


@router.delete("/skills/{name}")
def delete_skill(name: str):
    from pathlib import Path

    name = _sanitize_name(name)
    path = _skill_memory._skills_dir / f"{name}.md"
    if path.exists():
        path.unlink()
    return {"ok": True}
