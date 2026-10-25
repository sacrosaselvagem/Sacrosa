// Configurações > Geral (só a dona): respostas prontas, etiquetas, horário de atendimento,
// distribuição de conversas, marcas das caixas e login. Servidor: 06_BACKEND/atendimento/rotas/configuracoes.mjs.
// Contrato dos módulos: 09_DOCUMENTATION/atendimento-modulos.md.
'use strict';

(() => {
  if (!document.querySelector('link[data-mod="configuracoes"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'modulos/configuracoes.css'; l.dataset.mod = 'configuracoes';
    document.head.appendChild(l);
  }
})();

const CG_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CG_ORDEM = [1, 2, 3, 4, 5, 6, 0];
const CG_IA_LABELS = () => new Set(ASSUNTOS.map(a => a.id));
const CG = { respostas: null, etiquetas: null, geral: null, erro: {}, salvando: {} };

// exemplo para o modo demonstração (sem Chatwoot)
const CG_DEMO = {
  geral: {
    horario: { dias: [0, 1, 2, 3, 4, 5, 6].map(dia => ({ dia, fechado: dia === 0 || dia === 6, abre: '09:00', fecha: '18:00' })), mensagem_fora: '' },
    distribuicao: { limite: 8, automatica: true }, login_obrigatorio: false, salvo: false,
    texto_ia: 'Horário de atendimento da equipe (horário de Brasília/Recife): segunda a sexta, das 9h às 18h; sábado e domingo, fechado.',
    caixas: [
      { id: 1, nome: 'WhatsApp Rosa Selvagem', tipo: 'Channel::Api', marca: 'rosa' },
      { id: 2, nome: 'Instagram Rosa Selvagem', tipo: 'Channel::Api', marca: 'rosa' },
      { id: 7, nome: 'WhatsApp Beyoung', tipo: 'Channel::Api', marca: 'beyoung' },
    ],
  },
};

// ---------- usado por outras partes da tela ----------
// Respostas prontas do Chatwoot no formato do composer: [{ atalho, titulo, txt }]
async function carregarRespostasProntas() {
  if (!REAL) return RESPOSTAS.slice();
  const lista = await cw('canned_responses');
  return (Array.isArray(lista) ? lista : lista.payload || []).map(r => ({ atalho: r.short_code, titulo: cgTitulo(r), txt: r.content, id: r.id }));
}
// Horário, limite de conversas por pessoa e distribuição automática (atendimento-geral.json)
async function carregarConfigGeral() {
  if (!REAL) return CG_DEMO.geral;
  return chamar('/api/atendimento/configuracoes/geral');
}
function cgTitulo(r) {
  const fixo = RESPOSTAS.find(x => x.atalho === r.short_code);
  if (fixo) return fixo.titulo;
  const t = String(r.content || '').replace(/\{nome\}/g, '').replace(/\s+/g, ' ').trim();
  const palavras = t.split(' ').slice(0, 6).join(' ');
  return palavras.length < t.length ? `${palavras.replace(/[,.!?;:]+$/, '')}…` : palavras || r.short_code;
}

// ---------- página ----------
const CG_SECOES = [
  ['respostas', 'Respostas prontas'], ['etiquetas', 'Etiquetas'], ['horario', 'Horário'],
  ['distribuicao', 'Distribuição'], ['times', 'Times e assuntos'], ['marcas', 'Marcas'], ['seguranca', 'Segurança'],
];
const CG_ICO = {
  times: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
  respostas: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  etiquetas: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  horario: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>',
  distribuicao: '<circle cx="12" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 8.5v3M12 11.5 6.5 16M12 11.5l5.5 4.5"/>',
  marcas: '<path d="M4 5h16v11H8l-4 4z"/>',
  seguranca: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
};

registrarPagina({
  id: 'configuracoes', nome: 'Geral', niveis: ['dona'], ico: ICO_CONFIG,
  render(el) {
    el.innerHTML = `<div class="pag-in configuracoes">
      ${cabecalho('Geral', 'Os ajustes do atendimento. O que você muda aqui vale para toda a equipe.')}
      ${REAL ? '' : '<div class="nota-box configuracoes-demo">Isto é uma demonstração. Nada do que você mudar aqui é salvo.</div>'}
      <nav class="configuracoes-atalhos" aria-label="Partes desta página">${CG_SECOES.map(([id, nome]) => `<button class="chip" data-cg="ir" data-alvo="${id}">${nome}</button>`).join('')}</nav>
      ${CG_SECOES.map(([id]) => `<section class="configuracoes-bloco" id="cg-${id}" aria-labelledby="cg-t-${id}"></section>`).join('')}
    </div>`;
    CG_SECOES.forEach(([id]) => cgDesenhar(id));
    cgCarregar();
  },
});

async function cgCarregar() {
  if (!REAL) {
    CG.geral = structuredClone(CG_DEMO.geral);
    CG.respostas = RESPOSTAS.map((r, i) => ({ id: i + 1, short_code: r.atalho, content: r.txt }));
    CG.etiquetas = ASSUNTOS.map((a, i) => ({ id: i + 1, title: a.id, description: a.nome })).concat({ id: 99, title: 'cliente-vip', description: 'Cliente VIP' });
    CG_SECOES.forEach(([id]) => cgDesenhar(id));
    return;
  }
  const tarefas = [
    ['respostas', () => cw('canned_responses').then(r => { CG.respostas = Array.isArray(r) ? r : r.payload || []; })],
    ['etiquetas', () => cw('labels').then(r => { CG.etiquetas = r.payload || []; })],
    ['times', () => cgCarregarTimes()],
    ['geral', () => chamar('/api/atendimento/configuracoes/geral').then(r => { CG.geral = r; })],
  ];
  await Promise.all(tarefas.map(([k, f]) => f().then(() => { delete CG.erro[k]; }).catch(err => { CG.erro[k] = err.message; })));
  CG_SECOES.forEach(([id]) => cgDesenhar(id));
}

function cgTopo(id, titulo, desc, acoes = '') {
  return `<div class="configuracoes-topo">
    <span class="card-ico">${ico(CG_ICO[id])}</span>
    <div class="configuracoes-titulo"><h2 id="cg-t-${id}">${titulo}</h2><p>${desc}</p></div>
    ${acoes ? `<div class="configuracoes-acoes">${acoes}</div>` : ''}
  </div>`;
}
const cgCarregando = () => '<div class="configuracoes-carregando">Carregando…</div>';
const cgErro = k => `<div class="erro">Não consegui carregar: ${esc(CG.erro[k])}. Atualize a página para tentar de novo.</div>`;
const cgSwitch = (acao, ligado, rotulo, extra = '') => `<button type="button" class="configuracoes-switch${ligado ? ' on' : ''}" role="switch" aria-checked="${ligado}" aria-label="${esc(rotulo)}" data-cg="${acao}" ${extra}><i></i></button>`;

function cgDesenhar(id) {
  const el = document.getElementById(`cg-${id}`);
  if (!el) return;
  el.innerHTML = ({ respostas: cgRespostas, etiquetas: cgEtiquetas, horario: cgHorario, distribuicao: cgDistribuicao, times: cgTimes, marcas: cgMarcas, seguranca: cgSeguranca })[id]();
}

// ---------- 1. respostas prontas ----------
function cgRespostas() {
  const topo = cgTopo('respostas', 'Respostas prontas', 'Textos que você usa sempre. Na conversa, digite <b>/</b> e o atalho (por exemplo <b>/prazo</b>) para colar o texto. Escreva <b>{nome}</b> onde vai o primeiro nome da cliente.',
    CG.respostas?.length ? `<button class="btn" data-cg="resp-nova">${ico(CG_ICO.mais)}Nova resposta</button>` : '');
  if (CG.erro.respostas) return topo + cgErro('respostas');
  if (!CG.respostas) return topo + cgCarregando();
  if (!CG.respostas.length) return `${topo}<div class="configuracoes-vazio">
      <strong>Nenhuma resposta pronta ainda</strong>
      <span>Comece com as 5 da Rosa Selvagem (prazo, rastreio, troca, cancelamento e despedida). Depois você muda o que quiser.</span>
      <div class="configuracoes-linha-botoes"><button class="btn" data-cg="resp-importar">Trazer as 5 respostas da Rosa</button><button class="btn fantasma" data-cg="resp-nova">Escrever uma nova</button></div>
    </div>`;
  const lista = CG.respostas.slice().sort((a, b) => a.short_code.localeCompare(b.short_code, 'pt-BR'));
  const faltam = RESPOSTAS.filter(r => !CG.respostas.some(x => x.short_code === r.atalho)).length;
  return `${topo}<div class="tabela">${lista.map(r => `<div class="configuracoes-item">
      <div class="configuracoes-item-txt"><span class="configuracoes-atalho">/${esc(r.short_code)}</span><p>${esc(r.content)}</p></div>
      <div class="configuracoes-item-acoes">
        <button class="btn icone fantasma" data-cg="resp-editar" data-id="${r.id}" aria-label="Editar /${esc(r.short_code)}" title="Editar">${ico(CG_ICO.lapis)}</button>
        <button class="btn icone fantasma" data-cg="resp-apagar" data-id="${r.id}" aria-label="Apagar /${esc(r.short_code)}" title="Apagar">${ico(CG_ICO.lixo)}</button>
      </div></div>`).join('')}</div>
    ${faltam ? `<p class="configuracoes-dica">Faltam ${faltam} das respostas da Rosa. <button class="configuracoes-link" data-cg="resp-importar">Trazer as que faltam</button></p>` : ''}`;
}

function cgFormResposta(r) {
  gaveta(r ? 'Editar resposta pronta' : 'Nova resposta pronta', `
    <div class="campo"><label for="cg-atalho">Atalho</label>
      <div class="configuracoes-prefixo"><span>/</span><input id="cg-atalho" maxlength="30" autocomplete="off" value="${esc(r?.short_code || '')}" placeholder="prazo"></div>
      <small>Uma palavra só, sem espaço. É o que você digita depois da barra.</small></div>
    <div class="campo"><label for="cg-texto">Texto</label>
      <textarea id="cg-texto" class="configuracoes-textarea" rows="7" maxlength="2000" placeholder="Oi, {nome}! …">${esc(r?.content || '')}</textarea>
      <small>{nome} vira o primeiro nome da cliente.</small></div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="resp-salvar" data-id="${r?.id || ''}">Salvar resposta</button>`);
}

const cgAtalho = v => String(v || '').trim().replace(/^\/+/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');

async function cgSalvarResposta(botao) {
  const id = botao.dataset.id, atalho = cgAtalho($('#cg-atalho').value), texto = $('#cg-texto').value.trim();
  const erro = msg => { $('#g-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`; };
  if (!atalho) return erro('Escreva o atalho, por exemplo: prazo.');
  if (!texto) return erro('Escreva o texto da resposta.');
  if (CG.respostas.some(r => r.short_code === atalho && String(r.id) !== id)) return erro(`Já existe uma resposta com o atalho /${atalho}. Escolha outro.`);
  if (!REAL) {
    if (id) Object.assign(CG.respostas.find(r => String(r.id) === id), { short_code: atalho, content: texto });
    else CG.respostas.push({ id: Date.now(), short_code: atalho, content: texto });
    fecharGaveta(); cgDesenhar('respostas'); toast('Na demonstração nada é salvo.'); return;
  }
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    const corpo = { short_code: atalho, content: texto };
    const salvo = id ? await cw(`canned_responses/${id}`, 'PATCH', corpo) : await cw('canned_responses', 'POST', corpo);
    if (id) CG.respostas = CG.respostas.map(r => String(r.id) === id ? salvo : r); else CG.respostas.push(salvo);
    fecharGaveta(); cgDesenhar('respostas'); toast(`Resposta /${atalho} salva.`);
  } catch (err) { botao.disabled = false; botao.textContent = 'Salvar resposta'; erro(`Não salvou: ${err.message}. Tente de novo.`); }
}

async function cgImportar(botao) {
  const faltam = RESPOSTAS.filter(r => !CG.respostas.some(x => x.short_code === r.atalho));
  if (!faltam.length) return;
  if (!REAL) { faltam.forEach((r, i) => CG.respostas.push({ id: Date.now() + i, short_code: r.atalho, content: r.txt })); cgDesenhar('respostas'); toast('Na demonstração nada é salvo.'); return; }
  botao.disabled = true; botao.textContent = 'Trazendo…';
  let ok = 0;
  for (const r of faltam) {
    try { CG.respostas.push(await cw('canned_responses', 'POST', { short_code: r.atalho, content: r.txt })); ok++; } catch { /* conta abaixo */ }
  }
  cgDesenhar('respostas');
  toast(ok === faltam.length ? `${ok} respostas prontas adicionadas.` : `Só ${ok} de ${faltam.length} entraram. Tente de novo.`);
}

// ---------- 2. etiquetas ----------
function cgEtiquetas() {
  const topo = cgTopo('etiquetas', 'Etiquetas', 'Marcam o assunto da conversa e servem de filtro na lista. As que dizem “a IA usa” são colocadas sozinhas pela IA do SAC e não podem ser apagadas.',
    CG.etiquetas ? `<button class="btn" data-cg="et-nova">${ico(CG_ICO.mais)}Nova etiqueta</button>` : '');
  if (CG.erro.etiquetas) return topo + cgErro('etiquetas');
  if (!CG.etiquetas) return topo + cgCarregando();
  const ia = CG_IA_LABELS();
  const nomeDe = l => ia.has(l.title) ? nomeAssunto(l.title) : (l.description || l.title.replace(/[-_]/g, ' '));
  const minhas = CG.etiquetas.filter(l => !ia.has(l.title)).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));
  const daIA = CG.etiquetas.filter(l => ia.has(l.title)).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));
  const linha = l => `<div class="configuracoes-item">
      <div class="configuracoes-item-txt"><strong>${esc(nomeDe(l))}</strong>${ia.has(l.title) ? '<span class="chip">a IA usa</span>' : ''}</div>
      <div class="configuracoes-item-acoes">${ia.has(l.title) ? '' : `
        <button class="btn icone fantasma" data-cg="et-editar" data-id="${l.id}" aria-label="Mudar o nome de ${esc(nomeDe(l))}" title="Mudar o nome">${ico(CG_ICO.lapis)}</button>
        <button class="btn icone fantasma" data-cg="et-apagar" data-id="${l.id}" aria-label="Apagar ${esc(nomeDe(l))}" title="Apagar">${ico(CG_ICO.lixo)}</button>`}</div></div>`;
  return `${topo}
    <h3 class="configuracoes-sub">Criadas pela equipe</h3>
    ${minhas.length ? `<div class="tabela">${minhas.map(linha).join('')}</div>` : '<div class="configuracoes-vazio peq"><span>Nenhuma etiqueta da equipe ainda. Crie uma para separar o que a IA não separa, por exemplo “Cliente VIP”.</span></div>'}
    <h3 class="configuracoes-sub">Assuntos da IA</h3>
    <div class="configuracoes-etiquetas-ia">${daIA.map(l => `<span class="chip" title="${esc(l.description || '')}">${esc(nomeDe(l))}</span>`).join('')}</div>`;
}

