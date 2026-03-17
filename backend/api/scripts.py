"""Automation scripts API — saved prompt templates for one-click agent tasks."""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

SCRIPTS_FILE = Path.home() / ".nanobot" / "scripts.json"
router = APIRouter(prefix="/api/scripts")

_DEFAULTS = [
    {"id": "default-1", "name": "总结页面",   "prompt": "请总结当前浏览器页面的主要内容（使用 browser_get_page_content 工具）",       "icon": "📝"},
    {"id": "default-2", "name": "截图分析",   "prompt": "请截取当前页面截图并描述你看到的内容",                                       "icon": "📸"},
    {"id": "default-3", "name": "提取链接",   "prompt": "请列出当前页面上所有重要链接",                                               "icon": "🔗"},
    {"id": "default-4", "name": "翻译页面",   "prompt": "请将当前页面的主要内容翻译成中文（使用 browser_get_page_content 工具读取）",  "icon": "🌐"},
    {"id": "default-5", "name": "填写表单",   "prompt": "请帮我查看当前页面有哪些表单字段，并提示我如何填写",                        "icon": "📋"},
]


def _load() -> list[dict]:
    if SCRIPTS_FILE.exists():
        try:
            return json.loads(SCRIPTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return list(_DEFAULTS)
    return list(_DEFAULTS)


def _save(data: list[dict]) -> None:
    SCRIPTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCRIPTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class ScriptCreate(BaseModel):
    name: str
    prompt: str
    icon: str = "⚡"


@router.get("")
def list_scripts():
    return _load()


@router.post("")
def create_script(sc: ScriptCreate):
    data = _load()
    entry = {
        "id": str(int(time.time() * 1000)),
        "name": sc.name.strip(),
        "prompt": sc.prompt.strip(),
        "icon": sc.icon,
    }
    data.append(entry)
    _save(data)
    return entry


@router.delete("/{script_id}")
def delete_script(script_id: str):
    data = _load()
    data = [s for s in data if s.get("id") != script_id]
    _save(data)
    return {"ok": True}


class ScriptUpdate(BaseModel):
    name: str | None = None
    prompt: str | None = None
    icon: str | None = None


@router.put("/{script_id}")
def update_script(script_id: str, body: ScriptUpdate):
    data = _load()
    for s in data:
        if s.get("id") == script_id:
            if body.name is not None:
                s["name"] = body.name.strip()
            if body.prompt is not None:
                s["prompt"] = body.prompt.strip()
            if body.icon is not None:
                s["icon"] = body.icon
            _save(data)
            return s
    return {"error": "not found"}
