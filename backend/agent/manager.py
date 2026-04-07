"""
AgentManager: streaming agent loop built on nanobot's native providers.

Each chat session gets its own AgentManager instance tied to a BrowserSession.
Uses AnthropicProvider / OpenAICompatProvider directly (no LiteLLM dependency).
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, AsyncGenerator

from nanobot.config.loader import load_config
from nanobot.providers import AnthropicProvider, OpenAICompatProvider, AzureOpenAIProvider
from nanobot.providers.base import LLMProvider


def _migrate_config(data: dict) -> dict:
    """Migrate legacy config formats to current nanobot schema.

    Handles:
    - Old field names: apiKey -> api_key, apiBase -> api_base
    - Old provider names: "ali" -> "dashscope", "zhipu" -> "zhipuai"
    - Old tools.exec.restrictToWorkspace -> tools.restrictToWorkspace
    """
    if not data:
        return data

    # ── Legacy tools migration ─────────────────────────────────────────────
    tools = data.get("tools", {})
    exec_cfg = tools.get("exec", {})
    if "restrictToWorkspace" in exec_cfg and "restrictToWorkspace" not in tools:
        tools["restrictToWorkspace"] = exec_cfg.pop("restrictToWorkspace")

    # ── Legacy provider migration ─────────────────────────────────────────────
    LEGACY_PROVIDER_MAP = {
        "ali": "dashscope",
        "zhipu": "zhipuai",
    }

    providers = data.get("providers", {})
    agents_defaults = data.get("agents", {}).get("defaults", {})

    # Migrate provider configs: apiKey -> api_key, apiBase -> api_base
    migrated_providers = {}
    for name, cfg in providers.items():
        if not isinstance(cfg, dict):
            continue
        new_name = LEGACY_PROVIDER_MAP.get(name, name)
        migrated = {
            "api_key": cfg.get("apiKey") or cfg.get("api_key", ""),
            "api_base": cfg.get("apiBase") or cfg.get("api_base"),
        }
        if cfg.get("extraHeaders"):
            migrated["extra_headers"] = cfg["extraHeaders"]
        # Remove empty values
        migrated = {k: v for k, v in migrated.items() if v}
        migrated_providers[new_name] = migrated

    # Update providers dict with migrated entries
    data["providers"] = migrated_providers

    # Migrate provider name in agent defaults
    prov = agents_defaults.get("provider", "")
    if prov in LEGACY_PROVIDER_MAP:
        agents_defaults["provider"] = LEGACY_PROVIDER_MAP[prov]

    return data

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
    """Build system prompt, appending memory and skills."""
    parts = [_SYSTEM_PROMPT_BASE]

    # Load memory entries
    try:
        if NANOBOT_MEMORY.exists():
            entries = json.loads(NANOBOT_MEMORY.read_text(encoding="utf-8"))
            if entries:
                notes = "\n".join(f"- {e.get('content', '')}" for e in entries if e.get("content"))
                parts.append(f"【用户记忆事项（请在回答时参考）】\n{notes}")
    except Exception:
        pass

    # Load skills summary
    try:
        from nanobot.agent.skills import SkillsLoader
        loader = SkillsLoader(NANOBOT_WORKSPACE)
        summary = loader.build_skills_summary()
        if summary:
            parts.append(f"""【可用技能】

以下技能可帮助你完成特定任务：

