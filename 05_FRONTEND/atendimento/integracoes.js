// Aba Integrações: mostra o que está conectado e conecta canais novos no Chatwoot.
// Cada canal vira uma "caixa de entrada" no Chatwoot (POST /inboxes).
'use strict';

const MARCAS = { rosa: 'Rosa Selvagem', beyoung: 'Beyoung' };

const INTEGRACOES = [
  {
    id: 'whatsapp', grupo: 'canais', nome: 'WhatsApp', desc: 'Mensagens do WhatsApp oficial da marca, pela API da Meta.',
    passos: [
      'Em <b>developers.facebook.com</b>, abra o app da Rosa Selvagem e entre em <b>WhatsApp, Configuração da API</b>.',
      'Copie o <b>ID do número de telefone</b> e o <b>ID da conta do WhatsApp Business</b>.',
      'Em <b>business.facebook.com</b>, vá em Configurações, Usuários do sistema, crie um usuário de sistema administrador, dê a ele o app e a conta do WhatsApp, e gere um <b>token permanente</b> com as permissões <b>whatsapp_business_messaging</b> e <b>whatsapp_business_management</b>.',
      'Cole abaixo e clique em Conectar. O sistema confere tudo na Meta e já liga o recebimento das mensagens sozinho.',
    ],
    campos: [
      { id: 'phone_id', rot: 'ID do número de telefone', ph: '123456789012345' },
      { id: 'waba_id', rot: 'ID da conta do WhatsApp Business', ph: '102938475610293' },
      { id: 'token', rot: 'Token permanente', ph: 'EAAG…', tipo: 'password' },
    ],
    rota: '/canais/whatsapp', corpo: v => ({ phone_number_id: v.phone_id, waba_id: v.waba_id, token: v.token }),
    aviso: 'O número não pode estar ligado a outro sistema ao mesmo tempo. Hoje ele está na Seeyu: só conecte aqui quando for a hora de trocar.',
  },
  {
    id: 'instagram', grupo: 'canais', nome: 'Instagram', desc: 'Directs e respostas aos stories do perfil da marca.',
    oauth: 'instagram',
    passos: [
      'A conta do Instagram precisa ser <b>profissional</b> (empresa ou criador).',
      'Clique em <b>Entrar com o Instagram</b>, faça login com a conta da marca e aceite as permissões.',
      'Pronto: os Directs começam a cair aqui. Volte para esta aba depois do login.',
    ],
    aviso: 'Funciona com o sistema na VPS e o app da Meta configurado no servidor. Como a conta é da própria marca, não precisa esperar a aprovação da Meta.',
  },
  {
    id: 'messenger', grupo: 'canais', nome: 'Messenger', desc: 'Mensagens da página da marca no Facebook.',
    oauth: 'messenger',
    passos: [
      'Clique em <b>Abrir conexão do Facebook</b>. Abre uma aba do sistema de mensagens.',
      'Lá, escolha <b>Messenger</b>, clique em <b>Continuar com o Facebook</b>, entre com quem administra a página e escolha a página da marca.',
      'Volte para esta aba: a caixa nova aparece aqui já com a equipe e a IA.',
    ],
    aviso: 'Funciona com o sistema na VPS e o app da Meta configurado no servidor.',
  },
  {
    // Comentários: não vira caixa do Chatwoot. O servidor lê direto da Meta (06_BACKEND/atendimento/rotas/comentarios.mjs).
    id: 'comentarios', grupo: 'canais', nome: 'Comentários do Instagram e Facebook',
    desc: 'Comentários dos posts, dos Reels e dos anúncios, e as menções à marca. Aparecem na seção Comentários.',
  },
  {
    id: 'telegram', grupo: 'canais', nome: 'Telegram', desc: 'Um robô do Telegram que entrega as mensagens aqui.',
    passos: [
      'No Telegram, abra o <b>@BotFather</b> e mande <b>/newbot</b>.',
      'Escolha um nome, como "Rosa Selvagem Atendimento".',
      'O BotFather manda um <b>token</b>. Cole abaixo.',
    ],
    campos: [{ id: 'token', rot: 'Token do robô', ph: '123456789:AAH…', tipo: 'password' }],
    aviso: 'O Telegram só entrega as mensagens num endereço público: funciona com o sistema na VPS.',
    rota: '/canais/telegram', corpo: v => ({ token: v.token }),
  },
  {
    id: 'site', grupo: 'canais', nome: 'Chat do site', desc: 'Uma janelinha de conversa no site da loja.',
    passos: [
      'Informe o endereço do site e clique em Conectar.',
      'Copie o código que aparece e cole no tema da loja, antes de <b>&lt;/body&gt;</b>.',
    ],
    campos: [
      { id: 'url', rot: 'Endereço do site', ph: 'https://rosaselvagemoficial.com.br' },
      { id: 'boasvindas', rot: 'Mensagem de boas-vindas', ph: 'Oi! Como podemos te ajudar?', opcional: true },
    ],
    rota: '/canais/site', corpo: v => ({ url: v.url, boasvindas: v.boasvindas }),
  },
  {
    id: 'email', grupo: 'canais', nome: 'E-mail', desc: 'Os e-mails de duvidas@ caem aqui como conversas.',
    precisaVps: true,
    passos: [
      'O e-mail precisa de um endereço público para receber as mensagens encaminhadas.',
      'Na VPS, você cadastra o duvidas@rosaselvagemoficial.com.br e liga o encaminhamento.',
    ],
  },
  {
    id: 'shopify', grupo: 'ferramentas', nome: 'Shopify', desc: 'Mostra os pedidos da cliente ao lado da conversa.',
    breve: true,
    passos: [
      'Vamos ligar a loja (331 produtos) para cada conversa mostrar o último pedido, o status e o rastreio de verdade.',
      'Hoje o pedido que aparece ao lado da conversa é de teste.',
    ],
  },
  {
    id: 'ia', grupo: 'ferramentas', nome: 'IA do SAC', desc: 'Responde primeiro, separa por assunto e chama alguém da equipe quando precisa.',
    passos: [
      'Toda conversa nova passa primeiro pela IA. Ela espera a cliente terminar de escrever e responde como uma atendente, com a base de conhecimento do Cérebro.',
      'Ela marca o assunto (reembolso, troca, frete, rastreio…) para vocês filtrarem na lateral.',
      'Reembolso, devolução, troca, defeito, pedido específico ou cliente brava vão para <b>Precisam de alguém</b>, com o motivo, um resumo e uma sugestão de resposta.',
      'Qualquer pessoa da equipe pode assumir a conversa a qualquer momento. A partir daí, a IA para de responder nela.',
    ],
  },
];

