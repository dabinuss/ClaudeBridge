# ClaudeBridge

**Use Claude Desktop and Codex CLI together through ordinary Claude conversations. No slash commands required.**

![Version](https://img.shields.io/badge/version-2.0.0--preview-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

> Preview: ClaudeBridge runs as an MCP Desktop Extension. It cannot change the proprietary Claude chat UI, read hidden Claude conversation context, or bypass subscription limits.

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

## Architecture

Claude Desktop communicates with the ClaudeBridge MCP server. The server manages a local project registry at **~/.claudebridge/projects.json**. Each project stores its own SQLite database under **.agent-bridge/state.sqlite**. Codex tasks run as detached worker processes and record messages, progress, heartbeats, and session IDs.

## Important limitations

- Claude Desktop's existing UI is reused through MCP tools, not modified with new native buttons, chat tabs or menus.
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
```

Platform-specific installers with bundled Codex CLI are assembled by [GitHub Actions](https://github.com/dabinuss/ClaudeBridge/actions) and published only after the full CI matrix passes.

See the [engineering audit](docs/AUDIT.md) for risks and future work.

## License

[MIT](LICENSE). ClaudeBridge is not affiliated with Anthropic or OpenAI.