function cgFormEtiqueta(l) {
  gaveta(l ? 'Mudar o nome da etiqueta' : 'Nova etiqueta', `
    <div class="campo"><label for="cg-et-nome">Nome</label><input id="cg-et-nome" maxlength="40" autocomplete="off" value="${esc(l ? (l.description || l.title) : '')}" placeholder="Cliente VIP">
    ${l ? '<small>As conversas que já têm esta etiqueta continuam com ela.</small>' : '<small>Curto e claro. Aparece na lista de conversas.</small>'}</div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="et-salvar" data-id="${l?.id || ''}">${l ? 'Salvar nome' : 'Criar etiqueta'}</button>`);
}

async function cgSalvarEtiqueta(botao) {
  const id = botao.dataset.id, nome = $('#cg-et-nome').value.trim().replace(/\s+/g, ' ');
  const erro = msg => { $('#g-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`; };
  if (nome.length < 2) return erro('Escreva o nome da etiqueta.');
  const titulo = cgAtalho(nome).replace(/^[-_]+|[-_]+$/g, '').slice(0, 40);
  if (!id) {
    if (!titulo) return erro('Use letras ou números no nome.');
    if (CG.etiquetas.some(l => l.title === titulo)) return erro('Já existe uma etiqueta com esse nome.');
  }
  if (!REAL) {
    if (id) CG.etiquetas.find(l => String(l.id) === id).description = nome; else CG.etiquetas.push({ id: Date.now(), title: titulo, description: nome });
    fecharGaveta(); cgDesenhar('etiquetas'); toast('Na demonstração nada é salvo.'); return;
  }
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    const salvo = id ? await cw(`labels/${id}`, 'PATCH', { description: nome })
      : await cw('labels', 'POST', { title: titulo, description: nome, color: '#71717A', show_on_sidebar: true });
    if (id) CG.etiquetas = CG.etiquetas.map(l => String(l.id) === id ? salvo : l); else CG.etiquetas.push(salvo);
    fecharGaveta(); cgDesenhar('etiquetas'); toast(id ? 'Nome da etiqueta salvo.' : `Etiqueta “${nome}” criada.`);
  } catch (err) { botao.disabled = false; botao.textContent = id ? 'Salvar nome' : 'Criar etiqueta'; erro(`Não salvou: ${err.message}. Tente de novo.`); }
}

// ---------- 3. horário ----------
function cgHorario() {
  const topo = cgTopo('horario', 'Horário de atendimento', 'Quando tem gente da equipe para responder (horário de Brasília/Recife). A IA responde a qualquer hora e usa este horário para dizer à cliente quando uma pessoa vai continuar a conversa.');
  if (CG.erro.geral) return topo + cgErro('geral');
  if (!CG.geral) return topo + cgCarregando();
  const h = CG.geral.horario;
  const dias = CG_ORDEM.map(i => h.dias.find(d => d.dia === i));
  return `${topo}<div class="tabela configuracoes-dias">${dias.map(d => `<div class="configuracoes-dia${d.fechado ? ' fechado' : ''}" data-dia="${d.dia}">
      <div class="configuracoes-dia-nome">${cgSwitch('dia', !d.fechado, `${CG_DIAS[d.dia]}: aberto`, `data-dia="${d.dia}"`)}<strong>${CG_DIAS[d.dia]}</strong></div>
      <div class="configuracoes-dia-horas">${d.fechado ? '<span class="muted">Fechado</span>' : `
        <label><span class="configuracoes-sr">${CG_DIAS[d.dia]}, abre às</span><input type="time" step="900" value="${esc(d.abre)}" data-cg-hora="abre" data-dia="${d.dia}"></label>
        <span class="muted">até</span>
        <label><span class="configuracoes-sr">${CG_DIAS[d.dia]}, fecha às</span><input type="time" step="900" value="${esc(d.fecha)}" data-cg-hora="fecha" data-dia="${d.dia}"></label>`}</div>
    </div>`).join('')}</div>
    <div class="campo configuracoes-campo">
      <label for="cg-fora">Mensagem automática fora do horário <span class="muted" style="font-weight:400">(opcional)</span></label>
      <textarea id="cg-fora" class="configuracoes-textarea" rows="3" maxlength="600" placeholder="Oi! Nossa equipe atende de segunda a sexta, das 9h às 18h. Assim que voltarmos, respondemos você por aqui. 🌹">${esc(h.mensagem_fora || '')}</textarea>
      <small>Vai sozinha quando a cliente escreve fora do horário. Com a IA ligada, deixe em branco: a IA já avisa.</small>
    </div>
    <div class="configuracoes-pe">
      <span class="configuracoes-status">${CG.geral.salvo ? `A IA diz: “${esc(CG.geral.texto_horario || '')}”` : 'Ainda não salvo. Confira os dias e salve.'}</span>
      <button class="btn" data-cg="horario-salvar">Salvar horário</button>
    </div>`;
}

function cgLerHorario() {
  const h = CG.geral.horario;
  document.querySelectorAll('[data-cg-hora]').forEach(inp => {
    const d = h.dias.find(x => x.dia === +inp.dataset.dia);
    if (d && inp.value) d[inp.dataset.cgHora] = inp.value.slice(0, 5);
  });
  const fora = $('#cg-fora');
  if (fora) h.mensagem_fora = fora.value;
}

async function cgSalvarHorario(botao) {
  cgLerHorario();
  const h = CG.geral.horario;
  const ruim = h.dias.find(d => !d.fechado && d.fecha <= d.abre);
  if (ruim) return toast(`${CG_DIAS[ruim.dia]}: o horário de fechar precisa ser depois do de abrir.`);
  if (!REAL) return toast('Na demonstração nada é salvo.');
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    const r = await chamar('/api/atendimento/configuracoes/geral', 'POST', { horario: { dias: h.dias, mensagem_fora: h.mensagem_fora } });
    CG.geral.salvo = true; CG.geral.texto_ia = r.texto_ia; CG.geral.texto_horario = r.texto_horario;
    cgDesenhar('horario');
    toast(r.falhas?.length ? `Salvo, mas não entrou em: ${r.falhas.join(', ')}. Tente de novo.` : 'Horário salvo em todos os canais.');
  } catch (err) { botao.disabled = false; botao.textContent = 'Salvar horário'; toast(`Não salvou: ${err.message}`); }
}

