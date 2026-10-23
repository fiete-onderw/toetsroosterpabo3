#!/bin/sh
# Draait alle tests. Vooraf: python3 -m http.server 8766 in de hoofdmap.
cd "$(dirname "$0")/.." || exit 1
export PLAYWRIGHT_PAD="${PLAYWRIGHT_PAD:-playwright}"
fouten=0
node tests/parse.test.js
node tests/parse2.test.js
node tests/ics.test.mjs
node tests/ics-import.test.js | tail -1
for t in app randgevallen aanraken import meeplannen openen; do echo "== $t"; node "tests/$t.test.js" | grep -v "^PASS" || true; done
node tests/xss.test.js | tail -1
node tests/sw-push.test.js | tail -3
