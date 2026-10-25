# Guia: atendimento da Rosa Selvagem na VPS

Hoje o atendimento roda no PC, só para teste. Para ligar o WhatsApp oficial, o Instagram, o Messenger e o
Telegram de verdade, ele precisa morar num servidor ligado 24 horas, com endereço HTTPS público. Esse servidor é a VPS.

Na VPS ficam:

- **Tela de atendimento** (a nossa): `https://atendimento.rosaselvagemoficial.com.br`
- **Chatwoot** (por baixo; recebe as mensagens dos canais): `https://chat.rosaselvagemoficial.com.br`
- **IA do SAC**: responde pelo Claude, com a base do SAC que o PC manda para a VPS a cada 10 minutos.

Tudo o que está nesta pasta (`deploy/vps`):

| Arquivo | Para que serve |
|---|---|
| `instalar.sh` | Instala tudo numa VPS nova (roda uma vez; pode repetir sem estragar) |
| `atualizar.sh` | Põe no ar uma versão nova da tela e da IA (não mexe no Chatwoot) |
| `backup.sh` | Backup diário às 03:30, guarda 14 dias |
| `enviar-codigo.ps1` | No PC: manda o código para a VPS e atualiza |
| `sincronizar-cerebro.ps1` | No PC: manda a base do SAC, o catálogo e as regras; traz de volta o que o Capitão escreveu |
| `.env.exemplo` | Modelo da configuração (cada linha explicada) |
| `docker-compose.yml`, `Caddyfile`, `atendimento/`, `scripts/` | Peças técnicas (não precisa mexer) |

---

## 1. Qual VPS comprar

Precisa de: **Ubuntu 24.04**, região **São Paulo** (mais rápido para as clientes e para a equipe),
**pelo menos 4 vCPU, 8 GB de RAM e 80 GB de disco SSD/NVMe**.

| Opção | Plano | Preço aproximado por mês |
|---|---|---|
| Hostinger (VPS KVM, datacenter em São Paulo) | KVM 4: 4 vCPU, 16 GB, 200 GB NVMe | R$ 70 a R$ 130 (o menor preço é no plano de 12 a 24 meses; a renovação sai mais cara) |
| Vultr (região São Paulo) | Cloud Compute 4 vCPU, 8 GB, 160 GB | cerca de US$ 48, ou R$ 260 a R$ 300, cobrado em dólar no cartão |
| Magalu Cloud (região São Paulo) | Máquina virtual 4 vCPU, 8 GB | R$ 250 a R$ 350, cobrado em real, com nota fiscal brasileira |

**Os preços mudam o tempo todo.** Confira no site antes de comprar. Para começar, a Hostinger custa menos.
A Magalu Cloud é a melhor opção se você precisar de nota fiscal brasileira e suporte em português.

Na compra:
- Escolha **Ubuntu 24.04** como sistema.
- Se o site pedir uma **chave SSH**, cole a do passo 3 abaixo. Se não pedir, anote a senha de root.
- Anote o **IP** da VPS (algo como `191.252.10.20`).

## 2. Apontar o DNS (dois registros A)

No lugar onde o domínio `rosaselvagemoficial.com.br` é administrado (Registro.br, Cloudflare, Hostinger...), crie:

| Tipo | Nome | Valor |
|---|---|---|
| A | `atendimento` | IP da VPS |
| A | `chat` | IP da VPS |

Se o DNS estiver na Cloudflare, deixe a nuvem **cinza** ("somente DNS") nesses dois.
O DNS leva de alguns minutos a algumas horas para valer. O cadeado HTTPS só aparece depois disso.

## 3. Chave SSH no PC (uma vez)

No PowerShell do PC:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\rosa_vps -N '""'
type $env:USERPROFILE\.ssh\rosa_vps.pub | ssh root@IP_DA_VPS "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