// ---------- 4. distribuição ----------
function cgDistribuicao() {
  const topo = cgTopo('distribuicao', 'Distribuição de conversas', 'Quantas conversas cada pessoa pode ter abertas ao mesmo tempo e quem recebe as conversas novas.');
  if (CG.erro.geral) return topo + cgErro('geral');
  if (!CG.geral) return topo + cgCarregando();
  const d = CG.geral.distribuicao;
  return `${topo}<div class="tabela">
      <div class="configuracoes-opcao">
        <div><strong id="cg-lim-rot">Limite de conversas abertas por pessoa</strong><p>Na página Equipe, a barra de cada pessoa enche até este número.</p></div>
        <div class="configuracoes-stepper" role="group" aria-labelledby="cg-lim-rot">
          <button class="btn icone" data-cg="lim" data-passo="-1" aria-label="Diminuir" ${d.limite <= 1 ? 'disabled' : ''}>${ico(CG_ICO.menos)}</button>
          <output aria-live="polite">${d.limite}</output>
          <button class="btn icone" data-cg="lim" data-passo="1" aria-label="Aumentar" ${d.limite >= 50 ? 'disabled' : ''}>${ico(CG_ICO.mais)}</button>
        </div>
      </div>
      <div class="configuracoes-opcao">
        <div><strong>Passar conversas novas automaticamente</strong><p>${d.automatica ? 'Ligado: cada conversa nova vai para alguém que está Disponível, uma pessoa de cada vez.' : 'Desligado: as conversas novas ficam em “Precisam de alguém” até alguém assumir.'}</p></div>
        ${cgSwitch('auto', d.automatica, 'Passar conversas novas automaticamente')}
      </div>
    </div>`;
}

