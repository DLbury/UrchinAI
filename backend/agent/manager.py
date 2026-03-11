"""
AgentManager: streaming agent loop built directly on LiteLLM.

Each chat session gets its own AgentManager instance tied to a BrowserSession.
We bypass nanobot's non-streaming process_direct and implement our own loop so
the frontend receives tokens in real time.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)

NANOBOT_CONFIG = Path.home() / ".nanobot" / "config.json"
NANOBOT_WORKSPACE = Path.home() / ".nanobot" / "workspace"

_SYSTEM_PROMPT_BASE = """\
你是 UrchinAI，一个通用智能体助手，可以控制浏览器完成任务。用中文回复用户。

【核心工作流 - 必须遵守】
每次只调用一个工具，等待结果后再决定下一步。

◆ 与页面交互的标准流程（仿照 page-agent 的文字 DOM 方式）：
  1. browser_navigate   → 打开目标页面（等待返回成功）
  2. browser_get_dom    → 获取页面所有可交互元素的编号列表
  3. 分析列表，找到目标元素的编号 N
  4. browser_type("@N", "文字") 或 browser_click("@N") → 用 @N 精准操作
  5. browser_press_key("Enter") → 提交表单/搜索（不要点提交按钮）

◆ 使用 @N 编号的好处：
  - 比 CSS 选择器更可靠，不受页面结构变化影响
  - 不会误点到错误元素（如先点提交再填内容的顺序错误）
  - 每次 browser_get_dom 后编号刷新，页面变化后需重新获取

◆ 其他规则：
  - 不确定页面状态时：先 browser_get_dom 了解结构，必要时 browser_screenshot 查看视觉效果
  - 读取页面内容：browser_get_dom 已包含正文，也可用 browser_get_page_content 获取更完整文本
  - 禁止并行调用多个工具\