O segundo comando pede a senha de root uma única vez. Depois disso o PC entra na VPS sem senha.
Ela fica sem senha porque a sincronização roda sozinha. Guarde o arquivo `rosa_vps` como guarda uma senha.

## 4. Instalar

1. No PC, mande o código para a VPS:
   ```powershell
   cd "C:\Users\Cncept D\RosaSelvagemOS\deploy\vps"
   powershell -ExecutionPolicy Bypass -File .\enviar-codigo.ps1 -Servidor root@IP_DA_VPS -SoEnviar
   ```
2. Entre na VPS e confira os endereços:
   ```bash
   ssh -i ~/.ssh/rosa_vps root@IP_DA_VPS
   cd /opt/rosa/codigo/deploy/vps
   cp -n .env.exemplo .env && nano .env    # ATENDIMENTO_HOST, CHAT_HOST e ACME_EMAIL; o resto pode ficar vazio
   bash instalar.sh
   ```
3. O instalar pede o **nome** e o **e-mail da dona**, e no fim mostra uma **senha provisória**. **Anote, porque ela
   aparece uma vez só.** Na primeira entrada, troque a senha pelo menu da conta.

O instalar faz tudo sozinho: Docker, firewall (só as portas 22, 80 e 443), senhas do banco, Chatwoot, conta
"Rosa Selvagem" em português, dona, IA do SAC (desligada), etiquetas de assunto, HTTPS e backup diário.

Ele também gera dois arquivos de configuração: `/opt/rosa/codigo/deploy/vps/.env`, com as senhas do sistema, e
`/opt/rosa/config/chatwoot.json`, com os tokens da tela. Nos dois, só root consegue ler. **Não mande esses arquivos para ninguém.**

Depois de 1 ou 2 minutos, abra:
- `https://atendimento.rosaselvagemoficial.com.br`: entre com o e-mail e a senha da dona.
- `https://chat.rosaselvagemoficial.com.br`: é o Chatwoot, com o mesmo login. Os canais são ligados por aqui.

## 5. Mandar a base do SAC para a VPS (e manter em dia)

A IA lê quatro coisas: `SAC - Base de Conhecimento.md`, `SAC - Aprendizados.md`, `Decisões.md` e o catálogo. Também lê
as regras do SAC (a parte `sac` do `config.json` do motor, sem nenhuma chave). Para mandar tudo, rode no PC:

```powershell
powershell -ExecutionPolicy Bypass -File .\sincronizar-cerebro.ps1 -Servidor root@IP_DA_VPS -Seco   # só mostra o que faria
powershell -ExecutionPolicy Bypass -File .\sincronizar-cerebro.ps1 -Servidor root@IP_DA_VPS
```

As duas notas do SAC andam **nos dois sentidos**: o que a página Capitão escreve na VPS volta para o Obsidian.
Quando a nota da VPS é mais nova, o script guarda a versão antiga do PC em `%LOCALAPPDATA%\RosaSync\anteriores\`
antes de trocar. `Decisões.md`, o catálogo e as regras só vão do PC para a VPS.

**Para rodar sozinho a cada 10 minutos**, crie uma tarefa no Agendador de Tarefas do Windows. O comando está no topo
do `sincronizar-cerebro.ps1`. Ela só roda com o PC ligado. Se o PC ficar desligado, a VPS continua com a última
versão que recebeu.

## 6. Ligar os canais (no Chatwoot: `https://chat.rosaselvagemoficial.com.br`)

> **Jeito mais fácil:** entre em `https://atendimento.rosaselvagemoficial.com.br`, vá em **Configurações > Integrações** e use o botão de cada canal. **WhatsApp**: cole os dois IDs e o token permanente; o sistema confere na Meta e liga o recebimento das mensagens sozinho. **Instagram**: "Entrar com o Instagram". **Messenger**: "Abrir conexão do Facebook". **Telegram**: cole o token do @BotFather. Toda caixa nova já recebe a equipe, a distribuição automática e a IA. Os passos abaixo são o caminho manual, se precisar.

