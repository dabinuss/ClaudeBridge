---
name: bridge
description: Open ClaudeBridge agent controls in this chat
---

Use the locally installed ClaudeBridge MCP tools, not an external program or second Claude launcher. Call `bridge_health` and `bridge_settings` with `{"action":"get"}` to determine the current Codex status and mode. If available, invoke `bridge_control_panel` to display the interactive mode control within this chat; if this client cannot render MCP Apps, offer to switch mode by invoking `bridge_settings` with the user's chosen value.

Valid modes: `off`, `manual`, `fallback`, `dual`. Never present these as new Claude model identities or imply they were added to the model picker. Do not start login if already signed in. If the MCP tools are not connected, explain that ClaudeBridge's local Desktop MCP integration must be enabled.
