#!/usr/bin/env bash
# Atualiza so o servico de atendimento (tela + API + IA), sem mexer no Chatwoot, no banco nem no Caddy.
#   bash /opt/rosa/codigo/deploy/vps/atualizar.sh
# De onde vem o codigo novo:
#   - se /opt/rosa/codigo for um repositorio git: faz git pull aqui;
#   - se nao: o PC ja mandou o codigo com o enviar-codigo.ps1 (que chama este script no fim).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODIGO="$(cd "$DIR/../.." && pwd)"
dc() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" "$@"; }

[[ -f "$DIR/.env" ]] || { echo "Falta $DIR/.env. Rode o instalar.sh primeiro." >&2; exit 1; }

if git -C "$CODIGO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "==> git pull em $CODIGO"
  git -C "$CODIGO" pull --ff-only
fi

echo "==> Montando a imagem nova do atendimento"
dc build atendimento

echo "==> Reiniciando so o atendimento"
dc up -d --no-deps --wait --wait-timeout 180 atendimento

echo "==> Limpando imagens antigas sem uso"
docker image prune -f >/dev/null

dc ps atendimento --format 'table {{.Service}}\t{{.Status}}'
echo "Atualizado. Registro: docker compose logs -f atendimento (nesta pasta)."
