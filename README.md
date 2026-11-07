# ClaudeBridge

**Run OpenAI Codex CLI alongside Claude Desktop with project-scoped handoffs, background tasks, and progress tracking.**

> **Experimental v1.0.1:** Automated MCP smoke tests pass against a simulated Codex CLI. A live Claude Desktop / ChatGPT account end-to-end test has not yet been performed.

ClaudeBridge is a lightweight, dependency-free [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server packaged as a Claude Desktop extension (`.mcpb`). Keep Claude as your main interface while delegating coding tasks and read-only reviews to the Codex CLI using its existing ChatGPT sign-in. No OpenAI API key or separate billing integration is required for this bridge.

## Features

- **Delegation:** Start Codex coding and review jobs from a Claude conversation.
- **Background execution:** Codex tasks run asynchronously while Claude can work on independent files.
- **Project memory:** Save handoff notes, task metadata, and JSONL event logs under `.agent-bridge/`.
- **Progress tracking:** List jobs, inspect status, last agent message, token usage, and recent events.
- **Resumption:** Continue an earlier Codex session when a session ID is available.
- **Guardrails:** Read-only sandbox for reviews; only one concurrent coding job to reduce write conflicts.
- **Local-first:** No bridge telemetry or extra service required.

## Requirements

- Claude Desktop with Desktop Extensions / local MCP support
- Node.js 18 or newer
- [OpenAI Codex CLI](https://github.com/openai/codex) installed and signed in
- A **local source-code directory** accessible to both Claude and Codex

## Quick start: install and use

**For Windows users:**

1. Install [Node.js LTS](https://nodejs.org/) if you do not already have it.
2. Open PowerShell, install Codex and sign in **once**:

   ```powershell
   npm install -g @openai/codex
   codex login
   ```

3. Download **[ClaudeBridge.mcpb](https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge.mcpb)** from the public preview release. This download is updated automatically after all Windows, macOS, and Linux CI checks pass. If the preview has not been published yet, use the [GitHub Actions build artifact](https://github.com/dabinuss/ClaudeBridge/actions/workflows/build.yml).
4. Double-click the `.mcpb` file, or open **Claude Desktop → Settings → Extensions → Install Extension**. Choose your **local code folder** when prompted.
5. Restart Claude Desktop if needed, then say:

   > **Set up ClaudeBridge, check if Codex is ready, and review my project with Codex.**

**That's it for normal use.** You do not need to open a separate Codex window. Claude calls the tools and reports results in its own conversation.

### Everyday Claude prompts

| Say this to Claude | What ClaudeBridge does |
| --- | --- |
| “Ask Codex to review my code.” | Starts a read-only review |
| “Let Codex write the tests while we work on the UI.” | Starts a background coding task (coordinate separate files) |
| “What is Codex working on?” | Reads the latest task status |
| “Stop the Codex task.” | Stops a running Codex subprocess |
| “Save our decisions and hand off to Codex.” | Saves checkpoint notes and delegates work |
| “Continue the previous Codex task.” | Resumes an available Codex session |

You **do not** have to remember tool names or task IDs: Claude can call `bridge_health`, `bridge_delegate`, `bridge_status`, and the other tools for you.

### Troubleshooting

**Codex CLI is not found:** Confirm `codex --version` works in a fresh PowerShell session and restart Claude Desktop. For installations where Claude Desktop cannot see your PATH, set `CODEX_BIN` to the full path to your Codex executable in the local environment used to launch the extension.

**Codex reports an authentication error:** Run `codex login` in PowerShell and retry the task.

**Codex reports a Git repository error:** Select an initialized Git project folder or create one using `git init`.

**Claude hit its usage limit:** ClaudeBridge does not bypass Claude's UI limits. Previously started Codex work can continue only while the bridge process remains alive.

**Changing projects:** The current release has one configured local folder per extension instance. Update the extension's Project directory setting when switching workspaces.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `bridge_health` | Check the project directory, Codex CLI availability, and active jobs. |
| `bridge_delegate` | Start an asynchronous Codex job (`mode: code` or `mode: review`). |
| `bridge_status` | Read job status, progress, recent events, usage, and output. |
| `bridge_cancel` | Stop a running Codex job. |
| `bridge_resume` | Continue a previous Codex session with additional instructions. |
| `bridge_checkpoint` | Append durable project decisions, changes, and next steps. |
| `bridge_context` | Read the saved handoff notes and recent jobs. |

### Example: parallel work

> Work with Codex as a second coding agent. Save your decisions using `bridge_checkpoint`, delegate the test implementation to Codex using `bridge_delegate` in `code` mode, and work only on *different files* while it runs. Poll `bridge_status`, then inspect and test the changes before using them.

### Example: read-only review

> Ask Codex to review this project for bugs using `bridge_delegate` in `review` mode. Retrieve the completed report with `bridge_status`.

## Project-local state

ClaudeBridge creates this directory in the configured code project:

```text
my-project/
├── src/
└── .agent-bridge/
    ├── tasks.json          # Task state, IDs, session IDs, completion status
    ├── handoff.md          # Human-readable handoff notes
    ├── activity.jsonl      # Task events and checkpoints
    └── task-<uuid>.jsonl   # Raw Codex JSON events per task
```

Add `.agent-bridge/` to **your project's** `.gitignore` unless you intentionally want to share those logs. The bridge does not automatically extract every Claude message or read other Claude Project threads.

## Limitations

- **Not automatic subscription fallback.** Claude cannot reliably invoke MCP tools after its usage limit has been reached. ClaudeBridge does not detect remaining Claude quota or auto-switch the Claude UI to Codex.
- **No full conversation transfer.** Only saved handoff notes, local files, and job metadata are shared; Claude's hidden context and unrelated Claude threads cannot be exported by this extension.
- **No always-on watchdog.** Jobs can keep running while the MCP server process remains active. If Claude Desktop stops that process, the bridge cannot restart itself. Previously running jobs are marked `interrupted` at the next startup and may be resumed if a Codex session ID exists.
- **Cooperative parallelism.** Claude and Codex must agree on file ownership. There is no automatic Git worktree isolation, merge process, or autonomous inter-agent conversation in v1.0.
- **One writer.** The bridge permits only one writing Codex task at a time (and prevents overlapping Codex review/code tasks when a writer is active). Claude's own edits must be coordinated separately.
- **Account usage limits still apply.** Your Claude and ChatGPT subscriptions remain separate.

## Build from source

The extension is a ZIP-compatible `.mcpb` archive containing `manifest.json` and `server/` at its root. On Windows PowerShell:

```powershell
Compress-Archive -Path manifest.json,server -DestinationPath ClaudeBridge.zip -Force
Rename-Item ClaudeBridge.zip ClaudeBridge.mcpb
```

For a full local source checkout, test the server with:

```bash
node tests/smoke.js
```

The smoke test uses `tests/mock-codex.js`; it does **not** require a live Codex login. This project does not require `npm install` for the bridge itself.

## Security and privacy

- ClaudeBridge starts a local Codex process with the selected project as its working directory. In `code` mode, Codex may modify files there; in `review` mode the Codex sandbox is read-only.
- Task prompts and progress logs remain in `.agent-bridge/` locally. Their contents may be sent to Claude or OpenAI when their respective assistants process the project.
- No extra bridge telemetry, remote coordination server, or API credentials are stored by ClaudeBridge.
- Only configure trusted project directories, inspect generated code, and review changes before committing.

## Roadmap

- Optional independent watchdog and interruption recovery
- Git worktree-based isolation for simultaneous agents
- Structured agent-to-agent messages, ownership, and leases
- Improved cross-platform Codex discovery and packaging
- CI integration tests and release downloads

## License

[MIT](LICENSE). This project is independent and is not affiliated with Anthropic or OpenAI.