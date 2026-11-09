# RFC: ClaudeBridge Mod UI — technical proof before another installer

Status: **Research and visual validation; NOT a shipping implementation.**
Date: 2026-11-09

## Product requirement

The user wants a visible **◈ ClaudeBridge ▾** text item **directly to the right of the project title** (e.g. "MemeWars") in the **global Claude Desktop Code workspace header**. Clicking it must present Off / Manual / Fallback / Dual plus account and task state. The original Claude shortcut and binaries stay untouched. No MITM proxy, local root CA, alternate launcher, or blind installation-success message.

The previous ClaudeBridge 2.8/2.9 release does **not** meet this requirement. The current Mod listens for `ui.render({component:"AbovePrompt"})`, which draws next to the prompt, not the project header. The installer also treats plugin activation failure as nonfatal and can show success when zero mods load.

## External findings, with provenance

- Anthropic's official launch: <https://claude.com/resources/articles/claude-code-mods> (2026-10-01). Mods can render UI through event hooks, in Claude Code CLI and Desktop Code tab. This does NOT guarantee arbitrary Desktop shell DOM insertion.
- Anthropic's starter guide: <https://claude.dev/blog/getting-started-with-claude-code-mods/>. The first-class `AbovePrompt` slot; `hooks/hooks.json`, `.claude-plugin/plugin.json`, `register(on)`, `$.ui.resolve(e)`; Claude Code >= 2.1.287 and `claude --plugin-dir` hot reload. Mods are sandboxed without DOM/Node globals. In a current running session, `.claude-plugin/types` emitted by Claude Code is the version-specific type authority.
- Anthropic's example repo: <https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods>. Its Token Weather adds an AbovePrompt band; Blast Radius/Replayer use other sites. This validates the API convention, not our global header.
- Community's **specific Windows Desktop Code UI probe**: <https://github.com/anthropics/claude-code/issues/102300> (2026-10-15, Claude Code 2.1.295 Windows). It observed `SessionMode` render on the row near/under the model picker; `AbovePrompt` above the prompt; desktop position changed between versions. A tested example of probe instrumentation is included. This is a community report, not a guaranteed Desktop contract.
- Community plugin troubleshooting: <https://claude-mods.com/install/>. Verify installed plugin AND a *loaded* mod with `/plugin`; use `/reload-plugins`, `claude plugin validate`, `claude --debug`, and note Desktop Code != generic Desktop Chat. A CLI plugin install succeeding is insufficient proof.
- UI chain composition issues: <https://github.com/anthropics/claude-code/issues/100789> — `AbovePrompt` shares one hook chain. Always preserve `await next(e)`.

## Explicit render surface distinction

1. **Claude Desktop shell global project header** — contains "MemeWars" and icons. No documented official Claude Code Mods render site for app-shell header; no host DOM access from the sandboxed Mod.
2. **Claude Code embedded session** — has `AbovePrompt`, `Pane`, `SessionMode`, `Spinner`, `AskUserQuestion`, etc. Can paint here using official Mods.
3. **Normal Claude Chat** — MCP tool integration can work without arbitrary app-shell UI. Installing a Mod in Claude Code does not alter the Chat model picker.

Any claim that a text item is placed beside "MemeWars" requires a real screenshot of the item there from an unmodified Desktop startup; unit tests of mock UI events do not count.

## Engineering options

### A — Official-only (preferred for robustness, location is **not** project header)

- Surface: `AbovePrompt` button `◈ ClaudeBridge ▾`, expanded details in a `Pane`.
- Secondary: `SessionMode` lightweight text next to local Code mode/model status **only after** surface probe confirms Windows layout.
- Hooks: `session.start` initialize; `ui.render` for chosen sites; `command.run` for toggles; optional `tool.call` / `$.tool.register` for Codex delegate, subject to exact generated API types.
- State: persist modes through `$.store` for Mod controls, optionally call shared backend via `$.process.run` for MCP parity. Do not invent automatic first-party model switching.
- Install: plugin manifest + hooks, official user-scoped `claude plugin marketplace add` and `claude plugin install`; verify plugin *loaded* at runtime.

### B — Exact project-header location without client patch or proxy (**conditional on real discovery**)

