# -*- mode: python ; coding: utf-8 -*-
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── 用 collect_all 完整收集关键包 ──────────────────────────────────────────
all_datas     = []
all_binaries  = []
all_hidden    = []

for pkg in ['litellm', 'openai', 'anthropic', 'tiktoken', 'httpx', 'httpcore', 'pydantic', 'pydantic_core']:
    try:
        d, b, h = collect_all(pkg)
        all_datas    += d
        all_binaries += b
        all_hidden   += h
        print(f'[spec] collect_all {pkg}: {len(d)} datas, {len(b)} bins, {len(h)} hidden')
    except Exception as e:
        print(f'[spec] WARNING: collect_all {pkg} failed: {e}')

# ── Hidden imports ─────────────────────────────────────────────────────────
hidden_imports = all_hidden + [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'httptools',
    'starlette',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'anyio',
    'anyio._backends._asyncio',
    'sniffio',
    'h11',
    'websockets',
    'multipart',
    'nanobot',
    'nanobot.config',
    'nanobot.config.loader',
    'nanobot.config.schema',
    'nanobot.providers',
    'nanobot.providers.base',
    'nanobot.agent',
    'nanobot.agent.skills',
    'nanobot.agent.tools',
    'nanobot.agent.tools.base',
    'nanobot.agent.tools.registry',
    'nanobot.agent.tools.filesystem',
    'nanobot.agent.tools.shell',
    'nanobot.agent.tools.web',
    'nanobot.agent.hook',
    'nanobot.agent.runner',
    'agent',
    'agent.manager',
    'agent.browser_tool',
    # tiktoken
    'tiktoken_ext',
    'tiktoken_ext.openai_public',
    # litellm 子模块 - 确保完整打包
    'litellm',
    'litellm.main',
    'litellm.utils',
    'litellm.litellm_core_utils',
    'litellm.litellm_core_utils.core_helpers',
    'litellm.types',
    'litellm.types.utils',
    'litellm.integrations',
    'litellm.llms',
    'litellm.llms.openai',
    'litellm.llms.openai.chat',
    'litellm.llms.openai.completion',
    'litellm.llms.anthropic',
    'litellm.llms.custom_httpx',
    'litellm.timeout',
    'litellm.exceptions',
    'litellm.caching',
    'litellm._logging',
]

excludes = [
    'tkinter', 'torch', 'torchvision', 'torchaudio',
    'tensorflow', 'keras', 'jax', 'scipy',
    'matplotlib', 'PIL', 'cv2', 'sklearn',
    'transformers', 'diffusers', 'accelerate',
    'safetensors', 'huggingface_hub',
    # 'tokenizers' 移除，litellm 依赖它
    'sentencepiece', 'gradio', 'langflow',
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='urchinai-backend',
    debug=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    bootloader_ignore_signals=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)