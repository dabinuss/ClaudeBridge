# ClaudeBridge

**Use Claude Desktop and Codex CLI together through ordinary Claude conversations. No slash commands required.**

![Version](https://img.shields.io/badge/version-2.9.0--preview-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

> Preview: ClaudeBridge integrates with the normal Claude Desktop client as MCP. Its official Claude Code Mod provides a visible `◈ ClaudeBridge ▾` control **above the prompt in the local Code tab**, not in the global app header. No HTTPS proxy, CA certificate, client patch, or separate launcher is installed by default.

## Install ClaudeBridge

**Windows:** [Download ClaudeBridge-Setup-Windows.exe](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-Windows.exe).

The Windows installer is an offline, self-contained executable. It includes the private Node.js runtime, Codex CLI package, ClaudeBridge MCP server, official Code Mod source and all application assets. **No separate Node.js download or global Node installation is needed.** The JavaScript runtime remains embedded inside the executable and is extracted privately for the existing MCP implementation; converting the entire MCP backend to native code is a separate change.

- macOS: [ClaudeBridge-Setup-macOS.command](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-macOS.command) (online installer)
- Linux: [ClaudeBridge-Setup-Linux.run](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Setup-Linux.run) (online installer)

If an earlier Windows uninstall left `Installed/integrations/native-ui/node.exe` but removed the ownership marker, the new Windows installer identifies this exact safe-to-repair residue, restores the ownership marker and completes installation. An unowned directory with unrelated files is **never** adopted automatically.

Installation registers ClaudeBridge MCP and offers the Code Mod using the supported plugin manager when available. The normal Claude Desktop app is not patched; no proxy, CA certificate or alternate launcher is installed. Previously enabled owned Ripple-Lite proxy settings should be disabled and restored before upgrading; see installer diagnostics for failures.

Windows .exe setup/update/uninstall never needs to download Node.js. Other platforms' online installers still fetch a private runtime as needed.

## ClaudeBridge control panel inside Claude

ClaudeBridge 2.9.0 includes an interactive **MCP Apps** control panel without replacing the MCP bridge. In your Claude conversation, ask:

> **Open ClaudeBridge settings.**

When your Claude Desktop build supports local MCP Apps rendering, the panel appears directly inside your existing Claude conversation, with:

- **Off:** Block new Codex tasks while keeping project history.
- **On demand:** Claude delegates tasks when asked.
- **Fallback:** A Codex handoff requires an explicitly confirmed Claude limit or a manual user request. Claude Desktop does **not** expose a reliable automatic quota event.
- **Dual agents:** Claude and Codex may work on separate tasks concurrently, with durable handoffs, messages and Git worktrees.
- **Working memory:** Toggle token-free project activity monitoring.
- **Codex status:** Detect the bundled CLI and ChatGPT sign-in state; connect your account or open the installer download for repair.

The same settings are available to Claude as MCP tools through normal-language requests. No slash commands are needed.

## Official Claude Code Mod — no proxy

The bundled plugin includes a real Claude Code Mods hooks module at `claude-plugin/hooks/claudebridge.mjs`, registered in `claude-plugin/hooks/hooks.json`. It draws **◈ ClaudeBridge ▾** and the Off / On demand / Fallback / Dual agent buttons in the native **AbovePrompt** UI of local Claude Code sessions. Clicking a mode runs the private `integrations/mod/settings-cli.js`, which updates the same `~/.claudebridge/settings.json` used by MCP tasks. It preserves UI rendered by other mods.

The official Mod API currently **does not expose the global Claude Desktop header** beside the project title (such as `MemeWars`), nor the normal Chat model selector. It cannot put the control at precisely that screenshot location. The Code-tab AbovePrompt band is the closest **supported** native drawing surface. We will not use HTTPS interception, certificate trust, patching, or an alternate launcher as an implicit workaround.

The installer bundles the Mod source and a local plugin marketplace. If a Claude Code CLI is available, it attempts `claude plugin marketplace add` and `claude plugin install claudebridge@claudebridge-local --scope user` automatically. If the CLI is absent, the install reports the Mod as inactive without affecting MCP; you can install it later from Claude Code's `/plugin` manager or add the installed `claude-plugin` folder as a local marketplace. Once installed, `/reload-plugins` loads the UI in local Code sessions. The control is above the prompt, **not** in the global app header.

## First use in the normal Claude Desktop app

1. Run the compact **ClaudeBridge-Setup** installer. All Bridge scripts are embedded. Node.js and Codex CLI are downloaded privately on demand. No certificate approval is needed in the new setup.
2. Restart **Claude Desktop using its original icon**. ClaudeBridge remains registered as MCP, and the optional Claude Code Mod can show its controls above the prompt in local Code sessions once the plugin is loaded.
3. Ask Claude: **“Check ClaudeBridge, select my local code project and connect Codex if necessary.”** If Codex is already signed in, the existing account is used; otherwise approve one-time device sign-in.

Examples: **“Open ClaudeBridge settings”**, **“Ask Codex to review my code”**, **“Let Codex write tests while we work on the UI”**, **“What is Codex doing?”**.

The standard MCP server now also advertises four named prompts for settings, dual-agent work, independent review and account login. An optional account-level Chat skill is bundled under `claude-plugin/` but is not auto-installed in your Claude account; see [Chat integration](docs/CHAT-INTEGRATION.md).

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

Run the **same ClaudeBridge-Setup file again** and select uninstall. The installer removes the ClaudeBridge-owned local MCP registration and its files without modifying other MCP servers or your projects. You may explicitly choose to delete saved ClaudeBridge settings, plans and project memory; project source code is preserved.

If you used the older experimental **ClaudeBridge Claude** shortcut, the legacy `bridge_native_picker(action=remove)` MCP tool is still available for cleanup. New installation of that shortcut is disabled. The original Claude launcher is always used.

For advanced/manual cleanup, see `maintenance/cleanup.ps1` (Windows) and `maintenance/cleanup-unix.js` (macOS/Linux). Neither should be used to delete source projects.

## Important limitations

- The official Mod UI is supported only in Claude Code rendering areas (including the desktop Code tab), not the global Chat app title toolbar. It must be installed/loaded as a Claude Code plugin.
- One-time ChatGPT login cannot be completed without your approval.
- Claude Projects conversation data is not automatically mirrored to the local project folders.
- A live Codex turn does not automatically read messages that arrive after the turn started; the messages are stored for later tasks.
- Git worktree changes are **not merged automatically**. Review and integrate them separately.
- The bridge does not detect Claude subscription limits or create Claude threads itself.
- Detached tasks are not a guarantee of surviving a computer reboot. Recovery depends on a valid Codex session ID.
- ClaudeBridge uses its own private Node.js 22 runtime. This version does not install a new Ripple-Lite certificate or HTTPS proxy. Upgrades attempt to clean up prior owned Ripple-Lite installations.
- This is a preview release. Mocked integration tests run on Windows, macOS, and Linux; authenticated Claude/Codex end-to-end behavior still requires field validation.

## Development and tests

```bash
node tests/smoke.js
node tests/v2.js
node tests/native-cdp.js
node tests/ripple-chat-e2e.js
node tests/ripple-renderer.js
node tests/ripple-routing.js
```

Platform-specific installers with bundled Codex CLI are assembled by [GitHub Actions](https://github.com/dabinuss/ClaudeBridge/actions) and published only after the full CI matrix passes.

See the [engineering audit](docs/AUDIT.md) for risks and future work.

## License

[MIT](LICENSE). ClaudeBridge is not affiliated with Anthropic or OpenAI.
