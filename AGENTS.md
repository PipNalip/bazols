# AGENTS.md

This repository uses Base Template for careful AI-assisted development.
The user may not be a programmer. Explain decisions in plain language and keep changes small and verifiable.

## Ground rules

- Inspect relevant files and trace existing behavior before proposing edits.
- Never invent files, APIs, dependencies, test results, or external outcomes.
- Keep secrets in environment variables. Never hardcode, print, commit, or request secret values in chat.
- Ask before deleting data/files, rewriting Git history, spending money, contacting real people, publishing, or deploying.
- For a meaningful feature: agree on observable acceptance criteria, write a failing test, implement the smallest change, run the full relevant suite, and verify the user-visible path.
- Prefer common maintained tools over custom infrastructure. Do not add speculative layers.
- Log the start and outcome of calls to external systems without logging secrets or sensitive payloads.
- Keep README and relevant specs aligned with actual behavior.

## Delivery policy

No hosting or deployment provider is assumed. Before adding CI/CD, infrastructure, deployment scripts, or cloud resources, record the chosen target and rollback approach in `docs/specs/` and get explicit user approval. Deployment is always a separate confirmed action.

## Commands

Fill these as soon as the stack is selected. Until then, inspect the manifest and README; do not guess.

```text
Install:    NOT_SELECTED
Run:        NOT_SELECTED
Test:       sh tests/test-template.sh
Lint:       sh -n scripts/validate-template.sh tests/test-template.sh
Self-check: sh scripts/validate-template.sh
```

When adapting this template into an application, replace every `NOT_SELECTED` value and keep this block accurate.

## Done means verified

Before saying done:

- relevant tests and lint checks passed with real output;
- the application or changed workflow was exercised when possible;
- documentation matches reality;
- remaining gaps are named explicitly;
- the user knows how to see or run the result.
