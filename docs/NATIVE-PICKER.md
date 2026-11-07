# Native Claude Desktop model-menu controls

Status: **ClaudeBridge 2.3.0 experimental Windows companion**. Source and CI smoke tests are present. An authenticated, real Claude Desktop installation has **not** yet been verified.

## What this implementation changes

The Windows companion augments the **existing** Claude Desktop model-picker menu with a ClaudeBridge control section:

- **Off** — Codex delegation disabled
- **On demand** — user-directed delegation
- **Fallback** — only user-requested or externally confirmed handoff; there is no supported automatic quota signal
- **Dual agents** — Claude and Codex can work concurrently on separate tasks
- **Codex installed / connected** — determined from the bundled Codex CLI
- **Connect Codex** — starts a user-approved ChatGPT device sign-in
- **Install / Repair** — opens the official project's release download

The selected Claude model remains unchanged. Settings are written to `~/.claudebridge/settings.json` and take effect through the existing ClaudeBridge MCP tools. The mode selector does **not** substitute Codex as a native Claude model.

## How it works

1. Install the standard ClaudeBridge Windows `.mcpb` extension with bundled Codex CLI and runtime.
2. In Claude, open **ClaudeBridge settings** and click **Enable in model menu**. The extension's `bridge_native_picker` tool runs the bundled PowerShell installer with ordinary user permissions.
3. The installer copies `node.exe`, the native companion, its renderer script, and settings module to `%LOCALAPPDATA%\ClaudeBridge\NativePicker`. It creates two shortcuts named **ClaudeBridge Claude** (Desktop and Start Menu). Original Claude files and shortcuts are left untouched.
4. Fully quit Claude and launch using **ClaudeBridge Claude**. The companion spawns the original `Claude.exe` with `--remote-debugging-pipe`, then connects via inherited anonymous pipes (descriptors 3 and 4), attaches to Claude pages and injects DOM controls into recognized model menus.
5. Each control sends a narrow, validated action through a CDP Runtime binding to the local companion, which writes the same settings as the MCP extension. No third-party proxy, TLS certificate, or replacement Claude model is involved.
6. Uninstall using **Remove integration** from the MCP App settings; remove the shortcuts and copied companion. Claude continues to work through its original shortcut, while MCP remains untouched.

## Security boundaries

- No HTTPS traffic interception, certificate installation, credentials forwarding or open debugging TCP port.
- The renderer receives only `status`, `set-mode`, `login`, and `repair` actions. It cannot execute arbitrary commands.
- The companion attaches only to pages with the `claude.ai` hostname or a Claude-specific local `file:` path.
- Model-selector controls are additive. The original model IDs and items are not changed.
- Login tokens remain with Codex CLI. Device codes displayed for authorization are kept in a user-local temporary log.
- Install/remove operations operate under the current Windows user and do not require administrator rights.
- A running Claude instance must be fully closed before starting the enhanced launcher.

## Verification

GitHub Actions tests on Windows, macOS and Linux:

- `tests/native-picker.js` — simulates a model picker in a DOM and verifies group insertion, mode selection and original model preservation.
- `tests/native-cdp.js` — exercises the debugging-pipe protocol, host binding dispatch, target selection and session cleanup using a mock Chromium endpoint.
- `tests/native-install.ps1` (Windows only) — safely tests installation, shortcut creation, status and rollback in an isolated directory.

These tests **cannot** guarantee that a particular Claude Desktop version uses a recognized menu structure or accepts the debugging-pipe launch switch. The Microsoft Store packaged version may use a launch pathway not supported by the shortcut installer.

## Reference project and licensing

[ClaudeRipple](https://github.com/PBJ-2/clauderipple) demonstrated custom model entries in the **Code** surface through a local HTTPS proxy and model bootstrap modification. ClaudeBridge's Windows companion is an independently implemented **renderer-control approach** and does not copy ClaudeRipple code or require its GPL components. The older pure adapter `integrations/picker.js` remains a test prototype and is not installed or routed.

## Recovery

If Claude does not open through the enhanced shortcut, quit all Claude instances and use your original Claude shortcut. Then remove the optional integration in ClaudeBridge settings. No original Claude installation files were modified.

If Claude opens but the model menu does not show ClaudeBridge, the app may have changed the menu DOM, or the enhanced debugging pipe may not have attached. Check the terminal output of the companion launcher and report your Claude Desktop version. The MCP extension remains usable regardless.
