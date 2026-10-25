#!/usr/bin/env bash
# Backup diario: banco do Chatwoot (pg_dump), anexos do Chatwoot, config, logs, dados do Cerebro e o .env.
# Guarda 14 dias em ${ROSA_DIR}/backups. Roda pelo cron (/etc/cron.d/rosa-backup, 03:30) ou na mao:
#   bash /opt/rosa/codigo/deploy/vps/backup.sh
# Restaurar o banco (exemplo):
#   docker compose exec -T postgres pg_restore -U postgres -d chatwoot --clean --if-exists < chatwoot.dump
# ATENCAO: o backup tem tokens e senhas (.env e chatwoot.json). A pasta fica com permissao 700.
# Copie para fora da VPS de vez em quando (ex.: scp para o PC); backup so na mesma maquina nao salva de tudo.
set -euo pipefail
umask 077

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dc() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env" "$@"; }
ROSA_DIR="$(grep -E '^ROSA_DIR=' "$DIR/.env" | tail -n1 | cut -d= -f2- || true)"; ROSA_DIR="${ROSA_DIR:-/opt/rosa}"
DIAS=14

DESTINO="$ROSA_DIR/backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DESTINO"
chmod 700 "$ROSA_DIR/backups"
echo "[$(date '+%F %T')] backup em $DESTINO"

# 1. banco (formato custom, comprimido)
dc exec -T postgres pg_dump -U postgres -d chatwoot -Fc >"$DESTINO/chatwoot.dump"
[[ -s "$DESTINO/chatwoot.dump" ]] || { echo "pg_dump vazio" >&2; exit 1; }

# 2. anexos do Chatwoot (fotos, audios, arquivos das conversas)
dc exec -T rails tar -czf - -C /app storage >"$DESTINO/chatwoot-storage.tar.gz"

# 3. config do atendimento, logs, dados do Cerebro e o .env
tar --exclude='logs/backup.log' -czf "$DESTINO/rosa-arquivos.tar.gz" -C "$ROSA_DIR" config logs dados
cp "$DIR/.env" "$DESTINO/env"

du -sh "$DESTINO" | awk '{print "tamanho: "$1}'

# 4. apaga backups com mais de 14 dias
find "$ROSA_DIR/backups" -mindepth 1 -maxdepth 1 -type d -mtime +"$((DIAS - 1))" -print -exec rm -rf {} +
echo "[$(date '+%F %T')] ok"