"""

NANOBOT_MEMORY = Path.home() / ".nanobot" / "memory.json"


def _build_system_prompt() -> str:
    """Build system prompt, appending any saved memory entries."""
    try:
        if NANOBOT_MEMORY.exists():
            entries = json.loads(NANOBOT_MEMORY.read_text(encoding="utf-8"))
            if entries:
                notes = "\n".join(f"- {e.get('content', '')}" for e in entries if e.get("content"))
                return _SYSTEM_PROMPT_BASE + f"\n\n【用户记忆事项（请在回答时参考）】\n{notes}"
    except Exception:
        pass
    return _SYSTEM_PROMPT_BASE

# OpenAI function-call schema for each browser tool
_BROWSER_TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "browser_navigate",
            "description": "让浏览器导航到指定 URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "要访问的完整 URL（含 http:// 或 https://）"}
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_click",
            "description": (
                "点击页面元素。推荐先调用 browser_get_dom 获取元素编号，再用 '@N'（如 '@5'）精准点击。"
                "也支持 CSS 选择器（如 #id、button[type=submit]）或元素可见文字作为 fallback。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "@N 元素编号（最可靠）、CSS 选择器、或元素可见文字"}
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_type",
            "description": (
                "在输入框中填入文字。推荐先调用 browser_get_dom 获取输入框编号，再用 '@N' 精准输入。"
                "也支持 CSS 选择器或 placeholder/aria-label 文字作为 fallback。兼容 React/Vue 受控组件。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "@N 元素编号（最可靠）、CSS 选择器、placeholder 或 aria-label"},
                    "text": {"type": "string", "description": "要填入的文字"},
                },
                "required": ["selector", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_get_text",
            "description": "获取页面元素的文字内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS 选择器（默认 body）", "default": "body"}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_get_url",
            "description": "获取浏览器当前 URL",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_scroll",
            "description": "上下滚动页面",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"], "default": "down"},
                    "amount": {"type": "integer", "description": "滚动像素数", "default": 300},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_evaluate",
            "description": "在浏览器页面中执行 JavaScript",
            "parameters": {
                "type": "object",
                "properties": {
                    "javascript": {"type": "string", "description": "要执行的 JS 代码"}
                },
                "required": ["javascript"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_new_tab",
            "description": "打开一个新的浏览器标签页，可选指定初始 URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "要在新标签页中打开的 URL（可选）", "default": ""},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_close_tab",
            "description": "关闭当前活动的浏览器标签页",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_list_tabs",
            "description": "列出所有已打开的标签页，返回每个标签的 id、标题、URL 和当前活动状态",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_switch_tab",
            "description": "切换到指定 id 的标签页（id 可通过 browser_list_tabs 获取）",
            "parameters": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "string", "description": "要切换到的标签页 id"},
                },
                "required": ["tab_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_get_dom",
            "description": (
                "获取当前页面所有可见可交互元素的编号列表（按钮、链接、输入框、下拉框等），"
                "同时返回页面正文内容。返回格式为 '[N] 元素描述'，可用 @N 引用元素进行 click/type 操作。"
                "每次导航到新页面后、或页面内容变化后，应先调用此工具了解页面结构，再执行操作。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_press_key",
            "description": (
                "模拟键盘按键，例如按 Enter 提交表单/搜索，按 Tab 切换焦点，按 Escape 关闭弹窗。"
                "搜索完成输入后，应用此工具按 Enter 而非点击搜索按钮。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "按键名称，如 'Enter'、'Tab'、'Escape'、'ArrowDown'",
                    }
                },
                "required": ["key"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_screenshot",
            "description": (
                "截取当前页面的截图。如果需要查看页面视觉内容（图表、图片、验证码、复杂布局等），"
                "请使用此工具。返回的截图数据会自动传给视觉模型分析。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_get_page_content",
            "description": (
                "获取当前页面的纯文字内容（已去除广告/导航噪音）。"
                "当需要分析文章内容、提取信息或总结页面时，优先使用此工具而不是 browser_get_text。"
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


def _load_config() -> dict:
    if NANOBOT_CONFIG.exists():
        with open(NANOBOT_CONFIG) as f:
            return json.load(f)
    return {}


def _resolve_litellm_model(model: str, provider_name: str, api_base: str | None, api_key: str) -> str:
    """Return a LiteLLM-compatible model string for the given config."""
    # If the model already has a provider prefix (e.g. "openai/gpt-4"), use as-is
    if "/" in model:
        return model

    # Known nanobot provider → known LiteLLM prefix
    _KNOWN_PREFIXES: dict[str, str] = {
        "openai": "",           # no prefix needed
        "anthropic": "anthropic",
        "deepseek": "deepseek",
        "gemini": "gemini",
        "zhipu": "zai",
        "dashscope": "dashscope",
        "moonshot": "moonshot",
        "minimax": "minimax",
        "siliconflow": "openai",  # OpenAI-compat gateway
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
        return model  # openai: no prefix

    # Unknown / custom provider with a custom api_base → treat as OpenAI-compat
    if api_base:
        os.environ["OPENAI_API_KEY"] = api_key
        return f"openai/{model}"

    return model


class AgentMessage:
    """Structured message yielded by the agent stream."""

    def __init__(self, mtype: str, content: Any, **kwargs) -> None:
        self.type = mtype      # "token" | "tool_call" | "tool_result" | "done" | "error"
        self.content = content
        self.extra = kwargs

    def to_dict(self) -> dict:
        d = {"type": self.type, "content": self.content}
        d.update(self.extra)
        return d


class AgentManager:
    """Streaming LiteLLM agent loop for one session (Electron edition).

    browser_page is ignored — browser control goes through the Electron HTTP bridge.
    """

    def __init__(self, session_id: str, browser_page=None) -> None:
        self.session_id = session_id
        self.browser_page = browser_page  # kept for API compat, unused in Electron
        self._history: list[dict] = []
        self._nanobot_available = self._check_nanobot()

    def _check_nanobot(self) -> bool:
        try:
            import litellm  # noqa: F401
            return True
        except ImportError:
            logger.warning("litellm not installed; running in fallback mode")
            return False

    async def chat(self, user_message: str) -> AsyncGenerator[AgentMessage, None]:
        """Stream agent responses for a user message."""
        self._history.append({"role": "user", "content": user_message})

        if self._nanobot_available:
            async for msg in self._streaming_chat():
                yield msg
        else:
            async for msg in self._fallback_chat(user_message):
                yield msg

    async def _streaming_chat(self) -> AsyncGenerator[AgentMessage, None]:
        """Streaming agent loop using LiteLLM directly."""
        import litellm
        litellm.suppress_debug_info = True
        litellm.drop_params = True

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

        if not model:
            yield AgentMessage("error", "未配置模型，请在设置中选择模型。")
            return
        if not api_key and not api_base:
            yield AgentMessage("error", "未找到有效的服务商配置，请在设置中配置 API Key。")
            return

        resolved_model = _resolve_litellm_model(model, provider_name, api_base, api_key)
        logger.info("Using model: %s (resolved: %s)", model, resolved_model)

        # Browser tools available when a page is attached
        # In Electron edition, browser tools always go through the HTTP bridge
        from agent.browser_tool import BrowserTools
        browser_tools_obj = BrowserTools()
        tools = _BROWSER_TOOL_SCHEMAS

        # Build messages: system (with memory) + history (already includes latest user turn)
        messages: list[dict] = [{"role": "system", "content": _build_system_prompt()}] + self._history

        max_iterations = 15
        assistant_content = ""

        try:
            for _ in range(max_iterations):
                # ── Streaming LLM call ────────────────────────────────────────
                call_kwargs: dict[str, Any] = {
                    "model": resolved_model,
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.1,
                    "max_tokens": 4096,
                    "api_key": api_key,
                }
                if api_base:
                    call_kwargs["api_base"] = api_base
                if tools:
                    call_kwargs["tools"] = tools
                    call_kwargs["tool_choice"] = "auto"
                    # Force single tool call per round to prevent ordering bugs
                    # (e.g. click before type causing empty-form submissions)
                    call_kwargs["parallel_tool_calls"] = False

                response_content = ""
                # Accumulate streaming tool calls: {index: {id, name, args_str}}
                pending_tool_calls: dict[int, dict] = {}

                stream = await litellm.acompletion(**call_kwargs)
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta

                    # Text tokens
                    if delta.content:
                        response_content += delta.content
                        assistant_content += delta.content
                        yield AgentMessage("token", delta.content)

                    # Tool call chunks
                    if delta.tool_calls:
                        for tc_chunk in delta.tool_calls:
                            idx = tc_chunk.index
                            if idx not in pending_tool_calls:
                                pending_tool_calls[idx] = {
                                    "id": tc_chunk.id or "",
                                    "name": "",
                                    "args_str": "",
                                }
                            entry = pending_tool_calls[idx]
                            if tc_chunk.id:
                                entry["id"] = tc_chunk.id
                            if tc_chunk.function:
                                if tc_chunk.function.name:
                                    entry["name"] += tc_chunk.function.name
                                if tc_chunk.function.arguments:
                                    entry["args_str"] += tc_chunk.function.arguments

                # ── If no tool calls, we're done ─────────────────────────────
                if not pending_tool_calls:
                    messages.append({"role": "assistant", "content": response_content})
                    break

                # ── Execute tool calls ────────────────────────────────────────
                # Add assistant turn with tool_calls
                tool_call_list = []
                for entry in pending_tool_calls.values():
                    tool_call_list.append({
                        "id": entry["id"],
                        "type": "function",
                        "function": {
                            "name": entry["name"],
                            "arguments": entry["args_str"],
                        },
                    })
                messages.append({
                    "role": "assistant",
                    "content": response_content or None,
                    "tool_calls": tool_call_list,
                })

                for entry in pending_tool_calls.values():
                    call_id = entry["id"]
                    tool_name = entry["name"]
                    try:
                        args = json.loads(entry["args_str"] or "{}")
                    except json.JSONDecodeError:
                        args = {}

                    yield AgentMessage("tool_call", tool_name,
                                       args=args, call_id=call_id)

                    # Execute
                    if browser_tools_obj and hasattr(browser_tools_obj, tool_name):
                        try:
                            fn = getattr(browser_tools_obj, tool_name)
                            result = await fn(**args)
                        except Exception as exc:
                            result = f"Tool error: {exc}"
                    else:
                        result = f"Tool '{tool_name}' not available."

                    # Truncate screenshot base64 in the UI message
                    ui_result = result
                    if isinstance(result, str) and result.startswith("screenshot:"):
                        parts = result.split(":", 2)
                        ui_result = f"[截图 {parts[1] if len(parts) > 1 else ''}]"

                    yield AgentMessage("tool_result", ui_result,
                                       call_id=call_id, name=tool_name)

                    # For screenshot results, inject as vision content for LLMs that support it
                    if isinstance(result, str) and result.startswith("screenshot:") and "data:image/jpeg;base64," in result:
                        b64_data = result.split("data:image/jpeg;base64,", 1)[1]
                        tool_content: Any = [
                            {"type": "text", "text": "当前页面截图如下："},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}},
                        ]
                    else:
                        tool_content = str(result)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": tool_name,
                        "content": tool_content,
                    })

        except Exception as exc:
            logger.exception("Streaming chat error")
            yield AgentMessage("error", f"模型调用失败：{exc}")
            return

        self._history.append({"role": "assistant", "content": assistant_content})
        yield AgentMessage("done", assistant_content)

    async def _fallback_chat(self, user_message: str) -> AsyncGenerator[AgentMessage, None]:
        """Simple fallback when litellm is not available."""
        reply = (
            "[litellm 未安装，无法调用大模型]\n\n"
            f"你说：{user_message}\n\n"
            "请安装 litellm 并配置 ~/.nanobot/config.json 启用 AI 回复。"
        )
        for word in reply.split(" "):
            yield AgentMessage("token", word + " ")
            await asyncio.sleep(0.02)
        self._history.append({"role": "assistant", "content": reply})
        yield AgentMessage("done", reply)

    def clear_history(self) -> None:
        self._history.clear()


# Per-session manager registry
_managers: dict[str, AgentManager] = {}


def get_or_create_manager(session_id: str, browser_page=None) -> AgentManager:
    if session_id not in _managers:
        _managers[session_id] = AgentManager(session_id, browser_page)
    elif browser_page is not None:
        _managers[session_id].browser_page = browser_page
    return _managers[session_id]


def remove_manager(session_id: str) -> None:
    _managers.pop(session_id, None)
