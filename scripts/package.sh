#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
mkdir -p "$root/dist"
rm -f "$root/dist/Better YouTube.zip"
(cd "$root/extension" && zip -qr "$root/dist/Better YouTube.zip" . -x '*.DS_Store')
echo "Created dist/Better YouTube.zip (Safari temporary extension, not a signed app)."
