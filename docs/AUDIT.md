# ClaudeBridge 2.0 — Stability, Security and Performance Audit

Date: 2026-11-07 · Status: Experimental preview

## Scope and evidence

Reviewed the MCP bridge, project registry, detached Codex workers, SQLite storage, Codex-side message server, watchdog, packaging workflow and tests. Cross-platform CI uses simulated Codex events. **A complete authenticated Claude Desktop + Codex end-to-end test has not been conducted.** No external penetration test or formal security certification is claimed.

## Improvements in v2

| Area | Implemented change |
| --- | --- |
| Installation | Separate Windows, macOS and Linux desktop extension bundles including the official Codex CLI |
| Account setup | One-time device login can be initiated from Claude, subject to user authorization |
| Project management | Persistent local multi-project registry with real-path validation |
| State consistency | SQLite in WAL mode with indexed task and message tables |
| Concurrency | Limit of three running workers; writing tasks use Codex-managed Git worktrees by default |
| Context preservation | Project messages, checkpoints, session IDs, heartbeat and final task output |
| Agent collaboration | Separate project-scoped Codex MCP inbox with read, send and checkpoint tools |
| Failure detection | Independent watchdog watches worker heartbeats and marks dead workers as interrupted |
| Runtime limits | Each worker has a 45-minute task timeout; raw events are capped |
| Windows security | CLI execution via argument arrays without cmd.exe shell concatenation |
| Privacy | Project state under .agent-bridge; internal .gitignore protects accidental source commits |
| Review safety | Read-only sandbox is requested for fresh and resumed review tasks |
| Usability | Claude uses MCP tools through normal conversational requests |
| Verification | Legacy MCP smoke tests, v2 integration tests and mailbox tests in CI |

## Remaining limitations and risks

1. **No native UI injection.** MCP desktop extensions cannot add arbitrary Claude chat controls. Tool use is triggered through ordinary Claude conversation.
2. **No Claude quota event.** Claude subscription exhaustion does not generate a supported MCP handover signal. The independent worker can finish an already-started task, but cannot force Claude to send new instructions.
3. **Account consent.** ChatGPT OAuth/device login requires the user's action. Account tokens must never be copied into the project database.
4. **Node version.** SQLite relies on the Node.js 22.13+ built-in module. Runtime compatibility with every Claude Desktop build is not proven.
5. **Agent messages are pull-based.** Codex must invoke the mailbox MCP tool to read newly arrived messages. Arrival does not automatically interrupt a model's current turn.
6. **Git worktree integration remains manual.** Codex manages its worktree, but there is no unattended cherry-pick or merge; the user/Claude must inspect results.
7. **No exact model-context transfer.** Saved files, messages, and Codex sessions do not reproduce Claude's hidden context or unrelated Claude Projects threads.
8. **Daemon persistence is bounded.** Workers and the short-lived watchdog are independent of MCP server lifetime; machine restart still interrupts them.
9. **Session resume may fail.** Invalid or expired sessions, worktree mismatch, or CLI-version changes may prevent continuation. The bridge preserves the error and past state.
10. **No proof of sandbox containment.** The bridge selects Codex sandbox flags; actual filesystem enforcement depends on the OS and CLI version.
11. **No external audit or code signing.** Installer artifacts are built in GitHub Actions; signed reproducible releases and external pentesting are still future work.
12. **Project registry scope.** Selecting a project affects the local Bridge instance. It does not automatically detect Claude Projects identity, which the MCP extension cannot access.

## Performance considerations

- SQLite WAL handles independent task workers better than rewriting a shared JSON state file.
- Task and message listings are bounded. The project message history is retained up to 2,000 records.
- One process per Codex task has measurable memory overhead; the three-worker limit prevents unbounded growth.
- Each worker writes a heartbeat every five seconds, while the watchdog checks independently every fifteen seconds.
- Actual CPU, memory and throughput benchmarks with a live Codex subscription have not yet been conducted.

## Recommended validation before stable release

- Test the bundled install and login on clean Windows, macOS and Linux installations.
- Run real dual-agent workflows on Git repositories with overlapping and independent file changes.
- Verify Codex worktree merge/review behavior and session restoration after forced termination.
- Fuzz MCP requests and project paths, test symlink/sandbox boundaries, cancellation and password/token leakage.
- Pin and attest downloadable Codex and extension dependencies; commission an independent security review.

## Testing

GitHub Actions executes `node tests/smoke.js`, `node tests/v2.js`, and `node tests/mailbox.js`, along with syntax checks and a bundled Codex executable check, across three operating systems. CI success verifies those cases only.
