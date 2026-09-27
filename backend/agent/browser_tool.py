"""
Browser tools that delegate to the Electron BrowserView via the HTTP bridge.

The Electron main process runs a tiny HTTP server on localhost:8002 that
accepts commands (navigate, click, type, scroll, get-text, execute JS) and
executes them on the embedded BrowserView — no Playwright, no WebRTC.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from agent.i18n import t

logger = logging.getLogger(__name__)
BRIDGE_URL = "http://127.0.0.1:8002"


async def _call(method: str, path: str, **json_body: Any) -> dict:
    """Send a request to the Electron bridge and return the JSON response."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if method == "GET":
                r = await client.get(f"{BRIDGE_URL}{path}")
            else:
                r = await client.post(f"{BRIDGE_URL}{path}", json=json_body)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("Bridge call failed %s %s: %s", method, path, exc)
        return {"error": str(exc)}


class BrowserTools:
    """Async browser tool functions backed by the Electron HTTP bridge."""

    def __init__(self, lang: str = "") -> None:
        # UI language of the current turn; these results are shown in the chat
        # panel, so they must not stay hardcoded Chinese.
        self.lang = lang

    def _t(self, key: str, **kwargs: object) -> str:
        return t(key, self.lang, **kwargs)

    async def browser_navigate(self, url: str) -> str:
        """让浏览器导航到指定 URL。"""
        res = await _call("POST", "/navigate", url=url)
        if "error" in res:
            return self._t("navFailed", err=res["error"])
        return self._t("navOk", url=url, title=res.get("title", ""))

    async def browser_click(self, selector: str) -> str:
        """点击页面元素（支持 CSS 选择器或可见文字）。"""
        res = await _call("POST", "/click", selector=selector)
        if res.get("ok") is False:
            return self._t("clickFailed", err=res.get("error") or self._t("elementNotFound"))
        element = res.get("element", selector)
        x, y = res.get("x", "?"), res.get("y", "?")
        return self._t("clickOk", el=element, x=x, y=y)

    async def browser_type(self, selector: str, text: str) -> str:
        """在输入框中输入文字（支持 CSS 选择器、placeholder、name 或 aria-label）。"""
        res = await _call("POST", "/type", selector=selector, text=text)
        if res.get("ok") is False:
            return self._t("typeFailed", err=res.get("error") or self._t("elementNotFound"))
        return self._t("typeOk", sel=selector, text=text)

    async def browser_get_text(self, selector: str = "body") -> str:
        """获取页面文字内容（敏感页面会被拦截）。"""
        current_url = await self.browser_get_url()
        if self._is_sensitive_host(current_url):
            return self._t("textBlocked")
        res = await _call("POST", "/get-text", selector=selector)
        if "error" in res:
            return self._t("textFailed", err=res["error"])
        return res.get("text", "")

    async def browser_get_url(self) -> str:
        """获取浏览器当前 URL。"""
        res = await _call("GET", "/url")
        return res.get("url", "")

    async def browser_scroll(self, direction: str = "down", amount: int = 300) -> str:
        """滚动页面。"""
        res = await _call("POST", "/scroll", direction=direction, amount=amount)
        if "error" in res:
            return self._t("scrollFailed", err=res["error"])
        return self._t("scrollOk", dir=direction, amount=amount)

    # Hosts where content reading / screenshots are considered high-risk
    _SENSITIVE_HOST_PATTERNS = {
        "alipay", "wechatpay", "tenpay", "paypal", "stripe", "bank",
        "mail", "gmail", "outlook", "yahoo", "163.com", "qq.com",
        "amazon", "taobao", "tmall", "jd.com", "binance", "coinbase",
        "kraken", "okx", "huobi", "gate.io", "webull", "robinhood",
    }

    def _is_sensitive_host(self, url: str) -> bool:
        try:
            from urllib.parse import urlparse
            host = urlparse(url).hostname or ""
            host_lower = host.lower()
            return any(p in host_lower for p in self._SENSITIVE_HOST_PATTERNS)
        except Exception:
            return False

    async def browser_evaluate(self, javascript: str) -> str:
        """在浏览器页面执行 JavaScript（敏感页面会被拦截）。"""
        current_url = await self.browser_get_url()
        if self._is_sensitive_host(current_url):
            return self._t("jsBlocked")
        res = await _call("POST", "/execute", javascript=javascript)
        if "error" in res:
            return self._t("jsFailed", err=res["error"])
        return res.get("result", "")

    async def browser_new_tab(self, url: str = "") -> str:
        """打开一个新的浏览器标签页，可选指定初始 URL。"""
        res = await _call("POST", "/new-tab", url=url)
        if "error" in res:
            return self._t("newTabFailed", err=res["error"])
        return self._t("newTabOk") + (self._t("newTabOpenUrl", url=url) if url else "")

    async def browser_close_tab(self) -> str:
        """关闭当前活动标签页。"""
        res = await _call("POST", "/close-tab")
        if "error" in res:
            return self._t("closeTabFailed", err=res["error"])
        return self._t("closeTabOk")

    async def browser_list_tabs(self) -> str:
        """列出所有已打开的标签页（id、标题、URL）。"""
        res = await _call("GET", "/tabs")
        if "error" in res:
            return self._t("tabsFailed", err=res["error"])
        tabs = res.get("tabs", [])
        if not tabs:
            return self._t("noTabs")
        lines = []
        for tab in tabs:
            active = self._t("activeTab") if tab.get("isActive") else ""
            title = tab.get("title") or self._t("untitled")
            lines.append(f"[{tab['id']}] {title} — {tab.get('url', '')}{active}")
        return "\n".join(lines)

    async def browser_switch_tab(self, tab_id: str) -> str:
        """切换到指定 id 的标签页。"""
        res = await _call("POST", "/switch-tab", tabId=tab_id)
        if "error" in res:
            return self._t("switchTabFailed", err=res["error"])
        return self._t("switchTabOk", id=tab_id)

    async def browser_get_dom(self) -> str:
        """获取页面所有可交互元素的编号列表（类似 page-agent 的文字 DOM），供 LLM 用 @N 定位元素（敏感页面会被拦截）。"""
        current_url = await self.browser_get_url()
        if self._is_sensitive_host(current_url):
            return self._t("domBlocked")
        res = await _call("GET", "/get-dom")
        if "error" in res:
            return self._t("domFailed", err=res["error"])
        title = res.get("title", "")
        url   = res.get("url", "")
        count = res.get("elementCount", 0)
        elems = res.get("elements", [])
        body  = res.get("bodyText", "")
        vw    = res.get("viewportWidth", 0)
        vh    = res.get("viewportHeight", 0)
        scroll_y = res.get("scrollY", 0)
        page_h   = res.get("pageHeight", 0)

        pixels_above = scroll_y
        pixels_below = max(0, page_h - scroll_y - vh)
        pages_above  = pixels_above / max(vh, 1)
        pages_below  = pixels_below / max(vh, 1)

        lines = [
            self._t("domTitle", title=title),
            f"URL: {url}",
            self._t("domViewport", vw=vw, vh=vh),
        ]
        if pixels_above > 4:
            lines.append(self._t("domMoreAbove", px=pixels_above, pages=f"{pages_above:.1f}"))
        else:
            lines.append(self._t("domTop"))
        lines.append(self._t("domCount", count=count))
        lines.extend(elems)
        if pixels_below > 4:
            lines.append(self._t("domMoreBelow", px=pixels_below, pages=f"{pages_below:.1f}"))
        else:
            lines.append(self._t("domBottom"))
        if body:
            lines += ["", self._t("domBody"), body]
        return "\n".join(lines)

    async def browser_press_key(self, key: str = "Enter") -> str:
        """模拟键盘按键（Enter/Tab/Escape 等）。"""
        res = await _call("POST", "/press-key", key=key)
        if res.get("ok") is False:
            return self._t("keyFailed", err=res.get("error", ""))
        return self._t("keyOk", key=key)

    async def browser_screenshot(self) -> str:
        """截取当前页面的截图，以 base64 JPEG 格式返回，供视觉分析使用（敏感页面会被拦截）。"""
        current_url = await self.browser_get_url()
        if self._is_sensitive_host(current_url):
            return self._t("shotBlocked")
        res = await _call("GET", "/screenshot")
        if "error" in res:
            return self._t("shotFailed", err=res["error"])
        b64 = res.get("image", "")
        w, h = res.get("width", 0), res.get("height", 0)
        return f"screenshot:{w}x{h}:data:image/jpeg;base64,{b64}"

    async def browser_get_page_content(self) -> str:
        """获取当前页面的主要文字内容（已去除广告/导航等噪音），用于总结或分析（敏感页面会被拦截）。"""
        current_url = await self.browser_get_url()
        if self._is_sensitive_host(current_url):
            return self._t("contentBlocked")
        res = await _call("GET", "/page-content")
        if "error" in res:
            return self._t("contentFailed", err=res["error"])
        return self._t("contentHeader", title=res.get("title", ""), url=res.get("url", "")) + res.get("text", "")
