# UrchinAI 浏览器 — 打包说明

## 前置要求

- Node.js 18+
- Python 3.8+（运行 AI 后端）
- 目标系统需安装：`pip install -r backend/requirements.txt`

## 打包命令

### Linux 下打包 deb

```bash
npm run dist:linux
```

产物：`release/urchin-electron_0.1.0_amd64.deb`

安装：`sudo dpkg -i release/urchin-electron_0.1.0_amd64.deb`

### Windows 下打包 exe

在 Windows 上执行：

```bash
npm run dist:win
```

产物：
- `release/UrchinAI 浏览器 Setup 0.1.0.exe`（安装包）
- `release/UrchinAI 浏览器 0.1.0.exe`（便携版）

### Linux 下交叉打包 Windows exe

需安装 Wine：

```bash
# Ubuntu/Debian
sudo apt install wine

# 然后执行
npm run dist:win
```

### 仅打包当前平台

```bash
npm run dist
```

- 在 Linux 上：生成 deb
- 在 Windows 上：生成 exe

## 首次运行

打包后的应用会依赖系统 Python 环境。首次使用前请安装后端依赖：

```bash
# Linux（deb 安装后）
cd /opt/UrchinAI\ 浏览器/resources/backend
pip3 install -r requirements.txt

# 或从源码目录
cd backend
pip install -r requirements.txt
```

## 产物目录

```
release/
├── urchin-electron_0.1.0_amd64.deb   # Linux deb 包
├── UrchinAI 浏览器 Setup 0.1.0.exe     # Windows 安装包
├── UrchinAI 浏览器 0.1.0.exe           # Windows 便携版
└── linux-unpacked/                    # Linux 解压目录
```
