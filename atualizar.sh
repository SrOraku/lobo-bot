#!/usr/bin/env bash
# Atualiza pelo serviço oficial e inicia o supervisor, sem apagar dados.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if (( $# != 0 )); then
  echo 'Use somente: bash atualizar.sh' >&2
  exit 64
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js não encontrado. Selecione Node 22.12+ ou NodeJs XY no painel.' >&2
  exit 1
fi
exec node ./scripts/update-and-start.js
