#!/usr/bin/env node
/**
 * Build backend exe for Windows (PyInstaller). No-op on non-Windows.
 * Used by npm run dist:win so the bundled exe is included when building on Windows.
 */
const { execSync } = require('child_process');
const path = require('path');

if (process.platform !== 'win32') {
  console.log('[build:backend:win] Skip (not Windows)');
  process.exit(0);
}

const backendDir = path.join(__dirname, '..', 'backend');
const script = path.join(backendDir, 'build_exe.py');
execSync(`python "${script}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
