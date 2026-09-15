---
name: checkpoint
description: Verify and commit the intended local changes without publishing.
---
Save a local checkpoint of the current working state.

1. Inspect `git status` and the diff.
2. Run the documented tests and lint checks.
3. Scan changed files for accidental secrets without reading ignored secret files.
4. If checks fail, explain the risk and ask whether the user still wants a checkpoint.
5. Commit only the intended files with a concise Conventional Commit message.
6. Do not push, publish, or deploy.
7. Report the commit and the checks that actually ran.
