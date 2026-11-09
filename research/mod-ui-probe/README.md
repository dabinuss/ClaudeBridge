# ClaudeBridge visual render-site probe (not a release plugin)

Temporary, read-only official Claude Code Mods UI probe; zero Node backend usage and no programmatic Desktop modifications.

With Claude Code >= 2.1.287 installed, in a local project:

```shell
claude plugin validate ./research/mod-ui-probe
claude --plugin-dir ./research/mod-ui-probe
```

Within Claude Code: `/plugin` to confirm the mod is **active** and `/bridge-probe` to list sites seen. Then inspect whether the labels `[ClaudeBridge probe: AbovePrompt]` and `[ClaudeBridge probe: SessionMode]` appear in the terminal and in a **local Code session** of the unmodified Claude Desktop app. `/reload-plugins` to reload installed mods in running sessions.

Record precise location and screenshot, especially relative to the global **MemeWars** header; a plugin event running does not mean the host paints a button there. A local Desktop session may ship a different Claude Code version from the CLI. This probe deliberately does not write project settings or launch Codex.
