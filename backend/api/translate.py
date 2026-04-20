"""Translation API — calls LLM to translate selected text."""
from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from api.config import _read_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/translate", tags=["translate"])


def _normalize_litellm_api_base(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        from urllib.parse import urlparse
        parsed = urlparse(s)
        if parsed.scheme not in ("http", "https"):
            return None
    except Exception:
        return None
    return s.rstrip("/")


def _resolve_litellm_model(model: str, provider_name: str, api_base: str | None) -> str:
    if "/" in model:
        return model
    _KNOWN_PREFIXES: dict[str, str] = {
        "openai": "",
        "anthropic": "anthropic",
        "deepseek": "deepseek",
        "gemini": "gemini",
        "zhipu": "zai",
        "dashscope": "dashscope",
        "moonshot": "moonshot",
        "minimax": "minimax",
        "siliconflow": "openai",
        "aihubmix": "openai",
        "volcengine": "volcengine",
        "groq": "groq",
        "openrouter": "openrouter",
        "vllm": "hosted_vllm",
    }
    prefix = _KNOWN_PREFIXES.get(provider_name)
    if prefix is not None:
        if prefix:
            return f"{prefix}/{model}"
        return model
    if api_base:
        return f"openai/{model}"
    return model


class TranslateRequest(BaseModel):
    text: str


class TranslateResponse(BaseModel):
    translation: str


@router.post("")
async def translate(body: TranslateRequest) -> TranslateResponse:
    cfg = _read_config()
    tr_cfg = cfg.get("translation", {})

    # Fallback to default agent model if translation not configured
    defaults = cfg.get("agents", {}).get("defaults", {})
    model: str = tr_cfg.get("model") or defaults.get("model", "")
    provider_name: str = tr_cfg.get("provider") or defaults.get("provider", "")
    target_lang: str = tr_cfg.get("targetLang", "中文")

    providers_map: dict = cfg.get("providers", {})
    provider_cfg: dict = providers_map.get(provider_name, {})
    if not provider_cfg and providers_map:
        provider_name, provider_cfg = next(iter(providers_map.items()))

    api_key: str = provider_cfg.get("apiKey", "") or ""
    api_base: str | None = _normalize_litellm_api_base(provider_cfg.get("apiBase", "") or None)

    if not model:
        return TranslateResponse(translation="错误：未配置翻译模型，请在设置中选择模型。")

    resolved_model = _resolve_litellm_model(model, provider_name, api_base)
    logger.info("[translate] model=%s resolved=%s", model, resolved_model)

    import litellm
    litellm.suppress_debug_info = True
    litellm.drop_params = True

    system_msg = f"你是一个专业翻译助手。请将以下文本翻译成{target_lang}。只返回翻译结果，不要添加任何解释、前缀或后缀。"
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": body.text},
    ]

    try:
        response = await litellm.acompletion(
            model=resolved_model,
            messages=messages,
            api_key=api_key or None,
            api_base=api_base or None,
            temperature=0.3,
            max_tokens=2048,
        )
        translation = response.choices[0].message.content.strip()
        return TranslateResponse(translation=translation)
    except Exception as e:
        logger.error("[translate] error: %s", e)
        return TranslateResponse(translation=f"翻译失败：{e}")
