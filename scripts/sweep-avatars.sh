#!/usr/bin/env bash
set -euo pipefail

AVATARS_DIR="${AVATARS_DIR:-/srv/cairn/avatars}"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

psql "$DATABASE_URL" -t -A -c \
  "SELECT id FROM public.profiles WHERE avatar_version > 0" >"$tmp"

swept=0
orphans=0

while IFS= read -r file; do
  uuid="${file%.webp}"
  uuid="${uuid##*/}"
  swept=$((swept + 1))
  if ! grep -qxF "$uuid" "$tmp"; then
    rm -f "$file"
    orphans=$((orphans + 1))
  fi
done < <(find "$AVATARS_DIR" -maxdepth 1 -name "*.webp" -type f)

echo "Swept ${swept} file(s) — ${orphans} orphan(s) removed."
