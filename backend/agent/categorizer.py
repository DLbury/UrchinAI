"""
Bookmark categorizer using LLM.

Provides intelligent categorization for bookmarks based on URL and title.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

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


def _create_categorizer_provider() -> tuple[Any, str, str] | None:
    """Create nanobot LLM provider for categorization. Returns (provider, model, provider_name) or None."""
    try:
        from nanobot.providers import AnthropicProvider, OpenAICompatProvider, AzureOpenAIProvider
    except ImportError:
        return None

    import json as _json
    from pathlib import Path
    _cfg_path = Path.home() / ".nanobot" / "config.json"
    if not _cfg_path.exists():
        return None
    try:
        raw = _json.loads(_cfg_path.read_text(encoding="utf-8"))
    except Exception:
        return None

    # Legacy migration (ali->dashscope, apiKey->api_key)
    LEGACY = {"ali": "dashscope", "zhipu": "zhipuai"}
    providers_raw = {}
    for name, v in raw.get("providers", {}).items():
        new_name = LEGACY.get(name, name)
        providers_raw[new_name] = {
            "api_key": v.get("apiKey") or v.get("api_key", ""),
            "api_base": v.get("apiBase") or v.get("api_base", ""),
        }

    defaults = raw.get("agents", {}).get("defaults", {})
    provider_name = defaults.get("provider", "")
    model = defaults.get("model", "")

    provider_cfg = providers_raw.get(provider_name, {})
    api_key = provider_cfg.get("api_key", "")
    api_base = provider_cfg.get("api_base", "")

    if not model or (not api_key and not api_base):
        return None

    if provider_name == "anthropic":
        provider = AnthropicProvider(api_key=api_key, api_base=api_base, default_model=model)
    elif provider_name == "azure_openai":
        provider = AzureOpenAIProvider(api_key=api_key, api_base=api_base, default_model=model)
    else:
        provider = OpenAICompatProvider(api_key=api_key, api_base=api_base, default_model=model)

    return provider, model, provider_name


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
    # Build category list for prompt
    cat_list = ", ".join(f"{c['id']} ({c['name']})" for c in categories)

    prompt = f"""请将以下书签分类到最合适的类别。

URL: {url}
标题: {title or '未知'}

可选分类：{cat_list}

只返回分类的 id（如 work、study 等），不要其他内容。"""

    try:
        provider_info = _create_categorizer_provider()
        if provider_info is None:
            logger.warning("No nanobot provider available, using fallback categorization")
            return _fallback_categorize(url, categories)

        provider, model, provider_name = provider_info

        response = await provider.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=0,
            max_tokens=20,
        )
        content = response.content.strip().lower() if response.content else ""

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