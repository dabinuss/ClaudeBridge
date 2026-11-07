# ClaudeBridge Ripple-lite research and prototype

The module `integrations/ripple-lite/bootstrap.js` is an independent bootstrap-list adapter, not a proxy, installer, or functional model routing implementation.

## Confirmed boundary

ClaudeRipple injects additional model entries into `model_selector_config` in the `/edge-api/bootstrap` response and restricts injection to CLI-backed surfaces `code`, `ccd`, `ccr`, `cowork`. Ordinary Claude Chat does **not** use the same CLI routing path. This means advertising a fake model in Chat would not provide functional Codex chat integration.

Reference implementation studied: https://github.com/PBJ-2/clauderipple/blob/main/packages/router/src/picker.ts

## Required to make this real

1. Local HTTP CONNECT proxy bound to loopback, with strong TLS certificate validation and strictly scoped interception.
2. Install a per-user CA only with explicit user consent and reliably remove it.
3. Configure Claude Desktop's managed proxy settings for regular launches; preserve and restore existing values.
4. Implement actual requests routing for each advertised model ID, including streaming, cancellation, and authentication.
5. Connect routes to ClaudeBridge's existing Codex workers/MCP tools; test tool-call compatibility and project context.
6. Test in a real signed-in Claude Desktop instance on each supported OS.
7. Verify the **normal chat** model menu separately; this is not supported by this bootstrap prototype.

No patched Claude app, separate launcher, or globally installed Node is required by the intended architecture; a small local proxy process would be required while the feature is enabled.

Run: `node tests/ripple-lite.js`.
