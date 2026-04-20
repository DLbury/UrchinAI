"""Translation configuration API."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from api.config import _read_config, _write_config

router = APIRouter(prefix="/api/config/translation", tags=["config"])


@router.get("")
async def get_translation_config():
    cfg = _read_config()
    tr = cfg.get("translation", {})
    defaults = cfg.get("agents", {}).get("defaults", {})
    return {
        "model": tr.get("model") or defaults.get("model", ""),
        "provider": tr.get("provider") or defaults.get("provider", ""),
        "targetLang": tr.get("targetLang", "中文"),
    }


class TranslationConfigUpdate(BaseModel):
    model: str = ""
    provider: str = ""
    targetLang: str = "中文"


@router.put("")
async def update_translation_config(body: TranslationConfigUpdate):
    cfg = _read_config()
    cfg["translation"] = {
        "model": body.model,
        "provider": body.provider,
        "targetLang": body.targetLang,
    }
    _write_config(cfg)
    return {"ok": True}