- UI component inside Desktop shell needs an **actual extensibility channel**. Investigate documented Desktop app extension/Chrome-extension mount, devtools injection lifecycle or officially supported host slots.
- A Mod cannot inject React/DOM into its parent Electron shell by itself. If Desktop exposes an authorized host bridge for a header contribution, implement a separate tiny UI adapter with feature detection and scoped cleanup, while keeping Codex logic in the Mod.
- Do **not** assume a CSS theme or one-time DevTools JS offers persistent safe install. No downloaded root CA, `app.asar` patch, global shell hook, or second launcher.
- If no supported persistent channel exists on the actual Windows build, preserve A as supported implementation, and leave B experimental instead of silently shipping a different location.

### C — Native Mod-first, no installed Node backend (separate architectural refactor)

- Move Off / Manual / Fallback / Dual plus per-project state to the Mod `$.store`.
- Use `$.process.run` to launch an explicitly user-selected native Codex CLI executable. CLI binary discovery, login, cancellation, job lifecycle, cross-agent memory/SQLite, worktrees and dual coordination need individual proof; the UI Mod itself does not automatically replace the existing MCP worker.
- Retain MCP until feature parity tests verify all legacy project and coordination features. This can dramatically reduce installer size once validated, but not during UI location verification.

## Independent exact-header precedent: Chromium content script

<https://github.com/maximebories/claude-desktop-clay-theme> documents a **different** UI extension channel, *not a Claude Code Mod*. It reports an experimental permanent Chromium extension on **macOS** through a bundled React DevTools extension loader enabled by `REACT_PROFILE=1`. Its content script targets `https://claude.ai/*` in the original Desktop shell, so a DOM-inserted button could in principle appear next to the project title. The repository explicitly says the launcher/paths are macOS-only; it does not establish that Windows exposes this loader.

Proof plan **only if exact header is mandatory**:
1. Inspect the user's Windows Claude Desktop app version and normal startup environment without modifying any binary. Locate whether its extension loader exists at all and whether it accepts an unpacked extension folder. Do not set `REACT_PROFILE` globally or install credentials/network interceptors.
2. Create a benign, unpacked Chrome extension with one content script that adds a text-only `◈ ClaudeBridge (probe)` element next to a verified DOM anchor. Use a `MutationObserver` so re-render and workspace switching are covered. No access to chat content or network permission.
3. Verify the original desktop shortcut picks the extension up at startup; verify it survives navigation/restart, handles DOM changes, doesn't duplicate buttons and can be removed cleanly.
4. Only after that proof, connect the injected shell button to a local **Mod/MCP** settings action through an explicitly authenticated and user-scoped bridge. Never put secrets in DOM or query strings. Treat cross-webview RPC security and message origin checks as mandatory.
5. If the loader is absent/blocked on Windows, discard this track rather than patching the app, hijacking Electron or claiming the official Mod provides shell access.

This channel may meet the exact placement, but is an **experimental third-party extension path** rather than an officially supported Claude Mods API, and requires validation on the actual Windows client before being offered.

## Release gate — mandatory, no more mocked success

1. Run `claude --version` and Desktop local Code-tab `/status` (must have function hooks enabled).
2. Validate plugin directory: `claude plugin validate <folder>`; run `claude plugin test`; check generated types.
3. Use the **surface probe** in a Code terminal: `claude --plugin-dir <research/surface-probe folder>`. Confirm `/plugin` actually reports an active mod; `/reload-plugins` when installing in an existing session.
4. Repeat in the **original Windows Desktop Code tab** with actual login and local project. Record: `ui.render` event/site, rendered vs not, visual screen position, button press event, restart persistence. Note Desktop `/status` version may differ from shell `claude --version`.
5. Check own ClaudeBridge mode toggle through native Mod buttons, persist settings and verify that an MCP worker reads the same mode.
6. Verify plugin uninstallation reversibly removes controls and preserves unrelated Claude/Desktop settings.
7. Only after an actual screenshot shows `◈ ClaudeBridge ▾` **beside the project title** may any release claim this original requirement is implemented.
8. If a valid official render site cannot draw there, explicitly identify the mismatch and request a product choice before shipping as equivalent.

## Existing issues in ClaudeBridge to fix separately

- Installer currently hides CLI-missing Mod activation as a normal success (inspect `installer/mod-install.js` and `installer/windows/Program.cs`). Separate states: `mcp_registered`, `plugin_installed`, `mod_loaded`, `ui_rendered`; no boolean combining them.
- Existing `claude-plugin/hooks/claudebridge.mjs` calls a private Node executable. Mod display and Mod logic can be tested independently from that process; Node absence should appear as explicit `backend unavailable` in its UI, not a missing button.
- Synthetic node tests are useful for logic but cannot validate actual host render sites, real plugin load, or Electron layout.
