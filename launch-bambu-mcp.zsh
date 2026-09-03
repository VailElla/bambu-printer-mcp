#!/bin/zsh

# Launch the local Bambu MCP with printer metadata from the credential-free
# project config and the LAN access code read just-in-time from macOS Keychain.
# The access code is never written to disk or included in the process argv.

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
MONITOR_CONFIG="${PROJECT_ROOT}/bambu-monitor/config.json"
CA_CERT="${PROJECT_ROOT}/bambu-monitor/certs/bbl-device-ca-n6-v2.pem"

if [[ ! -r "$MONITOR_CONFIG" ]]; then
  print -u2 "Missing local Bambu monitor config: $MONITOR_CONFIG"
  exit 1
fi
if [[ ! -r "$CA_CERT" ]]; then
  print -u2 "Missing pinned Bambu device CA: $CA_CERT"
  exit 1
fi

PRINTER_HOST="$(/usr/bin/jq -er '.host // empty' "$MONITOR_CONFIG")"
BAMBU_SERIAL="$(/usr/bin/jq -er '.serial // empty' "$MONITOR_CONFIG")"
KEYCHAIN_SERVICE="$(/usr/bin/jq -er '.keychain_service // empty' "$MONITOR_CONFIG")"
KEYCHAIN_ACCOUNT="$(/usr/bin/jq -er '.keychain_account // empty' "$MONITOR_CONFIG")"
BAMBU_TOKEN="$(/usr/bin/security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w)"

if [[ -z "$PRINTER_HOST" || -z "$BAMBU_SERIAL" || -z "$BAMBU_TOKEN" ]]; then
  print -u2 "Bambu MCP configuration or Keychain access code is incomplete"
  exit 1
fi

export PRINTER_HOST
export BAMBU_SERIAL
export BAMBU_TOKEN
export BAMBU_MODEL="x2d"
export BAMBU_CA_CERT="$CA_CERT"
export BED_TYPE="textured_plate"
export NOZZLE_DIAMETER="0.4"
export SLICER_TYPE="bambustudio"
export SLICER_PATH="/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"
export TEMP_DIR="${SCRIPT_DIR}/temp"
export MCP_TRANSPORT="stdio"
# Prefer the scriptable local X2D route. The explicit bambu_connect mode is
# still available when a cloud-mode handoff is intentionally needed.
export BAMBU_DEFAULT_CONNECTION_MODE="bambu_native"
export BAMBU_NATIVE_HELPER="${SCRIPT_DIR}/native/bambu-native-print"
# Bambu Connect carries the networking plug-in version validated for X2D's
# local tunnel. Keep Bambu Studio's copy as a fallback for older installs.
if [[ -r "/Applications/Bambu Connect.app/Contents/Resources/app.asar.unpacked/plugins/plugins-mac/libbambu_networking.dylib" ]]; then
  export BAMBU_NATIVE_PLUGIN="/Applications/Bambu Connect.app/Contents/Resources/app.asar.unpacked/plugins/plugins-mac/libbambu_networking.dylib"
fi

if [[ -z "${NODE_BIN:-}" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [[ -x "/usr/local/bin/node" ]]; then
    NODE_BIN="/usr/local/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  print -u2 "Node.js is required to run bambu-printer-mcp"
  exit 1
fi

cd "$SCRIPT_DIR"
exec "$NODE_BIN" "$SCRIPT_DIR/dist/index.js"
