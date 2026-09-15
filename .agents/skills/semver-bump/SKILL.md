---
name: semver-bump
description: Use when choosing the next semantic version from committed and uncommitted user-visible changes before a release.
---

# Semantic version bump

1. Find the latest semantic-version tag and inspect changes since it, including the working tree.
2. If there is an explicit `BREAKING CHANGE` or `!` marker, propose major.
3. Otherwise propose minor for backward-compatible user-visible capability and patch for fixes or small compatible improvements.
4. Documentation-only or internal work may be patch when the project versions those changes; explain the policy.
5. Never infer major solely from diff size.
6. If nothing releasable changed, say so instead of inventing a version.
7. Return the proposed version, classification evidence, and notable changes. Do not edit, tag, push, or publish.
