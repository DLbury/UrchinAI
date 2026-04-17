"""
Skills API: list, install (via URL), and delete skills from the nanobot workspace.
"""
from __future__ import annotations

import json
import logging
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
    """Download and install a skill from a URL pointing to a skill.md file or a .zip archive."""
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "url is required")

    is_zip = url.endswith('.zip')

    try:
        # Use system proxy if available (HTTP_PROXY/HTTPS_PROXY env vars)
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content if is_zip else resp.text
    except httpx.HTTPStatusError as exc:
        logger.error(f"Failed to fetch skill: HTTP {exc.response.status_code}")
        raise HTTPException(502, f"Failed to fetch skill from {url}: HTTP {exc.response.status_code}")
    except httpx.RequestError as exc:
        logger.error(f"Failed to fetch skill: Request error - {exc}")
        raise HTTPException(502, f"Failed to fetch skill from {url}: Network error - {exc}")
    except Exception as exc:
        logger.error(f"Failed to fetch skill: {type(exc).__name__} - {exc}")
        raise HTTPException(502, f"Failed to fetch skill from {url}: {exc}")

    # derive a directory name from the URL or provided name
    if body.name and body.name.strip():
        skill_name = body.name.strip()
    elif "/" in url:
        # For zip files, use the filename without extension
        if is_zip:
            skill_name = url.rstrip("/").split("/")[-1].replace('.zip', '')
        else:
            skill_name = url.rstrip("/").split("/")[-2]
    else:
        skill_name = "skill"

    skill_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_name)[:64]

    if not skill_name or skill_name == "skill":
        # fallback if extraction failed
        skill_name = "imported_skill"

    try:
        skill_dir = SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        if is_zip:
            # Handle zip file - extract and look for SKILL.md
            import zipfile
            import io
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                # List files in zip
                files = zf.namelist()
                # Look for SKILL.md in various locations
                skill_md_path = None
                for path in files:
                    if path.endswith('SKILL.md') or path.endswith('skill.md'):
                        skill_md_path = path
                        break

                if skill_md_path:
                    # Extract the skill file
                    skill_content = zf.read(skill_md_path).decode('utf-8')
                    (skill_dir / "skill.md").write_text(skill_content)
                else:
                    # If no skill.md found, extract all files
                    zf.extractall(skill_dir)
            logger.info(f"Skill installed successfully from zip: {skill_name}")
        else:
            # Handle plain markdown file
            (skill_dir / "skill.md").write_text(content)
            logger.info(f"Skill installed successfully: {skill_name}")
    except Exception as exc:
        logger.error(f"Failed to write skill file: {exc}")
        raise HTTPException(500, f"Failed to save skill: {exc}")

    return {"ok": True, "id": skill_name, "skills": _skill_list()}


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    skill_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_id)[:64]
    if not skill_name or skill_name != skill_id.strip():
        raise HTTPException(400, "Invalid skill id")
    skill_dir = SKILLS_DIR / skill_name
    if not skill_dir.exists() or not skill_dir.is_dir():
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    import shutil
    shutil.rmtree(skill_dir)
    return {"ok": True, "skills": _skill_list()}


class InstallLocalSkillRequest(BaseModel):
    name: str
    content: str


@router.post("/install-local")
async def install_local_skill(body: InstallLocalSkillRequest):
    """Install a skill from local content (uploaded from file)."""
    skill_name = body.name.strip()
    content = body.content

    if not skill_name:
        raise HTTPException(400, "Skill name is required")
    if not content:
        raise HTTPException(400, "Skill content is required")

    # Sanitize skill name
    skill_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_name)[:64]
    if not skill_name:
        skill_name = "local_skill"

    try:
        skill_dir = SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        # Write the skill.md file
        (skill_dir / "skill.md").write_text(content)
        logger.info(f"Local skill installed successfully: {skill_name}")
    except Exception as exc:
        logger.error(f"Failed to write local skill file: {exc}")
        raise HTTPException(500, f"Failed to save skill: {exc}")

    return {"ok": True, "id": skill_name, "skills": _skill_list()}


# ─── Skills Hub Integration ─────────────────────────────────────────────────

# Anthropic Skills Hub
ANTHROPIC_SKILLS_REPO = "https://api.github.com/repos/anthropics/skills/contents/skills"

# Tencent SkillHub (placeholder - requires API discovery)
TENCENT_SKILLHUB_API = "https://skillhub.tencent.com/api/skills"


@router.get("/hub/anthropic")
async def list_anthropic_skills():
    """List available skills from Anthropic's official skills repository."""
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(ANTHROPIC_SKILLS_REPO)
            resp.raise_for_status()
            items = resp.json()

            skills = []
            for item in items:
                if item.get("type") == "dir":
                    skill_name = item.get("name", "")
                    # Fetch SKILL.md to get description
                    raw_url = f"https://raw.githubusercontent.com/anthropics/skills/main/skills/{skill_name}/SKILL.md"
                    try:
                        skill_resp = await client.get(raw_url, timeout=10)
                        if skill_resp.status_code == 200:
                            content = skill_resp.text
                            # Parse YAML frontmatter
                            description = ""
                            if content.startswith("---"):
                                parts = content.split("---", 2)
                                if len(parts) >= 3:
                                    frontmatter = parts[1].strip()
                                    for line in frontmatter.split("\n"):
                                        if line.startswith("description:"):
                                            description = line.split(":", 1)[1].strip()
                                            break
                            skills.append({
                                "id": skill_name,
                                "name": skill_name.replace("-", " ").title(),
                                "description": description or f"Anthropic {skill_name} skill",
                                "url": raw_url,
                                "source": "anthropic",
                            })
                    except Exception as e:
                        logger.warning(f"Failed to fetch skill {skill_name}: {e}")
                        skills.append({
                            "id": skill_name,
                            "name": skill_name.replace("-", " ").title(),
                            "description": f"Anthropic {skill_name} skill",
                            "url": raw_url,
                            "source": "anthropic",
                        })

            return {"skills": skills}
    except httpx.HTTPStatusError as exc:
        logger.error(f"Failed to fetch Anthropic skills: HTTP {exc.response.status_code}")
        raise HTTPException(502, f"Failed to fetch skills from Anthropic hub")
    except Exception as exc:
        logger.error(f"Failed to fetch Anthropic skills: {exc}")
        raise HTTPException(502, f"Failed to fetch skills from Anthropic hub: {exc}")
