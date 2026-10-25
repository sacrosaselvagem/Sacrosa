# Atendimento (tela própria sobre o Chatwoot)

A tela `05_FRONTEND/atendimento/` é a nossa central de mensagens. Endereço: **http://localhost:8790/atendimento/** (servido pelo serviço de atendimento, mais rápido). O endereço antigo, http://localhost:8787/atendimento/index.html, também funciona.
Por baixo roda o **Chatwoot Community** (código aberto, grátis), que guarda as conversas e liga os canais.

```
navegador ──> painel (server.ps1, :8787) ──> serviço de atendimento (Node, :8790) ──> Chatwoot (Docker, :3000)
                                                 │
                                                 └── IA do SAC: procura conversas novas a cada 3 s e responde pelo Claude
```

## Onde está cada coisa
| O quê | Onde |
|---|---|
| Tela | `05_FRONTEND/atendimento/` (`atendimento.js` conversas, equipe e login; `integracoes.js`; `usuarios.js`) |
| Serviço de atendimento | `06_BACKEND/atendimento/servico.mjs` (login, usuários, ponte), `ia.mjs` (IA do SAC), `prompt-ia.md` (como a IA conversa) |
| Repasse do painel | `06_BACKEND/chatwoot-ponte.ps1`: manda `/api/atendimento/*` para o serviço e liga o serviço se ele estiver parado |
| Chatwoot (Docker) | `C:\Users\Cncept D\chatwoot\` (`docker-compose.yaml`, `.env`). Painel do Chatwoot em http://localhost:3000 |
| Configuração e tokens | `00_CORE/Configuration/chatwoot.json` (token de sistema, token de plataforma, token e ajustes da IA) |
| Níveis das pessoas | `00_CORE/Configuration/atendimento-niveis.json` |
| Sessões de login | `00_CORE/Configuration/atendimento-sessoes.json` (valem 30 dias) |
| Registro da IA | `07_LOGS/ia-sac/AAAA-MM-DD.jsonl` (cada decisão: conversa, ação, assuntos, motivo e tempo) |
| Logins de teste | `C:\Users\Cncept D\chatwoot\credenciais-teste.txt` |

O navegador nunca recebe token: cada pessoa entra com e-mail e senha, o serviço guarda o token dela na sessão
(cookie `atd`, HttpOnly) e apaga `access_token`, `pubsub_token` e `password` de toda resposta.

## Pessoas e níveis
| Nível | Vê | No Chatwoot |
|---|---|---|
| Dona | Tudo: conversas, Equipe, Usuários e Integrações; liga e desliga a IA | administrator |
| Supervisora | Conversas e Equipe | agent |
| Atendente | Conversas | agent |

Convidar: em Usuários, use **Convidar pessoa**. O serviço cria a pessoa pela API de plataforma do Chatwoot, com uma senha
provisória, coloca a pessoa em todas as caixas e mostra uma mensagem pronta para mandar no WhatsApp. **Não precisa de e-mail
configurado.** Em "Nova senha", a dona gera outra senha provisória. Cada pessoa troca a própria senha no menu da conta.

## IA do SAC (o filtro)
- Com a IA ligada (Integrações, IA do SAC), toda conversa nova chega com o status `pending`, que aparece na fila "Com a IA".
- A IA espera 6 s sem mensagem nova da cliente, lê a conversa, a base do SAC, os aprendizados, as ofertas e os produtos
  citados, e decide pelo Claude (modelo `opus`, uns 20 s com a pausa de digitação):
  - **responder**: manda de 1 a 3 balões, com "digitando…" e pausa proporcional ao texto;
  - **escalar**: manda um aviso acolhedor e abre a conversa para a equipe ("Precisam de alguém") com `motivo_ia` (curto),
    `observacao_ia`, `sugestao_ia` e `resumo_ia`;
  - **ignorar**: não responde ("ok", "obrigada", figurinha).
- Sempre marca de 1 a 3 **assuntos** (etiquetas do Chatwoot): reembolso, devolucao, troca, cancelamento, problema-no-pedido,
  frete-e-entrega, rastreio, duvida-de-produto, como-usar, pagamento, quer-comprar, saude-e-reacao, reclamacao,
  revenda-e-parceria, elogio e outro. Na lateral da tela, Canais e Assuntos filtram a lista.
- **Trava**: preço que não está no catálogo, link fora dos domínios liberados ou balão com mais de 900 caracteres barram a
  resposta. Nesse caso nada é enviado e a conversa vai para a equipe com o texto como sugestão.
- Se a cliente perguntar se fala com um robô, a IA diz a verdade e oferece chamar uma pessoa.
- **Fotos e áudios**: das últimas 10 mensagens da cliente com anexo, a IA baixa até 3 fotos (até 5 MB; HEIC ou grande demais
  vira JPEG pelo ffmpeg) e manda ao Claude como imagem, e transcreve até 3 áudios (até 10 MB) com `transcrever.py`
  (faster-whisper, modelo `RS_WHISPER_MODELO`, padrão `small`, CPU; Python em `RS_PYTHON`, padrão o venv do `.rosa-motor`).
  A transcrição entra na conversa como `[áudio transcrito] ...`, fica em `07_LOGS/ia-sac/transcricoes.json` (nunca transcreve
  o mesmo áudio duas vezes) e vira **nota interna** "Áudio transcrito pela IA: ..." uma vez por áudio. Vídeo continua só
  "[mandou um vídeo]". Se baixar ou transcrever falhar, fica o "[mandou ...]" de antes. Leva uns 5 s a mais por áudio.
- Quando alguém assume a conversa (status `open`), a IA para de responder nela. "Devolver para a IA" volta para `pending`.
- Dúvida que a base não responde vira linha em "SAC - Aprendizados.md" (Perguntas sem resposta na base).
- Ajustes em `chatwoot.json`, campo `ia`: `ligada`, `modelo`, `espera_segundos`. O jeito de conversar fica em `prompt-ia.md`,
  que é lido a cada resposta e pode ser editado sem reiniciar nada.
- O agent bot no Chatwoot fica **sem** `outgoing_url`. Se tiver um endereço que o Chatwoot não alcança, ele devolve a
  conversa para a equipe com "erro com o robô".

## Rastreio (pedido da Shopify + avisos de entrega)
- A cliente manda o **número do pedido e o CPF da compra** (em qualquer ordem, em mensagens separadas ou juntas). A IA acha o
  pedido (`06_BACKEND/atendimento/pedidos.mjs`), confere o CPF e só então conta status, itens, código e link de rastreio.
  CPF errado ou pedido inexistente: ela pede para conferir sem dizer qual dado está errado; na 3ª tentativa passa para a equipe.
- A conversa guarda `pedido_id` e `pedido_num`; dali em diante cada resposta usa o status atualizado na hora. O card
  "Último pedido" do contato é preenchido sozinho.
- Pedido localizado passa a ser **acompanhado** (`acompanhamento.mjs`, lista em `07_LOGS/atendimento/acompanhamentos.json`,
  tela **Rastreios**). A cada 30 min (1 min no teste) confere o pedido e, quando ele muda de fase (postado, a caminho, saiu
  para entrega, problema, retirada, entregue), escreve um aviso curto e humano (`prompt-rastreio.md`) na própria conversa.
  Entregue: avisa e para de acompanhar. Passou do prazo: nota interna para a equipe.
- Das 21h às 8h segura o aviso e manda de manhã. Conversa com alguém da equipe: vira nota interna com o aviso sugerido.
  WhatsApp oficial fora da janela de 24 h: precisa de modelo aprovado em `shopify.json > modelo_whatsapp`
  (`{ name, language, category, parametros: ["nome","pedido","status"] }`); sem ele, nota interna.
- Configuração em `00_CORE/Configuration/shopify.json`: `modo` "teste" (pedidos fictícios #1001 a #1004 em
  `07_LOGS/atendimento/pedidos-teste.json`; CPFs: `node 06_BACKEND/atendimento/pedidos.mjs teste`) ou "loja" com `loja`
  (xxxx.myshopify.com) e `access_token` ou `client_id` + `client_secret`. Escopos: read_orders, read_customers,
  read_fulfillments, com acesso a dados protegidos de clientes. O CPF é procurado no campo do checkout brasileiro
  (localizedFields / localizationExtensions), nos atributos do pedido, na nota e no campo "empresa" do endereço.
- As movimentações vêm dos eventos de entrega da Shopify, que o app de frete grava. Se o app de frete não grava eventos,
  falta ligar a transportadora direto (ponto previsto em `pedidos.mjs`).

## Comandos
```bash
cd "/c/Users/Cncept D/chatwoot" && docker compose up -d      # ligar o Chatwoot
cd "/c/Users/Cncept D/chatwoot" && docker compose down       # desligar (os dados ficam nos volumes)
```
O serviço de atendimento liga sozinho na primeira chamada à tela. O registro dele fica em `07_LOGS/atendimento-servico.log`.

## Seções do menu (igual ao Droni)
Caixa de Entrada, Conversas, Capitão (a IA: números, testar, perguntas sem resposta, base, jeito de falar), Comentários
(Feed, Reels, Patrocinados, Menções, Moderação: a dona conecta em Integrações > "Comentários do Instagram e Facebook"), Contatos, Relatórios, Campanhas
(mensagem no site; WhatsApp em massa travado até o WhatsApp oficial), Central de Ajuda (portal "Ajuda Rosa Selvagem" com 7
artigos em rascunho), Helpdesk (chamados com protocolo e prazo, em `07_LOGS/atendimento/chamados.json`) e Configurações
(Geral, Integrações, Usuários, Equipe). Como cada seção é feita: `09_DOCUMENTATION/atendimento-modulos.md`.

## Encaminhamento por assunto
Quando a IA passa a conversa para a equipe, ela manda para o **time** do assunto mais sério (reclamação > saúde > reembolso > devolução > troca > …). O mapa assunto → time e as pessoas de cada time ficam em Configurações > Geral > Times e assuntos (`roteamento` em `atendimento-geral.json`). Os assuntos também ficam gravados no contato.

## Falar com a Rosa (chat da equipe com a IA)
Aba onde a atendente conversa com a IA do SAC como com uma colega: pergunta por que ela fez algo, pede ajuda para responder, anexa uma conversa (três pontinhos na conversa > "Perguntar à Rosa sobre esta conversa") e ensina regras. O que ela aprende vai para "SAC - Aprendizados.md" > Respostas corrigidas ou aprovadas pela equipe; o que uma atendente ensina fica "a confirmar" e a IA das clientes só usa depois que a dona ou a supervisora confirmar. Preço, desconto, cupom, reembolso e prazo não mudam pelo chat. Arquivos: `modulos/rosa.js`, `rotas/rosa.mjs`, `prompt-colega.md`; histórico por pessoa em `07_LOGS/atendimento/rosa/`.

## O que ainda falta
- Canais de verdade (WhatsApp Cloud API, Instagram, Messenger, Telegram), o que exige um endereço HTTPS público (VPS).
- Ligar a Shopify de verdade (`shopify.json`, modo "loja"); hoje o rastreio roda com pedidos de teste.
- Comentários reais: a dona conecta em Integrações > "Comentários do Instagram e Facebook" (o passo a passo está na tela; o token fica só no servidor, em `meta-comentarios.json`).
- Horário real da equipe em Configurações > Geral (o salvo é provisório: seg a sex, 9h às 18h).
- Revisar e publicar os 7 artigos em rascunho da Central de Ajuda. Para a VPS, colocar `url_publica` no `chatwoot.json`.
- Base de conhecimento da **Beyoung**: hoje a IA usa a da Rosa Selvagem para as duas marcas.
- A IA usa o Claude Code logado no PC. Para a VPS, o ideal é uma chave da API da Anthropic.
