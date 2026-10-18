#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")"
: "${DISTRIBUTION_ID:?Set DISTRIBUTION_ID to the homegames.io CloudFront distribution ID}"

# The complete static build reads gamesDirs and featuredGames from site.config.json.
# Forward all overrides, including --games-dir / --featured / --no-featured.
npm run build -- "$@"
# Upload immutable dependencies before pages start referencing them. Retain old
# hashed files for already-open pages, and never sync/delete the builds/ prefix.
aws s3 sync web/games/ s3://homegames.io/games/ --exclude '*.html' \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync web/studio-templates/ s3://homegames.io/studio-templates/ \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync web/studio-examples/ s3://homegames.io/studio-examples/ \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync web/game-app-icons/ s3://homegames.io/game-app-icons/ \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync web/ s3://homegames.io/ --exclude '*' --include 'homegames-client.*' \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync web/ s3://homegames.io/ --exclude 'homegames-client.*' \
  --exclude 'studio-templates/*' --exclude 'studio-examples/*' --exclude 'game-app-icons/*' --exclude 'games/*.zip' --exclude 'games/*.png' \
  --exclude 'games/*.jpg' --exclude 'games/*.jpeg' --exclude 'games/*.gif' \
  --exclude 'games/*.webp' --exclude 'games/*.avif' --exclude 'games/*.bmp' \
  --exclude 'games.json' --exclude 'studio-sw.js' --exclude 'game-app-sw.js' --cache-control no-cache
aws s3 cp web/games.json s3://homegames.io/games.json --content-type application/json --cache-control no-cache
# Make the new offline shell discoverable only after its dependencies arrive.
aws s3 cp web/studio-sw.js s3://homegames.io/studio-sw.js --content-type text/javascript --cache-control no-cache

aws s3 cp web/game-app-sw.js s3://homegames.io/game-app-sw.js --content-type text/javascript --cache-control no-cache

# Delete files left from older versions of the site: anything this build no
# longer produces. Older game packs, artwork, icons, templates, examples and
# runtimes stay for already-open pages and installed games, and builds/ holds
# the server downloads published by the homegames repository.
built=$(mktemp) live=$(mktemp)
trap 'rm -f "$built" "$live"' EXIT
(cd web && find . -type f | sed 's|^\./||' | LC_ALL=C sort) > "$built"
grep -qx 'index.html' "$built" || { echo "web/ looks incomplete; not deleting anything from S3" >&2; exit 1; }
aws s3api list-objects-v2 --bucket homegames.io --query 'Contents[].Key' --output text | tr '\t' '\n' | LC_ALL=C sort > "$live"
LC_ALL=C comm -23 "$live" "$built" \
  | { grep -Ev '^(builds/|games/|game-app-icons/|studio-templates/|studio-examples/|homegames-client\.|None$)' || true; } \
  | while IFS= read -r key; do aws s3 rm "s3://homegames.io/$key"; done
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*'
