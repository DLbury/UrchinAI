<div align="center">

<img src="logo.png" alt="UrchinAI" width="120" />

# UrchinAI

**AI 驱动的智能桌面浏览器 · 用自然语言控制一切**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/urchinai/browser?include_prereleases)](https://github.com/urchinai/browser/releases)
[![Downloads](https://img.shields.io/github/downloads/urchinai/browser/total)](https://github.com/urchinai/browser/releases)

[English](README.md) | [中文](README.zh-CN.md)

**"打开 GitHub 搜索 React 项目，帮我整理前 10 个热门仓库"** — AI 自动完成

</div>

---

## UrchinAI 是什么？

**UrchinAI** 是一款 AI 驱动的智能桌面浏览器，让你用自然语言控制网页浏览。无需点击菜单、无需记忆快捷键——告诉 AI 你想做什么，它自动帮你完成。

无论你是开发者、市场营销人员、学生、研究人员，还是需要自动化重复工作的专业人士，UrchinAI 都能适配你的工作流，让网页交互变得轻松高效。

## UrchinAI 能做什么？

### 🎯 核心能力

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
| **竞品分析** | "调研前三名竞争对手的产品特点" | 搜索 → 访问 → 整理 |
| **会议准备** | "帮我查一下这家公司的背景信息" | 搜索 → 汇总 → 简报 |

### ✨ 特色功能

| 功能 | 描述 |
|------|------|
| **🗣️ 自然语言控制** | 无需学习脚本，用日常语言控制浏览器 |
| **🤖 多 AI 模型支持** | 支持 15+ 种 LLM：OpenAI、Claude、DeepSeek、Gemini、智谱、月之暗面等 |
| **🧠 AI 记忆系统** | 记住你的偏好，越用越懂你 |
| **📚 智能书签分类** | AI 自动分类书签，告别混乱 |
| **🔧 技能扩展** | 安装技能包，扩展 AI 能力 |
| **🔌 MCP 协议** | 连接外部工具和服务 |
| **📖 AI 阅读模式** | 一键总结网页内容 |
| **🛡️ 隐私优先** | 本地运行，数据不上传 |
| **💬 实时流式对话** | WebSocket 实时交互，进度即时可见 |
| **🔄 会话管理** | 持久化聊天记录，支持多会话 |

---

## 按角色划分的使用场景

### 👨‍💻 开发者场景

- **API 调研**："查找 Stripe 支付 API 的文档"
- **代码示例**："在 GitHub 搜索 Python 异步代码示例，并解释最佳实践"
- **文档查阅**："打开 React 文档，查找 useEffect 的用法"
- **Bug 排查**："在 Stack Overflow 搜索这个错误信息的解决方案"
- **技术对比**："对比 Next.js 和 Nuxt.js 的功能差异"
- **框架选型**："搜索 2024 年最受欢迎的前端框架排名"
- **开源发现**："GitHub 上有什么好用的 Python 爬虫库"

### 📊 市场营销场景

- **竞品分析**："调研 CRM 行业前三名竞争对手，制作功能对比表"
- **趋势研究**："查找本周 AI 领域的热门话题"
- **选题灵感**："健身领域有哪些热门的博客文章主题"
- **SEO 研究**："分析'最佳 CRM 软件'搜索结果的前十名网页"
- **舆情监控**："查看我们产品在 G2 上的最新评价"
- **广告投放**："搜索 Facebook 广告投放的最佳实践"
- **KOL 发现**："找出科技领域粉丝量前 100 的 Twitter 账号"

### 🎓 学生与研究场景

- **学术检索**："在 Google Scholar 搜索机器学习的医疗应用论文"
- **笔记整理**："提取这篇维基百科文章的关键点并生成笔记"
- **文献综述**："找 5 篇关于气候变化影响的权威文献"
- **翻译辅助**："把这篇德文论文翻译成中文"
- **数据收集**："从多个网站收集全球互联网使用统计数据"
- **论文润色**："帮我检查这篇论文的语法和表达"
- **引用格式**："把这篇文献转成 APA 引用格式"

### 💼 商务办公场景

- **会议准备**："会前帮我查一下这家公司的产品和近期新闻"
- **报告生成**："收集 FAANG 公司的季度财报数据"
- **邮件起草**："帮我起草一封专业的合作邀约邮件"
- **合同审查**："高亮这份服务条款中的关键条款"
- **差旅规划**："查找下周从北京到上海的航班，比较价格"
- **简历优化**："查看 LinkedIn 上这个职位的关键词"
- **演示准备**："搜索关于人工智能的行业报告"

### 🛒 购物决策场景

- **比价购物**："对比 iPhone 15 在京东、淘宝、苏宁的价格"
- **评测分析**："总结这款手机的热门评价优缺点"
- **规格筛选**："找所有搭载 RTX 4060、价格低于 8000 元的笔记本"
- **优惠发现**："搜索 Nike 的优惠券和折扣码"
- **品牌调研**："这个品牌是否环保？查找他们的可持续发展报告"
- **库存查询**："查看这款产品在附近门店的库存"
- **海外代购**："查找这款美国产品在 Amazon 的价格"

### 🎨 创意设计场景

- **灵感收集**："在 Awwwards 上找获奖的网站设计案例"
- **素材搜索**："搜索免费的山景高清图片素材"
- **配色研究**："查找 2025 年流行的配色方案"
- **字体发现**："找类似 Helvetica 的中文字体"
- **教程查找**："YouTube 上有什么高级的 Photoshop 技巧视频"
- **竞品 UI 分析**："收集 10 个优秀的 App 登录界面设计"
- **设计规范**："查找 Material Design 3 的设计规范"

### 📈 数据分析场景

- **财报抓取**："从东方财富网抓取茅台的历年财务数据"
- **舆情分析**："收集微博上关于这个品牌的用户反馈"
- **价格监控**："追踪这款商品在过去一个月的价格变化"
- **行业报告**："下载艾瑞咨询关于电商行业的最新报告"
- **数据可视化**："把这个网页表格数据转换成图表"
- **多源整合**："从 3 个不同网站收集汇率数据并对比"
- **趋势预测**："搜索新能源汽车销量的历史数据和预测"

### 🏥 医疗健康场景

- **药品查询**："查找这种药品的说明书和副作用"
- **医院预约**："搜索附近三甲医院的预约挂号入口"
- **健康资讯**："查找关于高血压饮食的权威建议"
- **症状自查**："搜索这个症状的常见原因（仅供参考）"
- **医保政策**："查询最新的医保报销政策"
- **体检解读**："解释这份体检报告中的异常指标含义"

### 🏠 生活助手场景

- **菜谱搜索**："搜索四川麻婆豆腐的正宗做法"
- **租房找房**："在链家搜索朝阳区两居室的租房信息"
- **出行规划**："规划从北京到西安的自驾游路线"
- **活动查询**："查找本周末北京的音乐会演出"
- **维修指南**："搜索 iPhone 换电池的 DIY 教程"
- **理财比较**："对比各大银行的定期存款利率"
- **证件办理**："查询护照换发的办理流程和所需材料"

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
| **Kimi** | 长上下文，中文优化 | 文档处理 |
| **智谱 GLM-4** | 中文优化 | 国内用户 |
| **GPT-4o** | 综合能力强 | 通用场景 |
| **Gemini Pro** | Google 出品 | 多模态任务 |

---

## 使用示例

### 💬 对话式控制

```
用户: 帮我在京东搜索笔记本电脑，按销量排序
AI: [导航到京东] → [搜索笔记本电脑] → [点击销量排序] → 完成！

用户: 帮我把这个页面的商品信息整理成表格
AI: [分析页面] → [提取信息] → [生成 Markdown 表格]

用户: 帮我找到这家公司的官网
AI: [搜索公司名] → [找到官网链接] → [打开网站]

用户: 把这篇 50 页的 PDF 总结一下
AI: [处理文档] → [提取要点] → [生成摘要]
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

<details>
<summary><b>📄 文档处理</b></summary>

```
"提取这个页面所有的链接，并按类别整理"
```
AI 自动：扫描页面 → 提取链接 → 分类 → 输出列表
</details>

<details>
<summary><b>🔍 研究自动化</b></summary>

```
"找 10 篇 2024 年关于可再生能源的学术论文"
```
AI 自动：搜索学术数据库 → 按日期筛选 → 收集结果
</details>

<details>
<summary><b>📝 内容创作</b></summary>

```
"帮我搜集关于人工智能发展趋势的素材，整理成大纲"
```
AI 自动：多源搜索 → 信息整合 → 结构化输出
</details>

---

## 功能截图

<div align="center">

### 主界面 — AI 对话与快速访问
<img src="docs/screenshots/screenshot-main.png" alt="主界面" width="900"/>

### AI 对话实时交互
<img src="docs/screenshots/screenshot-chat.png" alt="AI 对话" width="900"/>

### 智能书签管理
<img src="docs/screenshots/screenshot-bookmarks.png" alt="书签管理" width="900"/>

### 设置面板 — 模型配置
<img src="docs/screenshots/screenshot-settings.png" alt="设置面板" width="900"/>

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
- **AI**: 多 LLM 提供商支持

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

通过 LiteLLM 支持：OpenAI、Anthropic、Google、DeepSeek、智谱 GLM、月之暗面 Kimi、MiniMax、Groq、OpenRouter 等主流提供商，以及任何 OpenAI 兼容的 API。
</details>

<details>
<summary><b>如何添加新技能？</b></summary>

设置 → 技能管理 → 从 URL 安装。支持安装社区贡献的 skill.md 文件。
</details>

<details>
<summary><b>没有网络可以使用吗？</b></summary>

基础浏览需要网络。AI 功能需要连接到你配置的 LLM 提供商。
</details>

<details>
<summary><b>支持哪些操作系统？</b></summary>

目前支持 Windows 和 Linux。macOS 版本正在开发中。
</details>

<details>
<summary><b>如何更新到最新版本？</b></summary>

Windows 用户可以在应用内检查更新，或从 Releases 页面下载最新安装包。Linux 用户可通过包管理器或重新下载 deb 包安装。
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
