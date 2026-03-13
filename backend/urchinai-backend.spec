# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for UrchinAI backend (one-file binary: .exe on Windows, no ext on Linux).
# Run from backend dir: pyinstaller urchinai-backend.spec

import sys
import site
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

site_packages = site.getsitepackages()[0]
# Try conda site-packages if default doesn't work
try:
    import litellm
    litellm_path = litellm.__path__[0]
except ImportError:
    litellm_path = None

block_cipher = None

# Hidden imports required by FastAPI, Uvicorn, and dependencies
hidden_imports = [
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
    'watchfiles',
    'pydantic',
    'pydantic_core',
    'multipart',
    'starlette',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'anyio',
    'anyio._backends',
    'anyio._backends._asyncio',
    'sniffio',
    'httpx',
    'httpcore',
    'h11',
    'websockets',
    'nanobot_ai',
    # Agent module
    'agent',
    'agent.manager',
    'agent.browser_tool',
]

# Automatically collect all litellm submodules
try:
    litellm_hidden = collect_submodules('litellm')
    hidden_imports.extend(litellm_hidden)
    print(f'[PyInstaller] Added {len(litellm_hidden)} litellm submodules')
except Exception as e:
    print(f'[PyInstaller] Warning: Could not collect litellm submodules: {e}')

# Also collect openai submodules
try:
    openai_hidden = collect_submodules('openai')
    hidden_imports.extend(openai_hidden)
    print(f'[PyInstaller] Added {len(openai_hidden)} openai submodules')
except Exception as e:
    print(f'[PyInstaller] Warning: Could not collect openai submodules: {e}')

# Data files needed by litellm
datas = []
if litellm_path:
    import glob
    json_files = glob.glob(f'{litellm_path}/*.json')
    for f in json_files:
        datas.append((f, 'litellm'))
    print(f'[PyInstaller] Adding {len(datas)} litellm data files from {litellm_path}')

# Also collect litellm data files using PyInstaller hook
try:
    litellm_datas = collect_data_files('litellm')
    datas.extend(litellm_datas)
    print(f'[PyInstaller] Added {len(litellm_datas)} litellm data files via hook')
except Exception as e:
    print(f'[PyInstaller] Warning: Could not collect litellm data files: {e}')

# Exclude heavy ML libraries that are not needed for browser automation
excludes = [
    'tkinter',
    'torch',
    'torchvision',
    'torchaudio',
    'tensorflow',
    'keras',
    'jax',
    'flax',
    'numpy.f2py',
    'scipy',
    'pandas',
    'matplotlib',
    'PIL',
    'cv2',
    'sklearn',
    'transformers',
    'diffusers',
    'accelerate',
    'safetensors',
    'huggingface_hub',
    'tokenizers',
    'sentencepiece',
    'tqdm',
    'gradio',
    'langflow',
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
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
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window on Windows
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
