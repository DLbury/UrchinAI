"""
Bookmark categorizer using LLM.

Provides intelligent categorization for bookmarks based on URL and title.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

NANOBOT_CONFIG = Path.home() / ".nanobot" / "config.json"

# Default preset categories
DEFAULT_CATEGORIES = [
    {"id": "work", "name": "工作", "name_en": "Work", "icon": "💼"},
    {"id": "study", "name": "学习", "name_en": "Study", "icon": "📚"},
    {"id": "entertainment", "name": "娱乐", "name_en": "Entertainment", "icon": "🎬"},
    {"id": "shopping", "name": "购物", "name_en": "Shopping", "icon": "🛒"},
    {"id": "social", "name": "社交", "name_en": "Social", "icon": "💬"},
    {"id": "tools", "name": "工具", "name_en": "Tools", "icon": "🔧"},
    {"id": "news", "name": "新闻", "name_en": "News", "icon": "📰"},
    {"id": "ai", "name": "AI", "name_en": "AI", "icon": "🤖"},
    {"id": "finance", "name": "金融", "name_en": "Finance", "icon": "💰"},
    {"id": "other", "name": "其他", "name_en": "Other", "icon": "📌"},
]


def _load_config() -> dict:
    """Load configuration from ~/.nanobot/config.json."""
    if NANOBOT_CONFIG.exists():
        try:
            with open(NANOBOT_CONFIG) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _resolve_litellm_model(model: str, provider_name: str, api_base: str | None, api_key: str) -> str:
    """Return a LiteLLM-compatible model string for the given config."""
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
        os.environ["OPENAI_API_KEY"] = api_key
        return f"openai/{model}"

    return model


async def categorize_bookmark(url: str, title: str, categories: list[dict]) -> str:
    """
    Use LLM to categorize a bookmark.

    Args:
        url: The bookmark URL
        title: The bookmark title
        categories: List of available categories [{id, name, icon}, ...]

    Returns:
        Category ID (falls back to "other" on failure)
    """
    try:
        import litellm
        litellm.suppress_debug_info = True
        litellm.drop_params = True
    except ImportError:
        logger.warning("litellm not available, using fallback categorization")
        return _fallback_categorize(url, categories)

    cfg = _load_config()
    defaults = cfg.get("agents", {}).get("defaults", {})
    provider_name: str = defaults.get("provider", "")
    model: str = defaults.get("model", "")

    providers_map: dict = cfg.get("providers", {})
    provider_cfg: dict = providers_map.get(provider_name, {})
    if not provider_cfg and providers_map:
        provider_name, provider_cfg = next(iter(providers_map.items()))

    api_key: str = provider_cfg.get("apiKey", "") or ""
    api_base: str | None = provider_cfg.get("apiBase", "") or None

    if not model or (not api_key and not api_base):
        logger.warning("No model or API key configured, using fallback categorization")
        return _fallback_categorize(url, categories)

    resolved_model = _resolve_litellm_model(model, provider_name, api_base, api_key)

    # Build category list for prompt
    cat_list = ", ".join(f"{c['id']} ({c['name']})" for c in categories)

    prompt = f"""请将以下书签分类到最合适的类别。

URL: {url}
标题: {title or '未知'}

可选分类：{cat_list}

只返回分类的 id（如 work、study 等），不要其他内容。"""

    try:
        call_kwargs: dict[str, Any] = {
            "model": resolved_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": 20,
            "api_key": api_key,
        }
        if api_base:
            call_kwargs["api_base"] = api_base

        response = await litellm.acompletion(**call_kwargs)
        content = response.choices[0].message.content.strip().lower()

        # Validate response is a valid category
        valid_ids = {c["id"] for c in categories}
        if content in valid_ids:
            logger.info("LLM categorized '%s' as '%s'", url, content)
            return content

        logger.warning("LLM returned invalid category '%s', using fallback", content)
        return _fallback_categorize(url, categories)

    except Exception as e:
        logger.error("LLM categorization failed: %s", e)
        return _fallback_categorize(url, categories)


def _fallback_categorize(url: str, categories: list[dict]) -> str:
    """
    Fallback categorization using URL patterns.

    This matches the existing CATEGORY_RULES logic from NewTabPage.
    """
    import re

    # URL pattern rules (matching NewTabPage logic)
    patterns = [
        ("search", r"google|baidu|bing|duckduckgo|sogou|yahoo|brave"),
        ("entertainment", r"youtube|bilibili|netflix|iqiyi|youku|vimeo|twitch|douyin"),
        ("social", r"twitter|x\.com|facebook|instagram|weibo|linkedin|tiktok|discord"),
        ("shopping", r"amazon|taobao|jd\.com|tmall|pinduoduo|ebay|aliexpress|shopify"),
        ("tools", r"github|gitlab|stackoverflow|npmjs|pypi|vercel|railway|cloudflare|docker"),
        ("news", r"news|bbc|cnn|xinhua|sina\.com|sohu|people\.com|reuters|theguardian"),
        ("ai", r"openai|chatgpt|claude|gemini|deepseek|huggingface|cohere|midjourney"),
        ("finance", r"bank|alipay|paypal|finance|trading|invest|stock|fund|crypto"),
    ]

    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname.lower() or ""

        for cat_id, pattern in patterns:
            if re.search(pattern, host):
                # Check if this category exists
                if any(c["id"] == cat_id for c in categories):
                    return cat_id
                # Map to closest available category
                if cat_id == "search":
                    return "tools"
                return "other"
    except Exception:
        pass

    return "other"