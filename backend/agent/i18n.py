"""User-facing strings for the agent runtime.

The UI language arrives with every ``chat`` WebSocket frame, so error messages
and the agent's reply language follow the interface instead of being hardcoded.
Mirrors the codes in ``src/i18n.ts``.
"""

from __future__ import annotations

SUPPORTED = ("en", "fa", "zh-CN")
DEFAULT = "zh-CN"


def normalize_lang(code: object) -> str:
    """Map an arbitrary client ``lang`` onto a supported code."""
    if not isinstance(code, str):
        return DEFAULT
    lowered = code.strip().lower()
    if lowered.startswith("fa") or lowered.startswith("pe"):
        return "fa"
    if lowered.startswith("zh"):
        return "zh-CN"
    if lowered.startswith("en"):
        return "en"
    return DEFAULT


# Reply-language instruction prepended to the system prompt. The rest of the
# prompt stays as-is; only the output language is user-facing.
_REPLY_LANG = {
    "en": "Always reply to the user in English.",
    "fa": "همیشه به کاربر به فارسی پاسخ بده.",
    "zh-CN": "始终使用中文回复用户。",
}

STRINGS: dict[str, dict[str, str]] = {
    "zh-CN": {
        "noModel": "未配置模型，请在设置中选择模型。",
        "noProvider": "未找到有效的服务商配置，请在设置中配置 API Key。",
        "errNoBase": "（未设置，由模型/默认网关决定）",
        "err404": (
            "模型 API 返回 404：当前地址上找不到 OpenAI 兼容接口。\n"
            "已配置的 API Base：{base}\n"
            "LiteLLM 会请求「API Base + /v1/chat/completions」。\n"
            "请在本机浏览器或 curl 确认该地址能访问；常见正确示例：\n"
            "· Ollama：http://<IP>:11434（一般无需再写 /v1）\n"
            "· LM Studio：http://<IP>:1234/v1\n"
            "· vLLM：http://<IP>:8000/v1\n"
            "若 8000 端口不是推理服务（例如别的 Web 应用），请改成实际提供 /v1/chat/completions 的地址与端口。"
        ),
        "err401": "API 鉴权失败（401/403），请检查 API Key 与服务商是否匹配。\n详情：{msg}",
        "errConnection": (
            "无法连接到模型服务：{msg}\n"
            "请确认 API Base「{base}」在本机网络可达，且推理进程已启动。"
        ),
        "errGeneric": "模型调用失败：{msg}",
        "errRateLimit": (
            "模型服务商当前正在限流（HTTP 429）。\n\n"
            "OpenRouter 的免费模型由所有用户共享额度，因此很快就会触顶。以下任一方式都有效：\n"
            "· 稍等片刻后重新发送消息\n"
            "· 换用有独立额度或付费档位的模型\n"
            "· 添加你自己的服务商密钥（https://openrouter.ai/settings/integrations），让限流只影响你\n"
            "· 路由到其他上游服务商（https://openrouter.ai/docs/features/provider-routing）\n\n"
            "详情：{msg}"
        ),
        "errContextLength": (
            "对话长度超过该模型可接受的范围（超出上下文长度）。\n\n"
            "请新建一个对话，或删除一些较早的消息/附件后重试。\n\n"
            "详情：{msg}"
        ),
        "errLoop": (
            "Agent 似乎陷入了循环，连续 {count} 次调用「{tool}」且参数相同。"
            "已自动终止，请尝试换种方式描述需求。"
        ),
        "errMaxRounds": "Agent 运行了过多轮次后自动停止。你可以尝试简化需求或继续追问。",
        "errMaxIterations": (
            "Agent 已达到最大迭代次数（{count} 次），任务尚未完成。你可以尝试简化需求或继续追问。"
        ),
        "fallbackReply": (
            "[litellm 未安装，无法调用大模型]\n\n"
            "请安装 litellm 并配置 ~/.nanobot/config.json 启用 AI 回复。"
        ),
        "wsMessageTooLong": "消息内容过长",
        "wsTooManyFiles": "附件数量超出限制",
        "wsFileTooLarge": "附件体积超出限制",
        "wsInitFailed": "Agent 初始化失败：{msg}",
        "imageOmitted": "[图片已省略]",
        "elementNotFound": "元素未找到",
        "navFailed": "导航失败：{err}",
        "navOk": "已导航至 {url}，页面标题：{title}",
        "clickFailed": "点击失败：{err}",
        "clickOk": "已点击 [{el}]，坐标（{x}, {y}）",
        "typeFailed": "输入失败：{err}",
        "typeOk": "已在 [{sel}] 输入：{text}",
        "textBlocked": "获取文字被拒绝：当前页面属于敏感站点，已禁止读取内容。",
        "textFailed": "获取文字失败：{err}",
        "scrollFailed": "滚动失败：{err}",
        "scrollOk": "已向 {dir} 滚动 {amount}px",
        "jsBlocked": "JS 执行被拒绝：当前页面属于敏感站点，为避免安全风险，已禁止在此页面执行任意代码。",
        "jsFailed": "JS 执行失败：{err}",
        "newTabFailed": "新建标签失败：{err}",
        "newTabOk": "已新建标签页",
        "newTabOpenUrl": "，打开 {url}",
        "closeTabFailed": "关闭标签失败：{err}",
        "closeTabOk": "已关闭当前标签页",
        "tabsFailed": "获取标签列表失败：{err}",
        "noTabs": "当前没有打开的标签页",
        "activeTab": " ← 当前",
        "untitled": "无标题",
        "switchTabFailed": "切换标签失败：{err}",
        "switchTabOk": "已切换到标签 {id}",
        "domBlocked": "获取 DOM 被拒绝：当前页面属于敏感站点，已禁止读取内容。",
        "domFailed": "获取 DOM 失败：{err}",
        "domTitle": "页面标题：{title}",
        "domViewport": "视口：{vw}×{vh}px",
        "domMoreAbove": "... 上方还有 {px}px 内容（约 {pages} 屏）- 可滚动查看 ...",
        "domTop": "[页面顶部]",
        "domCount": "共 {count} 个可交互元素（用 @N 引用）:",
        "domMoreBelow": "... 下方还有 {px}px 内容（约 {pages} 屏）- 可滚动查看 ...",
        "domBottom": "[页面底部]",
        "domBody": "── 页面正文 ──",
        "keyFailed": "按键失败：{err}",
        "keyOk": "已按键：{key}",
        "shotBlocked": "截图被拒绝：当前页面属于敏感站点，已禁止截取屏幕内容。",
        "shotFailed": "截图失败：{err}",
        "contentBlocked": "获取页面内容被拒绝：当前页面属于敏感站点，已禁止读取内容。",
        "contentFailed": "获取内容失败：{err}",
        "contentHeader": "页面标题：{title}\nURL: {url}\n\n",
        "memAdded": "已添加记忆（ID：{id}）",
        "memDeleted": "已删除记忆。",
        "memNotFound": "未找到该记忆条目。",
        "archiveHeader": "历史记录搜索结果：\n{lines}",
        "archiveEmpty": "未找到相关历史记录。",
        "skillsHeader": "可用技能列表：\n{lines}",
        "skillsEmpty": "暂无可用的技能文档。",
        "screenshotNote": "当前页面截图如下：",
    },
    "en": {
        "noModel": "No model configured. Pick a model in Settings.",
        "noProvider": "No usable provider configuration. Add an API key in Settings.",
        "errNoBase": "(not set — decided by the model / default gateway)",
        "err404": (
            "The model API returned 404: no OpenAI-compatible endpoint at that address.\n"
            "Configured API Base: {base}\n"
            "LiteLLM requests \"API Base + /v1/chat/completions\".\n"
            "Open the address in a browser or with curl to confirm it responds. Common setups:\n"
            "· Ollama: http://<IP>:11434 (no need to append /v1)\n"
            "· LM Studio: http://<IP>:1234/v1\n"
            "· vLLM: http://<IP>:8000/v1\n"
            "If port 8000 is some other web app, point this at the host and port that actually "
            "serves /v1/chat/completions."
        ),
        "err401": "Authentication failed (401/403). Check that the API key matches the provider.\nDetails: {msg}",
        "errConnection": (
            "Could not reach the model service: {msg}\n"
            "Confirm that API Base \"{base}\" is reachable on this network and that the inference process is running."
        ),
        "errGeneric": "Model call failed: {msg}",
        "errRateLimit": (
            "The model provider is throttling requests right now (HTTP 429).\n\n"
            "Free-tier models on OpenRouter share one pool across all users, so they hit the "
            "limit quickly. Any of these will work:\n"
            "· Wait a moment and send the message again\n"
            "· Pick a model with its own quota, or a paid tier\n"
            "· Add your own provider key (https://openrouter.ai/settings/integrations) so the "
            "limit applies to you alone\n"
            "· Route to another upstream provider "
            "(https://openrouter.ai/docs/features/provider-routing)\n\n"
            "Details: {msg}"
        ),
        "errContextLength": (
            "The conversation is longer than this model can accept (context length exceeded).\n\n"
            "Start a new chat, or remove some earlier messages or attachments and retry.\n\n"
            "Details: {msg}"
        ),
        "errLoop": (
            "The agent looks stuck: it called \"{tool}\" {count} times in a row with identical arguments. "
            "Stopped automatically — try describing the task differently."
        ),
        "errMaxRounds": "The agent stopped after too many rounds. Try simplifying the request or asking a follow-up.",
        "errMaxIterations": (
            "The agent hit the iteration limit ({count}) before finishing. Try simplifying the request or asking a follow-up."
        ),
        "fallbackReply": (
            "[litellm is not installed, so the model cannot be called]\n\n"
            "Install litellm and configure ~/.nanobot/config.json to enable AI replies."
        ),
        "wsMessageTooLong": "Message is too long",
        "wsTooManyFiles": "Too many attachments",
        "wsFileTooLarge": "Attachment is too large",
        "wsInitFailed": "Failed to initialize the agent: {msg}",
        "imageOmitted": "[image omitted]",
        "elementNotFound": "element not found",
        "navFailed": "Navigation failed: {err}",
        "navOk": "Navigated to {url}. Page title: {title}",
        "clickFailed": "Click failed: {err}",
        "clickOk": "Clicked [{el}] at ({x}, {y})",
        "typeFailed": "Typing failed: {err}",
        "typeOk": "Typed into [{sel}]: {text}",
        "textBlocked": "Reading page text was refused: this page is a sensitive site, so its content is not read.",
        "textFailed": "Failed to read page text: {err}",
        "scrollFailed": "Scroll failed: {err}",
        "scrollOk": "Scrolled {dir} by {amount}px",
        "jsBlocked": "JavaScript was refused: this page is a sensitive site, so running arbitrary code here is blocked for safety.",
        "jsFailed": "JavaScript execution failed: {err}",
        "newTabFailed": "Failed to open a new tab: {err}",
        "newTabOk": "Opened a new tab",
        "newTabOpenUrl": " at {url}",
        "closeTabFailed": "Failed to close the tab: {err}",
        "closeTabOk": "Closed the current tab",
        "tabsFailed": "Failed to list tabs: {err}",
        "noTabs": "No tabs are currently open.",
        "activeTab": " ← current",
        "untitled": "Untitled",
        "switchTabFailed": "Failed to switch tab: {err}",
        "switchTabOk": "Switched to tab {id}",
        "domBlocked": "Reading the DOM was refused: this page is a sensitive site, so its content is not read.",
        "domFailed": "Failed to read the DOM: {err}",
        "domTitle": "Page title: {title}",
        "domViewport": "Viewport: {vw}×{vh}px",
        "domMoreAbove": "... {px}px of content above (about {pages} screens) — scroll to view ...",
        "domTop": "[Top of page]",
        "domCount": "{count} interactive elements (reference them as @N):",
        "domMoreBelow": "... {px}px of content below (about {pages} screens) — scroll to view ...",
        "domBottom": "[Bottom of page]",
        "domBody": "── Page body ──",
        "keyFailed": "Key press failed: {err}",
        "keyOk": "Pressed: {key}",
        "shotBlocked": "Screenshots are refused here: this page is a sensitive site, so screen content is not captured.",
        "shotFailed": "Screenshot failed: {err}",
        "contentBlocked": "Reading page content was refused: this page is a sensitive site, so its content is not read.",
        "contentFailed": "Failed to read page content: {err}",
        "contentHeader": "Page title: {title}\nURL: {url}\n\n",
        "memAdded": "Memory added (ID: {id})",
        "memDeleted": "Memory deleted.",
        "memNotFound": "That memory entry was not found.",
        "archiveHeader": "History search results:\n{lines}",
        "archiveEmpty": "No matching history was found.",
        "skillsHeader": "Available skills:\n{lines}",
        "skillsEmpty": "No skill documents are available yet.",
        "screenshotNote": "Current page screenshot:",
    },
    "fa": {
        "noModel": "مدلی تنظیم نشده است. از بخش تنظیمات یک مدل انتخاب کنید.",
        "noProvider": "پیکربندی معتبری برای سرویس‌دهنده پیدا نشد. کلید API را در تنظیمات وارد کنید.",
        "errNoBase": "(تنظیم نشده — بسته به مدل / درگاه پیش‌فرض تعیین می‌شود)",
        "err404": (
            "API مدل خطای ۴۰۴ برگرداند: روی این آدرس هیچ سرویس سازگار با OpenAI وجود ندارد.\n"
            "API Base تنظیم‌شده: {base}\n"
            "LiteLLM درخواست را به «API Base + /v1/chat/completions» می‌فرستد.\n"
            "آدرس را در مرورگر یا با curl باز کنید و از درستی آن مطمئن شوید. نمونه‌های رایج:\n"
            "· Ollama: http://<IP>:11434 (معمولاً نیازی به افزودن /v1 نیست)\n"
            "· LM Studio: http://<IP>:1234/v1\n"
            "· vLLM: http://<IP>:8000/v1\n"
            "اگر پورت ۸۰۰۱ یک وب‌اپلیکیشن دیگر است، آدرس و پورتی را وارد کنید که واقعاً /v1/chat/completions ارائه می‌دهد."
        ),
        "err401": "احراز هویت ناموفق بود (۴۰۱/۴۰۳). بررسی کنید کلید API با سرویس‌دهنده هم‌خوان است.\nجزئیات: {msg}",
        "errConnection": (
            "اتصال به سرویس مدل برقرار نشد: {msg}\n"
            "مطمئن شوید API Base با مقدار «{base}» در این شبکه در دسترس است و فرایند اجرای مدل فعال است."
        ),
        "errGeneric": "فراخوانی مدل ناموفق بود: {msg}",
        "errRateLimit": (
            "سرویس‌دهندهٔ مدل در حال حاضر درخواست‌ها را محدود کرده است (خطای ۴۲۹).\n\n"
            "مدل‌های رایگان OpenRouter بین همهٔ کاربران مشترک‌اند، بنابراین خیلی زود به سقف "
            "می‌رسند. هر کدام از این کارها جواب می‌دهد:\n"
            "· چند لحظه صبر کنید و پیام را دوباره بفرستید\n"
            "· مدلی با سهمیهٔ اختصاصی یا سطح پولی انتخاب کنید\n"
            "· کلید سرویس‌دهندهٔ خودتان را اضافه کنید (https://openrouter.ai/settings/integrations) "
            "تا محدودیت فقط برای شما اعمال شود\n"
            "· مسیر را به سرویس‌دهندهٔ دیگری تغییر دهید "
            "(https://openrouter.ai/docs/features/provider-routing)\n\n"
            "جزئیات: {msg}"
        ),
        "errContextLength": (
            "گفت‌وگو از حدی که این مدل می‌پذیرد بلندتر است (حجم متن بیش از حد مجاز).\n\n"
            "یک چت جدید شروع کنید، یا چند پیام یا پیوست قدیمی‌تر را حذف کنید و دوباره تلاش کنید.\n\n"
            "جزئیات: {msg}"
        ),
        "errLoop": (
            "به نظر می‌رسد عامل در یک حلقه گرفتار شده است: {count} بار پیاپی «{tool}» را با آرگومان‌های یکسان صدا زد. "
            "به‌صورت خودکار متوقف شد — درخواست را به شکل دیگری بیان کنید."
        ),
        "errMaxRounds": "عامل پس از تعداد زیادی مرحله به‌صورت خودکار متوقف شد. درخواست را ساده‌تر کنید یا ادامه دهید.",
        "errMaxIterations": (
            "عامل پیش از پایان کار به سقف تکرار ({count} بار) رسید. درخواست را ساده‌تر کنید یا ادامه دهید."
        ),
        "fallbackReply": (
            "[litellm نصب نیست، بنابراین فراخوانی مدل ممکن نیست]\n\n"
            "برای فعال شدن پاسخ‌های هوش مصنوعی، litellm را نصب کنید و ~/.nanobot/config.json را پیکربندی کنید."
        ),
        "wsMessageTooLong": "متن پیام بیش از حد طولانی است",
        "wsTooManyFiles": "تعداد پیوست‌ها بیش از حد مجاز است",
        "wsFileTooLarge": "حجم پیوست بیش از حد مجاز است",
        "wsInitFailed": "راه‌اندازی عامل ناموفق بود: {msg}",
        "imageOmitted": "[تصویر حذف شد]",
        "elementNotFound": "عنصر یافت نشد",
        "navFailed": "ناوبری ناموفق بود: {err}",
        "navOk": "به {url} منتقل شد. عنوان صفحه: {title}",
        "clickFailed": "کلیک ناموفق بود: {err}",
        "clickOk": "روی [{el}] کلیک شد (مختصات {x}، {y})",
        "typeFailed": "تایپ ناموفق بود: {err}",
        "typeOk": "متن در [{sel}] تایپ شد: {text}",
        "textBlocked": "خواندن متن رد شد: این صفحه یک سایت حساس است و محتوای آن خوانده نمی‌شود.",
        "textFailed": "خواندن متن ناموفق بود: {err}",
        "scrollFailed": "اسکرول ناموفق بود: {err}",
        "scrollOk": "به اندازه {amount} پیکسل به سمت {dir} اسکرول شد",
        "jsBlocked": "اجرای جاوااسکریپت رد شد: این صفحه یک سایت حساس است و برای حفظ امنیت، اجرای کد دلخواه در آن مسدود است.",
        "jsFailed": "اجرای جاوااسکریپت ناموفق بود: {err}",
        "newTabFailed": "باز کردن زبانهٔ جدید ناموفق بود: {err}",
        "newTabOk": "یک زبانهٔ جدید باز شد",
        "newTabOpenUrl": "، روی {url}",
        "closeTabFailed": "بستن زبانه ناموفق بود: {err}",
        "closeTabOk": "زبانهٔ فعلی بسته شد",
        "tabsFailed": "دریافت فهرست زبانه‌ها ناموفق بود: {err}",
        "noTabs": "در حال حاضر هیچ زبانه‌ای باز نیست.",
        "activeTab": " ← فعلی",
        "untitled": "بدون عنوان",
        "switchTabFailed": "تغییر زبانه ناموفق بود: {err}",
        "switchTabOk": "به زبانهٔ {id} منتقل شد",
        "domBlocked": "خواندن DOM رد شد: این صفحه یک سایت حساس است و محتوای آن خوانده نمی‌شود.",
        "domFailed": "خواندن DOM ناموفق بود: {err}",
        "domTitle": "عنوان صفحه: {title}",
        "domViewport": "viewport: {vw}×{vh} پیکسل",
        "domMoreAbove": "... {px} پیکسل محتوا در بالا باقی مانده (حدود {pages} صفحه) - برای مشاهده اسکرول کنید ...",
        "domTop": "[بالای صفحه]",
        "domCount": "مجموع {count} عنصر قابل تعامل (با @N ارجاع دهید):",
        "domMoreBelow": "... {px} پیکسل محتوا در پایین باقی مانده (حدود {pages} صفحه) - برای مشاهده اسکرول کنید ...",
        "domBottom": "[پایین صفحه]",
        "domBody": "── متن صفحه ──",
        "keyFailed": "فشردن کلید ناموفق بود: {err}",
        "keyOk": "کلید فشرده شد: {key}",
        "shotBlocked": "گرفتن اسکرین‌شات رد شد: این صفحه یک سایت حساس است و تصویر صفحه ضبط نمی‌شود.",
        "shotFailed": "گرفتن اسکرین‌شات ناموفق بود: {err}",
        "contentBlocked": "خواندن محتوای صفحه رد شد: این صفحه یک سایت حساس است و محتوای آن خوانده نمی‌شود.",
        "contentFailed": "خواندن محتوای صفحه ناموفق بود: {err}",
        "contentHeader": "عنوان صفحه: {title}\nURL: {url}\n\n",
        "memAdded": "حافظه افزوده شد (شناسه: {id})",
        "memDeleted": "حافظه حذف شد.",
        "memNotFound": "این مدخل حافظه یافت نشد.",
        "archiveHeader": "نتایج جست‌وجوی تاریخچه:\n{lines}",
        "archiveEmpty": "تاریخچهٔ مرتبطی یافت نشد.",
        "skillsHeader": "فهرست مهارت‌های در دسترس:\n{lines}",
        "skillsEmpty": "هنوز هیچ سند مهارتی در دسترس نیست.",
        "screenshotNote": "تصویر فعلی صفحه:",
    },
}


def t(key: str, lang: object = None, /, **kwargs: object) -> str:
    """Look up a user-facing string, falling back to the default locale.

    ``key`` and ``lang`` are positional-only so a placeholder may itself be
    called ``key`` (see the ``keyOk``/``keyFailed`` entries).
    """
    table = STRINGS.get(normalize_lang(lang))
    if table is None:
        table = STRINGS[DEFAULT]
    template = table.get(key) or STRINGS[DEFAULT].get(key) or key
    if kwargs:
        try:
            return template.format(**kwargs)
        except (KeyError, IndexError):
            return template
    return template


def reply_language_instruction(lang: object = None, /) -> str:
    return _REPLY_LANG[normalize_lang(lang)]
