# UrchinAI 浏览器

AI-powered browser with built-in agent that can control web pages, search, fill forms, and automate tasks. Built with Electron + React + Python backend.

## Features

- **AI Agent**: Control browser via natural language (navigate, click, type, search)
- **Multi-tab**: Tab management with drag-to-reorder and detach to new window
- **Bookmarks & History**: Built-in bookmark and browsing history
- **Sessions**: Save and restore tab sessions
- **Ad Blocking**: Built-in ad blocker (toggle in settings)
- **Reading Mode**: Clean reading view for articles
- **Light/Dark Theme**: Switch between day and night mode
- **i18n**: Chinese and English support

## Requirements

- Node.js 18+
- Python 3.8+
- pip: `pip install -r backend/requirements.txt`

## Quick Start

```bash
# Install dependencies
npm install

# Install Python backend deps
pip install -r backend/requirements.txt

# Development
npm run dev

# Production
npm run build && npm start
```

## Build

| Command | Output |
|---------|--------|
| `npm run dist` | Build for current platform |
| `npm run dist:linux` | Linux `.deb` |
| `npm run dist:win` | Windows `.exe` (installer + portable) |

See [BUILD.md](BUILD.md) for details.

## Project Structure

```
├── electron/          # Electron main process
├── src/               # React frontend
│   ├── components/
│   ├── hooks/
│   ├── locales/       # i18n translations
│   └── ...
├── backend/           # Python FastAPI + agent
└── release/           # Build output
```

## License

MIT