let cgLimiteTimer = null;
function cgMudarLimite(passo) {
  const d = CG.geral.distribuicao;
  d.limite = Math.min(50, Math.max(1, d.limite + passo));
  cgDesenhar('distribuicao');
  if (!REAL) return;
  clearTimeout(cgLimiteTimer);
  cgLimiteTimer = setTimeout(async () => {
    try {
      await chamar('/api/atendimento/configuracoes/geral', 'POST', { distribuicao: { limite: d.limite } });
      Object.values(EQUIPE).forEach(p => { p.limite = d.limite; });
      toast(`Limite salvo: ${d.limite} conversas por pessoa.`);
    } catch (err) { toast(`Não salvou o limite: ${err.message}`); }
  }, 700);
}

async function cgMudarAuto(botao) {
  const d = CG.geral.distribuicao, novo = !d.automatica;
  if (!REAL) { d.automatica = novo; cgDesenhar('distribuicao'); toast('Na demonstração nada é salvo.'); return; }
  botao.disabled = true;
  try {
    const r = await chamar('/api/atendimento/configuracoes/geral', 'POST', { distribuicao: { automatica: novo } });
    d.automatica = novo; cgDesenhar('distribuicao');
    toast(r.falhas?.length ? `Não mudou em: ${r.falhas.join(', ')}. Tente de novo.` : novo ? 'Conversas novas vão sozinhas para quem está disponível.' : 'Conversas novas ficam esperando alguém assumir.');
  } catch (err) { botao.disabled = false; toast(`Não mudou: ${err.message}`); }
}

