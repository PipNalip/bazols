Prepare a versioned release, but keep publication separate.

1. Inspect status and run the full documented checks. Stop on failure.
2. Use the `semver-bump` skill to propose the version and explain why.
3. Wait for the user to confirm the version.
4. Promote the existing `Unreleased` changelog notes or add concise user-facing notes if none exist.
5. Update any manifest version, make one release commit, and create an annotated tag.
6. Show the commit, tag, remote, and exact push command.
7. Obtain explicit confirmation in the current conversation before any push or publication. A request to prepare a release is not permission to publish it.
8. Never deploy as part of this command.