Todos os canais ficam em **Configurações > Caixas de entrada > Adicionar caixa de entrada**.
Os nomes dos menus da Meta mudam de vez em quando. Se não achar um botão, procure pelo nome parecido.

### 6.1 WhatsApp oficial (WhatsApp Cloud API)

**Atenção: o número que hoje está na Seeyu só pode estar ligado a um lugar por vez.** Leia o item "Troca sem
parar o atendimento" antes de mexer no número de verdade.

O que você vai precisar do lado da Meta (em `business.facebook.com` e `developers.facebook.com`):

1. **Portfólio empresarial (Meta Business)** da Rosa Selvagem, de preferência com a **empresa verificada**.
   Sem verificação, o número fica com limite baixo de conversas iniciadas pela empresa.
2. **App da Meta**: em developers.facebook.com, crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
3. **Conta do WhatsApp Business (WABA)** e o **número**: em WhatsApp > Configuração da API, adicione o número.
   Anote o **ID do número de telefone** (Phone number ID) e o **ID da conta do WhatsApp Business** (WABA ID).
4. **Token permanente**: em business.facebook.com, abra Configurações > Usuários > **Usuários do sistema** e crie um
   usuário do tipo **Admin**. Clique em **Atribuir ativos**, escolha o app e a conta do WhatsApp com controle total e
   depois clique em **Gerar token**. Use estas opções:
   - Validade: **Nunca**.
   - Permissões: `whatsapp_business_messaging`, `whatsapp_business_management` e `business_management`.

   Guarde esse token como uma senha. O token que aparece na tela de teste vence em 24 horas e não serve.

No Chatwoot:

1. Adicionar caixa de entrada > **WhatsApp** > provedor **WhatsApp Cloud**.
2. Preencha o nome da caixa ("WhatsApp Rosa Selvagem"), o **número com +55** (ex.: `+5511999999999`), o
   **Phone number ID**, o **Business Account ID** e, em "API Key", o **token permanente**.
3. Adicione as atendentes à caixa.
4. Abra a caixa criada > **Configurações**. O Chatwoot mostra a **URL do webhook**, no formato
   `https://chat.rosaselvagemoficial.com.br/webhooks/whatsapp/+5511999999999`, e o **token de verificação** (Verify token).

De volta ao app da Meta, em WhatsApp > **Configuração** > Webhook:

1. Clique em **Editar**. Cole a URL do webhook e o token de verificação que o Chatwoot mostrou e salve.
2. Em **Campos do webhook**, assine `messages`.
3. Mande um "oi" de outro celular para o número. A mensagem precisa aparecer no Chatwoot e na nossa tela.

Bom saber: depois de 24 horas sem mensagem da cliente, a empresa só pode puxar conversa com um **modelo aprovado**
pela Meta. Os modelos são criados no WhatsApp Manager.

#### Troca sem parar o atendimento (saindo da Seeyu)

1. **Pergunte à Seeyu como o número está ligado.** As respostas possíveis são:
   - **A)** o número está numa conta do WhatsApp Business **sua**, e a Seeyu só recebe as mensagens por um app;
   - **B)** o número está numa conta **da Seeyu** (ela é a provedora, ou BSP).
2. **Teste antes com um número de teste.** A Meta dá um número de teste grátis no app. Ligue esse número ao
   Chatwoot seguindo os passos acima e confira mensagens, a IA e as etiquetas. Nada disso toca no número de verdade.
3. **Escolha a hora**: um horário calmo, como domingo de manhã. Avise a equipe e deixe todas as conversas abertas
   respondidas na Seeyu.
