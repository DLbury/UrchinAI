<div align="center">

# UrchinAI Browser

**AI-Powered Desktop Browser with Intelligent Agent**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![Electron](https://img.shields.io/badge/Electron-33%2B-9FEAF9.svg)](https://www.electronjs.org/)

[English](README.md) | [中文](README.zh-CN.md)

*Control your browser with natural language — navigate, search, fill forms, and automate tasks effortlessly*

</div>

---

## Overview

UrchinAI Browser is an open-source AI-powered desktop browser that integrates a built-in intelligent agent. Unlike traditional browsers, UrchinAI allows you to control web browsing through natural language commands. Simply tell the AI what you want to do, and it will navigate websites, click elements, fill forms, and perform complex automation tasks for you.

### Why UrchinAI Browser?

- **Natural Language Control**: No need to learn complex automation scripts — just describe what you want
- **Multi-LLM Support**: Works with OpenAI, Anthropic Claude, Google Gemini, DeepSeek, and 10+ other providers
- **Privacy-First**: Runs locally on your machine, your data stays with you
- **Cross-Platform**: Available for Windows, macOS, and Linux
- **Open Source**: Fully open source under MIT license, community-driven development

---

## Features

### AI Agent Capabilities

| Feature | Description |
|---------|-------------|
| **Natural Language Navigation** | "Go to GitHub and search for React projects" — the AI handles it |
| **Smart Form Filling** | Automatically fills forms with context-aware input |
| **Web Scraping** | Extract and summarize content from any webpage |
| **Task Automation** | Automate repetitive browsing tasks with simple commands |
| **Visual Analysis** | AI can "see" and analyze page screenshots for complex tasks |
| **Multi-Tab Management** | Create, switch, and manage multiple tabs via voice commands |

### Browser Features

| Feature | Description |
|---------|-------------|
| **Modern UI** | Clean, intuitive interface with drag-and-drop tab management |
| **Ad Blocking** | Built-in ad blocker (configurable in settings) |
| **Reading Mode** | Distraction-free reading for articles and blogs |
| **Bookmarks & History** | Full-featured bookmark and browsing history management |
| **Session Persistence** | Save and restore your browsing sessions |
| **Dark/Light Theme** | Comfortable viewing in any environment |
| **i18n Support** | English and Chinese language support |

---

## Screenshots

<div align="center">

### Main Interface
<img src="docs/screenshots/screenshot-main.png" alt="UrchinAI Browser main interface showing AI chat panel and web content" width="800"/>

### Settings Panel
<img src="docs/screenshots/screenshot-settings.png" alt="Settings panel with AI provider configuration" width="500"/>

</div>

---

## Supported AI Providers

UrchinAI Browser supports a wide range of LLM providers through LiteLLM:

| Provider | Models | API Key Required |
|----------|--------|------------------|
| OpenAI | GPT-5.4 (Computer Use), GPT-4o, GPT-4 | Yes |
| Anthropic | Claude Sonnet 4.6, Claude 3.5 Sonnet/Opus/Haiku | Yes |
| Zhipu AI | GLM-5, GLM-4 | Yes |
| Moonshot (Kimi) | Kimi 2.5, Kimi v1 | Yes |
| Minimax | MiniMax m2, abab6.5-chat | Yes |
| Google | Gemini Pro, Gemini Flash | Yes |
| DeepSeek | DeepSeek V3, DeepSeek Coder | Yes |
| Groq | Llama 4, Llama 3, Mixtral | Yes |
| OpenRouter | 200+ models | Yes |
| Custom OpenAI-Compatible | Any OpenAI-compatible API | Yes |

---

## Requirements

- **Node.js** 18.0 or higher
- **Python** 3.8 or higher
- **pip** (Python package manager)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/urchinai/browser.git
cd browser
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python backend dependencies
pip install -r backend/requirements.txt
```

### 3. Configure AI Provider

Create a configuration file at `~/.nanobot/config.json`:

```json
{
  "providers": {
    "openai": {
      "apiKey": "your-api-key-here",
      "apiBase": ""
    }
  },
  "agents": {
    "defaults": {
      "provider": "openai",
      "model": "gpt-4o"
    }
  }
}
```

### 4. Run the Application

```bash
# Development mode with hot reload
npm run dev

# Production build and run
npm run build && npm start
```

---

## Build for Distribution

### Build for Current Platform

```bash
npm run dist
```

### Platform-Specific Builds

| Command | Output |
|---------|--------|
| `npm run dist:win` | Windows `.exe` (installer + portable) |
| `npm run dist:linux` | Linux `.deb` package |

Build outputs are placed in the `release/` directory.

---

## Project Structure

```
urchinai-browser/
├── electron/              # Electron main process
│   ├── main.js           # Application entry point
│   └── preload.js        # IPC bridge
├── src/                   # React frontend
│   ├── components/       # UI components
│   ├── hooks/            # Custom React hooks
│   ├── locales/          # i18n translations
│   └── App.tsx           # Main React component
├── backend/               # Python FastAPI backend
│   ├── main.py           # FastAPI server
│   ├── agent/            # AI agent implementation
│   │   ├── manager.py    # Agent orchestration
│   │   └── browser_tool.py # Browser control tools
│   └── api/              # REST API endpoints
├── docs/                  # Documentation and screenshots
└── release/              # Build output directory
```

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    UrchinAI Browser                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   React UI  │◄──►│  Electron   │◄──►│  BrowserView│     │
│  │  (Frontend) │    │   (Main)    │    │  (WebView)  │     │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘     │
│         │                  │                                  │
│         │    WebSocket     │ HTTP Bridge (localhost:8002)   │
│         ▼                  ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Python Backend (FastAPI)                │    │
│  │  ┌─────────────┐    ┌─────────────────────────────┐ │    │
│  │  │ AgentManager│───►│  BrowserTools (HTTP calls)  │ │    │
│  │  └──────┬──────┘    └─────────────────────────────┘ │    │
│  │         │                                             │    │
│  │         ▼                                             │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │     LiteLLM (Multi-provider LLM Gateway)    │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### AI Agent Workflow

1. **User Input**: User types a natural language command in the chat panel
2. **LLM Processing**: The agent sends the request to the configured LLM provider
3. **Tool Selection**: LLM decides which browser tools to use (navigate, click, type, etc.)
4. **Browser Control**: Tools execute actions via the Electron HTTP bridge
5. **Response Streaming**: Results are streamed back to the UI in real-time

---

## Browser Agent Tools

The AI agent has access to the following browser control tools:

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a specific URL |
| `browser_click` | Click on page elements using @N notation or CSS selectors |
| `browser_type` | Type text into input fields |
| `browser_get_dom` | Get interactive elements list with @N identifiers |
| `browser_screenshot` | Capture page screenshot for visual analysis |
| `browser_scroll` | Scroll the page up or down |
| `browser_press_key` | Simulate keyboard input (Enter, Tab, Escape, etc.) |
| `browser_new_tab` | Open a new browser tab |
| `browser_switch_tab` | Switch to a specific tab |
| `browser_get_page_content` | Extract main content from the page |

---

## Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute

- **Report Bugs**: Open an issue with detailed reproduction steps
- **Suggest Features**: Share your ideas in the discussions
- **Submit Pull Requests**: Fix bugs or add new features
- **Improve Documentation**: Help make our docs better
- **Translate**: Add support for more languages

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/browser.git

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes and test
npm run dev

# Submit a pull request
```

---

## Roadmap

- [ ] Voice input support for AI commands
- [ ] Browser extension support
- [ ] Custom agent skills and workflows
- [ ] Cloud sync for bookmarks and settings
- [ ] Mobile companion app
- [ ] MCP (Model Context Protocol) integration

---

## FAQ

### Which AI model should I use?

For best results, we recommend models with **computer use** capabilities (visual understanding + precise control):

1. **GPT-5.4** (with Computer Use) — Best-in-class browser automation
2. **Claude Sonnet 4.6** — Excellent for complex reasoning tasks
3. **GLM-5** — Strong performance for Chinese users
4. **Kimi 2.5** — Great for long-context scenarios
5. **MiniMax m2** — Cost-effective with solid performance

### Is my data sent to external servers?

Only your AI prompts are sent to your configured LLM provider. All browsing data stays on your local machine.

### Can I use this without an AI provider?

Yes! UrchinAI Browser works as a regular browser even without AI configuration. The AI features are optional.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [React](https://react.dev/) - UI framework
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [LiteLLM](https://github.com/BerriAI/litellm) - Unified LLM interface
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework

---

<div align="center">

**[Report Bug](https://github.com/urchinai/browser/issues) · [Request Feature](https://github.com/urchinai/browser/issues) · [Join Discussion](https://github.com/urchinai/browser/discussions)**

Made with ❤️ by the UrchinAI Team

</div>