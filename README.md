<div align="center">

# UrchinAI

**AI-Powered Desktop Browser · Control Everything with Natural Language**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/urchinai/browser?include_prereleases)](https://github.com/urchinai/browser/releases)
[![Downloads](https://img.shields.io/github/downloads/urchinai/browser/total)](https://github.com/urchinai/browser/releases)

[English](README.md) | [中文](README.zh-CN.md)

**"Open GitHub, search for React projects, and organize the top 10 popular repositories"** — AI handles it automatically

</div>

---

## What is UrchinAI?

**UrchinAI** is an AI-powered desktop browser that lets you control web browsing with natural language. No more clicking through menus or memorizing keyboard shortcuts—just tell the AI what you want to do.

Whether you're a developer researching APIs, a marketer analyzing competitors, a student gathering research, or a professional automating repetitive tasks, UrchinAI adapts to your workflow and makes web interaction effortless.

## What Can UrchinAI Do?

### 🎯 Core Capabilities

| Scenario | Just Say | AI Completes |
|----------|----------|--------------|
| **Daily Browsing** | "Open Amazon and search for mechanical keyboards" | Navigate → Search → Display results |
| **Information Gathering** | "Find today's tech news and summarize it" | Search → Scrape → Summarize |
| **Form Filling** | "Help me fill out this registration form" | Recognize fields → Smart fill |
| **Data Extraction** | "Convert this table data to Markdown" | Extract → Format → Output |
| **Web Analysis** | "What is this page mainly about?" | Analyze → Summarize → Answer |
| **Research** | "Search for recent AI papers on arXiv" | Navigate → Search → Extract |
| **Shopping** | "Compare prices for this laptop across sites" | Multi-site search → Price comparison |
| **Content Creation** | "Gather information for a blog post about climate change" | Research → Summarize → Structure |

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🗣️ Natural Language Control** | Control the browser with everyday language—no scripting needed |
| **🤖 Multi-AI Support** | 15+ LLM providers: OpenAI, Claude, DeepSeek, Gemini, and more |
| **🧠 AI Memory System** | Remembers your preferences and gets smarter over time |
| **📚 Smart Bookmarking** | AI auto-categorizes bookmarks—no more clutter |
| **🔧 Skill Extensions** | Install skill packs to extend AI capabilities |
| **🔌 MCP Protocol** | Connect to external tools and services |
| **📖 AI Reading Mode** | One-click webpage summarization |
| **🛡️ Privacy First** | Runs locally, your data stays on your device |
| **💬 WebSocket Streaming** | Real-time AI conversation with progress updates |
| **🔄 Session Management** | Persistent chat sessions with full history |

---

## Use Cases by Role

### 👨‍💻 For Developers

- **API Research**: "Find the Stripe API documentation for payment intents"
- **Code Examples**: "Search GitHub for Python async examples and explain the best ones"
- **Documentation**: "Open the React docs and find information about useEffect"
- **Bug Hunting**: "Search Stack Overflow for this error message and show solutions"
- **Tech Comparison**: "Compare Next.js and Nuxt.js features side by side"

### 📊 For Marketers

- **Competitor Analysis**: "Research our top 3 competitors and create a feature comparison"
- **Trend Research**: "Find trending topics in AI for this week"
- **Content Ideas**: "Search for popular blog post topics in the fitness niche"
- **SEO Research**: "Analyze the top-ranking pages for 'best CRM software'"
- **Review Monitoring**: "Check recent reviews for our product on G2"

### 🎓 For Students & Researchers

- **Academic Research**: "Search Google Scholar for papers on machine learning in healthcare"
- **Note Taking**: "Extract key points from this Wikipedia article and create notes"
- **Citation Gathering**: "Find 5 credible sources about climate change impacts"
- **Translation**: "Translate this German research paper to English"
- **Data Collection**: "Gather statistics about global internet usage from multiple sources"

### 💼 For Business Professionals

- **Meeting Prep**: "Research this company before my meeting—find their products and recent news"
- **Report Generation**: "Collect quarterly earnings data for FAANG companies"
- **Email Drafting**: "Help me draft a professional email requesting a partnership"
- **Contract Review**: "Highlight key terms in this Terms of Service page"
- **Travel Planning**: "Find flights from NYC to London for next week and compare prices"

### 🛒 For Shoppers

- **Price Comparison**: "Compare iPhone 15 prices on Amazon, Best Buy, and Apple"
- **Review Analysis**: "Summarize the top reviews for this product"
- **Feature Research**: "Find all laptops with RTX 4060 under $1500"
- **Deal Hunting**: "Search for discount codes for Nike"
- **Product Research**: "Is this brand eco-friendly? Find their sustainability page"

### 🎨 For Creatives

- **Inspiration**: "Find award-winning website designs on Awwwards"
- **Asset Gathering**: "Search for free stock photos of mountains"
- **Color Research**: "Find trending color palettes for 2025"
- **Font Discovery**: "Find Google Fonts similar to Helvetica"
- **Tutorial Finding**: "Search YouTube for advanced Photoshop techniques"

---

## Quick Start

### Download & Install

| Platform | Download |
|----------|----------|
| Windows | `.exe` installer + portable |
| Linux | `.deb` package |
| macOS | Coming soon |

👉 [Download latest release](https://github.com/urchinai/browser/releases)

### Configure AI Model

On first use, configure your AI model. Open Settings → Models & Providers:

```json
// Example config (located at ~/.nanobot/config.json)
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

### Recommended Models

| Model | Strengths | Best For |
|-------|-----------|----------|
| **DeepSeek V3** | Cost-effective, Chinese-friendly | Daily use |
| **Claude Sonnet 4.6** | Strong reasoning, vision support | Complex tasks |
| **GPT-4o** | Well-rounded capabilities | General purpose |
| **Kimi** | Long context | Document processing |
| **GLM-4** | Chinese-optimized | China users |

---

## Usage Examples

### 💬 Conversational Control

```
User: Help me search for MacBook Pro on JD.com and sort by price
AI: [Navigate to JD] → [Search MacBook Pro] → [Click price sort] → Done!

User: Extract product specs from this page into a table
AI: [Analyze page] → [Extract specs] → [Generate Markdown table]

User: Find the Twitter profile of this author
AI: [Search author name] → [Find Twitter link] → [Open profile]

User: Summarize this 50-page PDF for me
AI: [Process document] → [Extract key points] → [Create summary]
```

### 🎯 Automation Scenarios

<details>
<summary><b>📊 Competitor Analysis</b></summary>

```
"Research the top 5 companies in the CRM industry,
 collect their product features and pricing,
 and create a comparison table"
```
AI: Search → Visit websites → Extract info → Format output
</details>

<details>
<summary><b>📰 Daily News Digest</b></summary>

```
"Check today's tech news headlines
 and summarize them into 5 key points"
```
AI: Open news sites → Scrape headlines → Summarize points
</details>

<details>
<summary><b>🛒 Price Comparison</b></summary>

```
"Compare prices for this phone on Amazon and Best Buy"
```
AI: Search products → Extract prices → Compare and display
</details>

<details>
<summary><b>📄 Document Processing</b></summary>

```
"Extract all links from this page and organize them by category"
```
AI: Scan page → Extract links → Categorize → Output list
</details>

<details>
<summary><b>🔍 Research Automation</b></summary>

```
"Find 10 academic papers about renewable energy from 2024"
```
AI: Search academic DB → Filter by date → Collect results
</details>

---

---

## For Developers

### Local Development

```bash
# Clone repository
git clone https://github.com/urchinai/browser.git
cd browser

# Install dependencies
npm install
pip install -r backend/requirements.txt

# Dev mode
npm run dev

# Build release
npm run dist
```

### Project Structure

```
urchinai-browser/
├── electron/           # Electron main process
├── src/                # React frontend
├── backend/            # Python FastAPI backend
│   ├── agent/          # AI Agent implementation
│   └── api/            # REST API
└── release/            # Build output
```

### Tech Stack

- **Frontend**: React + TypeScript + TailwindCSS
- **Backend**: Python + FastAPI + LiteLLM
- **Desktop**: Electron
- **AI**: Multi-LLM provider support

---

## Roadmap

- [x] Natural language browser control
- [x] Multi-LLM provider support
- [x] AI memory system
- [x] Smart bookmark categorization
- [x] MCP protocol support
- [x] Skill system
- [ ] Voice input
- [ ] Browser extension
- [ ] Cloud sync
- [ ] Mobile companion

---

## FAQ

<details>
<summary><b>Is AI configuration required?</b></summary>

No. UrchinAI works as a regular browser without AI. AI features are optional enhancements.
</details>

<details>
<summary><b>Is my data secure?</b></summary>

All browsing data stays local. Only your AI conversations are sent to your configured LLM provider.
</details>

<details>
<summary><b>Which AI models are supported?</b></summary>

Via LiteLLM: OpenAI, Anthropic, Google, DeepSeek, Zhipu, Moonshot, MiniMax, Groq, OpenRouter, and any OpenAI-compatible API.
</details>

<details>
<summary><b>How do I add new skills?</b></summary>

Settings → Skills Management → Install from URL. Supports community-contributed skill.md files.
</details>

<details>
<summary><b>Can I use it without an internet connection?</b></summary>

Basic browsing requires internet. AI features need connectivity to your configured LLM provider.
</details>

---

## Contributing

Contributions welcome! Report issues, suggest features, or submit PRs.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/browser.git

# Create branch
git checkout -b feature/your-feature

# Submit PR
```

---

## Acknowledgments

- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [LiteLLM](https://github.com/BerriAI/litellm) - Unified LLM interface
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [React](https://react.dev/) - UI framework

---

<div align="center">

**[Download](https://github.com/urchinai/browser/releases) · [Issues](https://github.com/urchinai/browser/issues) · [Discussions](https://github.com/urchinai/browser/discussions)**

Made with ❤️ by UrchinAI Team

</div>
