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

    def __init__(self) -> None:
        pass  # no Playwright page needed

    async def browser_navigate(self, url: str) -> str:
        """让浏览器导航到指定 URL。"""
        res = await _call("POST", "/navigate", url=url)
        if "error" in res:
            return f"导航失败: {res['error']}"
        return f"已导航至 {url}，页面标题: {res.get('title', '')}"

    async def browser_click(self, selector: str) -> str:
        """点击页面元素（支持 CSS 选择器或可见文字）。"""
        res = await _call("POST", "/click", selector=selector)
        if res.get("ok") is False:
            return f"点击失败: {res.get('error', '元素未找到')}"
        element = res.get("element", selector)
        x, y = res.get("x", "?"), res.get("y", "?")
        return f"已点击 [{element}] 坐标({x},{y})"

    async def browser_type(self, selector: str, text: str) -> str:
        """在输入框中输入文字（支持 CSS 选择器、placeholder、name 或 aria-label）。"""
        res = await _call("POST", "/type", selector=selector, text=text)
        if res.get("ok") is False:
            return f"输入失败: {res.get('error', '元素未找到')}"
        return f"已在 [{selector}] 输入: {text}"

    async def browser_get_text(self, selector: str = "body") -> str:
        """获取页面文字内容。"""
        res = await _call("POST", "/get-text", selector=selector)
        if "error" in res:
            return f"获取文字失败: {res['error']}"
        return res.get("text", "")

    async def browser_get_url(self) -> str:
        """获取浏览器当前 URL。"""
        res = await _call("GET", "/url")
        return res.get("url", "")

    async def browser_scroll(self, direction: str = "down", amount: int = 300) -> str:
        """滚动页面。"""
        res = await _call("POST", "/scroll", direction=direction, amount=amount)
        if "error" in res:
            return f"滚动失败: {res['error']}"
        return f"已向{direction}滚动 {amount}px"

    async def browser_evaluate(self, javascript: str) -> str:
        """在浏览器页面执行 JavaScript。"""
        res = await _call("POST", "/execute", javascript=javascript)
        if "error" in res:
            return f"JS 执行失败: {res['error']}"
        return res.get("result", "")

    async def browser_new_tab(self, url: str = "") -> str:
        """打开一个新的浏览器标签页，可选指定初始 URL。"""
        res = await _call("POST", "/new-tab", url=url)
        if "error" in res:
            return f"新建标签失败: {res['error']}"
        return f"已新建标签页" + (f"，打开 {url}" if url else "")

    async def browser_close_tab(self) -> str:
        """关闭当前活动标签页。"""
        res = await _call("POST", "/close-tab")
        if "error" in res:
            return f"关闭标签失败: {res['error']}"
        return "已关闭当前标签页"

    async def browser_list_tabs(self) -> str:
        """列出所有已打开的标签页（id、标题、URL）。"""
        res = await _call("GET", "/tabs")
        if "error" in res:
            return f"获取标签列表失败: {res['error']}"
        tabs = res.get("tabs", [])
        if not tabs:
            return "当前没有打开的标签页"
        lines = []
        for t in tabs:
            active = " ← 当前" if t.get("isActive") else ""
            lines.append(f"[{t['id']}] {t.get('title', '无标题')} — {t.get('url', '')}{active}")
        return "\n".join(lines)

    async def browser_switch_tab(self, tab_id: str) -> str:
        """切换到指定 id 的标签页。"""
        res = await _call("POST", "/switch-tab", tabId=tab_id)
        if "error" in res:
            return f"切换标签失败: {res['error']}"
        return f"已切换到标签 {tab_id}"

    async def browser_get_dom(self) -> str:
        """获取页面所有可交互元素的编号列表（类似 page-agent 的文字 DOM），供 LLM 用 @N 定位元素。"""
        res = await _call("GET", "/get-dom")
        if "error" in res:
            return f"获取 DOM 失败: {res['error']}"
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
            f"页面标题: {title}",
            f"URL: {url}",
            f"视口: {vw}x{vh}px",
        ]
        if pixels_above > 4:
            lines.append(f"... 上方还有 {pixels_above}px 内容（约 {pages_above:.1f} 屏）- 可滚动查看 ...")
        else:
            lines.append("[页面顶部]")
        lines.append(f"共 {count} 个可交互元素（用 @N 引用）:")
        lines.extend(elems)
        if pixels_below > 4:
            lines.append(f"... 下方还有 {pixels_below}px 内容（约 {pages_below:.1f} 屏）- 可滚动查看 ...")
        else:
            lines.append("[页面底部]")
        if body:
            lines += ["", "── 页面正文 ──", body]
        return "\n".join(lines)

    async def browser_press_key(self, key: str = "Enter") -> str:
        """模拟键盘按键（Enter/Tab/Escape 等）。"""
        res = await _call("POST", "/press-key", key=key)
        if res.get("ok") is False:
            return f"按键失败: {res.get('error', '')}"
        return f"已按键: {key}"

    async def browser_screenshot(self) -> str:
        """截取当前页面的截图，以 base64 JPEG 格式返回，供视觉分析使用。"""
        res = await _call("GET", "/screenshot")
        if "error" in res:
            return f"截图失败: {res['error']}"
        b64 = res.get("image", "")
        w, h = res.get("width", 0), res.get("height", 0)
        return f"screenshot:{w}x{h}:data:image/jpeg;base64,{b64}"

    async def browser_get_page_content(self) -> str:
        """获取当前页面的主要文字内容（已去除广告/导航等噪音），用于总结或分析。"""
        res = await _call("GET", "/page-content")
        if "error" in res:
            return f"获取内容失败: {res['error']}"
        title = res.get("title", "")
        url = res.get("url", "")
        text = res.get("text", "")
        return f"页面标题: {title}\nURL: {url}\n\n{text}"