const INTEG_ICO = {
  comentarios: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  shopify: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  ia: BRILHO,
};
const integIco = i => ico(CANAIS[i.id]?.svg || INTEG_ICO[i.id]);

// caixas do Chatwoot de cada canal; as do tipo API são só de teste
function caixasDe(id) {
  return Object.values(INBOX).filter(ib => ib.canal === id);
}
function situacao(i) {
  if (i.id === 'comentarios') {
    if (!COMENT) return { cls: '', rot: 'Conferindo…' };
    return COMENT.conectado ? { cls: 'ligado', rot: 'Conectado' } : { cls: '', rot: 'Não conectado' };
  }
  if (i.id === 'ia') return IA_LIGADA ? { cls: 'ligado', rot: 'Ligada' } : { cls: '', rot: 'Desligada' };
  if (i.breve) return { cls: 'espera', rot: 'Em preparação' };
  const cx = caixasDe(i.id);
  if (cx.some(c => c.tipo && c.tipo !== 'Channel::Api')) return { cls: 'ligado', rot: 'Conectado' };
  if (cx.length) return { cls: 'espera', rot: 'Só de teste' };
  return { cls: '', rot: 'Não conectado' };
}

function renderIntegracoes() {
  if (Date.now() - COMENT_T > 20000) carregarComent();
  prepararCaixasNovas();
  const card = i => {
    const s = situacao(i), cx = caixasDe(i.id);
    const contas = i.id === 'comentarios' ? contasComent()
      : !i.breve && i.id !== 'ia' && cx.length ? `<div class="contas">${cx.map(c => `<span>${esc(c.nome)}${c.tipo === 'Channel::Api' ? ' (teste)' : ''}</span>`).join('')}</div>` : '';
    const botao = i.id === 'comentarios' ? (COMENT?.conectado ? 'Ver ou desconectar' : 'Conectar')
      : i.id === 'ia' ? (IA_LIGADA ? 'Ver ou desligar' : 'Ligar a IA') : i.breve || i.precisaVps ? 'Ver o que falta' : s.cls === 'ligado' ? 'Conectar outra' : i.oauth === 'instagram' ? 'Entrar com o Instagram' : 'Conectar';
    return `<div class="card">
      <div class="card-top"><span class="card-ico">${integIco(i)}</span><div><h3>${i.nome}</h3><span class="estado ${s.cls}">${s.rot}</span></div></div>
      <p class="desc">${i.desc}</p>${contas}
      <div class="card-pe">${i.precisaVps ? '<span class="muted" style="font-size:12px">Precisa da VPS</span>' : ''}<button class="btn${i.breve || i.precisaVps || (i.id === 'comentarios' && COMENT?.conectado) ? '' : ' prim'} peq" data-integ="${i.id}">${botao}</button></div>
    </div>`;
  };
  $('#pag-integracoes').innerHTML = `<div class="pag-in">
    <div class="pag-head" style="align-items:flex-start"><button class="btn icone fantasma abrir-menu" data-acao="menu-lateral" aria-label="Abrir menu"><svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><div><h1>Integrações</h1><p>Conecte os canais por onde as clientes falam com a marca. Cada canal conectado manda as mensagens para cá automaticamente.</p></div></div>
    ${REAL ? '' : '<div class="nota-box">Você está na demonstração. Para conectar de verdade, o Chatwoot precisa estar ligado.</div>'}
    <div class="secao">Canais de mensagem</div>
    <div class="grade">${INTEGRACOES.filter(i => i.grupo === 'canais').map(card).join('')}</div>
    <div class="secao">Ferramentas</div>
    <div class="grade">${INTEGRACOES.filter(i => i.grupo === 'ferramentas').map(card).join('')}</div>
  </div>`;
}

