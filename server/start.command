#!/bin/bash
# Double-click this file to start the Ember sync server.
# `caffeinate` keeps your Mac awake so other devices can reach it while it runs.
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
  echo "Installing server dependencies (first run)…"
  npm install
fi
LANIP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "  Ember server starting."
echo "  On this Mac:        http://localhost:8787"
echo "  Same-WiFi devices:  http://$LANIP:8787"
echo "  (Leave this window open. Close it to stop the server.)"
echo ""
exec caffeinate -s node index.mjs
