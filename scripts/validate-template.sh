#!/bin/sh
set -u

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
cd "$root" || exit 1

sh tests/test-template.sh || exit 1
sh -n scripts/validate-template.sh tests/test-template.sh || exit 1

if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json; json.load(open(".cursor/permissions.json"))' || exit 1
elif command -v node >/dev/null 2>&1; then
    node -e 'JSON.parse(require("fs").readFileSync(".cursor/permissions.json", "utf8"))' || exit 1
else
    printf 'WARN: no Python or Node runtime; permissions JSON was not parsed\n' >&2
fi

skill_count=0
for file in .cursor/skills/*/SKILL.md; do
    [ -f "$file" ] || continue
    skill_count=$((skill_count + 1))
    folder=$(basename "$(dirname "$file")")
    grep -q "^name: $folder$" "$file" || {
        printf 'FAIL: skill name mismatch in %s\n' "$file" >&2
        exit 1
    }
    lines=$(wc -l < "$file" | tr -d ' ')
    [ "$lines" -le 500 ] || {
        printf 'FAIL: %s exceeds 500 lines\n' "$file" >&2
        exit 1
    }
done

[ "$skill_count" -gt 0 ] || {
    printf 'FAIL: no skills found\n' >&2
    exit 1
}

printf 'OK — base-template is healthy (%s skills checked)\n' "$skill_count"
