# ClaudeBridge

**Use Claude Desktop and Codex CLI together through ordinary Claude conversations. No slash commands required.**

![Version](https://img.shields.io/badge/version-2.3.0--preview-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

> Preview: ClaudeBridge is an MCP Desktop Extension with an **optional Windows native model-menu companion**. The companion adds UI controls, not an alternative language model; it never intercepts network requests or replaces MCP. Authenticated Claude Desktop testing is still required.

## ClaudeBridge control panel inside Claude

ClaudeBridge 2.3.0 includes an interactive **MCP Apps** control panel without replacing the MCP bridge. In your Claude conversation, ask:

> **Open ClaudeBridge settings.**

When your Claude Desktop build supports local MCP Apps rendering, the panel appears directly inside your existing Claude conversation, with:

- **Off:** Block new Codex tasks while keeping project history.
- **On demand:** Claude delegates tasks when asked.
- **Fallback:** A Codex handoff requires an explicitly confirmed Claude limit or a manual user request. Claude Desktop does **not** expose a reliable automatic quota event.
- **Dual agents:** Claude and Codex may work on separate tasks concurrently, with durable handoffs, messages and Git worktrees.
- **Working memory:** Toggle token-free project activity monitoring.
- **Codex status:** Detect the bundled CLI and ChatGPT sign-in state; connect your account or open the installer download for repair.

The same settings are available to Claude as MCP tools through normal-language requests. No slash commands are needed.

## Native model-picker controls (Windows preview)

ClaudeBridge now includes an optional **native model-menu companion for Windows**. It inserts a ClaudeBridge control section into Claude Desktop's existing model dropdown while preserving the original Claude model selections.

The native section offers **Off**, **On demand**, **Fallback**, **Dual agents**, **Codex installed/connected status**, **Connect Codex**, and **Install / Repair**. Mode changes write to the same project-specific settings used by MCP.

**Set up:**

1. Install the Windows `.mcpb` extension normally. The Codex CLI and the optional native companion runtime are bundled.
2. Tell Claude **“Open ClaudeBridge settings”**, then click **“Enable in model menu”**. This installs a user-scoped *ClaudeBridge Claude* shortcut. No system certificate or proxy is installed.
3. **Fully quit Claude Desktop**, including its background process. Launch **ClaudeBridge Claude** from the new desktop/Start Menu shortcut. Open the existing model dropdown to see the additional ClaudeBridge controls.

The native menu companion is distinct from the prototype `integrations/picker.js`, which would advertise a fake model ID and still lacks routing. The **new companion instead adds settings to the existing menu** without pretending to be a language model. It starts Claude Desktop with Chromium's local **debugging pipe**, attaches only to Claude renderer pages, and injects the controls. There is no open debugging TCP port.

To undo it, click **Remove integration** from the ClaudeBridge MCP App settings. Your regular Claude shortcut, original Claude model choices, files, and MCP extension remain intact. If Claude is currently using the companion launcher, close it before cleaning up locked files.

**Compatibility status:** Automated tests exercise DOM insertion, mode-selection requests, debugging-pipe protocol handling, and Windows shortcut creation/removal. These do **not** prove compatibility with every real Claude Desktop version or installer type. Microsoft Store-only installations may not allow this custom launch method. If the companion cannot start, continue using the normal MCP App panel.

See [Native model-menu integration details](docs/NATIVE-PICKER.md).

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

## Clean uninstall and data removal (Windows)

ClaudeBridge has two independent components: an MCP Desktop Extension managed by Claude and an optional native model-picker companion. **Removing one does not automatically remove the other.**

**Remove just the native model-menu controls:** Open ClaudeBridge settings and select **Remove integration**. This removes ClaudeBridge-owned shortcuts and companion files without changing Claude Desktop, its normal model list, or the MCP extension. If Windows has locked a running companion, completely quit Claude and rerun removal; the installer reports any remaining directory instead of claiming a clean uninstall.

**Completely remove ClaudeBridge:**

1. Fully quit Claude Desktop and stop running Codex tasks.
2. Open Claude Desktop's **Extensions** settings and uninstall the ClaudeBridge MCPB. The Claude extension manager owns that installation.
3. Run the optional cleanup tool `maintenance/cleanup.ps1` from an extracted ClaudeBridge source checkout to audit and remove user-local Bridge data. For permanent deletion, use explicit PowerShell switches:

```powershell
# See what is present without deleting anything
.\maintenance\cleanup.ps1 -AuditOnly -PurgeBridgeState -PurgeProjectMemory

# Permanently delete registered project memory and Bridge settings
.\maintenance\cleanup.ps1 -PurgeProjectMemory -PurgeBridgeState
```

The cleanup tool asks for confirmation, never removes your actual project source directories, and never deletes global Codex or ChatGPT credentials. Project memory lives in each registered project's `.agent-bridge/` directory; the registry and settings live in `~/.claudebridge/`. Delete project memory **before** the registry, or use both switches together.

For privacy, deliberately separate the persistent data deletion from normal extension uninstallation. If you want to keep your saved plans and project history, leave off both purge switches.

**Limitations:** Microsoft Store/managed Claude installations may have different extension uninstall behavior. A locked native companion directory may need cleanup after the processes exit. An unregistered project directory or user-made backup is outside the tool's registry-based inventory. No application can guarantee removal of arbitrary copies, OS backups, or third-party caches.

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
