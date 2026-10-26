#!/usr/bin/env bash
# Scans tracked files and git history for personal details and secrets before
# the repo goes public. Exits non-zero if anything is found.
#
#   scripts/prepublish-check.sh [ref]   (default: HEAD)
set -u
ref="${1:-HEAD}"
fail=0
report() { echo "FOUND: $1"; fail=1; }

cd "$(git rev-parse --show-toplevel)" || exit 2

# Patterns built at runtime, so this script holds no personal data itself.
email="$(git config user.email || true)"
home_dir="${HOME:-/nonexistent}"
patterns=(
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'   # any email address
  '/Users/[A-Za-z0-9._-]+'                            # macOS home paths
  '/home/[A-Za-z0-9._-]+'                             # Linux home paths
  '\b[A-Z]{2,6}-[0-9]+\b'                             # tracker ticket ids
  'gh[pousr]_[A-Za-z0-9]{20,}'                        # GitHub tokens
  'sk-[A-Za-z0-9_-]{20,}'                             # API keys
  'figd_[A-Za-z0-9_-]{20,}'                           # Figma tokens
  'AKIA[0-9A-Z]{16}'                                  # AWS keys
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

files="$(git ls-tree -r --name-only "$ref")"
[ -z "$files" ] && { echo "no files at $ref"; exit 2; }

for pat in "${patterns[@]}"; do
  hits="$(git grep -nIE -e "$pat" "$ref" -- . ':!scripts/prepublish-check.sh' ':!package-lock.json' 2>/dev/null \
    | grep -vE 'users\.noreply\.github\.com' || true)"
  [ -n "$hits" ] && report "pattern $pat" && echo "$hits" | sed 's/^/  /'
done

if [ -n "$email" ]; then
  hits="$(git grep -nIF -e "$email" "$ref" 2>/dev/null || true)"
  [ -n "$hits" ] && report "your git email in files" && echo "$hits" | sed 's/^/  /'
fi
if [ "$home_dir" != "/nonexistent" ]; then
  hits="$(git grep -nIF -e "$home_dir" "$ref" 2>/dev/null || true)"
  [ -n "$hits" ] && report "home directory path in files" && echo "$hits" | sed 's/^/  /'
fi

# Commit metadata: every author, committer and message in the history.
bad="$(git log "$ref" --format='%ae%n%ce' | sort -u | grep -v 'users\.noreply\.github\.com' || true)"
[ -n "$bad" ] && report "non-noreply emails in commit history" && echo "$bad" | sed 's/^/  /'
msgs="$(git log "$ref" --format='%h %s%n%b' | grep -E '\b[A-Z]{2,6}-[0-9]+\b' || true)"
[ -n "$msgs" ] && report "ticket ids in commit messages" && echo "$msgs" | sed 's/^/  /'

# Files that should never be published.
for f in $files; do
  case "$f" in
    .env|.env.*|*.pem|*.key|.DS_Store|.claude/*|.scratch/*|CLAUDE.md|BOARD.md) report "sensitive file tracked: $f" ;;
  esac
done

[ "$fail" -eq 0 ] && echo "clean: nothing found at $ref"
exit "$fail"
