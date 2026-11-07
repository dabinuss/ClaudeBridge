# ClaudeBridge 2.4.0 — Stability, Security & Performance Audit

Date: 2026-11-07  
Scope: Windows/macOS/Linux MCPB installers, MCP API, in-chat UI, Codex worker lifecycle, SQLite state, project memory, plan handoffs, agent mailbox, and GitHub supply chain.

## Method and verification limits

- Manual review of the public repository and the current implementation.
- Reproduction of CI failures and fixes in the GitHub Actions build matrix.
- Automated smoke tests using a **mock Codex process**, including an explicit child-process cancellation test.
- Real JavaScript browser bundling with esbuild, not merely a static HTML resource test.
- Official MCPB manifest validation plus platform-specific Codex CLI binary verification.
- **Not performed:** authenticated end-to-end testing inside a user's Claude Desktop installation, a formal penetration test, third-party dependency SCA attestation, or a live production performance benchmark.

Passing CI demonstrates the tested behavior; it is not evidence that every platform, desktop release, or network environment is bug-free.

## Corrected findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | Stopping the worker could leave the actual Codex subprocess alive, particularly on Windows. | Track child PID in SQLite, migrate previous databases, and terminate the process tree on cancel and timeout. |
| High | Race allowed a cancelled queued task to be marked running and launch anyway. | Atomic queued-to-running claim before beginning work. |
| High | Resuming a worktree task could write to the main checkout. | Preserve worktree isolation, use Codex session fork for isolated continuation, and reject unsafe mode changes. |
| High | Resumption could lose its approved plan binding. | Check plan revision validity and preserve the approved plan ID. |
| High | Concurrent bridge instances could reserve jobs without a transaction. | Use SQLite BEGIN IMMEDIATE for the active-job check and reservation. |
| High | MCP App UI previously used a brittle runtime-injection regex and could report success with nonfunctional controls. | Build an actual browser bundle from the MCP Apps SDK; fail validation when the compiled UI is missing. |
| High | Internal state could be redirected via symlinked project metadata or SQLite files. | Reject symbolic links, including dangling links, before writing. |
| Medium | Memory scanning continued even when disabled in project settings. | Use project-specific settings in the monitor and stop when memory is disabled. |
| Medium | Memory monitor could spawn duplicates; unchanged projects still rewrote snapshots repeatedly. | PID guard, 60-second default scanning, and no snapshot write when unchanged. |
| Medium | Authentication device codes remained stored after login. | Delete local device-authentication logs and process metadata after successful login. |
| Medium | Build-time tools were included in the released MCPB packages. | Move esbuild and validation dependencies to a separate build-only directory. |
| Medium | Outdated GitHub builds could overwrite recent Preview releases. | Serialize deployment and skip stale source revisions without failing successful test jobs. |
| Medium | Package manifest was not checked with the official MCPB validator. | Add schema validation to all build jobs. |
| Medium | Failed CI initially hid two invalid esbuild invocation/lookup assumptions. | Fix native esbuild invocation and resolve the SDK from the build-only package directory. |

## Cross-platform native model-picker integration (2.4 preview)

The optional ClaudeBridge-native control section is now implemented for Windows, macOS and Linux, using the same renderer and private Chrome DevTools Protocol pipe. It does not replace the MCP bridge or select a different language model.

| Platform | User launcher | Native install/rollback test | Full data cleanup test |
| --- | --- | --- | --- |
| Windows | Desktop and Start Menu shortcuts | PowerShell isolation test | PowerShell audit/purge test |
| macOS | User-owned ClaudeBridge Claude.app | Node isolation test on macOS CI | Node audit/purge test |
| Linux | User-owned .desktop application launcher | Node isolation test on Ubuntu CI | Node audit/purge test |

The optional launcher requires the original Claude Desktop executable to accept Electron's debugging-pipe switch. **Actual interactive use in authenticated Claude Desktop has not been verified across all three platforms.** Mocked DOM and CDP tests and clean installer jobs do not substitute for that live GUI validation.

The original Claude application, its native shortcuts, model responses, network stack, certificates and MCP extension are deliberately unchanged. Native companion files are tracked through ownership markers or verified shortcut targets. Users can choose between native integration removal and full deletion of the project-local Bridge state. Neither removes actual project source files.

## Remaining important risks

1. **Native model picker:** The adapter is a prototype and is not wired into Claude Desktop's live model response routing. No claim is made that the dropdown entry currently works.
2. **Automatic quota fallback:** Normal Claude Desktop does not provide a reliable subscription exhaustion event to MCP. The fallback mode requires a manual/confirmed handoff.
3. **True dual coordination:** Claude's delegation and Codex's inbox polling are model-directed. Automatic simultaneous progress and continuous awareness are not guaranteed for every response.
4. **UI host compatibility:** MCP Apps browser resources and actions are tested as protocol outputs, but exact rendering in all Claude Desktop versions has not been independently verified.
5. **Model compliance:** Neither the shared plan nor the instruction history is enforceable as a formal proof that an LLM always follows the plan.
6. **Independent process robustness:** A host reboot, access-token expiry, CLI update, hard process termination, or PID reuse can still interrupt a task. Recovery is best effort.
7. **Git worktree merges:** Automated merges are deliberately disabled; integration must be reviewed.
8. **Runtime compatibility:** Uses Node's built-in SQLite module and requires a supported Node version in the MCP host.
9. **Local file privacy:** The project database can contain prompts, plans and file histories. Protect the local account and project folder; the bridge intentionally excludes this metadata from Git by default.
10. **Supply chain:** GitHub builds publish SHA-256 checksums but do not yet provide reproducible build proofs or signed publisher attestation.
11. **Resource measurement:** No measured wall-clock/CPU/RAM benchmarks with live Codex have been completed. The 60-second scan and three-worker limit bound common load, not worst-case load.

## CI regression coverage

- Legacy MCP smoke test
- v2 project/SQLite/worker/resume smoke test
- Codex-side MCP mailbox communication
- Project file and Git activity memory
- Immutable plan revisions and user approval
- Per-project mode settings
- Prototype model-picker adapter
- Codex subprocess cancellation and terminal-state persistence
- Real compiled MCP Apps resource and tool calls
- Official MCPB manifest validation and bundled CLI version test

Tests are run on GitHub-hosted **Windows, macOS and Ubuntu** runners, with builds packaged separately for each platform.

## Release policy

The preview channel is experimental. Only successful cross-platform builds of the **current main revision** should update the downloadable assets. Any failing CI job blocks publication.

Before a stable release, complete real Claude Desktop + signed-in Codex end-to-end tests, fault injection (including session reboot/credential expiry), a dependency security scan and independent review of the desktop proxy/picker mechanism.

## Related

- [README](../README.md)
- [Native picker implementation limitations](NATIVE-PICKER.md)
- [CI pipeline](../.github/workflows/build.yml)
