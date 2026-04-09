#!/bin/bash
# Post-installation script for UrchinAI
# Fix chrome-sandbox permissions for Electron

set -e

SANDBOX="/opt/UrchinAI/chrome-sandbox"
BACKEND_BIN="/opt/UrchinAI/resources/backend/urchinai-backend"

if [ -f "$SANDBOX" ]; then
    chown root:root "$SANDBOX" 2>/dev/null || true
    chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

# Ensure bundled backend is executable (some packaging environments may drop +x bit)
if [ -f "$BACKEND_BIN" ]; then
    chmod +x "$BACKEND_BIN" 2>/dev/null || true
fi

exit 0