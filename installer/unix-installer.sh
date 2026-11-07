#!/bin/sh
# ClaudeBridge all-in-one installer for macOS and Linux.
set -eu
MODE=install
case "${1:-}" in
  --uninstall|uninstall) MODE=uninstall ;;
  --status|status) MODE=status ;;
  ""|--install|install) MODE=install ;;
  *) echo "Usage: $0 [--install|--uninstall|--status]" >&2; exit 2 ;;
esac
if [ "$#" -eq 0 ]; then
  case "$(uname -s)" in
    Darwin) INSTALLED="$HOME/Library/Application Support/ClaudeBridge/Installed/installer-owned.json" ;;
    Linux) INSTALLED="$HOME/.local/share/claudebridge/Installed/installer-owned.json" ;;
    *) INSTALLED="" ;;
  esac
  if [ -n "$INSTALLED" ] && [ -f "$INSTALLED" ]; then
    echo "ClaudeBridge is installed."
    echo "1) Update / Repair"
    echo "2) Uninstall"
    echo "3) Cancel"
    printf "Select [1-3]: "
    read -r CHOICE
    case "$CHOICE" in
      1) MODE=install ;;
      2) MODE=uninstall ;;
      *) exit 0 ;;
    esac
  else
    echo "Installing ClaudeBridge MCP and native model-menu controls..."
  fi
fi
case "$(uname -s)" in
  Darwin|Linux) ;;
  *) echo "This installer is for macOS and Linux only." >&2; exit 2 ;;
esac
umask 077
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/claudebridge-setup.XXXXXXXX") || exit 1
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
PAYLOAD_LINE=__PAYLOAD_LINE__
if ! tail -n +"$PAYLOAD_LINE" "$0" | tar -xz -C "$TEMP_ROOT"; then
  echo "Unable to unpack the embedded ClaudeBridge payload." >&2
  exit 1
fi
NODE="$TEMP_ROOT/integrations/native-ui/node"
if [ ! -f "$NODE" ]; then
  echo "Bundled Node runtime missing." >&2
  exit 1
fi
chmod 700 "$NODE"
"$NODE" "$TEMP_ROOT/installer/setup.js" "$MODE"
exit "$?"
