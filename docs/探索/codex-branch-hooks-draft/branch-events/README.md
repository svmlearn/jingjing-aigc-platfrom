# Codex Branch Events

This directory is the local queue used by the project-level Codex hooks.

Tracked:

- `README.md`

Ignored runtime state:

- `inbox/` — worker branches publish `branch_ready` JSON events here.
- `processed/` — main moves handled events here.
- `runtime/` — reserved for local hook state.

Do not commit runtime event files. Durable decisions belong in `docs/progress/*branch-control-board*.md`.
