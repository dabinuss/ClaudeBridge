# ClaudeBridge v1.0.1 — Engineering audit

Date: 2026-11-07  
Scope: MCP server, subprocess launch, project state, extension manifest, tests, install UX.

## Method

Manual source review of `server/index.js`, `manifest.json`, test suite, README and GitHub Actions. Mock Codex smoke tests and CI tests on Windows, macOS and Linux. **No live end-to-end test with a signed-in Claude Desktop and Codex CLI is claimed.** No formal penetration test was conducted.

## Findings and changes

| Severity | Finding | Action |
| --- | --- | --- |
| Critical | Windows launch concatenated arguments into a `cmd.exe` command line. | Invoke the installed Codex JavaScript entrypoint via Node without a shell; reject unsupported batch launchers. |
| High | Corrupted JSON task state was silently replaced with an empty object. | Fail fast on invalid task database instead of risking accidental overwrite. |
| High | Task event output and project handoff notes could grow without a bound. | Cap log volume, task history, and handoff notes; limit MCP message size. |
| High | Child process cleanup raced with Windows file locks in CI. | Wait for child exit and retry cleanup in smoke tests. |
| Medium | Excessive synchronous JSON writes for command-start events. | Throttle activity updates to at most approximately once per 1.5 seconds per job. |
| High | Unbounded concurrent read-only Codex jobs could exhaust processes and memory. | Allow no more than 3 concurrent Codex jobs and time out tasks after 45 minutes. |
| Medium | Setup checks did not distinguish installation from login state. | Call `codex login status` in the health check and return actionable English setup guidance. |
| Medium | Shell-dependent CLI resolution and repeated lookup. | Resolve Codex once and cache the discovered executable path. |
| Medium | Poor onboarding for non-technical users. | English quick start and plain-language example prompts; diagnostic next steps. |
| Medium | Codex session IDs accepted without validation. | Validate UUID-like session identifiers before passing them as process arguments. |

## Known limitations / remaining risks

1. **Claude Desktop lifecycle:** the MCP server is not an independent always-on daemon. Unstarted tasks cannot be delegated when Claude is no longer available; ongoing jobs depend on the host keeping the bridge alive.
2. **Project path:** a single extension instance targets one local project directory; Claude Projects conversation folders are not automatically mapped to local folders.
3. **Shared-workspace writes:** there is no enforced path ownership or Git worktree isolation; coordinating concurrent file edits is still the user's and agents' responsibility.
4. **Multiple server instances:** task state is stored in a project-local JSON file with atomic rename, but there is no inter-process transaction lock. Two independent ClaudeBridge instances pointing to the same project may overwrite each other's changes.
5. **Process recovery:** after a restart, old `running` tasks become `interrupted`. This does not confirm whether an orphaned Codex process is still alive.
6. **Authentication:** availability checks detect an installed Codex launcher, not whether its login has expired. Actual authentication is verified by a real task.
7. **Windows environments:** some atypical package-manager shims or custom `CODEX_BIN` configurations may need additional discovery support.
8. **Permissions:** Codex may execute project code in code mode. Review mode uses the CLI read-only sandbox, but the bridge cannot independently prove every platform sandbox policy.
9. **Runtime performance:** task metadata is stored as JSON, so progress updates still have synchronous disk I/O. Large projects or thousands of jobs would benefit from SQLite.
10. **No full context mirroring:** Claude's hidden model context and unrelated Project threads are not accessible to this extension.

## Further recommended improvements

- Independent watchdog and explicit process liveness tracking.
- Transaction-safe task database (SQLite or proper cross-process locks).
- Git worktrees for independent coding tasks, plus merge review.
- Automatic project discovery or per-call project selection with explicit trust approval.
- First-run diagnostic wizard that verifies Codex login and supported CLI options.
- Tests for corrupted state, symlinked directories, concurrent processes, cancellation, retries, and malformed or oversized JSON.
- Signed release artifacts, dependency review, and external security testing.

## Test status

The repository uses GitHub Actions with Node.js 22 across Windows, macOS and Linux, and packages a `.mcpb` artifact. CI success is a useful regression signal, but is not a substitute for real account-based integration testing.
