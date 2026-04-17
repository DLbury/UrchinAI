"""AI memory API — unified management for L1/L2/L3 memory layers."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from agent.memory import get_prompt_memory, get_session_archive, get_skill_memory

router = APIRouter(prefix="/api/memory")

_prompt_memory = get_prompt_memory()
_session_archive = get_session_archive()
_skill_memory = get_skill_memory()


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
    results = _session_archive.search(req.query, limit=req.limit)
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

    skills_dir = _skill_memory._skills_dir
    skills_dir.mkdir(parents=True, exist_ok=True)
    path = skills_dir / f"{item.name.strip()}.md"
    path.write_text(item.content, encoding="utf-8")
    return {"ok": True, "name": item.name.strip()}


@router.delete("/skills/{name}")
def delete_skill(name: str):
    from pathlib import Path

    path = _skill_memory._skills_dir / f"{name}.md"
    if path.exists():
        path.unlink()
    return {"ok": True}
