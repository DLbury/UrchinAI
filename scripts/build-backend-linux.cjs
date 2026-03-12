#!/usr/bin/env node
/**
 * Build backend binary for Linux (PyInstaller). No-op on non-Linux.
 * Used by npm run dist:linux so the bundled backend is included when building on Linux.
 */
const { execSync } = require('child_process');
const path = require('path');

if (process.platform !== 'linux') {
  console.log('[build:backend:linux] Skip (not Linux)');
  process.exit(0);
}

const backendDir = path.join(__dirname, '..', 'backend');
const script = path.join(backendDir, 'build_exe.py');
execSync(`python3 "${script}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
