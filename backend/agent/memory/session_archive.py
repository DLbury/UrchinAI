"""
Session Archive (L2) — SQLite + FTS5 searchable conversation history.

- Stores messages in ~/.nanobot/session_archive.db
- Provides full-text search over all past conversations
- Agent can call search_history to retrieve relevant context on demand
"""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any

ARCHIVE_FILE = Path.home() / ".nanobot" / "session_archive.db"


class SessionArchive:
    """Manages persistent session archive with FTS5 search."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or ARCHIVE_FILE
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
            # FTS5 virtual table for full-text search
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    content,
                    content='messages',
                    content_rowid='id'
                )
            """)
            # Triggers to keep FTS5 index in sync
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, content)
                    VALUES (new.id, new.content);
                END
            """)
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content)
                    VALUES ('delete', old.id, old.content);
                END
            """)
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content)
                    VALUES ('delete', old.id, old.content);
                    INSERT INTO messages_fts(rowid, content)
                    VALUES (new.id, new.content);
                END
            """)
            conn.commit()

    def archive_message(self, session_id: str, role: str, content: str) -> None:
        """Archive a single message."""
        if not content:
            return
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (session_id, role, content, int(time.time())),
            )
            conn.commit()

    def archive_turns(self, session_id: str, turns: list[dict[str, Any]]) -> None:
        """Batch archive multiple turns for a session."""
        rows = []
        now = int(time.time())
        for turn in turns:
            role = turn.get("role", "")
            content = _extract_text(turn.get("content", ""))
            if role and content:
                rows.append((session_id, role, content, now))
        if not rows:
            return
        with sqlite3.connect(self._db_path) as conn:
            conn.executemany(
                "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                rows,
            )
            conn.commit()

    def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Search archived messages using FTS5."""
        if not query.strip():
            return []
        # Escape FTS5 special chars
        safe_query = _escape_fts5(query)
        with sqlite3.connect(self._db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """
                SELECT m.session_id, m.role, m.content, m.created_at,
                       rank AS score
                FROM messages_fts
                JOIN messages m ON messages_fts.rowid = m.id
                WHERE messages_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (safe_query, limit),
            )
            rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def clear_session(self, session_id: str) -> None:
        """Remove all archived messages for a given session."""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            conn.commit()

    def list_sessions(self) -> list[dict[str, Any]]:
        """Return distinct sessions with message counts and last activity."""
        with sqlite3.connect(self._db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """
                SELECT session_id, COUNT(*) as message_count, MAX(created_at) as last_active
                FROM messages
                GROUP BY session_id
                ORDER BY last_active DESC
                """
            )
            rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def clear_all(self) -> None:
        """Remove all archived messages."""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM messages")
            conn.commit()


def _extract_text(content: Any) -> str:
    """Extract plain text from message content (str or multimodal list)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts)
    return str(content)


def _escape_fts5(query: str) -> str:
    """Escape FTS5 query special characters."""
    # FTS5 special chars: " * ( ) - /
    # Wrap the whole query in double quotes for literal matching of phrases,
    # or escape individual special chars.
    # Simple approach: replace internal double quotes, then wrap.
    return '"' + query.replace('"', '""') + '"'


_session_archive_instance: SessionArchive | None = None


def get_session_archive() -> SessionArchive:
    global _session_archive_instance
    if _session_archive_instance is None:
        _session_archive_instance = SessionArchive()
    return _session_archive_instance
