// Capitão: a sala de controle da IA do SAC (como o Captain do Chatwoot).
// Abas: Visão geral (liga/desliga e números), Testar a IA, Perguntas sem resposta, Base de conhecimento, Jeito de falar.
// Servidor: 06_BACKEND/atendimento/rotas/capitao.mjs. Contrato: 09_DOCUMENTATION/atendimento-modulos.md.
(() => {
  'use strict';

  const API = '/api/atendimento/capitao';
  const ABAS = [
    { id: 'geral', nome: 'Visão geral', ico: '<path d="M4 19V10M10 19V5M16 19v-6M22 19H2"/>' },
    { id: 'testar', nome: 'Testar a IA', ico: '<path d="M4 5h16v11H8l-4 4z"/><path d="M9 10.5h6"/>' },
    { id: 'perguntas', nome: 'Perguntas sem resposta', ico: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.3M12 16.6v.1"/>' },
    { id: 'base', nome: 'Base de conhecimento', ico: '<path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M8.5 11h7M8.5 14.5h7"/>' },
    { id: 'jeito', nome: 'Jeito de falar', ico: '<path d="M5 18c2-1 3-2.5 3-5V6h8v7c0 2.5 1 4 3 5"/><path d="M10 10h4"/>' },
  ];
  const MARCAS = ['Rosa Selvagem', 'Beyoung'];
  const CANAIS_TESTE = ['WhatsApp', 'Instagram', 'Messenger', 'Telegram', 'e-mail', 'chat do site'];
  const EXEMPLOS = [
    'Oii, qual o prazo de entrega pra Recife?',
    'Comprei ontem e quero cancelar',
    'O óleo clareador pode usar na virilha?',
    'Meu pedido chegou vazando, quero meu dinheiro de volta',
    'Vocês são um robô?',
  ];
  const MODELOS = { opus: 'Claude Opus (o mais caprichado)', sonnet: 'Claude Sonnet (equilibrado)', haiku: 'Claude Haiku (o mais rápido)' };
  const ICO_OK = '<path d="m5 12 4 4 10-10"/>';
  const ICO_NAO = '<path d="M6 6l12 12M18 6 6 18"/>';
  const ICO_SETA = '<path d="m9 6 6 6-6 6"/>';

  const C = {
    aba: 'geral', periodo: 'hoje',
    numeros: null, perguntas: null, base: null, jeito: null,
    erro: {}, carregando: {},
    teste: { marca: 'Rosa Selvagem', canal: 'WhatsApp', cliente: 'Cliente teste', msgs: [], pensando: false, inicio: 0, rascunho: '' },
  };

  // a conversa de teste sobrevive a um recarregar da página (só neste navegador, nesta aba)
  const CHAVE_TESTE = 'capitao-teste';
  function guardarTeste() {
    try { const T = C.teste; sessionStorage.setItem(CHAVE_TESTE, JSON.stringify({ marca: T.marca, canal: T.canal, cliente: T.cliente, msgs: T.msgs.filter(x => x.de !== 'erro') })); } catch { /* sem armazenamento */ }
  }
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_TESTE) || 'null');
    if (salvo && Array.isArray(salvo.msgs)) Object.assign(C.teste, { marca: salvo.marca || C.teste.marca, canal: salvo.canal || C.teste.canal, cliente: salvo.cliente || C.teste.cliente, msgs: salvo.msgs });
  } catch { /* sem armazenamento */ }

  // ---------- dados de exemplo (modo demonstração) ----------
  const DEMO = {
    numeros: (() => {
      const dia = i => { const d = new Date(Date.now() - i * 864e5); return d.toISOString().slice(0, 10); };
      return {
        ia_ligada: true, modelo: 'opus',
        hoje: { respondidas: 14, passadas: 6, barradas: 1, ignoradas: 3, erros: 0, resolvida_pct: 70, tempo_medio: 19, assuntos: [{ id: 'frete-e-entrega', total: 8 }, { id: 'como-usar', total: 5 }, { id: 'rastreio', total: 4 }, { id: 'cancelamento', total: 2 }] },
        semana: { respondidas: 81, passadas: 37, barradas: 4, ignoradas: 15, erros: 1, resolvida_pct: 69, tempo_medio: 20, assuntos: [{ id: 'frete-e-entrega', total: 40 }, { id: 'como-usar', total: 26 }, { id: 'rastreio', total: 21 }, { id: 'duvida-de-produto', total: 15 }, { id: 'cancelamento', total: 9 }] },
        por_dia: [6, 5, 4, 3, 2, 1, 0].map((i, k) => ({ dia: dia(i), respondidas: [9, 12, 10, 13, 11, 12, 14][k], passadas: [5, 6, 4, 7, 5, 4, 6][k] })),
        ultimas: [
          { ts: new Date(Date.now() - 6e5).toISOString(), conversa: 1, acao: 'escalar', assuntos: ['frete-e-entrega'], motivo: 'Pedido fora do prazo', segundos: 21 },
          { ts: new Date(Date.now() - 18e5).toISOString(), conversa: 2, acao: 'responder', assuntos: ['como-usar'], motivo: 'Modo de uso do sérum', segundos: 17 },
        ],
      };
    })(),
    perguntas: { abertas: [{ linha: '', data: new Date().toISOString().slice(0, 10), texto: 'Pode usar o óleo clareador depois da depilação? Quanto tempo esperar?' }], respondidas: [] },
  };

  // ---------- utilidades ----------
  const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dataBr = s => { const [a, mm, d] = String(s || '').split('-'); return a && mm && d ? `${d}/${mm}` : ''; };
  const quando = ts => {
    const d = new Date(ts);
    const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const mesmoDia = d.toDateString() === new Date().toDateString();
    return { h, dia: mesmoDia ? 'hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
  };
  const tempo = s => s == null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const podeUsar = () => ['dona', 'supervisora'].includes(MEU_NIVEL);
  const carregando = txt => `<div class="vazio"><span>${esc(txt)}</span></div>`;

  function garantirCss() {
    if (document.getElementById('capitao-css')) return;
    const l = document.createElement('link');
    l.id = 'capitao-css'; l.rel = 'stylesheet'; l.href = 'modulos/capitao.css';
    document.head.appendChild(l);
  }

  async function buscar(tipo, forcar) {
    if (!REAL) { C[tipo] = DEMO[tipo] || null; return; }
    if (C[tipo] && !forcar) return;
    if (C.carregando[tipo]) return C.carregando[tipo];
    C.erro[tipo] = null;
    C.carregando[tipo] = chamar(`${API}/${tipo}`)
      .then(r => { C[tipo] = r; if (tipo === 'numeros' && typeof r.ia_ligada === 'boolean') IA_LIGADA = r.ia_ligada; })
      .catch(err => { C.erro[tipo] = err.message; })
      .finally(() => { C.carregando[tipo] = null; });
    return C.carregando[tipo];
  }

  const naAba = id => C.aba === id && document.getElementById('capitao-corpo') && estado.pagina === 'capitao';

  // ---------- página ----------
  function render(el, sub) {
    garantirCss();
    C.aba = ABAS.some(a => a.id === sub) ? sub : 'geral';
    const n = C.perguntas?.abertas?.length || 0;
    el.innerHTML = `<div class="pag-in">
      ${cabecalho('Capitão', 'A sala de controle da IA do SAC: veja o que ela fez, teste como ela responde e ensine o que ela ainda não sabe.')}
      ${REAL ? '' : '<div class="nota-box" style="margin-bottom:16px">Você está na demonstração. Os números e as perguntas abaixo são de exemplo.</div>'}
      <div class="capitao-abas" role="tablist" aria-label="Partes do Capitão">
        ${ABAS.map(a => `<button class="capitao-aba" role="tab" aria-selected="${a.id === C.aba}" data-cap-aba="${a.id}">${ico(a.ico)}${a.nome}${a.id === 'perguntas' && n ? ` <span class="capitao-n" aria-label="${n} esperando">${n}</span>` : ''}</button>`).join('')}
      </div>
      <div id="capitao-corpo" role="tabpanel"></div>
    </div>`;
    desenhar();
  }

  function desenhar() {
    const corpo = document.getElementById('capitao-corpo');
    if (!corpo) return;
    if (!podeUsar()) { corpo.innerHTML = '<div class="vazio"><strong>Só a dona e a supervisora usam o Capitão.</strong></div>'; return; }
    ({ geral: desenharGeral, testar: desenharTeste, perguntas: desenharPerguntas, base: desenharBase, jeito: desenharJeito })[C.aba](corpo);
  }

  // carrega o que a aba precisa e redesenha quando chegar
  function precisa(tipo, aba, corpo, txt) {
    if (C[tipo]) return true;
    if (C.erro[tipo]) {
      corpo.innerHTML = `<div class="erro" style="margin-top:20px">Não consegui carregar: ${esc(C.erro[tipo])}. Confira se o atendimento está ligado e <button class="btn peq" data-cap-acao="recarregar" data-cap-tipo="${tipo}">tente de novo</button></div>`;
      return false;
    }
    corpo.innerHTML = carregando(txt);
    buscar(tipo).then(() => { if (naAba(aba)) desenhar(); });
    return false;
  }

  // ---------- 1 e 2: visão geral ----------
  function desenharGeral(corpo) {
    if (!precisa('numeros', 'geral', corpo, 'Carregando os números da IA…')) return;
    const N = C.numeros, P = C.periodo === 'hoje' ? N.hoje : N.semana;
    const ligada = REAL ? IA_LIGADA : N.ia_ligada;
    const souDona = MEU_NIVEL === 'dona';
    const maxDia = Math.max(1, ...N.por_dia.map(d => d.respondidas + d.passadas));
    const maxAss = Math.max(1, ...P.assuntos.map(a => a.total));
    const textoPeriodo = C.periodo === 'hoje' ? 'hoje' : 'nos últimos 7 dias';

    corpo.innerHTML = `
      <div class="secao">Como ela está agora</div>
      <div class="card">
        <div class="capitao-status">
          <div>
            <h2>IA do SAC <span class="estado ${ligada ? 'ligado' : ''}">${ligada ? 'Ligada' : 'Desligada'}</span></h2>
            <p class="desc">${ligada
              ? 'Toda conversa nova passa primeiro por ela. A IA lê a conversa, a base de conhecimento e o catálogo, e decide sozinha o que fazer.'
              : 'Ela está parada. As conversas novas vão direto para a equipe, na fila Precisam de alguém.'}</p>
            <div class="capitao-fatos">
              <span>Modelo: <b>${esc(MODELOS[N.modelo] || N.modelo)}</b></span>
              <span>Espera a cliente terminar de escrever antes de responder</span>
            </div>
          </div>
          <div class="capitao-chave">
            <button class="capitao-switch" role="switch" aria-checked="${ligada}" aria-label="IA do SAC ${ligada ? 'ligada' : 'desligada'}" data-cap-acao="chave" ${souDona && REAL ? '' : 'disabled'}></button>
            <small>${!REAL ? 'Na demonstração não dá para mudar.' : souDona ? (ligada ? 'Toque para desligar' : 'Toque para ligar') : 'Só a dona liga e desliga a IA.'}</small>
          </div>
        </div>
        <div class="capitao-faz">
          <div><b>Responde sozinha</b>Quando a base ou o catálogo têm a resposta certa: prazo, frete, como usar, troca e cancelamento.</div>
          <div><b>Passa para a equipe</b>Pedido específico, reembolso, defeito, reação na pele, reclamação ou dúvida sem resposta. Deixa um resumo e uma sugestão.</div>
          <div><b>Não responde</b>Quando a mensagem não pede resposta, como um "ok" ou um "obrigada".</div>
          <div><b>Nunca faz</b>Prometer reembolso, troca, cupom ou desconto. Preço ou link fora do catálogo é barrado e vai para a equipe.</div>
        </div>
      </div>

      <div class="capitao-secao-top">
        <div class="secao">O que ela fez ${textoPeriodo}</div>
        <div class="capitao-periodo" role="group" aria-label="Período">
          <button data-cap-periodo="hoje" aria-pressed="${C.periodo === 'hoje'}">Hoje</button>
          <button data-cap-periodo="semana" aria-pressed="${C.periodo === 'semana'}">Últimos 7 dias</button>
        </div>
      </div>
      <div class="resumo-num">
        <div class="num-card"><span>Respondidas sozinha</span><strong>${P.respondidas}</strong><small>sem precisar da equipe</small></div>
        <div class="num-card"><span>Passadas para a equipe</span><strong>${P.passadas}</strong><small>${P.barradas ? plural(P.barradas, 'barrada pela trava', 'barradas pela trava') : 'com resumo e sugestão'}</small></div>
        <div class="num-card"><span>Resolvidas pela IA</span><strong>${P.resolvida_pct == null ? '—' : `${P.resolvida_pct}%`}</strong><small>das mensagens que pediam resposta</small></div>
        <div class="num-card"><span>Tempo médio</span><strong>${tempo(P.tempo_medio)}</strong><small>para ler, decidir e escrever</small></div>
      </div>
      ${P.ignoradas || P.erros ? `<p class="muted" style="font-size:12.5px;margin-top:10px">${[
        P.ignoradas ? `Ela deixou ${plural(P.ignoradas, 'mensagem', 'mensagens')} sem resposta porque não pediam (um "ok", um "obrigada").` : '',
        P.erros ? `${plural(P.erros, 'vez', 'vezes')} a IA não conseguiu responder e a conversa foi para a equipe.` : '',
      ].filter(Boolean).join(' ')}</p>` : ''}

      <div class="capitao-dois">
        <div class="card">
          <h3>Dia a dia</h3>
          <div class="capitao-dias" role="img" aria-label="Conversas por dia nos últimos 7 dias">
            ${N.por_dia.map(d => {
              const tot = d.respondidas + d.passadas;
              const dt = new Date(`${d.dia}T12:00:00`);
              const nome = d.dia === hojeStr() ? 'hoje' : dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
              return `<div class="capitao-dia" title="${dataBr(d.dia)}: ${d.respondidas} respondidas, ${d.passadas} passadas">
                <div class="capitao-coluna" style="height:${tot ? Math.max(6, Math.round((tot / maxDia) * 100)) : 4}%">${tot ? `<i class="r" style="flex:${d.respondidas}"></i><i class="p" style="flex:${d.passadas}"></i>` : ''}</div>
                <span>${esc(nome)}</span></div>`;
            }).join('')}
          </div>
          <div class="capitao-legenda"><span><i style="background:var(--ok)"></i>Respondidas sozinha</span><span><i style="background:var(--warn)"></i>Passadas para a equipe</span></div>
        </div>
        <div class="card">
          <h3>Assuntos mais comuns ${textoPeriodo}</h3>
          ${P.assuntos.length ? `<div class="capitao-barras">${P.assuntos.map(a => `
            <div class="capitao-barra"><span title="${esc(nomeAssunto(a.id))}">${esc(nomeAssunto(a.id))}</span><div><i style="width:${Math.round((a.total / maxAss) * 100)}%"></i></div><b>${a.total}</b></div>`).join('')}</div>`
            : '<p class="muted" style="font-size:13px">Nenhum assunto ainda. Eles aparecem quando a IA atende alguém.</p>'}
        </div>
      </div>

      <div class="secao">Últimas decisões</div>
      ${N.ultimas.length ? `<div class="capitao-decisoes">${N.ultimas.slice(0, 12).map(linhaDecisao).join('')}</div>`
        : '<div class="vazio"><strong>Nenhuma decisão nos últimos 7 dias.</strong><span>Quando a IA atender alguém, aparece aqui. Para ver como ela responde agora, use Testar a IA.</span></div>'}`;
  }

  function chipAcao(acao) {
    if (acao === 'responder') return `<span class="chip capitao-ok">${ico(ICO_OK)}Respondeu sozinha</span>`;
    if (acao === 'escalar') return '<span class="chip aviso">Passou para a equipe</span>';
    if (acao === 'escalar-barrado') return '<span class="chip alerta">Barrada pela trava</span>';
    if (acao === 'ignorar') return '<span class="chip">Não respondeu</span>';
    return '<span class="chip alerta">Deu erro</span>';
  }

  function linhaDecisao(d) {
    const q = quando(d.ts);
    return `<button class="capitao-decisao" data-cap-conv="${Number(d.conversa) || ''}" aria-label="Abrir a conversa ${esc(d.conversa)}">
      <span class="quando"><b>${q.h}</b>${q.dia}</span>
      <span class="oque">
        <span class="chips">${chipAcao(d.acao)}${(d.assuntos || []).map(a => `<span class="chip">${esc(nomeAssunto(a))}</span>`).join('')}</span>
        ${d.motivo ? `<span class="motivo">${esc(d.motivo)}</span>` : ''}
      </span>
      <span class="ir">${ico(ICO_SETA)}</span>
    </button>`;
  }

  function abrirChave() {
    const ligar = !IA_LIGADA;
    gaveta(ligar ? 'Ligar a IA do SAC?' : 'Desligar a IA do SAC?', ligar
      ? '<p>As conversas novas passam primeiro pela IA. Ela responde o que a base sabe e passa o resto para a equipe, com um resumo.</p><div class="nota-box">As conversas que já estão com alguém da equipe continuam com essa pessoa.</div>'
      : '<p>As conversas novas vão direto para a equipe, na fila Precisam de alguém. Ninguém recebe resposta automática até você ligar de novo.</p><div class="nota-box">As conversas que estavam com a IA continuam na fila Com a IA. Assuma cada uma ou ligue a IA de novo.</div>',
      `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cap-acao="confirmar-chave" data-cap-ligar="${ligar ? 1 : 0}">${ligar ? 'Ligar a IA' : 'Desligar a IA'}</button>`);
  }

  async function confirmarChave(botao) {
    const ligar = botao.dataset.capLigar === '1';
    botao.disabled = true; botao.textContent = ligar ? 'Ligando…' : 'Desligando…';
    try {
      await chamar('/api/atendimento/ia', 'POST', { ligada: ligar });
      IA_LIGADA = ligar;
      if (C.numeros) C.numeros.ia_ligada = ligar;
      fecharGaveta();
      toast(ligar ? 'IA ligada. As conversas novas passam primeiro por ela.' : 'IA desligada. As conversas novas vão direto para a equipe.');
      if (naAba('geral')) desenhar();
    } catch (err) {
      botao.disabled = false; botao.textContent = ligar ? 'Ligar a IA' : 'Desligar a IA';
      const e = document.getElementById('g-erro');
      if (e) e.innerHTML = `<div class="erro">Não deu certo: ${esc(err.message)}. Tente de novo.</div>`;
    }
  }

  // ---------- 3: testar a IA ----------
  function desenharTeste(corpo) {
    const T = C.teste;
    corpo.innerHTML = `
      <div class="secao">Escreva como se você fosse a cliente</div>
      <div class="capitao-teste">
        <div class="capitao-chat">
          <div class="capitao-chat-topo">
            <span>Nada daqui vai para nenhuma cliente.</span>
            <button class="btn peq fantasma" data-cap-acao="limpar-teste" ${T.msgs.length && !T.pensando ? '' : 'disabled'}>Começar de novo</button>
          </div>
          <div class="capitao-fala" id="capitao-fala" aria-live="polite"></div>
          <form class="capitao-escrever" id="capitao-form">
            <textarea id="capitao-texto" rows="1" placeholder="${REAL ? 'Escreva a mensagem da cliente' : 'Na demonstração a IA não responde'}" aria-label="Mensagem da cliente" ${REAL ? '' : 'disabled'}>${esc(T.rascunho)}</textarea>
            <button class="btn prim" type="submit" id="capitao-enviar" ${REAL && !T.pensando ? '' : 'disabled'}>Enviar como cliente</button>
          </form>
        </div>
        <div class="capitao-lado">
          <div class="card">
            <div class="campo"><label for="capitao-marca">Marca</label>
              <select id="capitao-marca">${MARCAS.map(m => `<option ${m === T.marca ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            <div class="campo"><label for="capitao-canal">Canal</label>
              <select id="capitao-canal">${CANAIS_TESTE.map(c => `<option value="${c}" ${c === T.canal ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select></div>
            <div class="campo"><label for="capitao-cliente">Nome da cliente</label>
              <input id="capitao-cliente" value="${esc(T.cliente)}" maxlength="60" autocomplete="off"></div>
          </div>
          <div class="card">
            <h3>Ideias para testar</h3>
            <div class="capitao-exemplos">${EXEMPLOS.map((x, i) => `<button type="button" data-cap-exemplo="${i}">${esc(x)}</button>`).join('')}</div>
            <small class="muted" style="font-size:12px">A IA usa a mesma base, as mesmas regras e o mesmo modelo do atendimento de verdade. Cada resposta leva de 10 a 20 segundos.</small>
          </div>
        </div>
      </div>`;
    desenharFala();
  }

  function veredito(r) {
    const barrado = (r.barrado || []).length && r.acao !== 'ignorar';
    const chip = barrado ? '<span class="chip alerta">Barrada pela trava: ia para a equipe</span>'
      : r.acao === 'responder' ? `<span class="chip capitao-ok">${ico(ICO_OK)}Respondia sozinha</span>`
      : r.acao === 'escalar' ? '<span class="chip aviso">Passava para a equipe</span>'
      : '<span class="chip">Não respondia</span>';
    const item = (rot, val) => val ? `<dt>${rot}</dt><dd>${val}</dd>` : '';
    return `<div class="capitao-veredito">
      <div class="linha1"><b>O que a IA faria:</b> ${chip}${(r.assuntos || []).map(a => `<span class="chip">${esc(nomeAssunto(a))}</span>`).join('')}<span class="tempo">${r.segundos != null ? `${r.segundos} s` : ''}</span></div>
      <dl>
        ${item('Motivo', esc(r.motivo))}
        ${barrado ? item('Por que barrou', esc(r.barrado.join('; '))) + item('O que acontece', 'Nada é enviado. A conversa vai para a equipe com o texto acima como sugestão.') : ''}
        ${r.acao === 'escalar' ? item('Sugestão para a equipe', esc(r.sugestao_equipe)) : ''}
        ${item('Observação', esc(r.observacao))}
        ${item('Resumo', esc(r.resumo))}
        ${r.pergunta_sem_resposta ? item('A base não sabe', `${esc(r.pergunta_sem_resposta)}<br><span class="muted">No atendimento de verdade, essa dúvida iria para Perguntas sem resposta.</span>`) : ''}
      </dl>
    </div>`;
  }

  function desenharFala() {
    const alvo = document.getElementById('capitao-fala');
    if (!alvo) return;
    const T = C.teste;
    if (!T.msgs.length && !T.pensando) {
      alvo.innerHTML = `<div class="vazio" style="padding:40px 12px"><strong>Teste a IA antes da cliente.</strong>
        <span>Escreva uma pergunta como se fosse uma cliente ${esc(T.marca === 'Beyoung' ? 'da Beyoung' : 'da Rosa Selvagem')}. Você vê a resposta e o que a IA faria: responder sozinha ou passar para a equipe.</span></div>`;
      return;
    }
    let anterior = null;
    alvo.innerHTML = T.msgs.map(x => {
      let h = '';
      if (x.de === 'cliente') h = `${anterior !== 'cliente' ? `<span class="capitao-quem">${esc(T.cliente || 'Cliente')}</span>` : ''}<div class="capitao-balao cliente">${esc(x.txt)}</div>`;
      else if (x.de === 'ia') h = `${anterior !== 'ia' ? '<span class="capitao-quem ia">IA do SAC</span>' : ''}<div class="capitao-balao ia${x.barrado ? ' barrado' : ''}">${esc(x.txt)}</div>`;
      else if (x.de === 'veredito') h = veredito(x.r);
      else if (x.de === 'erro') h = `<div class="erro">${esc(x.txt)} <button class="btn peq" data-cap-acao="tentar">Tentar de novo</button></div>`;
      anterior = x.de;
      return h;
    }).join('') + (T.pensando ? `<div class="capitao-pensando" role="status"><span class="capitao-pontos" aria-hidden="true"><i></i><i></i><i></i></span>A IA está pensando… <span id="capitao-seg">${Math.round((Date.now() - T.inicio) / 1000)} s</span></div>` : '');
    alvo.scrollTop = alvo.scrollHeight;
    const enviar = document.getElementById('capitao-enviar');
    if (enviar) enviar.disabled = !REAL || T.pensando;
    const limpar = document.querySelector('[data-cap-acao="limpar-teste"]');
    if (limpar) limpar.disabled = !T.msgs.length || T.pensando;
  }

  async function perguntarIA() {
    const T = C.teste;
    const historico = T.msgs.filter(x => x.de === 'cliente' || (x.de === 'ia' && !x.barrado)).map(x => ({ de: x.de, txt: x.txt }));
    if (!historico.length || historico[historico.length - 1].de !== 'cliente') return;
    T.msgs = T.msgs.filter(x => x.de !== 'erro');
    T.pensando = true; T.inicio = Date.now();
    desenharFala();
    const relogio = setInterval(() => {
      const s = document.getElementById('capitao-seg');
      if (s) s.textContent = `${Math.round((Date.now() - T.inicio) / 1000)} s`;
    }, 1000);
    try {
      const r = await chamar(`${API}/testar`, 'POST', { marca: T.marca, canal: T.canal, cliente: T.cliente, mensagens: historico });
      const barrado = (r.barrado || []).length && r.acao !== 'ignorar';
      if (r.acao === 'responder' || r.acao === 'escalar') for (const txt of (r.mensagens || []).map(s => String(s).trim()).filter(Boolean)) T.msgs.push({ de: 'ia', txt, barrado: !!barrado });
      T.msgs.push({ de: 'veredito', r });
    } catch (err) {
      T.msgs.push({ de: 'erro', txt: `A IA não respondeu: ${err.message}` });
    } finally {
      clearInterval(relogio);
      T.pensando = false;
      guardarTeste();
      if (naAba('testar')) { desenharFala(); document.getElementById('capitao-texto')?.focus(); }
    }
  }

  function enviarTeste() {
    const T = C.teste, t = document.getElementById('capitao-texto');
    const txt = (t?.value || '').trim();
    if (!txt || T.pensando || !REAL) return;
    T.msgs.push({ de: 'cliente', txt });
    T.rascunho = ''; t.value = '';
    perguntarIA();
  }

  // ---------- 4: perguntas sem resposta ----------
  function desenharPerguntas(corpo) {
    if (!precisa('perguntas', 'perguntas', corpo, 'Carregando as perguntas…')) return;
    const { abertas, respondidas } = C.perguntas;
    corpo.innerHTML = `
      <div class="secao">Dúvidas que a IA não soube responder</div>
      <p class="muted" style="font-size:13px;margin:-4px 0 14px;max-width:70ch">Quando a base não tem a resposta, a IA passa a conversa para a equipe e anota a dúvida aqui. Responda uma vez e a IA passa a usar a resposta sozinha na próxima mensagem.</p>
      ${abertas.length ? `<div class="capitao-perguntas">${abertas.map((q, i) => `
        <div class="capitao-pergunta">
          <div><p>${esc(q.texto)}</p><small>Anotada em ${esc(dataBr(q.data) || 'data desconhecida')}</small></div>
          <button class="btn" data-cap-resp="${i}" ${REAL ? '' : 'disabled'}>Responder</button>
        </div>`).join('')}</div>`
        : '<div class="vazio"><strong>Nenhuma pergunta esperando.</strong><span>Quando a IA não souber algo, a dúvida aparece aqui para a equipe responder.</span></div>'}
      ${respondidas.length ? `<details class="capitao-detalhes" style="margin-top:18px"><summary>Já respondidas (${respondidas.length})</summary>
        <div class="capitao-perguntas" style="margin-top:8px">${respondidas.map(q => `<div class="capitao-pergunta feita"><div><p>${esc(q.texto)}</p><small>${esc(q.nota || '')}</small></div></div>`).join('')}</div></details>` : ''}`;
  }

  function linhaPrevia(perg, resp) {
    perg = perg.replace(/\s+/g, ' ').trim(); resp = resp.replace(/\s+/g, ' ').trim();
    if (resp && !/[.!?…)]$/.test(resp)) resp += '.';
    return `${esc(hojeStr())}: <b>${esc(perg || 'Pergunta')}</b> ${esc(resp || 'Resposta')}`;
  }

  function abrirResponder(i) {
    const q = C.perguntas?.abertas?.[i];
    if (!q) return;
    gaveta('Responder pergunta', `
      <p class="muted" style="font-size:13px">A IA anotou esta dúvida em ${esc(dataBr(q.data) || 'uma conversa')}. Ajuste a pergunta se quiser e escreva a resposta certa.</p>
      <div class="campo"><label for="capitao-perg">Pergunta</label><textarea id="capitao-perg" class="capitao-area" style="min-height:70px" maxlength="600">${esc(q.texto)}</textarea></div>
      <div class="campo"><label for="capitao-resp">Resposta</label><textarea id="capitao-resp" class="capitao-area" maxlength="2000" placeholder="Escreva a resposta como a equipe daria para a cliente. Seja exata: a IA vai usar isso como verdade."></textarea>
        <small>Só escreva o que a marca confirma. Preço, prazo e promoção precisam ser os de verdade.</small></div>
      <div class="campo"><label>Como vai ficar na base</label><div class="capitao-previa" id="capitao-previa">${linhaPrevia(q.texto, '')}</div></div>
      <div class="nota-box">A resposta entra na base de conhecimento e a pergunta sai desta lista. A IA usa a partir da próxima mensagem.</div>`,
      `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-cap-acao="salvar-resposta" data-cap-i="${i}">Salvar resposta</button>`);
    document.getElementById('capitao-resp')?.focus();
  }

  async function salvarResposta(botao) {
    const q = C.perguntas?.abertas?.[Number(botao.dataset.capI)];
    const perg = (document.getElementById('capitao-perg')?.value || '').trim();
    const resp = (document.getElementById('capitao-resp')?.value || '').trim();
    const erro = txt => { const e = document.getElementById('g-erro'); if (e) e.innerHTML = `<div class="erro">${esc(txt)}</div>`; };
    if (!q) return erro('Essa pergunta não está mais na lista. Feche e abra de novo.');
    if (!perg) return erro('Escreva a pergunta.');
    if (resp.length < 3) return erro('Escreva a resposta antes de salvar.');
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      await chamar(`${API}/responder`, 'POST', { linha: q.linha, pergunta: perg, resposta: resp });
      fecharGaveta();
      toast('Resposta salva na base. A IA já usa a partir da próxima mensagem.');
      C.base = null;
      await buscar('perguntas', true);
      renderMenuLateral();
      if (estado.pagina === 'capitao') MODULOS.capitao.render(pagEl('capitao'), C.aba);
    } catch (err) {
      botao.disabled = false; botao.textContent = 'Salvar resposta';
      erro(`Não salvou: ${err.message}`);
    }
  }

  // ---------- 5: base de conhecimento ----------
  function inline(s) {
    let h = esc(s);
    h = h.replace(/\*\*Em aberto:\*\*/g, '<span class="capitao-aberto">Em aberto</span>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
    return h;
  }

  function markdown(txt) {
    const linhas = String(txt || '').replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
    const out = [], titulos = [];
    let par = [], itens = null;
    const fecharPar = () => { if (par.length) out.push(`<p>${inline(par.join(' '))}</p>`); par = []; };
    const fecharLista = () => { if (itens) out.push(`<ul>${itens.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); itens = null; };
    for (const l of linhas) {
      const h = l.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        fecharPar(); fecharLista();
        const n = h[1].length;
        if (n === 2) { titulos.push(h[2]); out.push(`<h2 id="capitao-h-${titulos.length}">${inline(h[2])}</h2>`); }
        else out.push(`<h${n}>${inline(h[2])}</h${n}>`);
      } else if (/^\s*[-*]\s+/.test(l)) {
        fecharPar();
        if (!itens) itens = [];
        itens.push(l.replace(/^\s*[-*]\s+/, ''));
      } else if (!l.trim()) {
        fecharPar(); fecharLista();
      } else if (itens) {
        itens[itens.length - 1] += ` ${l.trim()}`;
      } else par.push(l.trim());
    }
    fecharPar(); fecharLista();
    return { html: out.join(''), titulos };
  }

  function desenharBase(corpo) {
    if (!precisa('base', 'base', corpo, 'Carregando a base de conhecimento…')) return;
    if (!C.base.texto) { corpo.innerHTML = '<div class="vazio"><strong>A base de conhecimento está vazia.</strong></div>'; return; }
    const { html, titulos } = markdown(C.base.texto);
    const abertos = (C.base.texto.match(/\*\*Em aberto:\*\*/g) || []).length;
    const quandoAtualizou = C.base.atualizada ? new Date(C.base.atualizada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    corpo.innerHTML = `
      <div class="secao">O que a IA sabe</div>
      <div class="nota-box" style="margin-bottom:14px">A IA lê esta base inteira antes de cada resposta. Para ensinar algo novo, responda em <button class="btn peq" data-cap-aba="perguntas">Perguntas sem resposta</button> ou edite a nota no Obsidian.${abertos ? ` Ainda há ${plural(abertos, 'ponto em aberto', 'pontos em aberto')}: nesses casos a IA passa para a equipe.` : ''}${quandoAtualizou ? ` <span class="muted">Atualizada em ${esc(quandoAtualizou)}.</span>` : ''}</div>
      ${titulos.length ? `<nav class="capitao-sumario" aria-label="Partes da base">${titulos.map((t, i) => `<button class="chip" data-cap-ir="capitao-h-${i + 1}">${inline(t)}</button>`).join('')}</nav>` : ''}
      <article class="capitao-md">${html}</article>`;
  }

  // ---------- 6: jeito de falar ----------
  function desenharJeito(corpo) {
    if (!precisa('jeito', 'jeito', corpo, 'Carregando o jeito de falar…')) return;
    const J = C.jeito;
    const lista = (itens, icone) => `<ul class="capitao-regras">${itens.map(t => `<li>${ico(icone)}<span>${inline(t)}</span></li>`).join('')}</ul>`;
    corpo.innerHTML = `
      <div class="secao">Como a IA conversa com as clientes</div>
      <div class="nota-box" style="margin-bottom:12px">Estas são as instruções que a IA segue em toda resposta. Para mudar alguma, peça ao Maestro. A mudança vale na próxima mensagem, sem desligar nada.</div>
      <div class="resumo-num">
        <div class="num-card"><span>Modelo em uso</span><strong style="font-size:18px">${esc(MODELOS[J.modelo] || J.modelo)}</strong></div>
        <div class="num-card"><span>Espera antes de responder</span><strong style="font-size:18px">${esc(J.espera_segundos)} s</strong><small>depois da última mensagem da cliente</small></div>
        <div class="num-card"><span>Balões por resposta</span><strong style="font-size:18px">1 a 3</strong><small>curtos, como no WhatsApp</small></div>
      </div>
      <div class="capitao-dois">
        <div class="card"><h3>Jeito de conversar</h3>${J.conversa.length ? lista(J.conversa, ICO_OK) : '<p class="muted">Nada escrito ainda.</p>'}</div>
        <div class="card"><h3>Regras que ela nunca quebra</h3>${J.regras.length ? lista(J.regras, ICO_NAO) : '<p class="muted">Nada escrito ainda.</p>'}</div>
      </div>`;
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-cap-aba],[data-cap-acao],[data-cap-periodo],[data-cap-conv],[data-cap-resp],[data-cap-exemplo],[data-cap-ir]');
    if (!el) return;
    const d = el.dataset;
    if (d.capAba) { irPara(d.capAba === 'geral' ? 'capitao' : `capitao/${d.capAba}`); return; }
    if (d.capPeriodo) { C.periodo = d.capPeriodo; desenhar(); return; }
    if (d.capConv) { const id = Number(d.capConv); if (!id) return; irPara('conversas'); abrir(id); return; }
    if (d.capResp !== undefined) { abrirResponder(Number(d.capResp)); return; }
    if (d.capIr) { document.getElementById(d.capIr)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (d.capExemplo !== undefined) {
      const t = document.getElementById('capitao-texto');
      if (t && !t.disabled) { t.value = EXEMPLOS[Number(d.capExemplo)]; C.teste.rascunho = t.value; t.focus(); }
      return;
    }
    switch (d.capAcao) {
      case 'chave': if (MEU_NIVEL === 'dona' && REAL) abrirChave(); break;
      case 'confirmar-chave': confirmarChave(el); break;
      case 'limpar-teste': if (!C.teste.pensando) { C.teste.msgs = []; guardarTeste(); desenharFala(); } break;
      case 'tentar': perguntarIA(); break;
      case 'salvar-resposta': salvarResposta(el); break;
      case 'recarregar': { const t = d.capTipo; C.erro[t] = null; buscar(t, true).then(desenhar); desenhar(); break; }
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'capitao-form') return;
    e.preventDefault(); enviarTeste();
  });

  document.addEventListener('keydown', e => {
    if (e.target.id === 'capitao-texto' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarTeste(); }
  });

  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'capitao-texto') C.teste.rascunho = e.target.value;
    else if (id === 'capitao-cliente') { C.teste.cliente = e.target.value.trim() || 'Cliente'; }
    else if (id === 'capitao-perg' || id === 'capitao-resp') {
      const p = document.getElementById('capitao-previa');
      if (p) p.innerHTML = linhaPrevia(document.getElementById('capitao-perg').value, document.getElementById('capitao-resp').value);
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'capitao-marca') { C.teste.marca = e.target.value; guardarTeste(); desenharFala(); }
    if (e.target.id === 'capitao-canal') { C.teste.canal = e.target.value; guardarTeste(); }
    if (e.target.id === 'capitao-cliente') guardarTeste();
  });

  // número de perguntas esperando, ao lado do nome no menu
  async function atualizarContador() {
    if (!MENU_PRONTO || !podeUsar()) return;
    if (!REAL) { C.perguntas = C.perguntas || DEMO.perguntas; renderMenuLateral(); return; }
    await buscar('perguntas', true);
    renderMenuLateral();
  }
  garantirCss();
  setTimeout(atualizarContador, 2500);
  setInterval(() => { if (document.visibilityState === 'visible') atualizarContador(); }, 5 * 60000);

  registrarPagina({
    id: 'capitao', nome: 'Capitão',
    ico: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    niveis: ['dona', 'supervisora'],
    contador: () => C.perguntas?.abertas?.length || 0,
    render,
  });
})();
