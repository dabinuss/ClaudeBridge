#!/bin/sh
# Thin online launcher. Never executes a downloaded script over a pipe.
# The project core is pinned to a SHA256 recorded when this setup was built.
set -eu
MODE=install
PURGE=0
case "${1:-}" in
  --uninstall|uninstall) MODE=uninstall ;;
  --status|status) MODE=status ;;
  --verify-core) MODE=verify-core ;;
  ""|--install|install) MODE=install ;;
  *) echo "Usage: $0 [--install|--uninstall|--status] [--purge-data]" >&2; exit 2 ;;
esac
for arg in "$@"; do [ "$arg" = "--purge-data" ] && PURGE=1 || true; done
case "$(uname -s)" in Darwin) PLATFORM=darwin ;; Linux) PLATFORM=linux ;; *) echo "Unsupported OS" >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "Unsupported CPU architecture" >&2; exit 1 ;; esac
case "$PLATFORM-$ARCH" in darwin-arm64|darwin-x64|linux-x64|linux-arm64) ;; *) exit 1 ;; esac
if [ -n "${CLAUDEBRIDGE_SETUP_TEST_HOME:-}" ]; then
  INSTALL="$CLAUDEBRIDGE_SETUP_TEST_HOME/Installed"
elif [ "$PLATFORM" = darwin ]; then
  INSTALL="$HOME/Library/Application Support/ClaudeBridge/Installed"
else
  INSTALL="$HOME/.local/share/claudebridge/Installed"
fi
if [ "$#" -eq 0 ] && [ -f "$INSTALL/installer-owned.json" ]; then
  echo "ClaudeBridge already installed. 1) Update/repair  2) Uninstall  3) Cancel"
  printf "Select [1-3]: "; read -r reply
  case "$reply" in
    1) MODE=install ;;
    2)
      MODE=uninstall
      printf "Delete ClaudeBridge settings/plans/project memory as well? [y/N]: "
      read -r reply2
      case "$reply2" in y|Y|yes|YES) PURGE=1 ;; esac ;;
    *) exit 0 ;;
  esac
fi
if [ "$MODE" = uninstall ] || [ "$MODE" = status ]; then
  if [ -x "$INSTALL/integrations/native-ui/node" ] && [ -f "$INSTALL/installer/setup.js" ]; then
    if [ "$MODE" = uninstall ] && [ "$PURGE" -eq 1 ]; then
      exec "$INSTALL/integrations/native-ui/node" "$INSTALL/installer/setup.js" uninstall --purge-data
    fi
    exec "$INSTALL/integrations/native-ui/node" "$INSTALL/installer/setup.js" "$MODE"
  fi
  echo "ClaudeBridge is not installed."
  exit 0
fi
umask 077
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/claudebridge-online.XXXXXXXX") || exit 1
trap 'rm -rf "$TMPROOT"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
CORE="$TMPROOT/core.tar.gz"
# The complete compiled ClaudeBridge application is embedded after this script.
# No GitHub request is needed to retrieve any ClaudeBridge-owned files.
PAYLOAD_LINE=__PAYLOAD_LINE__
tail -n +"$PAYLOAD_LINE" "$0" > "$CORE"
mkdir "$TMPROOT/core"
if ! tar -xzf "$CORE" -C "$TMPROOT/core"; then
  echo "The embedded ClaudeBridge application is damaged." >&2
  exit 1
fi
if [ "$MODE" = "verify-core" ]; then
  echo "Embedded ClaudeBridge application extracted successfully."
  exit 0
fi
NODE_VERSION="22.23.4"
NODE_ARCHIVE="node-v$NODE_VERSION-$PLATFORM-$ARCH.tar.gz"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION"
if [ "$MODE" != "verify-core" ] && ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download verified dependencies." >&2
  exit 1
fi
download(){ curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 --retry 2 --output "$2" "$1"; }
sha256(){
 if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
 else sha256sum "$1" | awk '{print $1}'; fi
}
echo "Downloading Node.js $NODE_VERSION from nodejs.org..."
download "$NODE_URL/$NODE_ARCHIVE" "$TMPROOT/$NODE_ARCHIVE"
download "$NODE_URL/SHASUMS256.txt" "$TMPROOT/SHASUMS256.txt"
EXPECTED=$(awk -v name="$NODE_ARCHIVE" '$2==name{print $1}' "$TMPROOT/SHASUMS256.txt")
if [ -z "$EXPECTED" ] || [ "$(sha256 "$TMPROOT/$NODE_ARCHIVE")" != "$EXPECTED" ]; then
  echo "Node.js checksum mismatch; installation stopped." >&2; exit 1
fi
mkdir "$TMPROOT/runtime"
tar -xzf "$TMPROOT/$NODE_ARCHIVE" -C "$TMPROOT/runtime" --strip-components=1
export CLAUDEBRIDGE_NPM_CLI="$TMPROOT/runtime/lib/node_modules/npm/bin/npm-cli.js"
"$TMPROOT/runtime/bin/node" "$TMPROOT/core/installer/online-deps.js" install
