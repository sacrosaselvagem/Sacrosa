# rosasac — Atendimento da Rosa Selvagem

Central de atendimento própria da Rosa Selvagem (e Beyoung): uma tela simples sobre o **Chatwoot Community**,
com a **IA do SAC** que responde primeiro, separa por assunto e passa para o time certo o que precisa de gente.

- `05_FRONTEND/atendimento/`: a tela (HTML, CSS e JS puros, sem build). As seções do menu ficam em `modulos/`.
- `06_BACKEND/atendimento/`: o serviço em Node 24 (`servico.mjs`), que cuida do login, dos usuários e da ponte com o Chatwoot.
  - `ia.mjs`: a IA do SAC. Ela usa o Claude pelo CLI e transcreve áudio com o `transcrever.py`.
  - `rotas/`: as rotas de cada seção.
  - `prompt-*.md`: o jeito de falar da IA.
- `deploy/vps/`: a instalação na VPS (Docker, Caddy com HTTPS, backup). Comece pelo `deploy/vps/GUIA.md`.
- `09_DOCUMENTATION/`: a arquitetura (`atendimento-chatwoot.md`) e como criar uma seção nova (`atendimento-modulos.md`).

**Segredos não entram aqui.** Tokens e chaves ficam no servidor, em `00_CORE/Configuration/*.json` e em `deploy/vps/.env`.
Esses arquivos são criados pelo `instalar.sh` e estão no `.gitignore`.
