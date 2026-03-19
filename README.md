<div align="center">

<img src="logo.png" alt="UrchinAI" width="120" />

# UrchinAI

**AI-Powered Desktop Browser · Control Everything with Natural Language**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/urchinai/browser?include_prereleases)](https://github.com/urchinai/browser/releases)
[![Downloads](https://img.shields.io/github/downloads/urchinai/browser/total)](https://github.com/urchinai/browser/releases)

[English](README.md) | [中文](README.zh-CN.md)

**"打开 GitHub，搜索 React 项目，帮我整理前 10 个热门仓库"** — AI 自动完成

</div>

---

## UrchinAI 能做什么？

### 🎯 核心能力

| 场景 | 你只需要说 | AI 自动完成 |
|------|-----------|------------|
| **日常浏览** | "打开淘宝搜索机械键盘" | 导航 → 搜索 → 展示结果 |
| **信息收集** | "帮我查今天的科技新闻并总结" | 搜索 → 抓取 → 总结 |
| **表单填写** | "帮我填写这个注册表单" | 识别字段 → 智能填写 |
| **数据分析** | "把这个表格数据整理成 Markdown" | 提取 → 格式化 → 输出 |
| **网页理解** | "这个页面主要讲了什么？" | 分析 → 总结 → 解答 |

### ✨ 特色功能

| 功能 | 描述 |
|------|------|
| **🗣️ 自然语言控制** | 无需学习脚本，用日常语言控制浏览器 |
| **🤖 多 AI 模型支持** | OpenAI、Claude、DeepSeek、Gemini 等 15+ 提供商 |
| **🧠 AI 记忆系统** | 记住你的偏好，越用越懂你 |
| **📚 智能书签分类** | AI 自动分类书签，告别混乱 |
| **🔧 技能扩展** | 安装技能包，扩展 AI 能力 |
| **🔌 MCP 协议** | 连接外部工具和服务 |
| **📖 AI 阅读模式** | 一键总结网页内容 |
| **🛡️ 隐私优先** | 本地运行，数据不上传 |

---

## 快速开始

### 下载安装

| 平台 | 下载 |
|------|------|
| Windows | `.exe` 安装包 + 便携版 |
| Linux | `.deb` 安装包 |
| macOS | 即将支持 |

👉 [前往 Releases 下载最新版本](https://github.com/urchinai/browser/releases)

### 配置 AI 模型

首次使用需要配置 AI 模型。打开设置 → 模型与服务商：

```json
// 配置示例（配置文件位于 ~/.nanobot/config.json）
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
| **GPT-4o** | 综合能力强 | 通用场景 |
| **Kimi** | 长上下文 | 文档处理 |
| **GLM-4** | 中文优化 | 国内用户 |

---

## 使用示例

### 💬 对话式控制

```
用户: 帮我在京东搜索 MacBook Pro，按价格排序
AI: [导航到京东] → [搜索 MacBook Pro] → [点击价格排序] → 完成！

用户: 帮我把这个页面的产品参数整理成表格
AI: [分析页面] → [提取参数] → [生成 Markdown 表格]

用户: 帮我找到这个作者的 Twitter 主页
AI: [搜索作者名] → [找到 Twitter 链接] → [打开主页]
```

### 🎯 自动化场景

<details>
<summary><b>📊 竞品分析</b></summary>

```
"帮我搜索 XX 行业的前 5 家公司，
 收集他们的产品信息和价格，
 整理成一个对比表格"
```
AI 自动：搜索 → 访问官网 → 提取信息 → 整理输出
</details>

<details>
<summary><b>📰 每日资讯</b></summary>

```
"帮我看看今天有什么科技新闻，
 总结成 5 条要点"
```
AI 自动：打开新闻站 → 抓取头条 → 总结要点
</details>

<details>
<summary><b>🛒 购物比价</b></summary>

```
"帮我对比这款手机在京东和淘宝的价格"
```
AI 自动：搜索商品 → 提取价格 → 对比展示
</details>

---

## 功能截图

<div align="center">

### 主界面 - AI 对话控制浏览器
<img src="docs/screenshots/screenshot-main.png" alt="Main Interface" width="700"/>

### 设置面板 - 配置 AI 模型
<img src="docs/screenshots/screenshot-settings.png" alt="Settings" width="450"/>

</div>

---

## 开发者

### 本地运行

```bash
# 克隆项目
git clone https://github.com/urchinai/browser.git
cd browser

# 安装依赖
npm install
pip install -r backend/requirements.txt

# 开发模式
npm run dev

# 构建发布
npm run dist
```

### 项目结构

```
urchinai-browser/
├── electron/           # Electron 主进程
├── src/                # React 前端
├── backend/            # Python FastAPI 后端
│   ├── agent/          # AI Agent 实现
│   └── api/            # REST API
└── release/            # 构建输出
```

### 技术栈

- **前端**: React + TypeScript + TailwindCSS
- **后端**: Python + FastAPI + LiteLLM
- **桌面**: Electron
- **AI**: 支持多种 LLM 提供商

---

## Roadmap

- [x] 自然语言浏览器控制
- [x] 多 LLM 提供商支持
- [x] AI 记忆系统
- [x] 智能书签分类
- [x] MCP 协议支持
- [x] 技能系统
- [ ] 语音输入
- [ ] 浏览器扩展
- [ ] 云同步
- [ ] 移动端伴侣

---

## 常见问题

<details>
<summary><b>必须配置 AI 才能使用吗？</b></summary>

不是必须的。UrchinAI 也可以作为普通浏览器使用，AI 功能是可选增强。
</details>

<details>
<summary><b>我的数据安全吗？</b></summary>

所有浏览数据都保存在本地。只有你发送给 AI 的对话会传递给你配置的 LLM 提供商。
</details>

<details>
<summary><b>支持哪些 AI 模型？</b></summary>

通过 LiteLLM 支持：OpenAI、Anthropic、Google、DeepSeek、智谱、月之暗面、MiniMax、Groq、OpenRouter 等主流提供商，以及任何 OpenAI 兼容的 API。
</details>

<details>
<summary><b>如何添加新技能？</b></summary>

设置 → 技能管理 → 从 URL 安装。支持安装社区贡献的 skill.md 文件。
</details>

---

## 贡献

欢迎贡献代码、报告问题、提出建议！

```bash
# Fork 并克隆
git clone https://github.com/YOUR_USERNAME/browser.git

# 创建分支
git checkout -b feature/your-feature

# 提交 PR
```

---

## 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用
- [LiteLLM](https://github.com/BerriAI/litellm) - 统一 LLM 接口
- [FastAPI](https://fastapi.tiangolo.com/) - Python Web 框架
- [React](https://react.dev/) - UI 框架

---

<div align="center">

**[下载使用](https://github.com/urchinai/browser/releases) · [反馈问题](https://github.com/urchinai/browser/issues) · [加入讨论](https://github.com/urchinai/browser/discussions)**

Made with ❤️ by UrchinAI Team

</div>