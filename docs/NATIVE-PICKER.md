# Native Claude Desktop picker integration

Status: **experimental adapter, not installed or routed by ClaudeBridge 2.2**.

## What the reference implementation demonstrates

[ClaudeRipple](https://github.com/PBJ-2/clauderipple) demonstrates a working extra model entry in the **Claude Desktop Code-tab picker**. It does so by handling Claude Desktop's bootstrap response (`model_selector_config`) and routing the selected model ID through an authenticated local proxy.

This is distinct from the normal Claude Projects chat and from an MCP tool list. A model-picker entry is not automatically a working agent or a toggle. It must route to a valid responder; otherwise selecting it could break the request.

ClaudeRipple uses the GPL-3.0 license. ClaudeBridge's adapter was written independently and does not import its source code.

## Implementation in this repository

- `integrations/picker.js` is a pure, testable bootstrap adapter.
- It adds one `claudebridge` entry to Code/Cowork-related picker surfaces while leaving the normal chat surface intact.
- It is idempotent and preserves the original response.
- It is **not** invoked during MCPB installation, and does not install certificates or modify Claude Desktop.

## Required for a production-ready picker

1. Detect the exact Claude Desktop build and applicable Code surface.
2. Provide an opt-in **local HTTPS proxy** that processes only the allowlisted bootstrap path, safely passes all other traffic through, and preserves MCP, login, streaming, Cloud sessions and Remote Control.
3. Obtain explicit consent before trusting a certificate or changing any desktop proxy configuration.
4. Register and route the `claudebridge` model ID to an actual model responder. A coordinator is not itself a language model.
5. Connect selection with the same mode store used by `bridge_settings`; selecting Off/Manual/Fallback/Dual must affect Codex delegation, not silently replace the active Claude model.
6. Offer an atomic rollback and verify the original picker and MCP still work after enabling/disabling the integration.
7. Integration-test Windows x64 against a real Claude Desktop Code-tab build before enabling automatically.

## Supported control surface today

ClaudeBridge 2.2 uses **MCP Apps** to display its interactive control panel *inside a Claude conversation* while retaining normal MCP task tools. Ask Claude to **Open ClaudeBridge settings**. This is the implemented supported UI; the model-picker adapter is a separate experimental foundation.

This project does not claim that the original model picker currently has a working ClaudeBridge submenu. It would be inaccurate to label the picker prototype as finished.
