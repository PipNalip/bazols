---
name: deploy-readiness
description: Use when the user asks whether an application is ready for a chosen runtime or deployment target; verify container/runtime behavior without assuming a provider.
paths:
  - "**/Dockerfile"
  - "**/.dockerignore"
  - "**/compose*.yml"
  - "**/package.json"
  - "**/pyproject.toml"
  - "**/requirements*.txt"
---

# Deploy readiness

First identify the selected target. If none is documented, report that as a decision gap rather than inventing one.

Check with file-and-line evidence:

- dependencies are declared and reproducible;
- config and secrets come from the environment;
- important state lives outside disposable processes;
- logs go to stdout/stderr;
- the runtime uses the assigned port where applicable;
- startup, health, migration, background-job, and shutdown behavior are documented;
- build context excludes secrets, credentials, VCS metadata, local dependencies, and caches;
- image/process runs without embedded credentials and preferably without root privileges;
- deployment trigger, artifact identity, health check, rollback, and owner match the accepted delivery spec.

Run the real build/start/health path when safe. Report green/yellow/red, blockers, unknowns, and the smallest handoff checklist. Never deploy during this check.
