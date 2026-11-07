---
name: bridge-dual
description: Coordinate Claude and Codex in the current project
---

Check `bridge_health`, `bridge_settings` and the selected project using `bridge_project`. Respect the actual mode. If the user wants dual-agent execution and mode is not `dual`, ask for their approval before changing settings. Use `bridge_plan` for explicit plans, `bridge_delegate` for independent Codex tasks and `bridge_status` for progress. Prefer Git worktrees for write tasks, avoid overlapping file modifications and review changes before merging. If Codex is not logged in, offer `bridge_login` only with permission. Never claim parallel execution until the MCP tool confirms the task started.
