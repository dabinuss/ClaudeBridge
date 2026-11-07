# ClaudeBridge

**Use Claude Desktop and Codex CLI together through ordinary Claude conversations. No slash commands required.**

![Version](https://img.shields.io/badge/version-2.6.0--preview-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

> Preview: ClaudeBridge is an MCP Desktop Extension with an **optional Windows/macOS/Linux native model-menu companion**. The companion adds UI controls, not an alternative language model; it never intercepts network requests or replaces MCP. Authenticated Claude Desktop testing is still required.

## Small online setup (recommended)

**One compact installer per operating system.** Each download already contains **every ClaudeBridge-owned file**: MCP server, task workers, SQLite/project memory logic, browser UI, native menu scripts, installer and uninstaller. It does not include the separate Node.js runtime or Codex binary.

| Platform | Download |
| --- | --- |
| Windows | [ClaudeBridge-Setup-Windows.cmd](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-Windows.cmd) — double-click |
| macOS | [ClaudeBridge-Setup-macOS.command](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-macOS.command) — open as an executable script |
| Linux | [ClaudeBridge-Setup-Linux.run](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-Linux.run) — mark executable and launch |

### What is downloaded during installation?

1. **ClaudeBridge's own application is already embedded in the installer** (MCP backend, complete UI, desktop companion and setup/removal scripts). No GitHub source or core archive is downloaded during installation.
2. A **pinned Node.js LTS runtime**, downloaded directly from https://nodejs.org and checked against its SHA-256 manifest. It is used **privately by ClaudeBridge**, with no global PATH changes.
3. **Codex CLI 0.167.0**, installed into ClaudeBridge's private `vendor` directory using npm from the official https://registry.npmjs.org registry with npm package-integrity verification, install scripts disabled and no global packages.

All ClaudeBridge-owned code is downloaded upfront inside the small installer. The additional program files are transferred **during setup**, so internet access is required. This changes the *installer download size*, not necessarily the final amount of installed data.

The installer registers only its own `claudebridge` MCP server in Claude Desktop's user configuration and creates the optional native model-menu launcher if the installed Claude Desktop edition supports it. It preserves other MCP entries and does not modify the original Claude executable, system certificates or proxy settings.

**To update or uninstall**, start **the same file** again. Existing private Node.js and ClaudeBridge files are reused for uninstall, so removing ClaudeBridge does not require redownloading the application. You may keep or explicitly delete saved plans and project memory; your project source code is never deleted.

The large fully-offline installers remain available through GitHub Actions build artifacts when needed; the recommended installers embed ClaudeBridge itself but download only external dependencies.

**Compatibility:** These installers are tested in CI on Windows, macOS and Linux. Signed-in end-to-end Claude Desktop UI behavior, particularly the optional model-menu injection, remains experimental. On macOS, security settings may require explicit approval of a downloaded `.command` script; on Linux, desktop environments may require enabling executable permissions.

## ClaudeBridge control panel inside Claude

ClaudeBridge 2.4.0 includes an interactive **MCP Apps** control panel without replacing the MCP bridge. In your Claude conversation, ask:

> **Open ClaudeBridge settings.**

When your Claude Desktop build supports local MCP Apps rendering, the panel appears directly inside your existing Claude conversation, with:

- **Off:** Block new Codex tasks while keeping project history.
- **On demand:** Claude delegates tasks when asked.
- **Fallback:** A Codex handoff requires an explicitly confirmed Claude limit or a manual user request. Claude Desktop does **not** expose a reliable automatic quota event.
- **Dual agents:** Claude and Codex may work on separate tasks concurrently, with durable handoffs, messages and Git worktrees.
- **Working memory:** Toggle token-free project activity monitoring.
- **Codex status:** Detect the bundled CLI and ChatGPT sign-in state; connect your account or open the installer download for repair.

The same settings are available to Claude as MCP tools through normal-language requests. No slash commands are needed.

## Native model-picker controls (Windows, macOS and Linux preview)

ClaudeBridge 2.4 includes an optional native **model-dropdown control panel** for all three supported desktop platforms. This adds a ClaudeBridge settings group without replacing the selected Claude model or changing the Claude MCP transport.

Controls: **Off**, **On demand**, **Fallback**, **Dual agents**, **Codex installed / ChatGPT connected**, **Connect Codex**, **Install / Repair**. These use the same persisted settings as the MCP extension.

**Installation:**

1. Install the matching `.mcpb` file in Claude Desktop. The Codex CLI and native companion runtime are bundled.
2. Tell Claude **“Open ClaudeBridge settings”**; click **Enable in model menu**. This installs a per-user launcher, not a network proxy or a certificate.
3. Fully quit Claude Desktop and start it using **ClaudeBridge Claude**, then open the original model dropdown.

| OS | Optional launcher | Removal |
| --- | --- | --- |
| Windows | Desktop and Start Menu **ClaudeBridge Claude** shortcuts | **Remove integration** deletes owned shortcuts and companion files |
| macOS | `~/Applications/ClaudeBridge Claude.app` | **Remove integration** deletes the owned app bundle and support folder |
| Linux | `~/.local/share/applications/claudebridge-claude.desktop` (also Desktop shortcut when the Desktop folder exists) | **Remove integration** deletes owned desktop entries and support folder |

The launcher starts the original Claude Desktop executable with Chromium's local debugging pipe, and inserts UI controls in the renderer. The original Claude executable, normal model choices, MCP tools, and certificates are not modified. The native controls are **an optional enhancement**, not a model proxy.

**Compatibility:** Installers, protocol messages, DOM controls and rollback are covered by automated tests on GitHub-hosted Windows, macOS and Linux. Real authenticated Claude Desktop versions can use different renderer structures, permissions or packaging; compatibility with every client build is **not yet confirmed**. macOS requires a normal Claude.app installation; Linux requires an accessible Claude Desktop executable. Restricted/App Store/Flatpak-style packaging can prevent launching with extra Electron switches.

If the new launcher does not work, use the regular Claude shortcut; MCP and the in-chat panel still work. See [Native model-menu integration details](docs/NATIVE-PICKER.md).

## Easy installation

1. Download your operating system's extension from [GitHub Releases](https://github.com/dabinuss/ClaudeBridge/releases/tag/preview): **ClaudeBridge-Windows.mcpb**, **ClaudeBridge-macOS.mcpb**, or **ClaudeBridge-Linux.mcpb**.
2. Open **Claude Desktop → Settings → Desktop App → Extensions → Advanced Settings → Install Extension** and select the downloaded file. The relevant Codex CLI is bundled — no separate npm or global Codex installation should be necessary.
3. Say to Claude: **“Set up ClaudeBridge, connect my local code project, and help me sign in to Codex.”** Follow the one-time ChatGPT sign-in instructions. You must authorize access to your own account.

Then simply say **“Ask Codex to review my code.”**, **“Let Codex write tests while we work on the UI.”**, **“What is Codex doing?”**, or **“Continue the interrupted Codex task.”**

## Features

| Feature | How it works |
| --- | --- |
| Natural-language operation | Claude invokes MCP tools behind the scenes |
| Project switching | Register local project directories and select the active project |
| Durable context | SQLite per project: tasks, messages, and sessions |
| Isolated parallel development | New writing tasks use Codex-managed Git worktrees |
| Detached worker | Active Codex jobs can continue when the MCP server closes |
| Failure detection | Heartbeat-based detection and resumption from a saved session ID |
| Two-agent messages | Persistent messages and checkpoints are included in subsequent Codex tasks |
| Resource protection | Three-job concurrency limit and 45-minute timeout |
| No additional bridge API key | Use Codex CLI signed in to your ChatGPT account |

## Example prompts

- “Connect my local project at C:\\Projects\\MyApp.”
- “Ask Codex to review the backend without making changes.”
- “Have Codex create tests in its own worktree. You handle the UI.”
- “Tell Codex our new API contract and save the decision.”
- “Show me progress from all active agents.”
- “Review Codex's changes before integrating them.”
- “Switch to the other registered project.”

## Original prompts and plan continuity

ClaudeBridge now keeps **two separate kinds of memory**:

- **Zero-token activity journal:** Records source-file changes, Git state, timestamps and task events locally without invoking another model.
- **Explicit decision memory:** Saves the user's original request, Claude's proposed plan, approval state, later revisions, and agent assignments.

**Example:**

1. Tell Claude: **“Create a plan to redesign the combat system.”** Claude should save the original request and its proposed plan with `bridge_plan`.
2. Review the proposal. Tell Claude: **“I approve that plan. Ask Codex to implement the tests.”** Claude approves the saved version and delegates the work using its plan ID.
3. Codex receives the exact approved plan revision, the original request, recent project events and the assigned task.
4. If you change the plan, Claude creates a new revision and asks for approval again. Existing task bindings still identify the previous revision, so discrepancies can be detected and explained.

**Not a hidden-thoughts mirror:** Claude Desktop does not give MCP extensions access to private reasoning or all user messages automatically. For reliable continuity, Claude must explicitly record the user request and the user-visible plan through the provided MCP tools. A running Codex task must explicitly poll its mailbox to see later updates.

Plan revisions and approvals are auditable in the project SQLite database. The bridge can enforce that a plan-bound task uses an approved version, but it cannot technically prove that an LLM follows every plan instruction.

## Architecture

Claude Desktop communicates with the ClaudeBridge MCP server. The server manages a local project registry at **~/.claudebridge/projects.json**. Each project stores its own SQLite database under **.agent-bridge/state.sqlite**. Codex tasks run as detached worker processes and record messages, progress, heartbeats, and session IDs.

## Complete uninstall and data cleanup (all platforms)

The native menu companion, ClaudeBridge MCP extension and saved project memory are **separate** so uninstalling the UI never silently deletes your work.

1. Fully quit Claude Desktop and any ClaudeBridge worker processes.
2. Click **Remove integration** in ClaudeBridge settings to remove the optional native menu launcher.
3. Remove the ClaudeBridge MCPB in Claude Desktop **Settings → Extensions** (the MCPB is owned by Claude's extension manager).
4. Optionally remove saved tasks, settings, plans and file history. Review what would be removed before selecting permanent deletion.

**Windows PowerShell** (from a ClaudeBridge source checkout):

```powershell
.\maintenance\cleanup.ps1 -AuditOnly -PurgeBridgeState -PurgeProjectMemory
.\maintenance\cleanup.ps1 -PurgeProjectMemory -PurgeBridgeState
```

**macOS / Linux**:

```bash
node maintenance/cleanup-unix.js --audit --purge-state --purge-project-memory
node maintenance/cleanup-unix.js --yes --purge-project-memory --purge-state
```

The scripts remove only ClaudeBridge-owned launchers and registered project state under `.agent-bridge/`. **Your source-code projects, Claude Desktop, global Codex CLI, and ChatGPT login are not deleted.** The platform cleanup reports paths that remain (for example, if a background worker still has files open). User-created backups or orphaned project folders not found in the registry are outside the automatic cleanup inventory.

See the [audit report](docs/AUDIT.md) for tested safeguards and limitations.

## Important limitations

- The optional Windows companion overlays ClaudeBridge controls into the original model menu. It is not automatically enabled by installing the MCPB; one-time shortcut activation and a full app restart are required.
- One-time ChatGPT login cannot be completed without your approval.
- Claude Projects conversation data is not automatically mirrored to the local project folders.
- A live Codex turn does not automatically read messages that arrive after the turn started; the messages are stored for later tasks.
- Git worktree changes are **not merged automatically**. Review and integrate them separately.
- The bridge does not detect Claude subscription limits or create Claude threads itself.
- Detached tasks are not a guarantee of surviving a computer reboot. Recovery depends on a valid Codex session ID.
- The v2 implementation uses Node.js 22.13+ with built-in SQLite. Claude Desktop must provide a compatible Node runtime.
- This is a preview release. Mocked integration tests run on Windows, macOS, and Linux; authenticated Claude/Codex end-to-end behavior still requires field validation.

## Development and tests

```bash
node tests/smoke.js
node tests/v2.js
node tests/native-cdp.js
```

Platform-specific installers with bundled Codex CLI are assembled by [GitHub Actions](https://github.com/dabinuss/ClaudeBridge/actions) and published only after the full CI matrix passes.

See the [engineering audit](docs/AUDIT.md) for risks and future work.

## License

[MIT](LICENSE). ClaudeBridge is not affiliated with Anthropic or OpenAI.