function fecharGaveta() { $('#gaveta').innerHTML = ''; }

function abrirGaveta(id, resultado) {
  const i = INTEGRACOES.find(x => x.id === id);
  const podeConectar = !!i.rota && REAL;
  const campos = i.campos ? `
    <div class="campo"><label for="f-marca">Marca</label>
      <select id="f-marca">${Object.entries(MARCAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    ${i.campos.map(f => `<div class="campo"><label for="f-${f.id}">${f.rot}${f.opcional ? ' <span class="muted" style="font-weight:400">(opcional)</span>' : ''}</label>
      <input id="f-${f.id}" type="${f.tipo || 'text'}" placeholder="${esc(f.ph)}" autocomplete="off"></div>`).join('')}` : '';
  const corpo = resultado || `
    <ol class="passos">${i.passos.map(p => `<li><span>${p}</span></li>`).join('')}</ol>
    ${i.aviso ? `<div class="nota-box">${i.aviso}</div>` : ''}
    ${podeConectar ? campos : ''}

    <div id="g-erro"></div>`;
  $('#gaveta').innerHTML = `<div class="fundo" data-fechar="1">
    <div class="gaveta" role="dialog" aria-modal="true" aria-labelledby="g-titulo">
      <div class="gaveta-head"><span class="card-ico">${integIco(i)}</span><h2 id="g-titulo">${resultado ? `${i.nome} conectado` : `Conectar ${i.nome}`}</h2>
        <button class="btn icone fantasma" data-fechar="1" aria-label="Fechar">${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="gaveta-corpo">${corpo}</div>
      <div class="gaveta-pe">
        <button class="btn fantasma" data-fechar="1">${resultado ? 'Fechar' : 'Cancelar'}</button>
        ${podeConectar && !resultado ? `<button class="btn prim" data-conectar="${i.id}">Conectar</button>` : ''}
        ${i.oauth && REAL && !resultado ? `<button class="btn prim" data-oauth="${i.oauth}">${i.oauth === 'instagram' ? 'Entrar com o Instagram' : 'Abrir conexão do Facebook'}</button>` : ''}
        ${i.id === 'ia' && REAL ? `<button class="btn${IA_LIGADA ? '' : ' prim'}" data-ia="${IA_LIGADA ? 'desligar' : 'ligar'}">${IA_LIGADA ? 'Desligar a IA' : 'Ligar a IA'}</button>` : ''}
      </div>
    </div></div>`;
  $('#gaveta').querySelector('input')?.focus();
}

