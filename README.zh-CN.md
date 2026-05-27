<div align="center">

<img src="logo.png" alt="UrchinAI — 开源 AI 智能桌面浏览器 Logo" width="120" />

# UrchinAI

**开源 AI 智能桌面浏览器 · 用自然语言控制一切**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/DLbury/UrchinAI?include_prereleases)](https://github.com/DLbury/UrchinAI/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)](https://github.com/DLbury/UrchinAI/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

[English](README.md) · [中文](README.zh-CN.md)

<img src="docs/screenshots/hero-banner.png" alt="UrchinAI AI 浏览器 — 自然语言驱动的桌面网页自动化" width="900" />

**"打开 GitHub 搜索 React 项目，帮我整理前 10 个热门仓库"** — AI 自动完成

[⬇ 下载最新版](https://github.com/DLbury/UrchinAI/releases) · [📖 快速开始](#快速开始) · [🛠 源码构建](#开发者)

</div>

---

> **UrchinAI** 是一款免费开源的 **AI 浏览器** 与 **浏览器自动化 Agent**，支持 Windows 和 Linux。用中文或英文描述任务——搜索、抓取、填表、比价、总结网页——AI 智能体自动操控浏览器完成。隐私优先、本地运行，是 Atlas 等闭源 AI 浏览器的 **开源替代方案**，支持 **15+ 大模型**（OpenAI、Claude、DeepSeek、Gemini、Kimi、智谱 GLM 等）。

## 目录

- [UrchinAI 是什么？](#urchinai-是什么)
- [界面预览](#界面预览)
- [特色功能](#特色功能)
- [工作原理](#工作原理)
- [使用场景](#按角色划分的使用场景)
- [快速开始](#快速开始)
- [使用示例](#使用示例)
- [为什么选择 UrchinAI？](#为什么选择-urchinai)
- [开发者](#开发者)
- [路线图](#路线图)
- [常见问题](#常见问题)
- [贡献](#贡献)

---

## UrchinAI 是什么？

**UrchinAI** 是基于 Electron、React 和 Python 构建的 AI 驱动桌面浏览器。无需点击菜单、无需编写自动化脚本——告诉 AI 你想做什么，它自动导航网页、提取数据、填写表单并返回结构化结果。

无论你是开发者、市场营销人员、学生、研究人员，还是需要自动化重复工作的专业人士，UrchinAI 都能用 **自然语言** 实现 **浏览器自动化**。

| 场景 | 你只需要说 | AI 自动完成 |
|------|-----------|------------|
| **日常浏览** | "打开淘宝搜索机械键盘" | 导航 → 搜索 → 展示结果 |
| **信息收集** | "帮我查今天的科技新闻并总结" | 搜索 → 抓取 → 总结 |
| **表单填写** | "帮我填写这个注册表单" | 识别字段 → 智能填写 |
| **数据提取** | "把这个表格数据整理成 Markdown" | 提取 → 格式化 → 输出 |
| **网页理解** | "这个页面主要讲了什么？" | 分析 → 总结 → 解答 |
| **学术研究** | "在 arXiv 搜索最近的 AI 论文" | 导航 → 搜索 → 提取 |
| **购物比价** | "对比这款手机在京东和淘宝的价格" | 多站搜索 → 价格对比 |
| **内容创作** | "收集关于气候变化的文章素材" | 调研 → 总结 → 结构化 |

---

## 界面预览

### 主界面 — AI 对话与智能新标签页

<img src="docs/screenshots/screenshot-main.png" alt="UrchinAI 主界面 — AI 智能体对话侧边栏、会话历史与智能新标签页快捷入口" width="900" />

### AI 智能体对话 — 实时浏览器操控

<img src="docs/screenshots/screenshot-chat.png" alt="UrchinAI AI 对话面板 — 自然语言浏览器自动化与流式响应" width="900" />

### 智能书签 — AI 自动分类

<img src="docs/screenshots/screenshot-bookmarks.png" alt="UrchinAI 智能书签管理 — AI 自动分类整理" width="900" />

### 设置面板 — 多 LLM 服务商配置

<img src="docs/screenshots/screenshot-settings.png" alt="UrchinAI 设置面板 — 配置 OpenAI Claude DeepSeek 等大模型 API" width="900" />

---

## 特色功能

| 功能 | 描述 |
|------|------|
| **🗣️ 自然语言控制** | 无需学习脚本，用日常语言控制浏览器 |
| **🤖 多 AI 模型支持** | 支持 15+ 种 LLM：OpenAI、Claude、DeepSeek、Gemini、智谱、月之暗面等 |
| **🧠 AI 记忆系统** | 记住你的偏好，越用越懂你 |
| **📚 智能书签分类** | AI 自动分类书签，告别混乱 |
| **🔧 技能扩展** | 安装技能包，扩展 AI 能力 |
| **🔌 MCP 协议** | 通过 Model Context Protocol 连接外部工具 |
| **📖 AI 阅读模式** | 一键总结网页内容 |
| **🛡️ 隐私优先** | 本地运行，浏览数据不上传 |
| **💬 实时流式对话** | WebSocket 实时交互，进度即时可见 |
| **🔄 会话管理** | 持久化聊天记录，支持多会话 |

---

## 工作原理

<img src="docs/screenshots/architecture.png" alt="UrchinAI 架构图 — 自然语言输入经 AI Agent 驱动浏览器自动化并连接多个 LLM 服务商" width="900" />

1. **你用自然语言描述任务**，在对话面板中输入指令。
2. **AI 智能体** 规划步骤、调用浏览器工具，并实时流式输出进度。
3. **自由选择大模型**（OpenAI、Claude、DeepSeek 等），随时切换服务商。
4. **数据本地优先** — 仅 AI 对话内容发送至你配置的 LLM 服务商。

---

## 按角色划分的使用场景

<details>
<summary><b>👨‍💻 开发者</b> — API 文档、代码搜索、Bug 排查、技术对比</summary>

- "查找 Stripe 支付 API 的文档"
- "在 GitHub 搜索 Python 异步代码示例，并解释最佳实践"
- "在 Stack Overflow 搜索这个错误信息的解决方案"
</details>

<details>
<summary><b>📊 市场营销</b> — 竞品分析、SEO 研究、舆情监控</summary>

- "调研 CRM 行业前三名竞争对手，制作功能对比表"
- "分析'最佳 CRM 软件'搜索结果的前十名网页"
</details>

<details>
<summary><b>🎓 学生与研究</b> — 学术检索、笔记整理、文献综述</summary>

- "在 Google Scholar 搜索机器学习的医疗应用论文"
- "找 5 篇关于气候变化影响的权威文献"
</details>

<details>
<summary><b>💼 商务办公 · 🛒 购物决策 · 🎨 创意设计 · 📈 数据分析 · 🏠 生活助手</b></summary>

涵盖会议准备、比价购物、设计灵感、数据抓取、菜谱搜索等更多场景 — 详见英文版 README 完整列表。
</details>

---

## 快速开始

### 下载安装

| 平台 | 格式 | 状态 |
|------|------|------|
| **Windows** | `.exe` 安装包 + 便携版 | ✅ 已支持 |
| **Linux** | `.deb` 安装包 | ✅ 已支持 |
| **macOS** | `.dmg` | 🔜 即将支持 |

👉 **[前往 Releases 下载最新版本](https://github.com/DLbury/UrchinAI/releases)**

### 配置 AI 模型

首次启动后，打开 **设置 → 模型与服务商**，填入 API Key：

```json
// 配置文件：~/.nanobot/config.json
{
  "providers": {
    "deepseek": {
      "apiKey": "your-api-key",
      "apiBase": "https://api.deepseek.com"
    }
  },
  "agents": {
    "defaults": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    }
  }
}
```

### 推荐模型

| 模型 | 特点 | 适用场景 |
|------|------|---------|
| **DeepSeek V3** | 高性价比，中文友好 | 日常使用 |
| **Claude Sonnet 4.6** | 推理能力强，支持视觉 | 复杂任务 |
| **Kimi** | 长上下文，中文优化 | 文档处理 |
| **智谱 GLM-4** | 中文优化 | 国内用户 |
| **GPT-4o** | 综合能力强 | 通用场景 |
| **Gemini Pro** | Google 出品 | 多模态任务 |

---

## 使用示例

```
用户: 帮我在京东搜索笔记本电脑，按销量排序
AI:  [导航到京东] → [搜索笔记本电脑] → [点击销量排序] → 完成！

用户: 帮我把这个页面的商品信息整理成表格
AI:  [分析页面] → [提取信息] → [生成 Markdown 表格]

用户: 把这篇 50 页的 PDF 总结一下
AI:  [处理文档] → [提取要点] → [生成摘要]
```

<details>
<summary><b>📊 竞品分析 · 📰 每日资讯 · 🛒 购物比价 · 🔍 研究自动化</b></summary>

```
"帮我搜索 XX 行业的前 5 家公司，收集产品信息和价格，整理成对比表格"
"找 10 篇 2024 年关于可再生能源的学术论文"
```
</details>

---

## 为什么选择 UrchinAI？

| | 传统浏览器 | 浏览器插件 + ChatGPT | 闭源 AI 浏览器 | **UrchinAI** |
|--|-----------|---------------------|---------------|--------------|
| 自然语言操控 | ❌ | 部分 | ✅ | ✅ |
| 完整浏览器自动化 | ❌ | ❌ | ✅ | ✅ |
| **开源免费** | — | 部分 | ❌ | **✅ MIT** |
| **本地运行 / 自托管** | ✅ | ❌ | ❌ | **✅** |
| 自选大模型 | ❌ | 部分 | ❌ | **✅ 15+ 服务商** |
| MCP 与技能扩展 | ❌ | ❌ | ❌ | **✅** |
| Windows & Linux | ✅ | ✅ | 各异 | **✅** |

> 在找 **Atlas 的开源替代**？UrchinAI 让你拥有 AI 原生浏览体验，无厂商绑定、无订阅锁定。

---

## 开发者

### 本地运行

```bash
git clone https://github.com/DLbury/UrchinAI.git
cd UrchinAI

npm install
pip install -r backend/requirements.txt

npm run dev      # 开发模式
npm run dist     # 构建发布
```

打包说明见 [BUILD.md](BUILD.md)（Windows `.exe`、Linux `.deb`）。

### 项目结构

```
UrchinAI/
├── electron/           # Electron 主进程
├── src/                # React + TypeScript 前端
├── backend/            # Python FastAPI 后端
│   ├── agent/          # AI Agent 与浏览器工具
│   └── api/            # REST & WebSocket API
├── docs/screenshots/   # README 配图资源
└── release/            # 构建产物
```

### 技术栈

- **前端**: React · TypeScript · TailwindCSS · Vite
- **后端**: Python · FastAPI · LiteLLM
- **桌面**: Electron 33
- **AI**: LiteLLM 多模型 + MCP 协议

---

## 路线图

- [x] 自然语言浏览器控制
- [x] 多 LLM 提供商支持
- [x] AI 记忆系统
- [x] 智能书签分类
- [x] MCP 协议支持
- [x] 技能系统
- [ ] 语音输入
- [ ] 浏览器扩展
- [ ] 云同步
- [ ] macOS 版本
- [ ] 移动端伴侣

---

## 常见问题

<details>
<summary><b>必须配置 AI 才能使用吗？</b></summary>

不是必须的。UrchinAI 也可以作为普通浏览器使用，AI 功能是可选增强。
</details>

<details>
<summary><b>我的数据安全吗？</b></summary>

所有浏览数据都保存在本地。只有你发送给 AI 的对话会传递给你配置的 LLM 服务商。
</details>

<details>
<summary><b>支持哪些 AI 模型？</b></summary>

通过 LiteLLM 支持：OpenAI、Anthropic、Google、DeepSeek、智谱 GLM、月之暗面 Kimi、MiniMax、Groq、OpenRouter 等，以及任何 OpenAI 兼容 API。
</details>

<details>
<summary><b>和 Atlas、Comet 有什么区别？</b></summary>

UrchinAI 完全开源（MIT），运行在本地，支持自带 API Key 和任意 LLM 服务商 — 无订阅锁定。
</details>

<details>
<summary><b>支持哪些操作系统？</b></summary>

目前支持 Windows 和 Linux。macOS 版本正在开发中。
</details>

---

## 贡献

欢迎贡献代码、报告问题、提出建议！

```bash
git clone https://github.com/YOUR_USERNAME/UrchinAI.git
git checkout -b feature/your-feature
# ... 修改代码 ...
git push origin feature/your-feature
```

---

## 致谢

- [Electron](https://www.electronjs.org/) · [LiteLLM](https://github.com/BerriAI/litellm) · [FastAPI](https://fastapi.tiangolo.com/) · [React](https://react.dev/)

---

<div align="center">

**[下载使用](https://github.com/DLbury/UrchinAI/releases) · [反馈问题](https://github.com/DLbury/UrchinAI/issues) · [加入讨论](https://github.com/DLbury/UrchinAI/discussions)**

<br/>

<sub>
关键词：AI浏览器 · 开源浏览器 · 浏览器自动化 · AI Agent · 自然语言浏览器 ·
大模型浏览器 · Electron 浏览器 · 网页抓取 · DeepSeek · Claude · GPT-4 · Atlas 开源替代 · MCP 浏览器
</sub>

<br/><br/>

Made with ❤️ by UrchinAI Team

</div>
