---
name: WG platform workflow duplicates
description: Explains the duplicate legacy workflow names left over from initial artifact creation on this project.
---

This project has duplicate workflow pairs: `API Server` / `artifacts/api-server: API Server`, and `Waryaa Gaming` / `artifacts/wg-platform: web`. The non-prefixed ones (`API Server`, `Waryaa Gaming`) are legacy/manual workflows that hardcode the same ports as the real artifact-managed workflows, so they fail with EADDRINUSE when both are (re)started.

**Why:** the artifact registration flow created its own workflow (`artifacts/<dir>: <name>`) separate from workflows that existed before or were created ad hoc with the same command/port.

**How to apply:** Only restart/monitor the `artifacts/api-server: API Server` and `artifacts/wg-platform: web` workflows for this project. The legacy `API Server`/`Waryaa Gaming` workflows were removed via `removeWorkflow` once identified — if they reappear (e.g. re-added by the "Run" button/.replit `Project` group), remove them again rather than just tolerating the port-conflict noise.