async function conectar(id, botao) {
  const i = INTEGRACOES.find(x => x.id === id);
  const v = {};
  for (const f of i.campos) {
    v[f.id] = ($(`#f-${f.id}`).value || '').trim();
    if (!v[f.id] && !f.opcional) {
      $('#g-erro').innerHTML = `<div class="erro">Preencha "${f.rot}".</div>`;
      $(`#f-${f.id}`).focus();
      return;
    }
  }
  const marca = $('#f-marca').value;
  botao.disabled = true; botao.textContent = 'Conectando…';
  try {
    const ib = await chamar(`/api/atendimento${i.rota}`, 'POST', { marca, ...i.corpo(v) });
    await recarregarCaixas();
    renderIntegracoes();
    const codigo = ib.codigo;
    abrirGaveta(id, `<div class="sucesso">${esc(ib.nome)} está conectado. A equipe e a IA já estão nele, e as conversas novas desse canal aparecem no Atendimento.</div>
      ${ib.webhook_erro ? `<div class="erro">A caixa foi criada, mas a Meta não ligou o recebimento das mensagens: ${esc(ib.webhook_erro)}</div>` : ''}
      ${codigo ? `<div class="campo"><label>Código para colar no site</label><div class="codigo"><pre id="g-codigo">${esc(codigo)}</pre><button class="btn peq" data-copiar="g-codigo">Copiar</button></div>
        <small>Na Shopify: Loja virtual, Temas, Editar código, theme.liquid. Cole antes de &lt;/body&gt;.</small></div>` : ''}`);
  } catch (err) {
    botao.disabled = false; botao.textContent = 'Conectar';
    $('#g-erro').innerHTML = `<div class="erro">Não conectou: ${esc(err.message)}. Confira os dados e tente de novo.</div>`;
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-integ],[data-fechar],[data-conectar],[data-copiar],[data-ia]');
  if (!el) return;
  if (el.dataset.ia) {
    const ligar = el.dataset.ia === 'ligar';
    el.disabled = true; el.textContent = ligar ? 'Ligando…' : 'Desligando…';
    chamar('/api/atendimento/ia', 'POST', { ligada: ligar })
      .then(() => { IA_LIGADA = ligar; fecharGaveta(); renderIntegracoes(); toast(ligar ? 'IA ligada. As conversas novas passam primeiro por ela.' : 'IA desligada. As conversas novas vão direto para a equipe.'); })
      .catch(err => { el.disabled = false; el.textContent = ligar ? 'Ligar a IA' : 'Desligar a IA'; $('#g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`; });
    return;
  }
  if (el.dataset.integ === 'comentarios') abrirGavetaComent();
  else if (el.dataset.integ) abrirGaveta(el.dataset.integ);
  else if (el.dataset.fechar && (e.target === el || el.tagName === 'BUTTON')) fecharGaveta();
  else if (el.dataset.conectar) conectar(el.dataset.conectar, el);
  else if (el.dataset.copiar) {
    navigator.clipboard.writeText($(`#${el.dataset.copiar}`).textContent).then(() => toast('Código copiado.'), () => toast('Não deu para copiar. Selecione o texto e copie.'));
  }
});

// ---------- Comentários do Instagram e Facebook ----------
// A dona cola os dados da Meta; o servidor confere na Meta antes de salvar (POST /comentarios/conectar)
// e nunca devolve o token. O resto da equipe vê só se está conectado.
let COMENT = null, COMENT_T = 0;
const COMENT_API = '/api/atendimento/comentarios';
async function carregarComent() {
  COMENT_T = Date.now();
  try { COMENT = await chamar(`${COMENT_API}/conexao`); }
  catch (e) { COMENT = { conectado: false, erro: e.message }; }
  const pg = $('#pag-integracoes');
  if (pg && !pg.hidden) renderIntegracoes();
}
function contasComent() {
  if (!COMENT?.conectado) return '';
  const nomes = [
    COMENT.pagina ? `Página: ${COMENT.pagina.nome || COMENT.pagina.id}` : '',
    COMENT.instagram ? `Instagram: @${COMENT.instagram.usuario || COMENT.instagram.id}` : '',
    COMENT.anuncios ? `Anúncios: ${COMENT.anuncios.nome || COMENT.anuncios.id}` : '',
  ].filter(Boolean);
  return `<div class="contas">${nomes.map(n => `<span>${esc(n)}</span>`).join('')}</div>`;
}

const COMENT_PERMISSOES = ['instagram_basic', 'instagram_manage_comments', 'pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_engagement', 'ads_read'];
const COMENT_PASSOS = [
  'No computador, entre no Facebook com a conta que <b>administra a página da Rosa Selvagem</b>.',
  'Abra o <b>Explorador da Graph API</b>: <b>developers.facebook.com/tools/explorer</b>.',
  'À direita, em <b>Meta App</b>, escolha o app da Rosa Selvagem. Em <b>User or Page</b>, deixe <b>User Token</b>.',
  `Em <b>Permissions</b>, adicione estas 7: ${COMENT_PERMISSOES.map(p => `<b>${p}</b>`).join(', ')}.`,
  'Clique em <b>Generate Access Token</b>. Na janela da Meta, escolha a página e o Instagram da marca e aceite tudo.',
  'No campo do alto do Explorador, apague o que estiver lá, cole <b style="overflow-wrap:anywhere">me/accounts?fields=name,id,instagram_business_account{id,username}</b> e clique em <b>Submit</b>.',
  'Na resposta, ache a página da marca: o número em <b>"id"</b> é o <b>ID da página</b>. Dentro de <b>instagram_business_account</b> estão o <b>ID da conta do Instagram</b> ("id") e o <b>nome de usuário</b> ("username").',
  '<b>Deixe o token sem vencer:</b> clique no <b>i</b> azul ao lado do token, depois em <b>Open in Access Token Tool</b> e em <b>Extend Access Token</b>. Copie o token novo que aparece embaixo. É ele que vai no campo "Token de acesso".',
  'Conta de anúncios (opcional, para ver os comentários dos anúncios no ar): no <b>Gerenciador de Anúncios</b>, é o número que aparece depois de <b>act=</b> no endereço da página.',
  'Cole tudo abaixo e clique em <b>Conectar</b>. O sistema confere na Meta antes de salvar.',
];
const COMENT_CAMPOS = [
  { id: 'page_id', rot: 'ID da página do Facebook', ph: 'Ex.: 104857362918273', num: true },
  { id: 'ig_user_id', rot: 'ID da conta do Instagram', ph: 'Ex.: 17841400123456789', num: true, opcional: 'se ficar vazio, o sistema procura' },
  { id: 'ig_username', rot: 'Nome de usuário do Instagram', ph: '@rosaselvagemoficial', opcional: 'opcional' },
  { id: 'ad_account_id', rot: 'ID da conta de anúncios', ph: 'Ex.: 1234567890123456', num: true, opcional: 'opcional' },
  { id: 'token', rot: 'Token de acesso', ph: 'Começa com EAA…', tipo: 'password' },
];

function gavetaComent(titulo, corpo, pe) {
  $('#gaveta').innerHTML = `<div class="fundo" data-fechar="1">
    <div class="gaveta" role="dialog" aria-modal="true" aria-labelledby="g-titulo">
      <div class="gaveta-head"><span class="card-ico">${ico(INTEG_ICO.comentarios)}</span><h2 id="g-titulo">${titulo}</h2>
        <button class="btn icone fantasma" data-fechar="1" aria-label="Fechar">${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="gaveta-corpo">${corpo}</div>
      <div class="gaveta-pe">${pe}</div>
    </div></div>`;
}

function abrirGavetaComent(modo) {
  if (!COMENT) { carregarComent().then(() => abrirGavetaComent(modo)); return; }
  const pode = COMENT.pode_editar !== false && typeof MEU_NIVEL !== 'undefined' && MEU_NIVEL === 'dona';
  if (COMENT.conectado && modo !== 'trocar') {
    const quando = COMENT.conectado_em ? new Date(COMENT.conectado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const vence = COMENT.vence_em ? new Date(COMENT.vence_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const linha = (rot, val) => val ? `<div class="campo"><label>${rot}</label><div>${esc(val)}</div></div>` : '';
    gavetaComent('Comentários do Instagram e Facebook', `
      <div class="sucesso">Conectado. Os comentários aparecem na seção Comentários.</div>
      ${linha('Página do Facebook', COMENT.pagina ? `${COMENT.pagina.nome || ''} (${COMENT.pagina.id})`.trim() : '')}
      ${linha('Instagram', COMENT.instagram ? `@${COMENT.instagram.usuario || COMENT.instagram.id}` : 'Nenhum Instagram ligado a esta página')}
      ${linha('Conta de anúncios', COMENT.anuncios ? `${COMENT.anuncios.nome || ''} (${COMENT.anuncios.id})`.trim() : '')}
      ${linha('Conectado em', [quando, COMENT.conectado_por ? `por ${COMENT.conectado_por}` : ''].filter(Boolean).join(' '))}
      ${vence ? `<div class="nota-box">Este acesso vence em ${vence}. Antes disso, gere um token novo e use "Trocar os dados".</div>` : ''}
      ${pode ? '' : '<div class="nota-box">Só a dona pode trocar ou desconectar.</div>'}
      <div id="g-erro"></div>`,
      `<button class="btn fantasma" data-fechar="1">Fechar</button>
       ${pode ? '<button class="btn" data-mc="trocar">Trocar os dados</button><button class="btn" data-mc="desconectar">Desconectar</button>' : ''}`);
    return;
  }
  const campos = COMENT_CAMPOS.map(c => `<div class="campo"><label for="mc-${c.id}">${c.rot}${c.opcional ? ` <span class="muted" style="font-weight:400">(${c.opcional})</span>` : ''}</label>
    <input id="mc-${c.id}" type="${c.tipo || 'text'}" placeholder="${esc(c.ph)}" autocomplete="${c.tipo === 'password' ? 'new-password' : 'off'}" spellcheck="false"${c.num ? ' inputmode="numeric"' : ''}></div>`).join('');
  gavetaComent(modo === 'trocar' ? 'Trocar os dados da Meta' : 'Conectar comentários', `
    <p class="desc">Os comentários não passam pelo Chatwoot: o sistema lê direto do Instagram e do Facebook. Você faz isto uma vez, no computador.</p>
    <ol class="passos">${COMENT_PASSOS.map(p => `<li><span>${p}</span></li>`).join('')}</ol>
    <div class="nota-box">Se o Explorador não mostrar um app da Rosa Selvagem, crie um em <b>developers.facebook.com/apps</b> (tipo Empresa) e volte ao passo 2.</div>
    ${pode ? campos : '<div class="nota-box">Só a dona pode conectar. Peça para ela abrir esta tela.</div>'}
    <div id="g-erro"></div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button>${pode ? '<button class="btn prim" data-mc="conectar">Conectar</button>' : ''}`);
  $('#mc-page_id')?.focus();
}

async function conectarComent(botao) {
  const v = {};
  for (const c of COMENT_CAMPOS) v[c.id] = ($(`#mc-${c.id}`)?.value || '').trim();
  const falta = COMENT_CAMPOS.find(c => !c.opcional && !v[c.id]);
  if (falta) { $('#g-erro').innerHTML = `<div class="erro">Preencha "${falta.rot}".</div>`; $(`#mc-${falta.id}`).focus(); return; }
  botao.disabled = true; botao.textContent = 'Conferindo na Meta…';
  $('#g-erro').innerHTML = '';
  try {
    const r = await chamar(`${COMENT_API}/conectar`, 'POST', v);
    v.token = ''; $('#mc-token').value = '';
    COMENT = { ...r, pode_editar: true }; COMENT_T = Date.now();
    renderIntegracoes();
    gavetaComent('Comentários conectados', `
      <div class="sucesso">Pronto. ${esc(r.pagina?.nome || 'A página')}${r.instagram ? ` e @${esc(r.instagram.usuario || '')}` : ''} estão conectados. Os comentários já aparecem na seção Comentários.</div>
      ${(r.avisos || []).map(a => `<div class="nota-box">${esc(a)}</div>`).join('')}
      <p class="desc">A moderação automática só mexe nos comentários que chegarem a partir de agora.</p>`,
      '<button class="btn fantasma" data-fechar="1">Fechar</button><button class="btn prim" data-mc="ver">Ver os comentários</button>');
  } catch (err) {
    botao.disabled = false; botao.textContent = 'Conectar';
    $('#g-erro').innerHTML = `<div class="erro">Não conectou: ${esc(err.message)}</div>`;
  }
}

async function desconectarComent(botao) {
  if (botao.dataset.confirmar !== '1') {
    botao.dataset.confirmar = '1'; botao.textContent = 'Sim, desconectar';
    $('#g-erro').innerHTML = '<div class="nota-box">Os comentários param de aparecer e a moderação automática para. Nada é apagado no Instagram nem no Facebook. Clique de novo para confirmar.</div>';
    return;
  }
  botao.disabled = true; botao.textContent = 'Desconectando…';
  try {
    await chamar(`${COMENT_API}/desconectar`, 'POST', {});
    COMENT = { conectado: false, pode_editar: true }; COMENT_T = Date.now();
    fecharGaveta(); renderIntegracoes();
    toast('Comentários desconectados.');
  } catch (err) {
    botao.disabled = false; botao.textContent = 'Desconectar'; delete botao.dataset.confirmar;
    $('#g-erro').innerHTML = `<div class="erro">Não desconectou: ${esc(err.message)}</div>`;
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-mc]');
  if (!el) return;
  if (el.dataset.mc === 'conectar') conectarComent(el);
  else if (el.dataset.mc === 'desconectar') desconectarComent(el);
  else if (el.dataset.mc === 'trocar') abrirGavetaComent('trocar');
  else if (el.dataset.mc === 'ver') { fecharGaveta(); irPara('comentarios/feed'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id?.startsWith('mc-')) { e.preventDefault(); const b = document.querySelector('[data-mc="conectar"]'); if (b && !b.disabled) conectarComent(b); }
});

// caixas que vieram do login da Meta (Instagram, Messenger) ganham equipe e IA quando a aba abre
async function recarregarCaixas() {
  const r = await cw('inboxes').catch(() => null);
  for (const ib of r?.payload || []) INBOX[ib.id] = { canal: canalDoInbox(ib), marca: /beyoung/i.test(ib.name) ? 'beyoung' : 'rosa', nome: ib.name, tipo: ib.channel_type };
}
let INTEG_PREPARADO = 0;
async function prepararCaixasNovas() {
  if (!REAL || MEU_NIVEL !== 'dona' || Date.now() - INTEG_PREPARADO < 30000) return;
  INTEG_PREPARADO = Date.now();
  try {
    const r = await chamar('/api/atendimento/canais/preparar', 'POST', {});
    if (r.preparadas?.length) { await recarregarCaixas(); renderIntegracoes(); toast(`Pronto para atender: ${r.preparadas.join(', ')}.`); }
  } catch { /* tenta de novo na próxima vez que a aba abrir */ }
}
// volta para cá depois do login da Meta: confere as caixas novas
window.addEventListener('focus', () => { if (estado.pagina === 'integracoes') { INTEG_PREPARADO = 0; prepararCaixasNovas(); } });

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-oauth]');
  if (!el) return;
  el.disabled = true;
  try {
    const r = el.dataset.oauth === 'instagram'
      ? await chamar('/api/atendimento/canais/instagram', 'POST', {})
      : await chamar('/api/atendimento/canais/messenger');
    window.open(r.url, '_blank', 'noopener');
    $('#g-erro').innerHTML = '<div class="nota-box">Abriu numa aba nova. Termine o login lá e volte para cá.</div>';
  } catch (err) {
    $('#g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`;
  } finally { el.disabled = false; }
});
