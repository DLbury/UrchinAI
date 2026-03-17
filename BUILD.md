# UrchinAI — 打包说明

## GitHub Actions 在线构建

项目已配置 GitHub Actions，支持在线编译打包：

### 触发方式

1. **发布版本**：推送 `v*` 格式的 tag（如 `v0.1.0`）到 main 分支
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   构建完成后会自动创建 GitHub Release，并附带 Linux `.deb` 和 Windows `.exe` 安装包。

2. **手动构建**：在 GitHub 仓库页面 → Actions → Build and Release → Run workflow
   构建产物可在该次运行的 Artifacts 中下载。

### 构建平台

- Linux：`.deb` 安装包
- Windows：安装包 + 便携版 `.exe`

---

## 前置要求（仅构建时需要）

- Node.js 18+
- Python 3.8+ 与 `pip install -r backend/requirements.txt`、`pip install pyinstaller`（用于打包后端；**最终用户无需安装 Python**）

## 打包命令

### Linux 下打包 deb（含内置后端）

在 **Linux** 上执行（会先打包后端为单二进制，再打包 Electron）：

```bash
npm run dist:linux
```

流程：`npm run build` → `build:backend:linux`（PyInstaller 生成 `backend/urchinai-backend`）→ electron-builder 打包。安装后用户无需安装 Python，主程序启动时后端自动启动。

产物：`release/urchin-electron_0.1.0_amd64.deb`

安装：`sudo dpkg -i release/urchin-electron_0.1.0_amd64.deb`

### Windows 下打包 exe（含内置 Python 后端）

在 **Windows** 上执行（会先打包后端为单 exe，再打包 Electron，无需用户本机安装 Python）：

```bash
npm run dist:win
```

流程：`npm run build` → `build:backend:win`（PyInstaller 生成 `backend/urchinai-backend.exe`）→ electron-builder 打包。

产物：
- `release/UrchinAI Setup 0.1.0.exe`（安装包）
- `release/UrchinAI 0.1.0.exe`（便携版）

**依赖**：本机需安装 Python 3.8+ 和 `pip install -r backend/requirements.txt` 以及 `pip install pyinstaller`，仅用于**构建**；最终用户无需安装 Python。

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

需**内置后端**时请使用 `npm run dist:linux` 或 `npm run dist:win`。

## 首次运行

**安装包/便携版（exe 或 deb）**：所有依赖已打包，后端随主程序自动启动，**用户无需安装 Python 或任何额外依赖**。

**从源码运行**（`npm run dev` / `npm start`）：需本机安装 Python 3.8+，并在 `backend` 目录执行 `pip install -r requirements.txt`。

## 产物目录

```
release/
├── urchin-electron_0.1.0_amd64.deb   # Linux deb 包
├── UrchinAI Setup 0.1.0.exe     # Windows 安装包
├── UrchinAI 0.1.0.exe           # Windows 便携版
└── linux-unpacked/                    # Linux 解压目录
```
