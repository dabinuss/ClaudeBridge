# ClaudeBridge 2.7 — Ripple-Lite native Claude Desktop integration

## User experience

Install ClaudeBridge once. The **original Claude Desktop application and original shortcut** are preserved. After one-time permission to trust the local ClaudeBridge CA (displayed with fingerprint during installation), a single user-scoped Node.js proxy starts at login. Claude Desktop's existing managed `egressProxyUrl` setting points at this loopback service. There is no new launcher, no `app.asar` patch and no alternative Claude client.

### Normal Chat tab

The proxy intercepts only the relevant `claude.ai` TLS session and adds a local first-party script to HTML pages where the CSP/nonce permits it. That script uses the existing `integrations/native-ui/renderer.js` DOM anchors to insert **Off / On demand / Fallback / Dual agents**, Codex status and login into the native model dropdown. The underlying Claude model selection and request routing remain unchanged. These controls update the same settings that ClaudeBridge MCP uses. They do not independently replace the server-side claude.ai model, intercept existing chats, or cause the model to delegate automatically without an MCP action.

When CSP or known DOM anchors do not match, injection is skipped (fail closed) rather than modifying unknown interface elements.

### Code tab

The proxy also adds a Codex-backed choice to CLI-backed bootstrap surfaces only when a signed-in Codex CLI is detected. A minimal Anthropic Messages API adapter can answer text requests through Codex CLI and emit text/SSE responses. **It rejects Claude Code tool schemas.** The existing ClaudeBridge MCP worker continues handling genuine code delegation and project memory.

## Files

- `integrations/ripple-lite/daemon.js` — the only additional resident process
- `proxy.js` — loopback HTTP CONNECT with scoped TLS interception and authenticated local endpoints
- `certs.js` — private CA and host certificates using Node native RSA + pinned node-forge
- `trust.js` — explicit user-scoped certificate trust/untrust
- `desktop-config.js` — managed Desktop config owner-tracked apply/restore
- `service.js` — login autostart on Windows, macOS and Linux
- `lifecycle.js` / `activate.js` — interactive install, restore, shutdown
- `html-inject.js` / `chat-rpc.js` — guarded normal Chat menu insertion and limited setting actions
- `bootstrap.js` / `transform.js` — CLI-surface model list additions
- `codex-model.js` — limited text-only Codex model route

## Security / rollback

- Certificate is locally generated; private key and CA key reside in user-private directories (0600 where supported).
- No system-wide proxy setting. Only Claude's managed config entry is changed, and its previous applied ID is preserved.
- The local control endpoint requires a per-run 256-bit token; RPC additionally checks the first-party Origin and only allows four known actions.
- No root CA is installed without interactive confirmation. Uninstall attempts proxy restoration and trust removal before deleting program files.
- No automatic bypass of TLS verification for upstream HTTPS requests.
- A proxy startup failure prevents applying the Desktop proxy setting.
- Node, Codex and node-forge are downloaded only as external pinned dependencies. ClaudeBridge-owned scripts ship inside the installer.

## Verification and limitations

Automated tests cover TLS certificate creation, trust command construction, CONNECT, actual local TLS handshake, bootstrap rewriting, model text routing via a mocked Codex binary, first-party HTML script injection, DOM mode actions, settings RPC and reversible service/config changes.

**A live signed-in Claude Desktop test is still required.** The first-party page structure, CSP and proprietary server behavior can change. The normal Chat menu modes control MCP delegation; they do not replace Claude's server-side inference. Code-tab direct Codex routing is text-only, not full tool-call parity. The feature must not be described as proven production-compatible before those integration tests.