4. **Exporte o que precisar da Seeyu**: contatos e conversas importantes. O histórico **não** vem para o Chatwoot.
5. **Faça a troca**:
   - **Caso A**: troque o webhook do app para a URL do Chatwoot (passos acima). A troca é imediata. Se der
     problema, volte o webhook para o endereço da Seeyu.
   - **Caso B**: peça à Seeyu a **migração do número** para a sua conta do WhatsApp Business, ou o cancelamento.
     Antes, **desligue a confirmação em duas etapas (PIN)** do número na Seeyu. A Meta manda um código por SMS ou
     ligação para confirmar. Em geral o número fica fora do ar de alguns minutos a poucas horas. O nome, a
     qualidade e o selo continuam. Os modelos de mensagem podem precisar de nova aprovação.
6. **Depois da troca**: mande e receba uma mensagem de teste e acompanhe a primeira hora na tela.
   Só cancele a Seeyu quando tudo estiver certo por alguns dias.

### 6.2 Instagram e Messenger

Os dois usam um **app da Meta** (pode ser o mesmo app do WhatsApp).

1. Em developers.facebook.com > seu app:
   - Configurações do app > Básico: copie o **ID do aplicativo** e a **Chave secreta do aplicativo**. Preencha
     também a URL da política de privacidade e o domínio do app (`chat.rosaselvagemoficial.com.br`).
   - Adicione **Login do Facebook para Empresas**. Em Configurações dele:
     - Ligue "Login com o SDK do JavaScript".
     - Em "Domínios permitidos para o SDK do JavaScript" e em "URIs de redirecionamento do OAuth válidos", coloque
       `https://chat.rosaselvagemoficial.com.br/`.
   - Adicione **Messenger**. Em Webhooks, use:
     - URL: `https://chat.rosaselvagemoficial.com.br/bot`
     - Token: o valor de `FB_VERIFY_TOKEN` no `.env` da VPS
     - Campos assinados: `messages`, `message_echoes`, `messaging_postbacks`, `message_deliveries` e `message_reads`
   - Adicione **Instagram**:
     - **Pela página do Facebook**: use o webhook `https://chat.rosaselvagemoficial.com.br/webhooks/instagram` com o
       valor de `IG_VERIFY_TOKEN`, e assine `messages`.
     - **Pelo Login do Instagram (jeito novo)**: copie o ID e a chave do app do Instagram para `INSTAGRAM_APP_ID` e
       `INSTAGRAM_APP_SECRET`. Use o mesmo webhook com o valor de `INSTAGRAM_VERIFY_TOKEN`. O redirecionamento é
       `https://chat.rosaselvagemoficial.com.br/instagram/callback`.
2. Na VPS, preencha `FB_APP_ID` e `FB_APP_SECRET` no `.env` (e `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET`, se for o
   caso) e rode:
   ```bash
   cd /opt/rosa/codigo/deploy/vps && docker compose up -d
   ```
3. No Chatwoot: Adicionar caixa > **Messenger**. Entre com o Facebook da dona e escolha a página da Rosa Selvagem.
   Depois faça o mesmo com **Instagram**. A conta do Instagram precisa ser **profissional** e estar ligada à página.
4. **Análise do app (App Review)**: enquanto o app está em modo de desenvolvimento, só quem tem função no app
   (admin, testador) consegue mandar mensagem. Para atender clientes de verdade, peça na Análise do app o
   **Acesso avançado** a estas permissões:
   - `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` e `business_management`;
   - `instagram_basic` e `instagram_manage_messages` (ou `instagram_business_basic` e
     `instagram_business_manage_messages`, no Login do Instagram).

   A Meta pede um vídeo curto mostrando o uso e a empresa verificada. Depois disso, coloque o app em modo **Ativo**.
   A análise costuma levar de alguns dias a duas semanas.

### 6.3 Telegram

1. No Telegram, fale com **@BotFather** e mande `/newbot`. Escolha o nome ("Rosa Selvagem") e o usuário
   (ex.: `RosaSelvagemBot`). Ele devolve um **token**.
