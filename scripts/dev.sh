#!/usr/bin/env bash
set -euo pipefail

# bunfig's runtime override adds a node -> bun symlink to PATH. Portless
# needs real Node for TLS SNI, while the Next.js process should stay on Bun.
IFS=: read -r -a path_entries <<< "$PATH"
bun_binary="$(command -v bun)"
node_binary=""
for directory in "${path_entries[@]}"; do
  candidate="${directory:-.}/node"
  if [[ -x "$candidate" && ! "$candidate" -ef "$bun_binary" ]]; then
    node_binary="$candidate"
    break
  fi
done

if [[ -z "$node_binary" ]]; then
  echo "Portless requires Node.js 24 or newer. Install Node and run bun run dev again." >&2
  exit 1
fi

export PORTLESS_PORT=443 PORTLESS_HTTPS=1 PORTLESS_TLD=localhost PORTLESS_LAN=0
portless_cli="node_modules/portless/dist/cli.js"
"$node_binary" "$portless_cli" proxy start --port 443 --https
exec "$node_binary" "$portless_cli" run bun run next dev --hostname 127.0.0.1
