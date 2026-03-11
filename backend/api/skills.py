"""
Skills API: list, install (via URL), and delete skills from the nanobot workspace.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/skills", tags=["skills"])

SKILLS_DIR = Path.home() / ".nanobot" / "workspace" / "skills"


def _skill_list() -> list[dict]:
    if not SKILLS_DIR.exists():
        return []
    skills = []
    for item in sorted(SKILLS_DIR.iterdir()):
        if item.is_dir():
            meta_file = item / "skill.json"
            md_file = item / "skill.md"
            name = item.name
            description = ""
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text())
                    description = meta.get("description", "")
                    name = meta.get("name", name)
                except Exception:
                    pass
            elif md_file.exists():
                lines = md_file.read_text().splitlines()
                for line in lines:
                    if line.startswith("# "):
                        name = line[2:].strip()
                    elif line.strip() and not line.startswith("#"):
                        description = line.strip()
                        break
            skills.append({"id": item.name, "name": name, "description": description})
    return skills


@router.get("")
async def list_skills():
    return {"skills": _skill_list()}


class InstallSkillRequest(BaseModel):
    url: str
    name: str = ""


@router.post("/install")
async def install_skill(body: InstallSkillRequest):
    """Download and install a skill from a URL pointing to a skill.md file."""
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "url is required")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.text
    except Exception as exc:
        raise HTTPException(502, f"Failed to fetch skill from {url}: {exc}")

    # derive a directory name from the URL or provided name
    skill_name = body.name.strip() or url.rstrip("/").split("/")[-2] if "/" in url else "skill"
    skill_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_name)[:64]

    skill_dir = SKILLS_DIR / skill_name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "skill.md").write_text(content)

    return {"ok": True, "id": skill_name, "skills": _skill_list()}


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    skill_dir = SKILLS_DIR / skill_id
    if not skill_dir.exists() or not skill_dir.is_dir():
        raise HTTPException(404, f"Skill '{skill_id}' not found")

    import shutil
    shutil.rmtree(skill_dir)
    return {"ok": True, "skills": _skill_list()}
