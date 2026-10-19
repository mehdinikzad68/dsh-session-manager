# dsh-session-manager

English | [فارسی](README.fa.md)

**Session deletion for the DeepSeek Harness (DSH) Web GUI.**

DSH can archive sessions but never delete them — the shipped persistence layer
has no deletion API, and workspace deletion keeps every session log on disk.
This plugin fills that gap:

- **Sidebar** — every session's `…` menu gets a **Delete…** row (after the
  shipped *Copy Session ID*), with a confirmation dialog.
- **Settings → Session Manager** — a management page listing every registered
  workspace and every orphaned directory with per-session sizes, event counts,
  and dates: per-row delete, checkbox bulk delete, and *Delete workspace data…*
  (removes the registration **and** its session logs).
- **Trash, not `rm`** — deleted session directories are *moved* to
  `$DSH_HOME/trash/sessions/<timestamp>--<id>/` with a `manifest.json`, so the
  settings page can **Restore** them until you *Empty trash*.

## How it works

```
┌──────────────────────┐  same-origin fetch   ┌─────────────────────────────┐
│ lib/client.js        │ ───────────────────▶ │ lib/index.js (Host half)    │
│  • menu slot row     │  /session-manager-…  │  • authenticated HTTP route │
│  • settings page     │ ◀────────────────── │  • workspaceRegistry        │
└──────────────────────┘      JSON           │  • sessionPersistence       │
                                             │  • archive → move to trash │
                                             └─────────────────────────────┘
```

Third-party client bundles get no package RPC channel in DSH (the Remote
namespaces are fixed at build time), so the two halves talk over the plugin's
own HTTP route registered through `ctx.webServer` — the documented
route-owner pattern. Every request passes the same browser trust fence as the
shipped `/api` route (`ctx.connection.requestRejection`), so only an
authenticated DSH page can call it; the browser's signed cookie rides the
same-origin `fetch` automatically.

Deletion flow per session: refuse if live → archive through
`workspaceRegistry.archiveSession` (so the row leaves the sidebar's default
*Hide archived* view immediately) → `rename` the session directory into the
trash → drop the empty project directory. Workspace purge: refuse if any of
its sessions is live → `workspaceRegistry.delete` → move every session
directory of that path to the trash.

## Install

Install straight from this repository — a Git address is a valid plugin spec:

```bash
dsh plugin --profile web add https://github.com/mehdinikzad68/dsh-session-manager
```

or paste the same URL into the Web GUI's **Plugins → Add plugin** dialog. For a
local checkout, pass the package directory's path instead. The bundle is
enabled on install: profiles with `patchReload: live` mount it without a
restart, while startup-only profiles (such as the Desktop profile) need one
DSH restart.

## Safety

- A **live** session (present in the in-memory session store or the agent
  registry) is always refused — stop it first.
- Deletion is a move, never an unlink: everything is recoverable from the
  trash until *Empty trash*.
- The HTTP API enforces DSH's browser authentication (401/403 otherwise).

## Limitations

- The sessions root is derived as `$DSH_HOME/sessions` (default `~/.dsh/sessions`).
  A profile that configures a different persistence `root` is not detected
  (v0.1).
- Session titles come from cached projection hints; sessions without hints
  show their id.
- `restore` recreates the directory (and unarchives if we archived it), but a
  workspace whose registration was purged must be re-registered by opening
  the folder again.
- After a delete, the sidebar hides the row via archive; the session summary
  disappears from lists on the next refresh.

## License

MIT © Mehdi Nikzad
