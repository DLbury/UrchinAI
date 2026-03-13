"""
UrchinAI backend — FastAPI

Endpoints:
  WS   /ws/{session_id}     — chat + agent streaming
  GET  /api/config          — read ~/.nanobot/config.json
  PUT  /api/config          — write ~/.nanobot/config.json
  *    /api/config/...      — provider / model sub-routes
  *    /api/skills/*        — skills CRUD
  *    /api/mcp/*           — MCP servers CRUD
  GET  /api/health          — health check
"""
from __future__ import annotations

import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.config import router as config_router
from api.skills import router as skills_router
from api.mcp import router as mcp_router
from api.bookmarks import router as bookmarks_router
from api.history import router as history_router
from api.memory import router as memory_router
from api.scripts import router as scripts_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="UrchinAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(skills_router)
app.include_router(mcp_router)
app.include_router(bookmarks_router)
app.include_router(history_router)
app.include_router(memory_router)
app.include_router(scripts_router)


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket: chat
# ─────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    try:
        await websocket.accept()
        logger.info("WebSocket connected: %s", session_id)
    except Exception as e:
        logger.error("Failed to accept WebSocket: %s", e)
        return

    try:
        from agent.manager import get_or_create_manager
        manager = get_or_create_manager(session_id)
        logger.info("Manager created for session: %s", session_id)
    except Exception as e:
        logger.error("Failed to create manager for session %s: %s", session_id, e)
        await websocket.send_text(json.dumps({"type": "error", "message": f"Failed to initialize agent: {str(e)}"}))
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            if msg_type == "chat":
                content = data.get("content", "").strip()
                if not content:
                    continue
                async for msg in manager.chat(content):
                    await websocket.send_text(json.dumps(msg.to_dict()))

            elif msg_type == "clear_history":
                manager.clear_history()
                await websocket.send_text(json.dumps({"type": "history_cleared"}))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)
    except Exception as exc:
        logger.exception("WebSocket error for session %s: %s", session_id, exc)


# ─────────────────────────────────────────────────────────────────────────────
# REST helpers
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Entry point for PyInstaller / bundled executable
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
