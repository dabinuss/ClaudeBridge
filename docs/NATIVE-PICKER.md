# Native Claude Desktop model-menu integration

**ClaudeBridge 2.4 Preview — Windows, macOS and Linux**

ClaudeBridge adds a control group to the **existing model dropdown** of Claude Desktop. The control group manages the ClaudeBridge agent modes and Codex account. It **does not** substitute a Claude model, intercept model API requests, or replace the original MCP bridge.

## Options

- **Off:** Disable new Codex delegations
- **On demand:** Use Codex when explicitly requested
- **Fallback:** Accept explicit handoff on user request or verified limit; Claude Desktop exposes no supported automatic subscription-quota event to MCP
- **Dual agents:** Allow parallel Claude/Codex tasks and shared project memory
- **Codex account status and login:** Show whether Codex CLI is available and signed in to ChatGPT; allow the user to start device authorization
- **Install / Repair:** Open ClaudeBridge's release installer page

All modes use the same persistent user/project settings as ClaudeBridge MCP.

## User-scoped installation and removal

Install the matching platform-specific ClaudeBridge MCPB through Claude Desktop. In the Claude conversation, ask **Open ClaudeBridge settings** and click **Enable in model menu**. Quit Claude fully and use the new **ClaudeBridge Claude** shortcut.

| Platform | Native launcher |
| --- | --- |
| Windows | Desktop and Start Menu shortcuts; implemented in integrations/native-ui/install.ps1 |
| macOS | User app at ~/Applications/ClaudeBridge Claude.app |
| Linux | ~/.local/share/applications/claudebridge-claude.desktop; Desktop shortcut when the Desktop folder exists |

macOS and Linux use integrations/native-ui/setup-unix.js to install and remove only ClaudeBridge-owned files.

**Remove integration** removes the optional model-menu launcher without affecting the original Claude client or its MCP extension. To remove ClaudeBridge fully, uninstall the MCPB in Claude Desktop's Extensions settings; optionally run maintenance/cleanup.ps1 (Windows) or maintenance/cleanup-unix.js (macOS/Linux) to remove user settings and selected registered project memories.

## Architecture

The platform-specific installer bundles a local Node runtime and companion, finds the installed Claude executable, and starts it with Chromium's local debugging **pipe**. The companion targets only Claude renderer URLs and inserts the UI controls in recognized model dropdowns. Control actions are restricted to status, set-mode, login and repair. There is **no** open debugging TCP port, HTTPS interception, system-trusted certificate or patched Claude application package.

The separate integrations/picker.js model-ID prototype is not used. The selected Claude model remains whichever native Claude model the user selected. ClaudeBridge's UI controls simply govern MCP delegation.

## OS compatibility limits

- Windows supports common user-scoped and Squirrel installations. Store-only packages may prevent launching with custom flags.
- macOS detects a regular Claude.app under /Applications or ~/Applications. Security permissions or Gatekeeper may block an unsigned user-created launcher.
- Linux detects common Claude Desktop binary locations or a supplied CLAUDEBRIDGE_CLAUDE_EXECUTABLE override. Sandboxed Flatpak/Snap distribution formats may not accept the custom launch flags.

**No authenticated live test yet proves that every real Claude Desktop build accepts the debugging pipe and renders the controls.** Automated tests verify package building, platform installation, rollback, CDP pipe messages and DOM insertion using mocks. They cannot guarantee native-client compatibility. If the optional launcher fails, use Claude normally; the MCP extension remains available.

## CI and security

- tests/native-picker.js: UI integration and settings control in simulated DOM
- tests/native-cdp.js: CDP-pipe connection, Claude target selection and request dispatch
- tests/native-install.ps1: Windows shortcut installation/removal
- tests/native-install-unix.js: macOS/Linux install, reinstall, rollback
- tests/cleanup.ps1 and tests/cleanup-unix.js: optional full cleanup preserving real project source files

Installers are user-scoped and do not modify original Claude shortcuts or model IDs. The Unix installer uses an ownership marker and refuses to overwrite unrelated launchers. Windows verifies shortcut ownership. Uninstall reports locked or remaining native files.

## Technical reference

[ClaudeRipple](https://github.com/PBJ-2/clauderipple) demonstrates a different approach: replacing model responses through a local HTTPS proxy. ClaudeBridge's companion is independently implemented, with an opt-in local renderer integration and unchanged model routing.