// ---------- 5. marcas ----------
function cgMarcas() {
  const topo = cgTopo('marcas', 'Marcas e canais', 'Cada canal de mensagem pertence a uma marca. A marca vem do nome: se o nome tem “Beyoung”, as conversas entram como Beyoung; se não, como Rosa Selvagem.');
  if (CG.erro.geral) return topo + cgErro('geral');
  if (!CG.geral) return topo + cgCarregando();
  const grupos = [['rosa', 'Rosa Selvagem'], ['beyoung', 'Beyoung']];
  return topo + grupos.map(([k, nome]) => {
    const cx = CG.geral.caixas.filter(c => c.marca === k);
    return `<h3 class="configuracoes-sub">${nome}</h3>${cx.length ? `<div class="tabela">${cx.map(c => {
      const canal = canalDoInbox({ channel_type: c.tipo, name: c.nome });
      return `<div class="configuracoes-item">
        <div class="configuracoes-item-txt configuracoes-caixa"><span class="configuracoes-canal">${canalIco(canal)}</span><div><strong>${esc(c.nome)}</strong><span class="muted">${c.tipo === 'Channel::WebWidget' ? 'Janela de conversa no site' : CANAIS[canal].nome}</span></div></div>
        <div class="configuracoes-item-acoes"><button class="btn peq" data-cg="cx-renomear" data-id="${c.id}">Mudar nome</button></div>
      </div>`;
    }).join('')}</div>` : `<div class="configuracoes-vazio peq"><span>Nenhum canal da ${nome} ainda. Ligue um em Integrações.</span></div>`}`;
  }).join('');
}

