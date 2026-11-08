#!/bin/sh
# Builds docs/app.js and stamps the service-worker cache version.
set -e
cd "$(dirname "$0")"
npx esbuild src/app.js --bundle --minify --format=esm --target=safari15 --outfile=docs/app.js --log-level=warning
V=$(date +%Y%m%d%H%M%S)
sed "s/__VERSION__/$V/" src/sw.js > docs/sw.js
touch docs/.nojekyll
echo "built $V"
