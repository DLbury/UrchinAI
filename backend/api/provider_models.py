"""
Fetch the live model list for a configured provider.

The user only ever types an API key; the model catalogue comes from the
provider itself, so there is nothing to maintain by hand. Every provider is
probed with its own listing endpoint, and failures surface as a readable 502
rather than a stack trace.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.config import _read_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/config", tags=["config"])

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


async def _openai_compat(url: str, *, key: str | None = None,
                         headers: dict | None = None,
                         params: dict | None = None) -> list[dict]:
    """Read an OpenAI-style {"data": [{"id": ...}]} listing."""
    hdrs = dict(headers or {})
    if key:
        hdrs["Authorization"] = f"Bearer {key}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(url, headers=hdrs, params=params)
    r.raise_for_status()
    return r.json().get("data") or []


async def _gemini(key: str) -> list[dict]:
    """Gemini lists under models/<id> and takes the key in the query string."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": key, "pageSize": 1000},
        )
    r.raise_for_status()
    out = []
    for m in r.json().get("models") or []:
        name = m.get("name") or ""
        if not name.startswith("models/"):
            continue
        model_id = name[len("models/"):]
        out.append({"id": model_id, "label": m.get("displayName") or model_id})
    return out


async def _volcengine(key: str) -> list[dict]:
    """Volcengine Ark: endpoint ids are user-created, so list deployments."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(
            "https://ark.cn-beijing.volces.com/api/v3/models",
            headers={"Authorization": f"Bearer {key}"},
        )
    r.raise_for_status()
    payload = r.json()
    rows = payload.get("data") or payload.get("models") or []
    out = []
    for m in rows:
        model_id = m.get("id") or m.get("model") or ""
        if model_id:
            out.append({"id": model_id, "label": m.get("name") or model_id})
    return out


#: provider name -> coroutine(api_key) -> raw listing entries
_FETCHERS = {
    "openrouter": lambda k: _openai_compat(
        "https://openrouter.ai/api/v1/models", key=k),
    "openai": lambda k: _openai_compat(
        "https://api.openai.com/v1/models", key=k),
    "deepseek": lambda k: _openai_compat(
        "https://api.deepseek.com/v1/models", key=k),
    "groq": lambda k: _openai_compat(
        "https://api.groq.com/openai/v1/models", key=k),
    "moonshot": lambda k: _openai_compat(
        "https://api.moonshot.cn/v1/models", key=k),
    "zhipu": lambda k: _openai_compat(
        "https://open.bigmodel.cn/api/paas/v4/models", key=k),
    "dashscope": lambda k: _openai_compat(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/models", key=k),
    "siliconflow": lambda k: _openai_compat(
        "https://api.siliconflow.cn/v1/models", key=k),
    "aihubmix": lambda k: _openai_compat(
        "https://aihubmix.com/v1/models", key=k),
    "minimax": lambda k: _openai_compat(
        "https://api.minimax.chat/v1/models", key=k),
    "anthropic": lambda k: _openai_compat(
        "https://api.anthropic.com/v1/models", headers={
            "x-api-key": k, "anthropic-version": "2023-06-01"}),
    "gemini": _gemini,
    "volcengine": _volcengine,
}

#: providers with no fixed listing endpoint (self-hosted or account-specific)
_UNLISTABLE = {"custom", "vllm", "azure_openai"}


class ModelFetchRequest(BaseModel):
    apiKey: str = ""


@router.post("/providers/{name}/models")
async def fetch_provider_models(name: str, body: ModelFetchRequest):
    """Return every model the provider currently offers, free ones included."""
    if name in _UNLISTABLE:
        raise HTTPException(
            status_code=400,
            detail=f"{name} has no public model list; add model IDs manually.",
        )

    fetcher = _FETCHERS.get(name)
    if fetcher is None:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {name}")

    cfg = _read_config()
    stored = (cfg.get("providers", {}).get(name) or {}).get("apiKey", "") or ""
    # The UI sends MASKED back when the user did not retype the key.
    api_key = body.apiKey if body.apiKey and "•" not in body.apiKey else stored
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key for this provider.")

    try:
        raw = await fetcher(api_key)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{name} returned HTTP {exc.response.status_code}.",
        ) from exc
    except Exception as exc:
        logger.warning("[provider-models] %s failed: %s", name, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    models: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        value = str(item.get("id") or item.get("name") or "").strip()
        value = value.removeprefix("models/").strip()
        if not value:
            continue
        label = str(item.get("displayName") or item.get("name") or value).strip()
        models.append({
            "label": label or value,
            "value": value,
            "isFree": value.endswith(":free"),
        })

    # Free models first, then alphabetical, so the usable ones land on top.
    models.sort(key=lambda m: (not m["isFree"], m["value"].lower()))
    return {"models": models, "count": len(models)}
