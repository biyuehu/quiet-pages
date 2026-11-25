#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.moon/bin:/nodejs22/bin:/nodejs20/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

cd reader
if command -v node >/dev/null 2>&1; then
  node prepare.mjs
else
  bun prepare.mjs
fi

mopress build
