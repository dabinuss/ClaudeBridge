# Chat integration without a second Claude launcher

## Shipped and automatically registered by the standard installer

- The normal Claude Desktop icon continues to start the original application.
- The local `claudebridge` MCP server is registered under the user's normal Claude Desktop configuration, with a privately managed Node runtime.
- Available MCP tools: health, settings, Codex login, project selection, delegation, plans, task status, persistent memory, messages and cancellation.
- Available standard MCP prompts: `claudebridge-settings`, `claudebridge-dual`, `claudebridge-review`, `claudebridge-login`.
- The MCP App control panel appears **inside a conversation** when the Claude client supports MCP Apps. All functions remain callable as tools if this renderer is not available.
- No second Claude launcher, background proxy, system CA, global PATH entry or always-on daemon is installed.

## Optional account-level Claude Chat skill

The files under `claude-plugin/` contain a valid Claude plugin with a `claudebridge` skill. Plugins and skills can work in ordinary Claude Chat; however, Claude requires **user-authorized account-level installation**. Merely placing files on disk does not install a skill into your Claude account.

If desired, package `claude-plugin/` as a .plugin archive and import it through Claude's **Plugins** interface (formerly Customize → Plugins). The package includes supported slash-menu commands `/bridge`, `/bridge-login` and `/bridge-dual`, accessible via the chat's `/` or `+` menu after user-authorized plugin installation. These commands guide Claude's use of the installed MCP tools; they **do not inject controls into the native model selector**. This step is **optional**; the local ClaudeBridge MCP server is already usable without it. Do not install a plugin's local MCP server as a replacement in Chat: Anthropic restricts bundled local plugin-MCP execution there.

## Hard boundary: original Chat model picker

As of 2026-11-07, no documented Anthropic API has been verified that allows third-party local extensions to insert settings beside the **native Chat model selector**. Public model-picker mods such as ClaudeRipple and Claude Desktop Extra modify the **Code** tab or repackage/patch the Claude application; this is not proof of regular Chat-tab compatibility.

The original Chat model-menu requirement remains open. The previous separately launched Chrome DevTools companion is disabled for installation and kept only for uninstalling older versions. Native model-picker support can be marked complete only after a standard-launcher client test demonstrates correct behavior on Windows/macOS/Linux.

## Test coverage

- `tests/v2.js` for real MCP protocol processes and Codex worker lifecycle.
- `tests/ui.js` for settings, MCP App panel, named Chat prompts and disabled legacy native install.
- `tests/standalone-setup.js` for local automatic MCP registration, safe uninstall and preservation of unrelated MCP registrations.
- CI on GitHub-hosted Windows, macOS and Linux.

These are protocol and build tests, **not** authenticated live GUI testing.