function cgFormCaixa(c) {
  gaveta('Mudar o nome do canal', `
    <div class="campo"><label for="cg-cx-nome">Nome</label><input id="cg-cx-nome" maxlength="60" autocomplete="off" value="${esc(c.nome)}">
    <small>Comece pelo canal e termine com a marca. Exemplos: “WhatsApp Rosa Selvagem”, “Instagram Beyoung”, “Chat do site Rosa Selvagem”.</small></div>
    <div class="nota-box">Se tirar ou colocar “Beyoung” no nome, as conversas deste canal mudam de marca.</div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="cx-salvar" data-id="${c.id}">Salvar nome</button>`);
}

async function cgSalvarCaixa(botao) {
  const id = +botao.dataset.id, nome = $('#cg-cx-nome').value.trim().replace(/\s+/g, ' ');
  const erro = msg => { $('#g-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`; };
  if (nome.length < 3) return erro('Escreva o nome do canal, por exemplo: WhatsApp Rosa Selvagem.');
  const c = CG.geral.caixas.find(x => x.id === id);
  if (!REAL) { c.nome = nome; c.marca = /beyoung/i.test(nome) ? 'beyoung' : 'rosa'; fecharGaveta(); cgDesenhar('marcas'); toast('Na demonstração nada é salvo.'); return; }
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    const r = await chamar(`/api/atendimento/configuracoes/caixas/${id}`, 'POST', { nome });
    Object.assign(c, { nome: r.nome, marca: r.marca });
    if (INBOX[id]) Object.assign(INBOX[id], { nome: r.nome, marca: r.marca });
    fecharGaveta(); cgDesenhar('marcas'); toast(`Canal salvo como “${r.nome}”.`);
  } catch (err) { botao.disabled = false; botao.textContent = 'Salvar nome'; erro(`Não salvou: ${err.message}. Tente de novo.`); }
}

// ---------- 6. segurança ----------
function cgSeguranca() {
  const topo = cgTopo('seguranca', 'Segurança', 'Quem pode abrir esta tela.');
  if (CG.erro.geral) return topo + cgErro('geral');
  if (!CG.geral) return topo + cgCarregando();
  const on = CG.geral.login_obrigatorio;
  return `${topo}<div class="tabela"><div class="configuracoes-opcao">
      <div><strong>Pedir login para entrar</strong>
        <p>${on ? 'Ligado: cada pessoa entra com o próprio e-mail e senha.' : 'Desligado: quem abre o endereço entra direto, como dona. Use só no teste.'}</p>
        ${on ? '<span class="estado ligado">Protegido</span>' : '<span class="chip aviso">Sem senha, só para teste</span>'}</div>
      ${cgSwitch('login', on, 'Pedir login para entrar')}
    </div></div>`;
}

function cgConfirmarLogin(ligar) {
  if (ligar) {
    gaveta('Ligar o login?', `
      <div class="erro configuracoes-alerta"><strong>Todo mundo vai precisar de e-mail e senha para entrar, inclusive você.</strong> Assim que ligar, esta tela fecha e pede o seu login.</div>
      <ul class="configuracoes-lista">
        <li>Antes, abra <button class="configuracoes-link" data-cg="ir-usuarios">Usuários</button> e confira o seu e-mail de dona.</li>
        <li>Se não souber a sua senha, gere uma nova lá em “Nova senha” e anote.</li>
        <li>Mande para cada pessoa da equipe o e-mail e a senha dela antes de ligar.</li>
      </ul>
      <label class="configuracoes-check"><input type="checkbox" id="cg-sei"> Eu sei o meu e-mail e a minha senha de dona.</label>`,
      '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="login-sim" data-ligar="1" disabled>Ligar o login</button>');
  } else {
    gaveta('Desligar o login?', `
      <div class="erro configuracoes-alerta"><strong>Qualquer pessoa que tiver o endereço vai entrar sem senha, como dona.</strong> Ela poderá ver as conversas e mudar tudo. Faça isso só no computador de teste.</div>`,
      '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="login-sim" data-ligar="0">Desligar o login</button>');
  }
}

async function cgMudarLogin(botao) {
  const ligar = botao.dataset.ligar === '1';
  if (!REAL) { CG.geral.login_obrigatorio = ligar; fecharGaveta(); cgDesenhar('seguranca'); toast('Na demonstração nada é salvo.'); return; }
  botao.disabled = true; botao.textContent = ligar ? 'Ligando…' : 'Desligando…';
  try {
    const r = await chamar('/api/atendimento/configuracoes/login', 'POST', { ligado: ligar });
    CG.geral.login_obrigatorio = r.login_obrigatorio;
    fecharGaveta(); cgDesenhar('seguranca');
    if (r.login_obrigatorio) { toast('Login ligado. Entre com o seu e-mail e senha.'); setTimeout(() => location.reload(), 1500); }
    else toast('Login desligado. Lembre de ligar antes de usar de verdade.');
  } catch (err) { botao.disabled = false; botao.textContent = ligar ? 'Ligar o login' : 'Desligar o login'; $('#g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`; }
}

// ---------- apagar com dois toques ----------
function cgDoisToques(botao, acao) {
  if (botao.dataset.confirmar) { clearTimeout(botao._t); acao(); return; }
  botao.dataset.confirmar = '1';
  botao.classList.add('configuracoes-confirmar');
  botao.innerHTML = `${ico(CG_ICO.lixo)}<span>Apagar?</span>`;
  botao._t = setTimeout(() => { delete botao.dataset.confirmar; botao.classList.remove('configuracoes-confirmar'); botao.innerHTML = ico(CG_ICO.lixo); }, 4000);
}

async function cgApagar(tipo, id) {
  const lista = tipo === 'resp' ? 'respostas' : 'etiquetas';
  const item = CG[lista].find(x => String(x.id) === String(id));
  if (!item) return;
  if (tipo === 'et' && CG_IA_LABELS().has(item.title)) return toast('Esta etiqueta é usada pela IA e não pode ser apagada.');
  try {
    if (REAL) await cw(`${tipo === 'resp' ? 'canned_responses' : 'labels'}/${id}`, 'DELETE');
    CG[lista] = CG[lista].filter(x => x !== item);
    cgDesenhar(lista);
    toast(tipo === 'resp' ? `Resposta /${item.short_code} apagada.` : 'Etiqueta apagada.');
  } catch (err) { toast(`Não apagou: ${err.message}`); }
}

// ---------- cliques ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-cg]');
  if (!el || el.disabled) return;
  const id = el.dataset.id;
  switch (el.dataset.cg) {
    case 'ir': document.getElementById(`cg-${el.dataset.alvo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'ir-usuarios': fecharGaveta(); irPara('usuarios'); break;
    case 'resp-nova': cgFormResposta(null); break;
    case 'resp-editar': cgFormResposta(CG.respostas.find(r => String(r.id) === id)); break;
    case 'resp-salvar': cgSalvarResposta(el); break;
    case 'resp-importar': cgImportar(el); break;
    case 'resp-apagar': cgDoisToques(el, () => cgApagar('resp', id)); break;
    case 'et-nova': cgFormEtiqueta(null); break;
    case 'et-editar': cgFormEtiqueta(CG.etiquetas.find(l => String(l.id) === id)); break;
    case 'et-salvar': cgSalvarEtiqueta(el); break;
    case 'et-apagar': cgDoisToques(el, () => cgApagar('et', id)); break;
    case 'dia': {
      cgLerHorario();
      const d = CG.geral.horario.dias.find(x => x.dia === +el.dataset.dia);
      d.fechado = !d.fechado;
      cgDesenhar('horario');
      break;
    }
    case 'horario-salvar': cgSalvarHorario(el); break;
    case 'lim': cgMudarLimite(+el.dataset.passo); break;
    case 'auto': cgMudarAuto(el); break;
    case 'time-pessoas': cgFormPessoas(CG.times.find(t => String(t.id) === id)); break;
    case 'time-pessoas-salvar': cgSalvarPessoas(el); break;
    case 'time-novo': cgFormTime(); break;
    case 'time-salvar': cgSalvarTime(el); break;
    case 'cx-renomear': cgFormCaixa(CG.geral.caixas.find(c => String(c.id) === id)); break;
    case 'cx-salvar': cgSalvarCaixa(el); break;
    case 'login': cgConfirmarLogin(!CG.geral.login_obrigatorio); break;
    case 'login-sim': cgMudarLogin(el); break;
  }
});

document.addEventListener('change', e => {
  if (e.target.dataset?.cgRota) cgMudarRota(e.target);
  if (e.target.id === 'cg-sei') { const b = document.querySelector('[data-cg="login-sim"]'); if (b) b.disabled = !e.target.checked; }
});
// Enter no campo da gaveta salva
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !['cg-et-nome', 'cg-cx-nome', 'cg-atalho'].includes(e.target.id)) return;
  e.preventDefault();
  document.querySelector('#gaveta [data-cg$="-salvar"]')?.click();
});

// ---------- 5. times e assuntos ----------
// Cada assunto que a IA marca leva a conversa para um time quando ela passa para a equipe.
async function cgCarregarTimes() {
  const times = await cw('teams');
  CG.times = await Promise.all((times || []).map(async t => {
    const membros = await cw(`teams/${t.id}/team_members`).catch(() => []);
    return { id: t.id, nome: t.name.charAt(0).toUpperCase() + t.name.slice(1), membros: (membros || []).map(u => u.id) };
  }));
}

function cgTimes() {
  const topo = cgTopo('times', 'Times e assuntos', 'Quando a IA passa uma conversa para a equipe, ela vai para o time do assunto. Dentro do time, a conversa vai para quem estiver disponível.',
    `<button class="btn" data-cg="time-novo">${ico(CG_ICO.mais)}Novo time</button>`);
  if (CG.erro.times) return topo + cgErro('times');
  if (!CG.times || !CG.geral) return topo + cgCarregando();
  const pessoas = Object.values(EQUIPE).filter(p => p.cwId);
  const nomeDe = uid => pessoas.find(p => p.cwId === uid)?.nome || '?';
  const rota = CG.geral.roteamento || {};
  const times = CG.times.map(t => `<div class="configuracoes-item">
      <div class="configuracoes-item-txt"><strong>${esc(t.nome)}</strong>
        <p>${t.membros.length ? esc(t.membros.map(nomeDe).join(', ')) : 'Ninguém neste time ainda. Sem ninguém, as conversas dele ficam em “Precisam de alguém”.'}</p>
        <p class="configuracoes-dica" style="margin:4px 0 0">Recebe: ${esc(ASSUNTOS.filter(a => rota[a.id] === t.id).map(a => a.nome).join(', ') || 'nenhum assunto')}</p></div>
      <div class="configuracoes-item-acoes"><button class="btn peq" data-cg="time-pessoas" data-id="${t.id}">Pessoas</button></div>
    </div>`).join('');
  const assuntos = ASSUNTOS.map(a => `<div class="configuracoes-opcao">
      <div><strong>${esc(a.nome)}</strong><p>${esc(a.desc || '')}</p></div>
      <select data-cg-rota="${a.id}" aria-label="Time que recebe ${esc(a.nome)}">
        <option value="">Nenhum time</option>
        ${CG.times.map(t => `<option value="${t.id}" ${rota[a.id] === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
      </select></div>`).join('');
  return `${topo}<div class="tabela">${times || '<div class="configuracoes-vazio"><strong>Nenhum time ainda</strong><span>Crie os times para a IA saber para onde mandar cada assunto.</span></div>'}</div>
    <h3 class="configuracoes-subtitulo">Para onde vai cada assunto</h3>
    <div class="tabela">${assuntos}</div>`;
}

async function cgMudarRota(sel) {
  const rota = { ...(CG.geral.roteamento || {}) };
  if (sel.value) rota[sel.dataset.cgRota] = Number(sel.value); else delete rota[sel.dataset.cgRota];
  try {
    await chamar('/api/atendimento/configuracoes/geral', 'POST', { roteamento: rota });
    CG.geral.roteamento = rota; cgDesenhar('times');
    toast(sel.value ? `${nomeAssunto(sel.dataset.cgRota)} vai para ${CG.times.find(t => t.id === Number(sel.value)).nome}.` : `${nomeAssunto(sel.dataset.cgRota)} não vai para nenhum time.`);
  } catch (err) { toast(`Não salvou: ${err.message}`); cgDesenhar('times'); }
}

function cgFormPessoas(t) {
  const pessoas = Object.values(EQUIPE).filter(p => p.cwId);
  gaveta(`Pessoas do time ${esc(t.nome)}`, `<p class="muted">Marque quem atende este time. Uma pessoa pode estar em mais de um time.</p>
    <div class="niveis">${pessoas.map(p => `<label class="nivel-op"><input type="checkbox" value="${p.cwId}" ${t.membros.includes(p.cwId) ? 'checked' : ''}><span><b>${esc(p.nome)}</b></span></label>`).join('') || '<p class="muted">Convide as pessoas em Usuários primeiro.</p>'}</div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="time-pessoas-salvar" data-id="${t.id}">Salvar</button>`);
}

async function cgSalvarPessoas(botao) {
  const ids = [...document.querySelectorAll('#gaveta input[type=checkbox]:checked')].map(i => Number(i.value));
  botao.disabled = true;
  try {
    await cw(`teams/${botao.dataset.id}/team_members`, 'PATCH', { user_ids: ids });
    await cgCarregarTimes(); fecharGaveta(); cgDesenhar('times'); toast('Time salvo.');
  } catch (err) { botao.disabled = false; document.getElementById('g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`; }
}

function cgFormTime() {
  gaveta('Novo time', '<div class="campo"><label for="cg-time-nome">Nome do time</label><input id="cg-time-nome" placeholder="Trocas e devoluções" maxlength="40"></div>',
    '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cg="time-salvar">Criar time</button>');
}

async function cgSalvarTime(botao) {
  const nome = document.getElementById('cg-time-nome').value.trim();
  if (nome.length < 3) { document.getElementById('g-erro').innerHTML = '<div class="erro">Escreva um nome com pelo menos 3 letras.</div>'; return; }
  botao.disabled = true;
  try {
    await cw('teams', 'POST', { name: nome, allow_auto_assign: true });
    await cgCarregarTimes(); fecharGaveta(); cgDesenhar('times'); toast(`Time ${nome} criado. Agora escolha as pessoas e os assuntos.`);
  } catch (err) { botao.disabled = false; document.getElementById('g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`; }
}
