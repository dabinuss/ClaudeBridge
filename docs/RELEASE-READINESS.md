# ClaudeBridge release-readiness investigation (2026-11-17)

**Decision: NOT production-ready.** The existing preview CI proves that a collection
of simulated MCP, plugin and installer tests pass. It does not prove that the
requested experience is available in an authenticated Claude Desktop Chat
session on Windows, macOS and Linux. A release must not advertise complete
native model-menu integration until that behavior is observed in the original
app, without an alternate launcher, interception, or application patch.

## User-approved product contract

1. Run the **original** Claude Desktop app, from its normal icon.
2. Present ClaudeBridge in the **existing model/mode control of ordinary Chat
   conversations and project conversations**, not only in Claude Code.
3. Offer Off / On demand / Fallback / Dual and select Codex from a discoverable
   UI; mode changes must affect actual task routing, not just a label.
4. Reuse an existing ChatGPT/Codex login or offer a consent-based login flow
   only when missing; do not ask for passwords or manipulate another account.
5. Support real Codex execution, independent review, worktrees, restart,
   cancellation, reports, plan history, project context, memory, messages,
   and traceable changes in the original Claude workflow.
6. Provide one install/uninstall artifact for each OS, with no system-wide
   Node installation, always-running proxy, separate launcher, or mutation of
   Claude itself. Preserve unrelated MCP plugins and user files.
7. Validate each feature in the actual host on all supported OSes, including
   failure injection, upgrade/uninstall and account-expiry scenarios.

## Authoritative platform findings

