#!/bin/sh
set -u

cd "$(dirname "$0")/.." || exit 1

failures=0
fail() {
    printf 'FAIL: %s\n' "$1" >&2
    failures=$((failures + 1))
}

validate_rule_frontmatter() {
    awk '
        NR == 1 { if ($0 != "---") bad = 1; next }
        !closed && $0 == "---" { closed = 1; next }
        closed { next }
        /\t/ { bad = 1; next }
        /^description: [^ ].+/ { descriptions++; next }
        /^alwaysApply: (true|false)$/ { always_apply++; next }
        { bad = 1 }
        END { exit !(closed && descriptions == 1 && always_apply == 1 && !bad) }
    ' "$1"
}

validate_skill_frontmatter() {
    expected_name=$2
    awk -v expected_name="$expected_name" '
        NR == 1 { if ($0 != "---") bad = 1; next }
        !closed && $0 == "---" { closed = 1; next }
        closed { next }
        /\t/ { bad = 1; next }
        $0 == "name: " expected_name { names++; in_paths = 0; next }
        /^description: [^ ].+/ { descriptions++; in_paths = 0; next }
        /^disable-model-invocation: (true|false)$/ { disable++; in_paths = 0; next }
        /^paths:$/ { paths++; in_paths = 1; next }
        in_paths && /^  - "[^"]+"$/ { path_items++; next }
        { bad = 1 }
        END {
            if (paths > 0 && path_items == 0) bad = 1
            exit !(closed && names == 1 && descriptions == 1 && paths <= 1 && disable <= 1 && !bad)
        }
    ' "$1"
}

for path in \
    README.md CHANGELOG.md LICENSE AGENTS.md CLAUDE.md \
    .gitignore .cursorignore .dockerignore .env.example \
    .cursor/permissions.json scripts/validate-template.sh; do
    [ -f "$path" ] || fail "missing $path"
done

for path in \
    .cursor/rules/safety.mdc \
    .cursor/rules/collaboration.mdc \
    .cursor/rules/dev-cycle.mdc \
    .cursor/rules/quality.mdc \
    .cursor/rules/simplicity.mdc \
    .cursor/rules/project-memory.mdc \
    .cursor/rules/delivery-policy.mdc \
    .cursor/commands/checkpoint.md \
    .cursor/commands/check.md \
    .cursor/commands/explain.md \
    .cursor/commands/release.md; do
    [ -f "$path" ] || fail "missing $path"
done

for rule in .cursor/rules/*.mdc; do
    [ -f "$rule" ] || { fail 'no Cursor rules found'; break; }
    validate_rule_frontmatter "$rule" || fail "$rule has invalid or unsupported frontmatter"
done

for skill in idea-interview plan-review project-audit docs-writer ai-app-checkup deploy-readiness semver-bump; do
    file=".cursor/skills/$skill/SKILL.md"
    [ -f "$file" ] || { fail "missing $file"; continue; }
    validate_skill_frontmatter "$file" "$skill" || fail "$file has invalid or unsupported frontmatter"
done

for skill in idea-interview plan-review project-audit docs-writer ai-app-checkup deploy-readiness semver-bump check checkpoint explain release; do
    file=".agents/skills/$skill/SKILL.md"
    [ -f "$file" ] || { fail "missing Hermes skill $file"; continue; }
    awk -v expected_name="$skill" '
        NR == 1 { if ($0 != "---") bad = 1; next }
        !closed && $0 == "---" { closed = 1; next }
        closed { next }
        $0 == "name: " expected_name { names++; next }
        /^description: [^ ].+/ { descriptions++; next }
        { bad = 1 }
        END { exit !(closed && names == 1 && descriptions == 1 && !bad) }
    ' "$file" || fail "$file has invalid Hermes frontmatter"
done

for skill in idea-interview plan-review project-audit docs-writer ai-app-checkup deploy-readiness semver-bump; do
    cursor_file=".cursor/skills/$skill/SKILL.md"
    hermes_file=".agents/skills/$skill/SKILL.md"
    [ -f "$hermes_file" ] || continue
    cursor_body=$(awk 'NR > 1 && /^---$/ { body = 1; next } body { print }' "$cursor_file")
    hermes_body=$(awk 'NR > 1 && /^---$/ { body = 1; next } body { print }' "$hermes_file")
    [ "$cursor_body" = "$hermes_body" ] || fail "$skill differs between Cursor and Hermes"
done

for skill in check checkpoint explain release; do
    cursor_file=".cursor/commands/$skill.md"
    hermes_file=".agents/skills/$skill/SKILL.md"
    [ -f "$hermes_file" ] || continue
    cursor_body=$(cat "$cursor_file")
    hermes_body=$(awk 'NR > 1 && /^---$/ { body = 1; next } body { print }' "$hermes_file")
    [ "$cursor_body" = "$hermes_body" ] || fail "$skill command differs between Cursor and Hermes"
done

for file in .gitignore .cursorignore .dockerignore; do
    for pattern in '.env' '*.pem' '*.key' 'credentials' 'service-account*.json' 'id_rsa' 'id_ed25519' '.npmrc' '.netrc'; do
        grep -Fq "$pattern" "$file" 2>/dev/null || fail "$file does not cover $pattern"
    done
done

for file in .gitignore .cursorignore .dockerignore; do
    grep -Fq '.cursor/mcp.json' "$file" 2>/dev/null || fail "$file does not cover .cursor/mcp.json"
done

grep -Fq '.git' .dockerignore 2>/dev/null || fail '.dockerignore does not cover .git'

private_endpoint_pattern="ssh""://|git""@|https?://[^ /]*(\.internal|\.corp|\.local)(/|$)"
if find . -type f ! -path './.git/*' \
    -exec grep -Eq "$private_endpoint_pattern" {} + 2>/dev/null; then
    fail 'private infrastructure endpoint remains'
fi

private_path_pattern='/home/[A-Za-z0-9_]|/Users/[A-Za-z0-9_]'
if find . -type f ! -path './.git/*' \
    -exec grep -Eq "$private_path_pattern" {} + 2>/dev/null; then
    fail 'personal absolute path remains'
fi

grep -q 'explicit confirmation' .cursor/commands/release.md 2>/dev/null \
    || fail 'release command must require explicit confirmation before push'
grep -q 'explicit confirmation' .agents/skills/release/SKILL.md 2>/dev/null \
    || fail 'Hermes release skill must require explicit confirmation before push'

if grep -Eiq 'git[[:space:]]+push|gh[[:space:]]+release[[:space:]]+create|npm[[:space:]]+publish|docker[[:space:]]+push' \
    .cursor/commands/release.md; then
    fail 'release command must not embed an executable publication command'
fi
if grep -Eiq 'git[[:space:]]+push|gh[[:space:]]+release[[:space:]]+create|npm[[:space:]]+publish|docker[[:space:]]+push' \
    .agents/skills/release/SKILL.md; then
    fail 'Hermes release skill must not embed an executable publication command'
fi

grep -Fq 'After three failed attempts' AGENTS.md 2>/dev/null \
    || fail 'AGENTS.md must carry the three-attempt rule for Hermes'
grep -Fq '.agents/skills/' README.md 2>/dev/null \
    || fail 'README must explain Hermes skills'

grep -q '^MIT License$' LICENSE 2>/dev/null || fail 'LICENSE must be MIT'
grep -q 'security boundary' README.md 2>/dev/null \
    || fail 'README must state the security limitation'

if [ "$failures" -ne 0 ]; then
    printf '%s contract check(s) failed\n' "$failures" >&2
    exit 1
fi

printf 'OK — base-template contract is satisfied\n'
