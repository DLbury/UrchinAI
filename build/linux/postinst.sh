#!/bin/bash
# Post-installation script for UrchinAI
# Fix chrome-sandbox permissions for Electron

set -e

SANDBOX="/opt/UrchinAI/chrome-sandbox"

if [ -f "$SANDBOX" ]; then
    chown root:root "$SANDBOX" 2>/dev/null || true
    chmod 4755 "$SANDBOX" 2>/dev/null || true
fi

exit 0