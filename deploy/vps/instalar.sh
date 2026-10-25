#!/usr/bin/env bash
# Instala o atendimento da Rosa Selvagem numa VPS Ubuntu 24.04 nova. Rode como root:
#   cd /opt/rosa/codigo/deploy/vps && bash instalar.sh
# Pode rodar de novo sem estragar nada: so cria o que falta.
#   --refazer-base   roda de novo a criacao da conta/dona/bot/etiquetas e reescreve o chatwoot.json
# Sem perguntas (opcional): DONA_NOME="Fulana" DONA_EMAIL="fulana@..." bash instalar.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODIGO="$(cd "$DIR/../.." && pwd)"
REFAZER=0
[[ "${1:-}" == "--refazer-base" ]] && REFAZER=1

passo() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[33m[aviso]\033[0m %s\n' "$*"; }
falha() { printf '\033[31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || falha "Rode como root (sudo bash instalar.sh)."
[[ -f "$DIR/docker-compose.yml" ]] || falha "docker-compose.yml nao encontrado em $DIR."
[[ -d "$CODIGO/06_BACKEND/atendimento" && -d "$CODIGO/05_FRONTEND/atendimento" ]] \
  || falha "O codigo do atendimento nao esta em $CODIGO (envie com o enviar-codigo.ps1)."
if ! grep -q 'VERSION_ID="24.04"' /etc/os-release 2>/dev/null; then
  aviso "Feito para Ubuntu 24.04. Continuando mesmo assim."
fi

# ---------- utilidades do .env ----------
ENV_ARQ="$DIR/.env"
env_get() { grep -E "^$1=" "$ENV_ARQ" | tail -n1 | cut -d= -f2- || true; }
env_set() { # troca a linha KEY=... ou acrescenta no fim
  local k="$1" v="$2"
  if grep -qE "^$k=" "$ENV_ARQ"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$ENV_ARQ" >"$tmp"
    cat "$tmp" >"$ENV_ARQ"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >>"$ENV_ARQ"
  fi
}
segredo() { openssl rand -hex "$1"; }
dc() { docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$ENV_ARQ" "$@"; }

# ---------- 1. pacotes, Docker, fuso, swap e firewall ----------
passo "Pacotes basicos e fuso horario"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg openssl ufw cron >/dev/null
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  passo "Instalando o Docker (repositorio oficial)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null

if ! swapon --show | grep -q .; then
  passo "Criando 2 GB de swap (folga para o build e para picos de memoria)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

passo "Firewall: so SSH (22), HTTP (80) e HTTPS (443)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
# Observacao: portas publicadas pelo Docker passam por fora do ufw. Por isso so o Caddy publica portas (80/443).

# ---------- 2. pastas e .env ----------
passo "Pastas e configuracao (.env)"
if [[ ! -f "$ENV_ARQ" ]]; then
  cp "$DIR/.env.exemplo" "$ENV_ARQ"
  echo "Criado $ENV_ARQ a partir do .env.exemplo."
fi
chmod 600 "$ENV_ARQ"
[[ -n "$(env_get SECRET_KEY_BASE)" ]]        || env_set SECRET_KEY_BASE "$(segredo 64)"
[[ -n "$(env_get POSTGRES_PASSWORD)" ]]      || env_set POSTGRES_PASSWORD "$(segredo 24)"
[[ -n "$(env_get REDIS_PASSWORD)" ]]         || env_set REDIS_PASSWORD "$(segredo 24)"
[[ -n "$(env_get FB_VERIFY_TOKEN)" ]]        || env_set FB_VERIFY_TOKEN "$(segredo 16)"
[[ -n "$(env_get IG_VERIFY_TOKEN)" ]]        || env_set IG_VERIFY_TOKEN "$(segredo 16)"
[[ -n "$(env_get INSTAGRAM_VERIFY_TOKEN)" ]] || env_set INSTAGRAM_VERIFY_TOKEN "$(segredo 16)"

ROSA_DIR="$(env_get ROSA_DIR)"; ROSA_DIR="${ROSA_DIR:-/opt/rosa}"
ATENDIMENTO_HOST="$(env_get ATENDIMENTO_HOST)"
CHAT_HOST="$(env_get CHAT_HOST)"
[[ -n "$ATENDIMENTO_HOST" && -n "$CHAT_HOST" ]] || falha "Preencha ATENDIMENTO_HOST e CHAT_HOST em $ENV_ARQ."
[[ -n "$(env_get ACME_EMAIL)" ]] || falha "Preencha ACME_EMAIL em $ENV_ARQ."

mkdir -p "$ROSA_DIR"/{config,logs,dados/cerebro,dados/motor,backups}
chown -R 1000:1000 "$ROSA_DIR/config" "$ROSA_DIR/logs" "$ROSA_DIR/dados"
chmod 700 "$ROSA_DIR/config" "$ROSA_DIR/backups"

# DNS: so avisa (o HTTPS so sai quando os dois nomes apontam para esta maquina)
IP_PUBLICO="$(curl -fsS4 --max-time 5 https://api.ipify.org || true)"
for h in "$ATENDIMENTO_HOST" "$CHAT_HOST"; do
  ip_dns="$(getent ahostsv4 "$h" | awk 'NR==1{print $1}' || true)"
  if [[ -z "$ip_dns" ]]; then aviso "$h ainda nao existe no DNS. Crie o registro A para ${IP_PUBLICO:-o IP desta VPS}."
  elif [[ -n "$IP_PUBLICO" && "$ip_dns" != "$IP_PUBLICO" ]]; then aviso "$h aponta para $ip_dns, mas esta VPS e $IP_PUBLICO."
  fi
done

# ---------- 3. imagens e banco ----------
passo "Baixando imagens e montando a imagem do atendimento (alguns minutos na primeira vez)"
dc pull --quiet --ignore-buildable
dc build atendimento

passo "Ligando Postgres e Redis"
dc up -d --wait postgres redis

passo "Preparando o banco do Chatwoot (db:chatwoot_prepare)"
dc run --rm rails bundle exec rails db:chatwoot_prepare

passo "Ligando o Chatwoot (rails e sidekiq)"
dc up -d --wait --wait-timeout 600 rails sidekiq

# ---------- 4. conta, dona, plataforma, bot e etiquetas ----------
CONF_JSON="$ROSA_DIR/config/chatwoot.json"
SENHA_DONA=""
if [[ -f "$CONF_JSON" && $REFAZER -eq 0 ]]; then
  echo "Ja existe $CONF_JSON: conta e tokens mantidos (use --refazer-base para recriar)."
else
  passo "Criando a conta Rosa Selvagem, a dona, o app de plataforma, a IA do SAC e as etiquetas"
  DONA_NOME="${DONA_NOME:-}"; DONA_EMAIL="${DONA_EMAIL:-}"
  [[ -n "$DONA_NOME" ]]  || read -rp "Nome da dona (como aparece para a equipe): " DONA_NOME </dev/tty
  [[ -n "$DONA_EMAIL" ]] || read -rp "E-mail da dona (login): " DONA_EMAIL </dev/tty
  [[ -n "$DONA_NOME" && "$DONA_EMAIL" == *@*.* ]] || falha "Nome ou e-mail invalido."
  # senha forte: letras, numeros e simbolo (regra do Chatwoot)
  SENHA_DONA="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 16)#Rs7"

  ASSUNTOS_JSON="$(dc run --rm --no-deps -T --entrypoint node atendimento --input-type=module -e \
    "const {ASSUNTOS}=await import('/app/06_BACKEND/atendimento/ia.mjs');console.log(JSON.stringify(ASSUNTOS))")"
  [[ "$ASSUNTOS_JSON" == \[* ]] || falha "Nao consegui ler os assuntos do ia.mjs."

  SAIDA="$(dc exec -T -e DONA_NOME="$DONA_NOME" -e DONA_EMAIL="$DONA_EMAIL" -e DONA_SENHA="$SENHA_DONA" \
    -e ASSUNTOS_JSON="$ASSUNTOS_JSON" rails bundle exec rails runner /rosa/semear-producao.rb)"
  val() { printf '%s\n' "$SAIDA" | grep -E "^$1=" | tail -n1 | cut -d= -f2-; }
  CONTA="$(val CONTA)"; TOKEN_DONA="$(val TOKEN_DONA)"; TOKEN_PLAT="$(val TOKEN_PLATAFORMA)"
  BOT_ID="$(val BOT_ID)"; TOKEN_BOT="$(val TOKEN_BOT)"; DONA_NOVA="$(val DONA_NOVA)"
  [[ -n "$CONTA" && -n "$TOKEN_DONA" && -n "$TOKEN_PLAT" && -n "$BOT_ID" && -n "$TOKEN_BOT" ]] \
    || falha "A criacao da base nao devolveu os dados esperados."
  [[ "$DONA_NOVA" == "1" ]] || SENHA_DONA=""   # usuario ja existia: a senha dele nao mudou
  echo "Etiquetas de assunto na conta: $(val ETIQUETAS)"

  # chatwoot.json do servico de atendimento (url interna; login obrigatorio em producao; IA desligada)
  ( umask 077
    cat >"$CONF_JSON" <<JSON
{
  "url": "http://rails:3000",
  "url_publica": "https://$CHAT_HOST",
  "conta": $CONTA,
  "token": "$TOKEN_DONA",
  "observacao": "token = usuario da dona, usado so pelo servidor; token_plataforma cria e gerencia usuarios; ia.token = bot IA do SAC. Nada disso vai para o navegador.",
  "token_plataforma": "$TOKEN_PLAT",
  "ia": {
    "bot_id": $BOT_ID,
    "token": "$TOKEN_BOT",
    "ligada": false,
    "modelo": "opus",
    "espera_segundos": 6,
    "marcas": ["Rosa Selvagem"],
    "teto_diario_usd": 30,
    "simultaneas": 6,
    "mensagem_espera": "Oi! Recebemos sua mensagem. Já já alguém da nossa equipe te responde por aqui."
  },
  "login_obrigatorio": true
}
JSON
  )
  chown 1000:1000 "$CONF_JSON"
  echo "Gravado $CONF_JSON."
fi

# ---------- 5. tudo no ar ----------
passo "Ligando o atendimento e o Caddy (HTTPS)"
dc up -d --wait --wait-timeout 300 atendimento
dc up -d caddy

# ---------- 6. backup diario ----------
passo "Backup diario as 03:30 (/etc/cron.d/rosa-backup)"
chmod +x "$DIR/backup.sh" "$DIR/atualizar.sh"
sed "s#__DIR__#$DIR#g; s#__ROSA_DIR__#$ROSA_DIR#g" "$DIR/rosa-backup.cron" >/etc/cron.d/rosa-backup
chmod 644 /etc/cron.d/rosa-backup

# ---------- 7. proximos passos ----------
passo "Pronto"
dc ps --format 'table {{.Service}}\t{{.Status}}'
cat <<FIM

Enderecos (o HTTPS sai sozinho em 1 ou 2 minutos, depois que o DNS aponta para esta VPS):
  Tela de atendimento: https://$ATENDIMENTO_HOST
  Chatwoot (canais):   https://$CHAT_HOST
FIM
if [[ -n "$SENHA_DONA" ]]; then
  cat <<FIM

Login da dona (anote agora; esta senha nao aparece de novo):
  E-mail: $DONA_EMAIL
  Senha provisoria: $SENHA_DONA
  Troque a senha no primeiro acesso (menu da conta).
FIM
fi
cat <<FIM

Proximos passos (detalhes no GUIA.md):
  1. No PC: rode sincronizar-cerebro.ps1 para mandar a base do SAC, o catalogo e as regras para a VPS.
  2. Coloque ANTHROPIC_API_KEY em $ENV_ARQ e rode: docker compose up -d atendimento
  3. Conecte os canais no Chatwoot (https://$CHAT_HOST): WhatsApp Cloud API, Instagram, Messenger, Telegram, site.
  4. Ligue a IA do SAC na tela (Configuracoes > Integracoes > IA do SAC) e convide a equipe (Usuarios).
  Verify tokens da Meta (cole na tela de webhooks do app): veja FB_VERIFY_TOKEN e IG_VERIFY_TOKEN em $ENV_ARQ.
FIM
