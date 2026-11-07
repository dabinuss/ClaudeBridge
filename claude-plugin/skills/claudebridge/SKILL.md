---
name: claudebridge
description: Coordinate Claude and Codex on local software projects, switch ClaudeBridge modes, inspect job status, manage shared project memory, and help connect a ChatGPT/Codex account. Use when the user mentions ClaudeBridge, Codex delegation, working together with Codex, or shared agent workflows.
---

# ClaudeBridge workflow

Use the ClaudeBridge local MCP integration in the **normal Claude Desktop chat**. This skill adds instructions and discovery; it does not install a local MCP server in Chat, modify the native model selector, or open an extra Claude client.

## Before running Codex

1. Call `bridge_health` and `bridge_settings` (action `get`). If the tools are unavailable, say the local ClaudeBridge MCP desktop integration needs installing; do not claim that the plugin's skill alone connects a local process.
2. If Codex CLI is available and already authenticated, reuse the session. If not authenticated, ask whether to start sign-in, then call `bridge_login`. Never request or display passwords, API keys, or tokens.
3. For a project-specific task, use `bridge_project` (action `list`) before asking for a path. If the user explicitly chooses a project, select it. Do not register or switch to an unknown folder.
4. Respect the active mode. `off`: do not delegate. `manual`: delegate upon request. `fallback`: delegate only when the user explicitly asks or an externally verified limit exists, not because the model assumes a quota. `dual`: divide non-overlapping work between Claude and Codex.

## During work

- Preserve the user's original task and plan through `bridge_plan` when appropriate; execute an approved plan only after explicit approval.
- For code tasks, prefer Git worktree isolation; never start two workers writing the same files.
- Use `bridge_delegate` for actual Codex work, `bridge_status` to inspect progress, `bridge_context` and `bridge_memory` for durable handoffs, and `bridge_worktrees` to review changes before merging.
- Use `bridge_cancel` and `bridge_resume` only for the corresponding user-requested tasks.
- Open `bridge_control_panel` to let the user change modes inside a supported Claude conversation, or use `bridge_settings` directly.
- Never claim this skill appears inside the **original model dropdown in Chat**; Claude does not expose a verified native-picker API through this skill.

## Chat versus Claude Code/Cowork

This skill can provide Chat guidance when installed in the user's Claude account. Local bridge execution in ordinary Chat still depends on the separately installed **local MCP desktop integration**. Hooks and subagents only apply where Claude supports them (Claude Code/Cowork), and are not a substitute for Chat's local MCP.