2. No Chatwoot: Adicionar caixa > **Telegram** > cole o token. O Chatwoot liga o webhook sozinho.

### 6.4 Chat do site

1. No Chatwoot: Adicionar caixa > **Site**. Preencha o nome, o domínio `rosaselvagemoficial.com.br`, a mensagem de
   boas-vindas e a cor.
2. Copie o código que o Chatwoot mostra e cole na Shopify: Loja virtual > Temas > Editar código > `theme.liquid`,
   logo antes de `</body>`.

## 7. Ligar a IA do SAC

1. Crie uma chave em **console.anthropic.com** > API Keys e coloque um **limite de gasto mensal** no console.
2. Na VPS:
   ```bash
   cd /opt/rosa/codigo/deploy/vps && nano .env      # ANTHROPIC_API_KEY=...
   docker compose up -d atendimento
   ```
3. Rode a sincronização do passo 5, para a IA ter a base do SAC.
4. Na tela de atendimento: Configurações > Integrações > **IA do SAC** > Ligar.
   Ligue a IA **depois** de criar as caixas dos canais, porque ela entra em todas as caixas que existem naquela hora.
   Se criar uma caixa nova depois, desligue e ligue a IA de novo.
5. Teste pela página **Capitão** > Testar antes de abrir para as clientes.

A IA usa o modelo `opus`. Para gastar menos, troque `"modelo": "opus"` por `"sonnet"` em
`/opt/rosa/config/chatwoot.json`. Vale na hora, sem reiniciar.

## 8. Convidar a equipe

Na tela: Configurações > **Usuários** > **Convidar pessoa**. Escolha o nível: Dona, Supervisora ou Atendente.
A tela gera uma senha provisória e uma mensagem pronta para mandar no WhatsApp da pessoa. Não precisa de e-mail.
Cada pessoa troca a senha no primeiro acesso.

## 9. Dia a dia

| Quero... | Comando |
|---|---|
| Pôr no ar uma versão nova da tela ou da IA | No PC: `powershell -ExecutionPolicy Bypass -File .\enviar-codigo.ps1 -Servidor root@IP_DA_VPS` |
| Ver se está tudo de pé | Na VPS: `cd /opt/rosa/codigo/deploy/vps && docker compose ps` |
| Ver o registro da tela e da IA | `docker compose logs -f --tail 100 atendimento` |
| Ver o registro do Chatwoot | `docker compose logs -f --tail 100 rails sidekiq` |
| Fazer um backup agora | `bash backup.sh` (fica em `/opt/rosa/backups`) |
| Reiniciar tudo | `docker compose restart` |

Leve um backup para fora da VPS de vez em quando, por exemplo uma vez por semana. No PC:

```powershell
scp -r -i $env:USERPROFILE\.ssh\rosa_vps root@IP_DA_VPS:/opt/rosa/backups/ .
```

**Os backups têm senhas e tokens.** Guarde em lugar seguro.

## 10. O que a dona precisa providenciar

- [ ] VPS em São Paulo (Ubuntu 24.04, 4 vCPU, 8 GB) e o IP dela
- [ ] Acesso ao DNS do domínio, para criar `atendimento` e `chat`
- [ ] E-mail para o aviso do certificado HTTPS (`ACME_EMAIL`)
- [ ] Chave da API da Anthropic, com limite de gasto
- [ ] Portfólio empresarial da Meta verificado, app da Meta, conta do WhatsApp Business, Phone number ID, WABA ID e token permanente
- [ ] Resposta da Seeyu: o número está numa conta sua ou na deles? E o PIN de duas etapas
- [ ] ID e chave do app da Meta para Instagram e Messenger, página do Facebook e Instagram profissional; pedido de análise do app
- [ ] Token do bot do Telegram (BotFather)
- [ ] Acesso ao tema da Shopify, para colar o chat do site
- [ ] (Opcional) Servidor de e-mail (SMTP), para o "esqueci a senha" por e-mail
