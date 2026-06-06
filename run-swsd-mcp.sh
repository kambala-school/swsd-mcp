#!/usr/bin/env bash
set -euo pipefail
set -a
. /Users/james_davis/repositories/swsd-mcp/.env
set +a
exec node /Users/james_davis/repositories/swsd-mcp/dist/index.js
