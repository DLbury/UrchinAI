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

import asyncio
import json
import logging
import os
import sys

# PyInstaller 打包环境配置
if getattr(sys, 'frozen', False):
    os.environ['LITELLM_LOCAL_MODEL_COST_MAP'] = 'True'
    os.environ['LITELLM_DONT_SHOW_FEEDBACK_BOX'] = 'True'
    if hasattr(sys, '_MEIPASS') and sys._MEIPASS not in sys.path:
        sys.path.insert(0, sys._MEIPASS)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.config import router as config_router
from api.skills import router as skills_router
from api.mcp import router as mcp_router
from api.bookmarks import router as bookmarks_router
from api.history import router as history_router
from api.memory import router as memory_router
from api.scripts import router as scripts_router
from api.category import router as category_router
from api.chat_sessions import router as chat_sessions_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="UrchinAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["app://", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Input size limits for WebSocket chat messages
MAX_MESSAGE_LENGTH = 10000
MAX_FILES_COUNT = 10
MAX_FILE_DATA_LENGTH = 5 * 1024 * 1024  # 5 MB base64

app.include_router(config_router)
app.include_router(skills_router)
app.include_router(mcp_router)
app.include_router(bookmarks_router)
app.include_router(history_router)
app.include_router(memory_router)
app.include_router(scripts_router)
app.include_router(category_router)
app.include_router(chat_sessions_router)


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
        from agent.manager import get_or_create_manager, remove_manager
        manager = await get_or_create_manager(session_id)
        logger.info("Manager created for session: %s", session_id)
    except Exception as e:
        logger.error("Failed to create manager for session %s: %s", session_id, e)
        await websocket.send_text(json.dumps({"type": "error", "message": f"Failed to initialize agent: {str(e)}"}))
        await websocket.close()
        return

    try:
        chat_task = None
        chat_lock = asyncio.Lock()

        def on_chat_done(task: asyncio.Task):
            nonlocal chat_task
            try:
                task.result()
            except asyncio.CancelledError:
                logger.info("Chat cancelled for session: %s", session_id)
            except Exception as exc:
                logger.exception("Chat task error for session %s: %s", session_id, exc)
            finally:
                chat_task = None

        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            if msg_type == "chat":
                content = data.get("content", "").strip()
                files = data.get("files", [])
                # Log file count but never the actual base64 payload
                logger.info("[DEBUG] chat message received: content='%s', files_count=%d",
                            content[:100] if content else "", len(files) if files else 0)
                if not content and not files:
                    continue
                if len(content) > MAX_MESSAGE_LENGTH:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Message too long"}))
                    continue
                if len(files) > MAX_FILES_COUNT:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Too many files"}))
                    continue
                for f in files:
                    data_len = len(f.get("data", ""))
                    if data_len > MAX_FILE_DATA_LENGTH:
                        await websocket.send_text(json.dumps({"type": "error", "message": "File too large"}))
                        continue

                async with chat_lock:
                    old_task = chat_task

                if old_task and not old_task.done():
                    old_task.cancel()
                    manager.stop()
                    try:
                        await old_task
                    except asyncio.CancelledError:
                        pass

                async with chat_lock:
                    chat_task = None

                async def send_chat():
                    async for msg in manager.chat(content, files=files):
                        await websocket.send_text(json.dumps(msg.to_dict()))

                chat_task = asyncio.create_task(send_chat())
                chat_task.add_done_callback(on_chat_done)

            elif msg_type == "stop":
                # 停止当前生成
                async with chat_lock:
                    old_task = chat_task

                if old_task and not old_task.done():
                    old_task.cancel()
                    manager.stop()
                    logger.info("Stop requested for session: %s", session_id)
                    try:
                        await old_task
                    except asyncio.CancelledError:
                        pass

                async with chat_lock:
                    chat_task = None

                await websocket.send_text(json.dumps({"type": "stopped"}))

            elif msg_type == "clear_history":
                manager.clear_history()
                await websocket.send_text(json.dumps({"type": "history_cleared"}))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)
    except Exception as exc:
        logger.exception("WebSocket error for session %s: %s", session_id, exc)
    finally:
        if chat_task and not chat_task.done():
            chat_task.cancel()
            manager.stop()
        try:
            await remove_manager(session_id)
        except Exception as e:
            logger.error("Failed to remove manager for session %s: %s", session_id, e)


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
