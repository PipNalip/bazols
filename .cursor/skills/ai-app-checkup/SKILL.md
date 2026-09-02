---
name: ai-app-checkup
description: Use when an application calls an AI model and needs a read-only check of prompts, state, observability, cost controls, validation, and human confirmation.
paths:
  - "**/prompts/**"
  - "**/ai/**"
  - "**/llm/**"
  - "**/*.prompt.md"
---

# AI app checkup

For each area report `ok`, `fail`, `n/a`, or `not confirmed` with file evidence.

- **Prompts:** important prompts are versioned and testable; prompt files contain no secrets or real personal data.
- **State:** conversation and workflow state survive process restarts when the product promises continuity.
- **Observability:** each model call records model, latency, token/cost data, and outcome without logging sensitive content.
- **Limits:** spend and request limits are checked before calls; retries are bounded and count toward limits.
- **Validation:** untrusted input is isolated from instructions; structured output is parsed and range-checked before use.
- **Human control:** money, messages, publication, deletion, and external writes require confirmation.
- **Kill switch:** AI can be disabled through configuration and the fallback path is exercised.

Lead with whether the AI path is safe to run, the worst bounded cost visible from code, and what breaks on restart. Do not fix findings during the check.
