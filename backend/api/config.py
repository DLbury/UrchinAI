"""
Config API: read/write ~/.nanobot/config.json.

Sensitive values (API keys) are masked in GET responses; clients send the
original sentinel back unchanged to preserve them during PUT.
"""
from __future__ import annotations

import copy
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/config", tags=["config"])

CONFIG_PATH = Path.home() / ".nanobot" / "config.json"
MASKED = "••••••••"

# Keys whose values should be masked in GET responses
_SENSITIVE_KEYS = {"apiKey", "token", "appSecret", "imapPassword", "smtpPassword", "secret"}


def _mask(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: (MASKED if k in _SENSITIVE_KEYS and isinstance(v, str) and v else _mask(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mask(i) for i in obj]
    return obj


def _unmask(new_obj: Any, orig_obj: Any) -> Any:
    """Replace masked sentinel values in new_obj with originals from orig_obj."""
    if isinstance(new_obj, dict) and isinstance(orig_obj, dict):
        result = {}
        for k, v in new_obj.items():
            if v == MASKED and k in orig_obj:
                result[k] = orig_obj[k]
            else:
                result[k] = _unmask(v, orig_obj.get(k, {}))
        return result
    if isinstance(new_obj, list) and isinstance(orig_obj, list):
        return [
            _unmask(n, o) for n, o in zip(new_obj, orig_obj)
        ] + new_obj[len(orig_obj):]
    return new_obj


def _read_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


def _write_config(data: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


@router.get("")
async def get_config():
    """Return config with sensitive values masked."""
    raw = _read_config()
    return {"config": _mask(raw)}


class ConfigUpdate(BaseModel):
    config: dict


@router.put("")
async def update_config(body: ConfigUpdate):
    """Update config. Masked sentinel values are preserved from disk."""
    orig = _read_config()
    merged = _unmask(body.config, orig)
    _write_config(merged)
    return {"config": _mask(merged)}


@router.get("/providers")
async def get_providers():
    raw = _read_config()
    providers = raw.get("providers", {})
    return {"providers": _mask(providers)}


class ProviderUpdate(BaseModel):
    name: str
    apiKey: str = ""
    apiBase: str = ""
    models: list[dict] = []  # [{"label": "显示名", "value": "模型ID"}, ...]


@router.put("/providers/{name}")
async def update_provider(name: str, body: ProviderUpdate):
    cfg = _read_config()
    cfg.setdefault("providers", {})
    existing = cfg["providers"].get(name, {})
    if body.apiKey and body.apiKey != MASKED:
        existing["apiKey"] = body.apiKey
    if body.apiBase:
        existing["apiBase"] = body.apiBase
    if body.models is not None:
        existing["models"] = body.models
    cfg["providers"][name] = existing
    _write_config(cfg)
    return {"ok": True}


@router.delete("/providers/{name}")
async def delete_provider(name: str):
    cfg = _read_config()
    cfg.get("providers", {}).pop(name, None)
    _write_config(cfg)
    return {"ok": True}


@router.get("/model")
async def get_model():
    raw = _read_config()
    return {"model": raw.get("agents", {}).get("defaults", {}).get("model", "")}


class ModelUpdate(BaseModel):
    model: str
    provider: str = ""


@router.put("/model")
async def update_model(body: ModelUpdate):
    cfg = _read_config()
    cfg.setdefault("agents", {}).setdefault("defaults", {})
    cfg["agents"]["defaults"]["model"] = body.model
    if body.provider:
        cfg["agents"]["defaults"]["provider"] = body.provider
    _write_config(cfg)
    return {"ok": True}


@router.get("/agent-limits")
async def get_agent_limits():
    """Get agent limits configuration (maxTokens, maxIterations)."""
    raw = _read_config()
    defaults = raw.get("agents", {}).get("defaults", {})
    return {
        "maxTokens": defaults.get("maxTokens", 0),
        "maxIterations": defaults.get("maxIterations", 0),
    }


class AgentLimitsUpdate(BaseModel):
    maxTokens: int = 0
    maxIterations: int = 0


@router.put("/agent-limits")
async def update_agent_limits(body: AgentLimitsUpdate):
    """Update agent limits configuration."""
    cfg = _read_config()
    cfg.setdefault("agents", {}).setdefault("defaults", {})
    cfg["agents"]["defaults"]["maxTokens"] = body.maxTokens
    cfg["agents"]["defaults"]["maxIterations"] = body.maxIterations
    _write_config(cfg)
    return {"ok": True}


@router.get("/search-engine")
async def get_search_engine():
    """Get default search engine."""
    raw = _read_config()
    return {"engine": raw.get("searchEngine", "bing")}


class SearchEngineUpdate(BaseModel):
    engine: str


@router.put("/search-engine")
async def update_search_engine(body: SearchEngineUpdate):
    """Update default search engine."""
    cfg = _read_config()
    cfg["searchEngine"] = body.engine
    _write_config(cfg)
    return {"ok": True}
