---
name: bridge-login
description: Check Codex login and connect ChatGPT only if required
---

Use `bridge_health` first. If Codex is already signed in, report success and do not trigger another login. If Codex CLI is missing, explain that the ClaudeBridge dependency installation needs repair. If Codex is installed but not signed in, ask the user before invoking `bridge_login`. Device authorization occurs outside this conversation; do not request passwords or verification tokens in chat.
