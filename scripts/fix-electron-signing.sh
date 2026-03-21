#!/bin/bash
# Re-sign Electron.app for macOS 26 Tahoe compatibility.
# macOS 26's SecCodeCheckValidity rejects the upstream ad-hoc signature,
# preventing Electron's JS bootstrap (lib/common/init.ts) from executing.

if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

ELECTRON_APP="node_modules/electron/dist/Electron.app"
if [ ! -d "$ELECTRON_APP" ]; then
  exit 0
fi

ENTITLEMENTS="build/entitlements.mac.plist"
if [ ! -f "$ENTITLEMENTS" ]; then
  echo "[fix-electron-signing] entitlements file not found: $ENTITLEMENTS"
  exit 1
fi

echo "[fix-electron-signing] Re-signing $ELECTRON_APP ..."
codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$ELECTRON_APP" 2>&1
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo "[fix-electron-signing] Done."
else
  echo "[fix-electron-signing] codesign exited with status $STATUS"
  exit $STATUS
fi
