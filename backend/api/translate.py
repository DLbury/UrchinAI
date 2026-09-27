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
    lang: str = "en"  # UI language code, used for error messages
    targetLang: str = ""  # used when no target has been saved yet


class TranslateResponse(BaseModel):
    translation: str


# User-facing error messages, keyed by the UI language sent by the frontend.
_ERROR_NO_MODEL = {
    "en": "Error: no translation model configured. Pick one in Settings.",
    "fa": "خطا: هیچ مدل ترجمه‌ای پیکربندی نشده است. از تنظیمات یکی را انتخاب کنید.",
    "zh-CN": "错误：未配置翻译模型，请在设置中选择模型。",
}
_ERROR_FAILED = {
    "en": "Translation failed: {error}",
    "fa": "ترجمه ناموفق بود: {error}",
    "zh-CN": "翻译失败：{error}",
}


def _localized(table: dict[str, str], lang: str, **fmt: str) -> str:
    if lang in table:
        return table[lang].format(**fmt) if fmt else table[lang]
    if lang.startswith("fa"):
        return table["fa"].format(**fmt) if fmt else table["fa"]
    if lang.startswith("zh"):
        return table["zh-CN"].format(**fmt) if fmt else table["zh-CN"]
    return table["en"].format(**fmt) if fmt else table["en"]


@router.post("")
async def translate(body: TranslateRequest) -> TranslateResponse:
    cfg = _read_config()
    tr_cfg = cfg.get("translation", {})

    # Fallback to default agent model if translation not configured
    defaults = cfg.get("agents", {}).get("defaults", {})
    model: str = tr_cfg.get("model") or defaults.get("model", "")
    provider_name: str = tr_cfg.get("provider") or defaults.get("provider", "")
    # Empty means the UI has not saved a target yet; the request may still carry one.
    target_lang: str = tr_cfg.get("targetLang") or body.targetLang or ""

    providers_map: dict = cfg.get("providers", {})
    provider_cfg: dict = providers_map.get(provider_name, {})
    if not provider_cfg and providers_map:
        provider_name, provider_cfg = next(iter(providers_map.items()))

    api_key: str = provider_cfg.get("apiKey", "") or ""
    api_base: str | None = _normalize_litellm_api_base(provider_cfg.get("apiBase", "") or None)

    if not model:
        return TranslateResponse(translation=_localized(_ERROR_NO_MODEL, body.lang))

    if not target_lang:
        # No target saved and none supplied — fall back to the interface language
        # so the prompt is never "Translate into ." (and never silently Chinese).
        target_lang = body.lang if body.lang in ("en", "fa", "zh-CN") else "en"

    resolved_model = _resolve_litellm_model(model, provider_name, api_base)
    logger.info("[translate] model=%s resolved=%s", model, resolved_model)

    import litellm
    litellm.suppress_debug_info = True
    litellm.drop_params = True

    system_msg = (
        f"You are a professional translation assistant. Translate the following text into "
        f"{target_lang}. Return only the translation, with no explanations, prefixes or suffixes."
    )
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
        return TranslateResponse(translation=_localized(_ERROR_FAILED, body.lang, error=str(e)))
