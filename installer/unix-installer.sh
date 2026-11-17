#!/bin/sh
# ClaudeBridge all-in-one installer for macOS and Linux.
set -eu
MODE=install
PURGE_DATA=0
for opt in "$@"; do
  if [ "$opt" = "--purge-data" ]; then PURGE_DATA=1; fi
done
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
      2)
        MODE=uninstall
        printf "Also permanently delete saved ClaudeBridge plans, settings and registered project memory? [y/N]: "
        read -r DELETE_ANSWER
        case "$DELETE_ANSWER" in
          y|Y|yes|YES) PURGE_DATA=1 ;;
        esac
        ;;
      *) exit 0 ;;
    esac
  else
    echo "Installing ClaudeBridge MCP and the official Code-tab Mod..."
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
if [ "$MODE" = "install" ]; then
  # Install the bundled ClaudeBridge MCP first, then register the official
  # Claude Code Mod from the private CLI already included in this archive.
  RESULT=$("$NODE" "$TEMP_ROOT/installer/setup.js" install)
  printf '%s\n' "$RESULT"
  if [ -z "${CLAUDEBRIDGE_SETUP_TEST_HOME:-}" ]; then
    INSTALLED_ROOT=$(printf '%s\n' "$RESULT" | "$NODE" -e '
      let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
        const info=JSON.parse(s);if(!info.ok||!info.installPath)process.exit(2);
        process.stdout.write(info.installPath);
      });')
    MOD_RESULT=$("$NODE" "$INSTALLED_ROOT/installer/mod-install.js" "$INSTALLED_ROOT")
    printf '%s\n' "$MOD_RESULT"
    if ! printf '%s\n' "$MOD_RESULT" | "$NODE" -e '
      let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
        const info=JSON.parse(s);if(!info.installed||!info.verified)process.exit(2);
      });'; then
      echo "ClaudeBridge MCP installed, but the Code Mod could not be activated. Run this installer again after checking Claude Code plugin permissions." >&2
      exit 2
    fi
  fi
  exit 0
fi
if [ "$MODE" = "uninstall" ] && [ "$PURGE_DATA" = "1" ]; then
  "$NODE" "$TEMP_ROOT/installer/setup.js" "$MODE" --purge-data
else
  "$NODE" "$TEMP_ROOT/installer/setup.js" "$MODE"
fi
