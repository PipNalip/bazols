---
name: plan-review
description: Use only when the user explicitly asks for an independent read-only review of an implementation plan against the repository and accepted requirements.
disable-model-invocation: true
---

# Plan review

Return `approve`, `revise`, or `reject` with evidence. Do not edit during review.

## Method

1. Read the plan, accepted spec, `AGENTS.md`, README, manifests, and every path the plan names.
2. Build a trace: outcome → step → owning file → test → verification → rollback.
3. Search for existing code and maintained prior art before accepting new mechanisms.
4. Replay normal, edge, failure, retry, and partial-success paths.
5. Check secrets, destructive actions, external writes, costs, data migration, observability, and delivery assumptions.
6. Reject blockers based on concrete failure scenarios, not taste.
7. Re-open every cited file before reporting.

## Report

Lead with verdict and at most three blockers. For each finding give path/line evidence, concrete impact, smallest plan correction, and proof required. List unknowns separately. Empty findings are valid; do not manufacture work.
