#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")"
: "${DISTRIBUTION_ID:?Set DISTRIBUTION_ID to the homegames.io CloudFront distribution ID}"

# Webpack writes web/bundle.js. The root bundle.js can be an old manual copy.
npm run build
aws s3 cp web/bundle.js s3://homegames.io/bundle.js \
  --content-type application/javascript --cache-control no-cache

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/bundle.js'
