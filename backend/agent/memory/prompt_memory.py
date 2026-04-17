"""
Prompt Memory (L1) — Hermes-style frozen snapshot memory.

- Stores curated facts in ~/.nanobot/memory.json
- Does NOT inject everything into the system prompt
- Instead, retrieves top-k relevant entries based on the user query
- Also provides tools for the agent to add/remove memories itself
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any

MEMORY_FILE = Path.home() / ".nanobot" / "memory.json"
logger = logging.getLogger(__name__)


class PromptMemory:
    """Manages persistent prompt memory with retrieval."""

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []
        self._save_timer: threading.Timer | None = None
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not MEMORY_FILE.exists():
            self._entries = []
            return
        try:
            data = json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                # Migrate old flat format to new structured format
                migrated = []
                for item in data:
                    if isinstance(item, dict) and "content" in item:
                        migrated.append(item)
                    elif isinstance(item, str):
                        migrated.append({
                            "id": str(int(time.time() * 1000)),
                            "content": item,
                            "createdAt": int(time.time()),
                            "tags": [],
                        })
                self._entries = migrated
        except Exception as e:
            logger.error("Failed to load prompt memory: %s", e)
            self._entries = []

    def _schedule_save(self) -> None:
        with self._lock:
            if self._save_timer:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(0.5, self._save)
            self._save_timer.start()

    def _save(self) -> None:
        with self._lock:
            timer = self._save_timer
            self._save_timer = None
        try:
            MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
            MEMORY_FILE.write_text(json.dumps(self._entries, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error("Failed to save prompt memory: %s", e)

    def list_all(self) -> list[dict[str, Any]]:
        return [dict(e) for e in self._entries]

    def add(self, content: str, tags: list[str] | None = None) -> dict[str, Any]:
        entry = {
            "id": str(int(time.time() * 1000)),
            "content": content.strip(),
            "createdAt": int(time.time()),
            "tags": tags or [],
        }
        self._entries.append(entry)
        self._schedule_save()
        return entry

    def remove(self, entry_id: str) -> bool:
        before = len(self._entries)
        self._entries = [e for e in self._entries if e.get("id") != entry_id]
        if len(self._entries) < before:
            self._schedule_save()
            return True
        return False

    def clear(self) -> None:
        self._entries = []
        self._schedule_save()

    def retrieve_relevant(self, query: str, top_k: int = 3) -> list[str]:
        """Return top-k memory contents most relevant to the query."""
        if not self._entries:
            return []

        # Simple token-overlap scoring
        query_tokens = set(_tokenize(query))
        if not query_tokens:
            return []

        scored = []
        for entry in self._entries:
            content = entry.get("content", "")
            tags = entry.get("tags", [])
            memory_tokens = set(_tokenize(content) + _tokenize(" ".join(tags)))
            score = len(query_tokens & memory_tokens)
            if score > 0:
                scored.append((score, content))

        scored.sort(key=lambda x: (-x[0], x[1]))
        return [content for _, content in scored[:top_k]]


def _tokenize(text: str) -> list[str]:
    """Simple CJK-aware tokenization."""
    # Keep CJK characters as individual tokens, split others on non-word
    tokens = []
    for part in re.split(r"(\s+)", text.lower()):
        if not part.strip():
            continue
        # CJK chars
        cjk = re.findall(r"[\u4e00-\u9fff]", part)
        tokens.extend(cjk)
        # Alphanumeric words >= 2 chars
        words = re.findall(r"[a-z0-9]{2,}", part)
        tokens.extend(words)
    return tokens


_prompt_memory_instance: PromptMemory | None = None


def get_prompt_memory() -> PromptMemory:
    global _prompt_memory_instance
    if _prompt_memory_instance is None:
        _prompt_memory_instance = PromptMemory()
    return _prompt_memory_instance