| Integration surface | Supported behavior | Does it satisfy the model-menu requirement? |
| --- | --- | --- |
| Claude Desktop local MCP / `.mcpb` | Local tools in regular Desktop conversations; see [Claude local MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) | **No.** Tools do not change the native model selector. |
| Claude plugins and skills | Custom commands and skills in Chat; local plugin MCP works in Cowork / Code, not regular Chat; see [Claude plugin documentation](https://support.claude.com/en/articles/13837440-use-plugins-in-claude) | **No.** Not a native Chat model-menu API. |
| Claude Code Mods | `SessionMode`, `AbovePrompt` and `Pane` UI in local Code sessions; see [official Mods reference](https://code.claude.com/docs/en/plugins/mods/reference) | **Code tab only.** These are real but different UI surfaces. |
| MCP Apps | Interactive settings embedded in a tool result in supporting Chat clients | **No.** A chat result is not a native dropdown item. |
| HTTPS / DOM interception or alternate launcher | Previous prototypes change private client behavior | **Rejected.** Violates no-patch/no-proxy/no-launcher requirements; brittle across releases. |

Anthropic has [documented Desktop Mod rendering defects](https://github.com/anthropics/claude-code/issues/99265)
with `AbovePrompt` in split and existing Code sessions; a successful plugin
registration alone is not equivalent to a visible, interactive Mod.

**Hard blocker:** No supported plugin, MCP, skill or Mod surface has been
verified that can add a control to Claude Desktop **regular Chat's existing
model menu**. There is no sound engineering basis for calling that requirement
implemented. A new official host API, or an explicitly authorized change to
the no-interception constraint, would be required.

## Verified source defects and repair scope

| Priority | Finding | Impact | Treatment |
| --- | --- | --- | --- |
| P0 | `server/worker.js` used `--sandbox` for `codex exec resume/fork`, although Codex 0.167 exposes that flag only for plain `exec`. | Resumed and forked jobs fail at CLI argument parsing. | Use the documented `-c sandbox_mode=...` for the nested subcommands; test all paths against CLI help. |
| P0 | `installer/setup.js` removed MCP config but never the user-scoped Claude Code plugin registration. | Uninstall leaves an enabled broken Mod pointing to deleted files. | Unregister the owned plugin and local marketplace **before** deleting private CLI/source; block unsafe deletion if removal cannot be verified. |
| P0 | Online macOS/Linux installation included only Codex, while the Mod install routine required an already-existing Claude CLI. | A fresh user machine generally receives MCP but not the visible Code-tab Mod. | Install a private pinned Claude Code CLI alongside Codex; do not change the system PATH. |
| P0 | Project-memory purge deleted a recursively named `.agent-bridge` folder when it held only two expected files, without checking its other contents. | Explicit data purge could delete unrelated user-owned files in that folder. | Require every file to match the known Bridge schema; block unknown content, symlinks and nested directories. |
| P0 | CI checks `claude plugin list --json`, not a live desktop render. | A green CI build can be falsely presented as a visible UI. | Separate `pluginRegistered`, `modLoaded`, `uiRendered` and `userAccepted` in release evidence. |
| P1 | No authenticated Claude Desktop / Codex field test on Windows/macOS/Linux. | Cannot certify end-to-end installation, login, GUI, real Codex jobs and cleanup. | Add platform test recordings and an explicit release gate before stable publication. |
| P1 | There is no verified Claude Chat subscription-quota event exposed to a local MCP process. | Fallback cannot switch automatically on subscription exhaustion. | Require explicit user handoff; never claim automatic detection without an official event. |
| P1 | `Dual` relies on Claude choosing to invoke MCP, and Codex polling its mailbox. | Guaranteed continuous simultaneous work and context mirroring are not established. | Document handoff and recovery, test real two-agent projects, and surface truthful status. |
| P1 | Installation and source/docs do not consistently distinguish native Chat UI from Code Mod UI. | User expects a control at a location where this implementation cannot display one. | Make unsupported requirement conspicuous, and do not describe a Code-tab Mod as Chat model-menu support. |

## Delivery plan and acceptance gates

### Gate A — deterministic code integrity

- [x] Identify the current main revision and read source, tests and installer pipelines.
- [x] Reproduce invalid resume/fork argument handling using the actual Codex CLI.
- [x] Correct nested Codex CLI arguments and add regression checks.
- [x] Make uninstall unregister an owned Mod before deleting its runtime.
- [x] Bundle the Claude CLI in online macOS/Linux dependencies for automatic registration.
- [x] Guard project memory deletion against unrelated content.
- [ ] Run the complete test matrix on GitHub Actions, inspect logs and check all packages.
- [ ] Verify no regressions in upgrades from the Nov 8 broken uninstall state.

### Gate B — authenticated, real-host functionality

- [ ] Windows: fresh install; observe local MCP in ordinary Chat and in a Claude project.
- [ ] Windows: observe Mod loaded and clickable in a new local Desktop Code session.
- [ ] macOS/Linux: repeat both UI and MCP checks, not only headless mocks.
- [ ] Codex: detect signed-in session; missing-login flow, expiration and account retry.
- [ ] Codex: perform an actual read-only review, a worktree edit, a fork, a resume,
  a forced cancel and a recovery, validating both CLI exit and persisted state.
- [ ] Agent coordination: run real parallel tasks in separate worktrees, review
  messages/plans and check that unrelated files remain untouched.
- [ ] Installation: retry on a damaged installation, and uninstall from an
  actively running client, then from a closed client; verify plugin/MCP removal.
- [ ] Measure CPU, RAM, disk and startup overhead on each OS.

### Gate C — UX and compatibility

- [ ] The user-approved native Chat model-menu integration is demonstrated in
  normal Claude Desktop with a supported, update-safe interface.
- [ ] All settings persist and have effect in regular chats and projects.
- [ ] Automate cross-version compatibility checks when Claude/Code updates.
- [ ] Verify screen-reader/keyboard controls, UI errors, offline recovery and
  all supported Claude project workflows.

### Gate D — production release

- [ ] Sign installers and publish SHA-256 checksums and provenance.
- [ ] Conduct dependency/advisory review and secret scanning.
- [ ] Freeze compatible dependency versions; test supported OS/architecture builds.
- [ ] Have an independent reviewer reproduce the release gates.
- [ ] Only then tag `stable` and advertise production readiness.

## Evidence and status semantics

- **Unit/mock passing** means only its isolated code path is tested.
- **CLI registered** means Claude Code recognizes the user plugin ID.
- **Mod loaded** requires a diagnostic from the actual Code session, not a
  simulated `register(on)` callback.
- **UI rendered** requires visual interaction in the authenticated Desktop host.
- **Model menu integrated** means the original Chat model picker, not a Code
  footer or in-message MCP App.
- **Production-ready** requires all gates; green CI by itself is insufficient.

Do not ship a stable release with any unchecked gate, and do not infer success
from the absence of an error. The user's requested unmodified-model-menu
integration remains blocked by the host's documented extension surface.
