# ClaudeBridge — binding product requirements (2026-11-07)

## Non-negotiable user experience

- Start **original Claude Desktop** through its normal icon, without a ClaudeBridge-specific launcher, patched Claude executable, privileged background daemon, TLS proxy, or extra window.
- ClaudeBridge must be available automatically in Claude Desktop conversations where local desktop extensions are supported, including ordinary chats and projects.
- An easily discoverable control next to/in the model-selection UI must expose Off, On demand, Fallback and Dual, plus Codex account/login status.
- Codex authentication uses the user's own ChatGPT/Codex CLI login, with a login flow offered only if necessary. Do not imply that Claude subscription limits trigger an API-supported automatic event.
- One downloadable, standard installer per supported platform (Windows, macOS, Linux), with a normal uninstall. All first-party ClaudeBridge source, built UI and scripts are embedded. Only external dependencies may be fetched, with user consent and verified sources.
- No global Node installation, PATH mutation, additional always-on servers, or duplicated language runtimes.
- Avoid changes to the original Claude app, original model IDs, other MCP registrations, unrelated source folders and credentials.

## Supported integration surfaces (confirmed against Claude documentation)

- Desktop Extensions/MCPB: officially supported for *local MCP servers in regular Claude Desktop chat*. Once installed, these tools appear in conversations automatically. Desktop extensions use Claude Desktop's included Node runtime; no global Node installer is required. [Claude Help: Getting Started with Local MCP Servers, 2026]
- MCP Apps: interactive settings widgets **inside conversation content**, not native chrome/model picker UI. [Claude Help: Interactive Connectors]
- Claude plugins: skills and commands usable in Chat; local MCP bundled in a plugin runs only in Cowork and Claude Code, **not in Chat**. Hooks and subagents also run only in Cowork and Claude Code. [Claude Help: Use Plugins, 2026]
- Desktop mods and custom-model GitHub repos: separate from the standard Chat model selector. Proven Code-tab custom-model injection is not proof of Chat-tab native picker support.
- No documented/official MCP, skill, hook, plugin or mod API has been verified that can add custom controls to the **original Chat tab model dropdown**. Treat this as an unmet acceptance criterion until demonstrated and tested in the real Claude Desktop client.

## Architecture decision

**Primary integration** is a user-scoped Claude Desktop MCP server / Desktop Extension. An optional Claude plugin may add skills/commands to surface ClaudeBridge workflows, but cannot replace the MCP integration for ordinary Chat. An MCP App handles settings in supported conversation views.

**Do not ship launcher-based CDP injection as the claimed native model-picker solution.** The existing native companion is a legacy experiment and violates the acceptance criterion. Its installer must not be enabled automatically in the standard distribution. Preserve a safe removal path only for users who previously installed it.

For native model-picker access: either obtain a verified in-process integration that works with Claude Desktop's *regular Chat tab* and the normal Claude launcher on all supported platforms, or clearly state that this criterion is currently unavailable. Never replace it silently with an in-chat widget and never claim full support from mock UI tests alone.

## Acceptance tests

1. Clean system: download exactly one platform installer; Claude Desktop already installed; install and open normal Claude icon. ClaudeBridge tools work in ordinary Chat and in project chats without separate launcher.
2. Native control appears in the existing Chat model menu **on the normal Claude client** and changes persisted mode settings; test live, not with simulated DOM.
3. No Codex login: user gets opt-in ChatGPT device authentication; existing login is detected, not overwritten.
4. Parallel Codex tasks run with proper isolation, memory and cancellation while Claude remains responsive.
5. Uninstall removes the owned MCP registration, native augmentation if one exists, installed files and only explicitly selected Bridge user data; unrelated applications and project source remain.
6. No global Node install, duplicate Node copies, TLS proxy or privileged system service.
7. Repeat test separately on actual Windows, macOS, Linux Claude Desktop client builds.

Until test 2 is actually demonstrated, describe the project as **MCP-integrated with native model-menu integration pending**, not as fully complete.