{summary}""")
    except Exception as e:
        logger.debug("Failed to load skills: %s", e)

    return "\n\n".join(parts)

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

_READ_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "Read the contents of a file. Returns numbered lines. Use offset and limit to paginate through large files.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The file path to read"},
                "offset": {"type": "integer", "description": "Line number to start reading from (1-indexed, default 1)", "minimum": 1},
                "limit": {"type": "integer", "description": "Maximum number of lines to read (default 2000)", "minimum": 1},
            },
            "required": ["path"],
        },
    },
}

_WRITE_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "write_file",
        "description": "Write content to a file at the given path. Creates parent directories if needed.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The file path to write to"},
                "content": {"type": "string", "description": "The content to write"},
            },
            "required": ["path", "content"],
        },
    },
}

_EDIT_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "edit_file",
        "description": "Edit a file by replacing old_text with new_text. Supports minor whitespace/line-ending differences. Set replace_all=true to replace every occurrence.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The file path to edit"},
                "old_text": {"type": "string", "description": "The text to find and replace"},
                "new_text": {"type": "string", "description": "The text to replace with"},
                "replace_all": {"type": "boolean", "description": "Replace all occurrences (default false)"},
            },
            "required": ["path", "old_text", "new_text"],
        },
    },
}

_LIST_DIR_SCHEMA = {
    "type": "function",
    "function": {
        "name": "list_dir",
        "description": "List the contents of a directory. Set recursive=true to explore nested structure.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The directory path to list"},
                "recursive": {"type": "boolean", "description": "Recursively list all files (default false)"},
                "max_entries": {"type": "integer", "description": "Maximum entries to return (default 200)", "minimum": 1},
            },
            "required": ["path"],
        },
    },
}

_EXEC_SCHEMA = {
    "type": "function",
    "function": {
        "name": "exec",
        "description": "Execute a shell command and return its output. Use with caution.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to execute"},
                "working_dir": {"type": "string", "description": "Optional working directory for the command"},
                "timeout": {"type": "integer", "description": "Timeout in seconds (default 60, max 600)"},
            },
            "required": ["command"],
        },
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Browser tool adapter — wraps BrowserTools methods as nanobot Tool instances
# ─────────────────────────────────────────────────────────────────────────────

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry


class BrowserToolAdapter(Tool):
    """Adapter that exposes a BrowserTools method as a nanobot Tool."""

    def __init__(self, name: str, description: str, parameters: dict, fn):
        self._name = name
        self._description = description
        self._parameters = parameters
        self._fn = fn

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict:
        return self._parameters

    async def execute(self, **kwargs: Any) -> Any:
        return await self._fn(**kwargs)


# Lazy browser tools instance (created once per streaming session)
_browser_tools_instance: "BrowserTools | None" = None


def _get_browser_tools():
    """Get or create the BrowserTools singleton."""
    global _browser_tools_instance
    if _browser_tools_instance is None:
        # Import locally to avoid cross-package import issues when running as script
        import sys
        from pathlib import Path
        # Ensure backend/agent is importable
        agent_dir = Path(__file__).parent
        backend_dir = agent_dir.parent
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        from agent.browser_tool import BrowserTools
        _browser_tools_instance = BrowserTools()
    return _browser_tools_instance


def _build_browser_tool_registry() -> tuple[ToolRegistry, list[dict]]:
    """Build a ToolRegistry with all browser tools + filesystem tools registered."""
    registry = ToolRegistry()
    browser = _get_browser_tools()

    # Map schema name → method name
    _TOOL_METHODS = [
        ("browser_navigate", "browser_navigate"),
        ("browser_click", "browser_click"),
        ("browser_type", "browser_type"),
        ("browser_get_text", "browser_get_text"),
        ("browser_get_url", "browser_get_url"),
        ("browser_scroll", "browser_scroll"),
        ("browser_evaluate", "browser_evaluate"),
        ("browser_new_tab", "browser_new_tab"),
        ("browser_close_tab", "browser_close_tab"),
        ("browser_list_tabs", "browser_list_tabs"),
        ("browser_switch_tab", "browser_switch_tab"),
        ("browser_get_dom", "browser_get_dom"),
        ("browser_press_key", "browser_press_key"),
        ("browser_screenshot", "browser_screenshot"),
        ("browser_get_page_content", "browser_get_page_content"),
    ]

    # Build name → schema map
    schema_map = {s["function"]["name"]: s["function"] for s in _BROWSER_TOOL_SCHEMAS}

    for tool_name, method_name in _TOOL_METHODS:
        schema = schema_map.get(tool_name)
        if schema and hasattr(browser, method_name):
            adapter = BrowserToolAdapter(
                name=schema["name"],
                description=schema.get("description", ""),
                parameters=schema.get("parameters", {}),
                fn=getattr(browser, method_name),
            )
            registry.register(adapter)

    # Register filesystem tools (read/write/edit/list for workspace files)
    try:
        from nanobot.agent.tools.filesystem import ReadFileTool, WriteFileTool, EditFileTool, ListDirTool
        for tool_cls in [ReadFileTool, WriteFileTool, EditFileTool, ListDirTool]:
            try:
                registry.register(tool_cls(workspace=NANOBOT_WORKSPACE, allowed_dir=NANOBOT_WORKSPACE))
            except Exception:
                registry.register(tool_cls())
    except Exception as e:
        logger.warning("Failed to register filesystem tools: %s", e)

    # Register shell execution tool
    try:
        from nanobot.agent.tools.shell import ExecTool
        exec_tool = ExecTool(
            working_dir=str(NANOBOT_WORKSPACE),
            restrict_to_workspace=False,
        )
        registry.register(exec_tool)
    except Exception as e:
        logger.warning("Failed to register exec tool: %s", e)

    # Register web tools (web_search, web_fetch)
    extra_schemas: list[dict] = []
    try:
        from nanobot.agent.tools.web import WebSearchTool, WebFetchTool
        ws = WebSearchTool()
        registry.register(ws)
        extra_schemas.append({"type": "function", "function": {"name": ws.name, "description": ws.description, "parameters": ws.parameters}})

        wf = WebFetchTool()
        registry.register(wf)
        extra_schemas.append({"type": "function", "function": {"name": wf.name, "description": wf.description, "parameters": wf.parameters}})
    except Exception as e:
        logger.warning("Failed to register web tools: %s", e)

    return registry, extra_schemas


def _create_nanobot_provider(cfg=None) -> tuple[LLMProvider, str, str]:
    """Create nanobot LLM provider from config.

    Returns (provider, model, provider_name).
    Raises ValueError if no valid config found.
    """
    import json

    if cfg is None:
        # Load raw JSON and apply legacy migration
        if NANOBOT_CONFIG.exists():
            with open(NANOBOT_CONFIG, encoding="utf-8") as f:
                raw = json.load(f)
        else:
            raw = {}

        # Apply legacy migrations (preserves unknown providers like 'minimax-bendi')
        raw = _migrate_config(raw)
        # Keep raw migrated providers before Pydantic strips unknown fields
        migrated_providers = raw.get("providers", {})

        # Build Config from migrated dict (bypass file re-read)
        from nanobot.config.schema import Config
        cfg = Config.model_validate(raw)
    else:
        migrated_providers = {}

    defaults = cfg.agents.defaults
    provider_name = cfg.get_provider_name(defaults.model) or defaults.provider
    model = defaults.model

    # Try to get provider config by model first, then by provider name as fallback
    provider_cfg = cfg.get_provider(model)
    if provider_cfg is None and provider_name:
        # Provider may not be in nanobot's registry — look it up in raw migrated config
        provider_cfg = migrated_providers.get(provider_name)

    api_key = (provider_cfg.api_key if hasattr(provider_cfg, 'api_key') else provider_cfg.get("api_key", "")) if provider_cfg else ""
    api_base = (provider_cfg.api_base if hasattr(provider_cfg, 'api_base') else provider_cfg.get("api_base", "")) if provider_cfg else ""
    if not api_base:
        api_base = cfg.get_api_base(model) or ""

    if not model:
        raise ValueError("未配置模型，请在设置中选择模型。")
    if not api_key and not api_base:
        raise ValueError("未找到有效的服务商配置，请在设置中配置 API Key。")

    # Create provider based on provider name
    if provider_name == "anthropic":
        provider = AnthropicProvider(
            api_key=api_key,
            api_base=api_base,
            default_model=model,
        )
    elif provider_name == "azure_openai":
        provider = AzureOpenAIProvider(
            api_key=api_key,
            api_base=api_base,
            default_model=model,
        )
    else:
        # OpenAI-compatible (openrouter, deepseek, dashscope, openai, siliconflow, etc.)
        provider = OpenAICompatProvider(
            api_key=api_key,
            api_base=api_base,
            default_model=model,
        )

    logger.info("Using provider: %s, model: %s", provider_name, model)
    return provider, model, provider_name


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


# ─────────────────────────────────────────────────────────────────────────────
# Streaming hook — nanobot AgentHook-compatible interface for streaming output
# ─────────────────────────────────────────────────────────────────────────────

from nanobot.agent.hook import AgentHook, AgentHookContext
from nanobot.agent.runner import AgentRunSpec, AgentRunResult


class StreamingAgentHook(AgentHook):
    """
    AgentHook that intercepts token stream and tool execution for the Electron UI.

    Implements nanobot's AgentHook interface so it can be used with AgentRunner,
    while also providing a standalone streaming mode via process_streaming().
    """

    def __init__(self):
        super().__init__()
        self._response_content = ""
        self._tool_results: dict[str, tuple[str, Any]] = {}  # call_id -> (name, result)

    def wants_streaming(self) -> bool:
        return True

    async def on_stream(self, context: AgentHookContext, delta: str) -> None:
        """Called for each text delta during streaming."""
        self._response_content += delta

    async def on_stream_end(self, context: AgentHookContext, *, resuming: bool) -> None:
        """Called when streaming of a response ends."""
        pass

    async def before_execute_tools(self, context: AgentHookContext) -> None:
        """Called before executing tool calls."""
        pass

    async def after_iteration(self, context: AgentHookContext) -> None:
        """Called after each agent iteration."""
        pass

    def finalize_content(self, context: AgentHookContext, content: str | None) -> str | None:
        """Called to finalize the response content."""
        return content

    def get_content(self) -> str:
        return self._response_content

    def clear(self) -> None:
        self._response_content = ""
        self._tool_results.clear()


class AgentManager:
    """Streaming agent loop for one session (Electron edition).

    browser_page is ignored — browser control goes through the Electron HTTP bridge.
    """

    def __init__(self, session_id: str, browser_page=None) -> None:
        self.session_id = session_id
        self.browser_page = browser_page  # kept for API compat, unused in Electron
        self._history: list[dict] = []
        self._provider_error: str | None = None  # 记录 provider 加载失败原因
        self._nanobot_available = self._check_nanobot()
        self._stop_requested: bool = False  # 停止标志

    def stop(self) -> None:
        """请求停止当前生成"""
        self._stop_requested = True

    def _check_nanobot(self) -> bool:
        """Check if nanobot providers are available. Captures all exceptions for diagnosis."""
        try:
            from nanobot.config.loader import load_config
            from nanobot.providers import AnthropicProvider, OpenAICompatProvider
            logger.info("nanobot providers loaded OK")
            return True
        except ImportError as e:
            self._provider_error = str(e)
            logger.error("nanobot ImportError: %s", e)
            return False
        except Exception as e:
            self._provider_error = f"{type(e).__name__}: {e}"
            logger.error("nanobot failed to load: %s: %s", type(e).__name__, e, exc_info=True)
            return False

    async def chat(self, user_message: str, files: list = None) -> AsyncGenerator[AgentMessage, None]:
        """Stream agent responses for a user message."""
        self._stop_requested = False  # 重置停止标志

        logger.info("[DEBUG] manager.chat called: user_message='%s', files=%s",
                    user_message[:100] if user_message else "", files[:1] if files else "none")

        # 构建用户消息内容（支持图片）
        if files:
            # 构建结构化的 content 数组（用于 Vision LLM）
            content = []
            if user_message:
                content.append({"type": "text", "text": user_message})
            for f in files:
                file_type = f.get("type", "")
                data = f.get("data", "")
                if file_type.startswith("image/") and data:
                    # 图片使用 image_url 类型
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": data}  # data 已经是 data:image/jpeg;base64,... 格式
                    })
                else:
                    # 非图片用 text 类型
                    name = f.get("name", "unnamed")
                    content.append({"type": "text", "text": f"[附件: {name}]"})
            self._history.append({"role": "user", "content": content})
        else:
            self._history.append({"role": "user", "content": user_message})

        if self._nanobot_available:
            async for msg in self._streaming_chat():
                yield msg
        else:
            async for msg in self._fallback_chat(user_message):
                yield msg

    async def _streaming_chat(self) -> AsyncGenerator[AgentMessage, None]:
        """Streaming agent loop using nanobot's native providers."""

        # Create provider from nanobot config
        try:
            provider, model, provider_name = _create_nanobot_provider()
        except ValueError as e:
            yield AgentMessage("error", str(e))
            return
        except Exception as e:
            logger.exception("Failed to create provider")
            yield AgentMessage("error", f"Provider 创建失败：{e}")
            return

        # Browser tools registered in nanobot ToolRegistry
        browser_registry, extra_tool_schemas = _build_browser_tool_registry()
        # Raw schemas still needed for the LLM provider (registry handles execution)
        tools = [*_BROWSER_TOOL_SCHEMAS, _READ_FILE_SCHEMA, _WRITE_FILE_SCHEMA, _EDIT_FILE_SCHEMA, _LIST_DIR_SCHEMA, _EXEC_SCHEMA, *extra_tool_schemas]

        # Build messages: system (with memory) + history (already includes latest user turn)
        messages: list[dict] = [{"role": "system", "content": _build_system_prompt()}] + self._history

        max_iterations = 15
        assistant_content = ""

        # Streaming infrastructure
        token_queue: asyncio.Queue[str] = asyncio.Queue()
        # Event for responsive stop detection
        stop_event = asyncio.Event()

        async def token_callback(delta: str) -> None:
            """Called by provider for each streaming token delta."""
            await token_queue.put(delta)

        # Mirror _stop_requested to our Event for responsiveness
        def _on_stop():
            stop_event.set()

        original_stop = self.stop
        self.stop = lambda: (_on_stop(), original_stop())

        async def _check_stop() -> bool:
            """Check if stop was requested. Returns True if should stop."""
            if self._stop_requested or stop_event.is_set():
                return True
            return False


        try:
            for iteration in range(max_iterations):
                # Check stop before each iteration
                if await _check_stop():
                    yield AgentMessage("error", "已停止生成")
                    return

                # Drain any remaining tokens from previous iteration
                while not token_queue.empty():
                    try:
                        token_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break

                # ── Streaming LLM call via nanobot provider ──────────────────
                stop_event.clear()

                # Run chat_stream in background so we can yield tokens as they arrive
                stream_task = asyncio.create_task(
                    provider.chat_stream(
                        messages=messages,
                        tools=tools,
                        model=model,
                        max_tokens=4096,
                        temperature=0.1,
                        on_content_delta=token_callback,
                    )
                )

                # Drain tokens from queue WHILE stream is running (concurrent)
                response_content = ""
                while not stop_event.is_set():
                    try:
                        token = await asyncio.wait_for(token_queue.get(), timeout=0.05)
                        response_content += token
                        assistant_content += token
                        yield AgentMessage("token", token)
                    except asyncio.TimeoutError:
                        if stream_task.done():
                            break
                        continue

                # Grab any remaining tokens
                while not token_queue.empty():
                    try:
                        token = token_queue.get_nowait()
                        response_content += token
                        assistant_content += token
                        yield AgentMessage("token", token)
                    except asyncio.QueueEmpty:
                        break

                # Get the final LLM response
                try:
                    if not stream_task.done():
                        stream_task.cancel()
                    response = stream_task.result()
                except (asyncio.CancelledError, asyncio.InvalidStateError):
                    response = type("obj", (object,), {"has_tool_calls": False, "content": response_content})()
                except Exception:
                    response = type("obj", (object,), {"has_tool_calls": False, "content": response_content})()

                # Final immediate drain - grab any remaining tokens
                while not token_queue.empty():
                    try:
                        token = token_queue.get_nowait()
                        response_content += token
                        assistant_content += token
                        yield AgentMessage("token", token)
                    except asyncio.QueueEmpty:
                        break

                # Check stop after streaming
                if await _check_stop():
                    yield AgentMessage("error", "已停止生成")
                    return

                # ── If no tool calls, we're done ─────────────────────────────
                if not response.has_tool_calls:
                    messages.append({"role": "assistant", "content": response_content})
                    break

                # ── Execute tool calls ────────────────────────────────────────
                tool_call_list = [
                    tc.to_openai_tool_call() for tc in response.tool_calls
                ]
                messages.append({
                    "role": "assistant",
                    "content": response_content or None,
                    "tool_calls": tool_call_list,
                })

                for tc in response.tool_calls:
                    call_id = tc.id
                    tool_name = tc.name
                    args = tc.arguments

                    yield AgentMessage("tool_call", tool_name,
                                       args=args, call_id=call_id, name=tool_name)

                    # Check stop before executing tool
                    if await _check_stop():
                        yield AgentMessage("error", "已停止生成")
                        return

                    # Execute via ToolRegistry
                    try:
                        result = await browser_registry.execute(tool_name, args)
                    except Exception as exc:
                        result = f"Tool error: {exc}"

                    # Truncate screenshot base64 in the UI message
                    ui_result = result
                    if isinstance(result, str) and result.startswith("screenshot:"):
                        parts = result.split(":", 2)
                        ui_result = f"[截图 {parts[1] if len(parts) > 1 else ''}]"

                    yield AgentMessage("tool_result", ui_result,
                                       call_id=call_id, name=tool_name)

                    # For screenshot results, inject as vision content
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
        finally:
            self.stop = original_stop

        self._history.append({"role": "assistant", "content": assistant_content})
        yield AgentMessage("done", assistant_content)

    async def _fallback_chat(self, user_message: str) -> AsyncGenerator[AgentMessage, None]:
        """Simple fallback when nanobot providers are not available."""
        error_detail = f"\n\n错误详情：{self._provider_error}" if self._provider_error else ""
        reply = (
            "[nanobot providers 未安装或加载失败，无法调用大模型]\n\n"
            f"你说：{user_message}\n\n"
            f"请安装 nanobot-ai 并配置 ~/.nanobot/config.json 启用 AI 回复。{error_detail}"
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
