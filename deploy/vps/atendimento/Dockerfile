# syntax=docker/dockerfile:1
# Servico de atendimento da Rosa Selvagem (tela + API + IA do SAC).
# Contexto do build: a raiz do RosaSelvagemOS (o docker-compose.yml ja aponta para ../..).
# O Dockerfile.dockerignore ao lado deixa entrar so 05_FRONTEND/atendimento e 06_BACKEND/atendimento
# (nada de 00_CORE, segredos ou logs dentro da imagem).
FROM node:24-slim

ARG CLAUDE_CODE_VERSION=latest

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    CLAUDE_BIN=claude \
    RS_CEREBRO=/dados/cerebro \
    RS_MOTOR=/dados/motor \
    RS_HOST=0.0.0.0 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force \
 && claude --version

# Audios das clientes: faster-whisper (CPU, int8) num venv proprio + ffmpeg (decodifica ogg/opus e reduz fotos).
# O modelo "small" (~460 MB) ja vem baixado na imagem para a 1a transcricao nao esperar download.
ARG WHISPER_MODELO=small
ENV RS_PYTHON=/opt/whisper/bin/python \
    RS_WHISPER_MODELO=${WHISPER_MODELO} \
    HF_HOME=/opt/whisper/hf \
    HF_HUB_DISABLE_TELEMETRY=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/whisper \
 && /opt/whisper/bin/pip install --no-cache-dir faster-whisper \
 && /opt/whisper/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODELO}', device='cpu', compute_type='int8')" \
 && chmod -R a+rX /opt/whisper

WORKDIR /app
# Codigo fica do root (so leitura para o servico); as pastas de dados sao do usuario node.
COPY 05_FRONTEND/atendimento 05_FRONTEND/atendimento
COPY 06_BACKEND/atendimento 06_BACKEND/atendimento
RUN mkdir -p /app/00_CORE/Configuration /app/07_LOGS /dados/cerebro /dados/motor /home/node/.claude \
 && chown -R node:node /app/00_CORE /app/07_LOGS /dados /home/node

USER node
ENV HOME=/home/node
EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8790/atendimento/index.html').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "06_BACKEND/atendimento/servico.mjs"]
