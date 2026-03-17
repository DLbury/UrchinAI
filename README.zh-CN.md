<div align="center">

<img src="logo.png" alt="UrchinAI" width="120" />

# UrchinAI

**AI 驱动的智能桌面浏览器，内置智能代理**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![Electron](https://img.shields.io/badge/Electron-33%2B-9FEAF9.svg)](https://www.electronjs.org/)

[English](README.md) | [中文](README.zh-CN.md)

*用自然语言控制浏览器 — 导航、搜索、填表、自动化，轻松搞定*

</div>

---

## 项目简介

UrchinAI是一款开源的 AI 智能桌面浏览器，内置智能代理。与传统浏览器不同，UrchinAI 允许你通过自然语言命令控制网页浏览。只需告诉 AI 你想做什么，它就会自动导航网站、点击元素、填写表单，完成复杂的自动化任务。

### 为什么选择 UrchinAI？

- **自然语言控制**：无需学习复杂的自动化脚本，直接描述你想要做什么
- **多模型支持**：支持 OpenAI、Anthropic Claude、Google Gemini、DeepSeek 等 10+ 种 AI 服务商
- **隐私优先**：本地运行，数据留在你自己的设备上
- **跨平台**：支持 Windows、macOS 和 Linux
- **开源免费**：MIT 许可证，社区驱动开发

---

## 功能特性

### AI 智能代理能力

| 功能 | 说明 |
|------|------|
| **自然语言导航** | "打开 GitHub 搜索 React 项目" —— AI 自动完成 |
| **智能表单填充** | 自动识别并填写网页表单 |
| **网页内容提取** | 从任意网页提取并总结内容 |
| **任务自动化** | 用简单命令自动化重复性浏览任务 |
| **视觉分析** | AI 可以"看懂"页面截图，处理复杂任务 |
| **多标签管理** | 通过语音/文字命令创建、切换和管理标签页 |

### 浏览器功能

| 功能 | 说明 |
|------|------|
| **现代界面** | 简洁直观的界面，支持标签页拖拽管理 |
| **广告拦截** | 内置广告拦截器（可在设置中配置） |
| **阅读模式** | 无干扰的文章阅读体验 |
| **书签与历史** | 完整的书签和浏览历史管理 |
| **会话持久化** | 保存和恢复浏览会话 |
| **明暗主题** | 适配任何使用环境的舒适视觉 |
| **多语言支持** | 支持中文和英文界面 |

---

## 应用截图

<div align="center">

### 主界面
<img src="docs/screenshots/screenshot-main.png" alt="UrchinAI主界面，展示 AI 聊天面板和网页内容" width="800"/>

### 设置面板
<img src="docs/screenshots/screenshot-settings.png" alt="设置面板，配置 AI 服务商" width="500"/>

</div>

---

## 支持的 AI 服务商

UrchinAI通过 LiteLLM 支持多种大语言模型服务商：

| 服务商 | 模型 | 需要 API Key |
|--------|------|--------------|
| OpenAI | GPT-5.4（Computer Use）、GPT-4o、GPT-4 | 是 |
| Anthropic | Claude Sonnet 4.6、Claude 3.5 Sonnet/Opus/Haiku | 是 |
| 智谱 AI | GLM-5、GLM-4 | 是 |
| Moonshot (Kimi) | Kimi 2.5、Kimi v1 | 是 |
| Minimax | MiniMax m2、abab6.5-chat | 是 |
| Google | Gemini Pro、Gemini Flash | 是 |
| DeepSeek | DeepSeek V3、DeepSeek Coder | 是 |
| Groq | Llama 4、Llama 3、Mixtral | 是 |
| OpenRouter | 200+ 模型 | 是 |
| 自定义 OpenAI 兼容 | 任何 OpenAI 兼容 API | 是 |

---

## 环境要求

- **Node.js** 18.0 或更高版本
- **Python** 3.8 或更高版本
- **pip**（Python 包管理器）

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/urchinai/browser.git
cd browser
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 后端依赖
pip install -r backend/requirements.txt
```

### 3. 配置 AI 服务商

在 `~/.nanobot/config.json` 创建配置文件：

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "your-api-key-here",
      "apiBase": ""
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

### 4. 运行应用

```bash
# 开发模式（热重载）
npm run dev

# 生产构建并运行
npm run build && npm start
```

---

## 打包发布

### GitHub Actions 在线构建

无需本地构建环境？使用 GitHub Actions：

- **发布构建**：推送 `v0.1.0` 格式的 tag → 自动构建并创建 Release，附带 `.deb` 和 `.exe`
- **手动构建**：Actions → Build and Release → Run workflow → 从 Artifacts 下载

详见 [BUILD.md](BUILD.md)。

### 构建当前平台版本

```bash
npm run dist
```

### 按平台构建

| 命令 | 输出 |
|------|------|
| `npm run dist:win` | Windows `.exe`（安装包 + 便携版） |
| `npm run dist:linux` | Linux `.deb` 安装包 |

构建输出位于 `release/` 目录。

---

## 项目结构

```
urchinai-browser/
├── electron/              # Electron 主进程
│   ├── main.js           # 应用入口
│   └── preload.js        # IPC 桥接
├── src/                   # React 前端
│   ├── components/       # UI 组件
│   ├── hooks/            # 自定义 React Hooks
│   ├── locales/          # 多语言翻译
│   └── App.tsx           # 主 React 组件
├── backend/               # Python FastAPI 后端
│   ├── main.py           # FastAPI 服务器
│   ├── agent/            # AI 代理实现
│   │   ├── manager.py    # 代理编排
│   │   └── browser_tool.py # 浏览器控制工具
│   └── api/              # REST API 端点
├── docs/                  # 文档和截图
└── release/              # 构建输出目录
```

---

## 工作原理

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    UrchinAI                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   React UI  │◄──►│  Electron   │◄──►│  BrowserView│     │
│  │  (前端界面)  │    │   (主进程)   │    │  (网页视图)  │     │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘     │
│         │                  │                                  │
│         │    WebSocket     │ HTTP 桥接 (localhost:8002)     │
│         ▼                  ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Python 后端 (FastAPI)                   │    │
│  │  ┌─────────────┐    ┌─────────────────────────────┐ │    │
│  │  │ AgentManager│───►│  BrowserTools (HTTP 调用)   │ │    │
│  │  └──────┬──────┘    └─────────────────────────────┘ │    │
│  │         │                                             │    │
│  │         ▼                                             │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │     LiteLLM (多服务商 LLM 网关)              │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### AI 代理工作流程

1. **用户输入**：用户在聊天面板输入自然语言命令
2. **LLM 处理**：代理将请求发送到配置的 LLM 服务商
3. **工具选择**：LLM 决定使用哪些浏览器工具（导航、点击、输入等）
4. **浏览器控制**：工具通过 Electron HTTP 桥接执行操作
5. **流式响应**：结果实时流式返回到 UI 界面

---

## 浏览器代理工具

AI 代理可以使用以下浏览器控制工具：

| 工具 | 说明 |
|------|------|
| `browser_navigate` | 导航到指定 URL |
| `browser_click` | 使用 @N 编号或 CSS 选择器点击页面元素 |
| `browser_type` | 在输入框中输入文字 |
| `browser_get_dom` | 获取页面可交互元素列表（带 @N 编号） |
| `browser_screenshot` | 截取页面截图用于视觉分析 |
| `browser_scroll` | 上下滚动页面 |
| `browser_press_key` | 模拟键盘输入（Enter、Tab、Escape 等） |
| `browser_new_tab` | 打开新标签页 |
| `browser_switch_tab` | 切换到指定标签页 |
| `browser_get_page_content` | 提取页面主要内容 |

---

## 参与贡献

我们欢迎社区贡献！以下是参与方式：

### 贡献途径

- **报告 Bug**：提交详细的复现步骤
- **功能建议**：在讨论区分享你的想法
- **提交 PR**：修复 Bug 或添加新功能
- **改进文档**：帮助完善项目文档
- **翻译**：添加更多语言支持

### 开发环境设置

```bash
# Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/browser.git

# 创建功能分支
git checkout -b feature/your-feature-name

# 进行修改并测试
npm run dev

# 提交 Pull Request
```

---

## 开发路线

- [ ] 语音输入支持
- [ ] 浏览器扩展支持
- [ ] 自定义代理技能和工作流
- [ ] 云同步书签和设置
- [ ] 移动端配套应用
- [ ] MCP（模型上下文协议）集成

---

## 常见问题

### 推荐使用哪个 AI 模型？

推荐使用具备 **Computer Use**（计算机使用）能力的模型，以获得最佳浏览器自动化体验：

1. **GPT-5.4**（带 Computer Use 功能）— 浏览器自动化首选
2. **Claude Sonnet 4.6** — 复杂推理任务表现优秀
3. **GLM-5** — 国内用户首选，中文能力强
4. **Kimi 2.5** — 长上下文场景表现出色
5. **MiniMax m2** — 性价比高，性能稳定

### 我的数据会发送到外部服务器吗？

只有你的 AI 提示词会发送到你配置的 LLM 服务商。所有浏览数据都保留在本地设备上。

### 可以不使用 AI 功能吗？

当然可以！UrchinAI即使不配置 AI 也能作为普通浏览器使用，AI 功能是可选的。

---

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - UI 框架
- [FastAPI](https://fastapi.tiangolo.com/) - Python Web 框架
- [LiteLLM](https://github.com/BerriAI/litellm) - 统一 LLM 接口
- [TailwindCSS](https://tailwindcss.com/) - 实用优先的 CSS 框架

---

<div align="center">

**[报告 Bug](https://github.com/urchinai/browser/issues) · [功能建议](https://github.com/urchinai/browser/issues) · [参与讨论](https://github.com/urchinai/browser/discussions)**

由 UrchinAI 团队用 ❤️ 打造

</div>