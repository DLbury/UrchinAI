#!/usr/bin/env python3
"""
Build UrchinAI backend into a single executable (Windows .exe or Linux binary).
Run from repo root: python backend/build_exe.py
Requires: pip install pyinstaller
Copies the binary to backend/urchinai-backend[.exe] so electron-builder packs it.
"""
from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys

def main():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    spec = os.path.join(backend_dir, "urchinai-backend.spec")
    if not os.path.isfile(spec):
        print("Spec not found:", spec)
        sys.exit(1)
    os.chdir(backend_dir)
    r = subprocess.call([sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", spec])
    if r != 0:
        sys.exit(r)
    is_win = sys.platform == "win32"
    name = "urchinai-backend.exe" if is_win else "urchinai-backend"
    exe_src = os.path.join(backend_dir, "dist", name)
    exe_dst = os.path.join(backend_dir, name)
    if not os.path.isfile(exe_src):
        print("Expected binary not found:", exe_src)
        sys.exit(1)
    shutil.copy2(exe_src, exe_dst)
    if not is_win:
        os.chmod(exe_dst, os.stat(exe_dst).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print("Built and copied to:", exe_dst)

if __name__ == "__main__":
    main()
