"""
Skill Memory (L3) — Procedural memory as markdown documents.

- Stores skills in ~/.nanobot/skills/
- Each skill is a markdown file describing a procedure, workflow, or pattern
- Agent can list and load skills on demand
- System prompt can also inject top-k relevant skills automatically
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

SKILLS_DIR = Path.home() / ".nanobot" / "skills"


class SkillMemory:
    """Manages skill documents with retrieval."""

    def __init__(self, skills_dir: Path | None = None) -> None:
        self._skills_dir = skills_dir or SKILLS_DIR
        self._skills_dir.mkdir(parents=True, exist_ok=True)

    def list_skills(self) -> list[dict[str, Any]]:
        """Return metadata for all available skills."""
        skills = []
        for path in sorted(self._skills_dir.glob("*.md")):
            skills.append({
                "name": path.stem,
                "filename": path.name,
                "title": _extract_title(path),
            })
        return skills

    def load_skill(self, name: str) -> str:
        """Load the full content of a skill by name."""
        path = self._skills_dir / f"{name}.md"
        if not path.exists():
            return f"Skill '{name}' not found."
        return path.read_text(encoding="utf-8")

    def retrieve_relevant(self, query: str, top_k: int = 2) -> list[tuple[str, str]]:
        """Return top-k (name, content) skills most relevant to the query."""
        query_tokens = set(_tokenize(query))
        if not query_tokens:
            return []

        scored = []
        for path in self._skills_dir.glob("*.md"):
            name = path.stem
            text = path.read_text(encoding="utf-8")
            skill_tokens = set(_tokenize(name) + _tokenize(text))
            score = len(query_tokens & skill_tokens)
            if score > 0:
                scored.append((score, name, text))

        scored.sort(key=lambda x: (-x[0], x[1]))
        return [(name, text) for _, name, text in scored[:top_k]]


def _extract_title(path: Path) -> str:
    """Extract the first H1 from a markdown file, or fallback to stem."""
    try:
        text = path.read_text(encoding="utf-8")
        m = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    return path.stem


def _tokenize(text: str) -> list[str]:
    """Simple CJK-aware tokenization."""
    tokens = []
    for part in re.split(r"(\s+)", text.lower()):
        if not part.strip():
            continue
        cjk = re.findall(r"[\u4e00-\u9fff]", part)
        tokens.extend(cjk)
        words = re.findall(r"[a-z0-9]{2,}", part)
        tokens.extend(words)
    return tokens


_skill_memory_instance: SkillMemory | None = None


def get_skill_memory() -> SkillMemory:
    global _skill_memory_instance
    if _skill_memory_instance is None:
        _skill_memory_instance = SkillMemory()
    return _skill_memory_instance
