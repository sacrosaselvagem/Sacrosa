// Caixa de Entrada: os avisos da pessoa (notificações do Chatwoot) e, no topo, as conversas em que a IA pediu ajuda.
// Contrato da seção: 09_DOCUMENTATION/atendimento-modulos.md. Tudo fica dentro da função para não colidir com outros módulos.
'use strict';
(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'modulos/caixa.css';
  document.head.appendChild(css);

  const POR_PAGINA = 15;
  const st = {
    filtro: 'todas',      // 'todas' | 'naolidas'
    avisos: [],           // notificações já carregadas
    total: 0,             // quantas existem no Chatwoot
    pagina: 0,            // última página carregada
    naoLidas: 0,          // número do menu
    carregando: false,
    erro: '',
    carregou: false,
    demo: null,
  };

  // ---------- textos ----------
  const TIPOS = {
    conversation_creation: 'Conversa nova chegou',
    conversation_assignment: 'Conversa passada para você',
    assigned_conversation_new_message: 'Mensagem nova numa conversa sua',
    conversation_mention: 'Você foi mencionada numa nota',
    participating_conversation_new_message: 'Mensagem nova numa conversa que você acompanha',
    sla_missed_first_response: 'Passou do prazo da primeira resposta',
    sla_missed_next_response: 'Passou do prazo para responder',
    sla_missed_resolution: 'Passou do prazo para resolver',
    voice_call_missed: 'Ligação perdida',
  };
  const ICONES = {
    conversation_assignment: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5"/><path d="M14 16h7M18 12.5l3.5 3.5-3.5 3.5"/>',
    conversation_mention: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.9"/>',
    voice_call_missed: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    prazo: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>',
    msg: '<path d="M4 5h16v11H8l-4 4z"/>',
  };
  const icoDe = tipo => ICONES[tipo] || (tipo.startsWith('sla_') ? ICONES.prazo : ICONES.msg);

  // "@[Gabriella](mention://user/1/Gabriella) olha isso" vira "@Gabriella olha isso"
  const limparMencao = s => String(s || '').replace(/\[@?([^\]]+)\]\(mention:\/\/[^)]+\)/g, '@$1').replace(/@@/g, '@');
  const quando = t => { const d = desde(t); return d === 'agora' ? 'agora' : `há ${d}`; };

  // Transforma a notificação do Chatwoot em { id, tipo, titulo, cliente, canal, conversa, quem, texto, t, lida }
  function avisoDe(n) {
    const conv = n.primary_actor_type === 'Conversation' ? (n.primary_actor || {}) : {};
    const cliente = conv.meta?.sender?.name || conv.meta?.sender?.phone_number || 'Cliente';
    const canal = INBOX[conv.inbox_id]?.canal || 'site';
    const sec = n.secondary_actor || null;
    let quem = '', texto = '';
    const nomeUser = u => (u && (u.available_name || u.name)) || 'Alguém da equipe';
    const souEu = id => id && `u${id}` === EU;
    switch (n.notification_type) {
      case 'conversation_assignment':
        // o segundo ator é quem passou (ou nada, quando foi a distribuição automática)
        quem = !sec ? 'Pela distribuição automática' : souEu(sec.id) ? 'Você mesma pegou' : `Quem passou: ${nomeUser(sec)}`;
        texto = conv.messages?.[0]?.content || '';
        break;
      case 'conversation_mention':
        quem = sec?.sender ? `Nota de ${nomeUser(sec.sender)}` : 'Nota da equipe';
        texto = limparMencao(sec?.content || n.push_message_body);
        break;
      case 'assigned_conversation_new_message':
      case 'participating_conversation_new_message':
      case 'conversation_creation':
        texto = sec?.content || conv.messages?.[0]?.content || '';
        break;
      default:
        texto = '';
    }
    return {
      id: n.id, tipo: n.notification_type, titulo: TIPOS[n.notification_type] || 'Aviso novo',
      cliente, canal, conversa: n.primary_actor_id, quem, texto: textoCurto(texto),
      t: (n.last_activity_at || n.created_at || 0) * 1000, lida: !!n.read_at, bruto: conv,
    };
  }
  const textoCurto = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 160 ? `${s.slice(0, 157)}…` : s; };

  // ---------- demonstração ----------
  function avisosDemo() {
    const min = n => Date.now() - n * 60000;
    return [
      { id: -1, tipo: 'assigned_conversation_new_message', conversa: 1, cliente: 'Nathalya Souza', canal: 'whatsapp', quem: '', texto: 'Já tem quase um mês', t: min(22), lida: false },
      { id: -2, tipo: 'conversation_mention', conversa: 9, cliente: 'Juliana Matos', canal: 'telegram', quem: 'Nota de Ana Carla', texto: '@Gabriella confirma com o Renato se os 5% do PIX valem junto com a Black Friday?', t: min(51), lida: false },
      { id: -3, tipo: 'conversation_assignment', conversa: 1, cliente: 'Nathalya Souza', canal: 'whatsapp', quem: 'Quem passou: Ana Carla', texto: '', t: min(30), lida: false },
      { id: -4, tipo: 'assigned_conversation_new_message', conversa: 4, cliente: 'Tayane Araújo', canal: 'whatsapp', quem: '', texto: 'Perfeito, obrigada!!', t: min(73), lida: true },
    ].map(a => ({ ...a, titulo: TIPOS[a.tipo] })).sort((a, b) => b.t - a.t);
  }

  // ---------- dados ----------
  // o Chatwoot só manda os não lidos, a não ser que peça os lidos também
  const incluirLidos = () => st.filtro === 'todas' ? '&includes[]=read' : '';
  async function carregar(mais) {
    if (st.carregando) return;
    st.carregando = true; st.erro = '';
    try {
      if (!REAL) {
        st.demo = st.demo || avisosDemo();
        st.avisos = st.demo; st.total = st.demo.length; st.pagina = 1;
      } else {
        const pagina = mais ? st.pagina + 1 : 1;
        const r = await cw(`notifications?page=${pagina}${incluirLidos()}`);
        const d = r.data || r;
        const lote = (d.payload || []).map(avisoDe);
        st.avisos = mais ? [...st.avisos, ...lote.filter(a => !st.avisos.some(b => b.id === a.id))] : lote;
        st.total = d.meta?.count ?? st.avisos.length;
        st.pagina = pagina;
        // quando carrega mais, guarda o tanto que já foi visto para a próxima atualização trazer o mesmo tanto
        if (!mais && st.paginasVistas > 1) {
          for (let p = 2; p <= st.paginasVistas; p++) {
            const rr = await cw(`notifications?page=${p}${incluirLidos()}`);
            const ll = ((rr.data || rr).payload || []).map(avisoDe);
            st.avisos.push(...ll.filter(a => !st.avisos.some(b => b.id === a.id)));
            st.pagina = p;
            if (ll.length < POR_PAGINA) break;
          }
        }
        st.paginasVistas = st.pagina;
        mudarContador(d.meta?.unread_count ?? st.avisos.filter(a => !a.lida).length);
      }
      st.carregou = true;
    } catch (err) {
      st.erro = err.message;
    } finally {
      st.carregando = false;
    }
  }

  function mudarContador(n) {
    n = Math.max(0, Number(n) || 0);
    if (n === st.naoLidas) return;
    st.naoLidas = n;
    if (MENU_PRONTO) renderMenuLateral();
  }
  const contarDemo = () => mudarContador((st.demo || []).filter(a => !a.lida).length);

  async function marcarLido(a) {
    if (a.lida) return;
    a.lida = true;
    if (!REAL) { contarDemo(); return; }
    mudarContador(st.naoLidas - 1);
    try { await cw(`notifications/${a.id}`, 'PATCH', {}); }
    catch { /* se não marcou, a próxima atualização mostra de novo como não lido */ }
  }

  async function marcarTodos(botao) {
    if (!st.avisos.some(a => !a.lida) && !st.naoLidas) { toast('Você já leu todos os avisos.'); return; }
    if (botao) { botao.disabled = true; botao.textContent = 'Marcando…'; }
    try {
      if (REAL) await cw('notifications/read_all', 'POST', {});
      st.avisos.forEach(a => { a.lida = true; });
      if (!REAL) contarDemo(); else mudarContador(0);
      toast('Todos os avisos foram marcados como lidos.');
    } catch (err) {
      toast(`Não consegui marcar os avisos. Tente de novo em instantes. (${err.message})`);
    }
    desenhar();
  }

  // Abre a conversa na tela de conversas. Se ela não estiver carregada (resolvida há dias, por exemplo), busca antes.
  async function abrirConversa(id) {
    id = Number(id);
    if (!id) return;
    let c = estado.convs.find(x => x.id === id);
    if (!c && REAL) {
      try {
        const x = await cw(`conversations/${id}`);
        c = convDe(x);
        estado.convs.push(c);
      } catch (err) { toast(`Não consegui abrir essa conversa. Ela pode ter sido apagada. (${err.message})`); return; }
    }
    if (!c) { toast('Essa conversa não está mais disponível.'); return; }
    estado.fila = c.resolvida ? 'resolvidas' : c.dono === EU ? 'mim' : c.dono === 'ia' ? 'ia' : !c.dono ? 'precisam' : 'todas';
    estado.canal = null; estado.assunto = null;
    irPara('conversas');
    abrir(id);
  }
  window.abrirConversaPorId = abrirConversa;

  // ---------- desenho ----------
  const pedidosDeAjuda = () => estado.convs
    .filter(c => c.escalou && !c.dono && !c.resolvida)
    .sort((a, b) => espera(b) - espera(a));

  function blocoAjuda() {
    const lista = pedidosDeAjuda();
    const titulo = `<div class="secao caixa-secao">${ico(BRILHO)}<span>A IA pediu ajuda</span>${lista.length ? `<span class="caixa-n alerta">${lista.length}</span>` : ''}</div>`;
    if (!lista.length) {
      return `${titulo}<div class="caixa-ok">${ico('<path d="m5 12 4 4 10-10"/>')}<span>Nenhum pedido de ajuda agora. Quando a IA não souber responder, a conversa aparece aqui para alguém assumir.</span></div>`;
    }
    return `${titulo}<ul class="caixa-ajuda">${lista.map(c => {
      const e = espera(c), cls = e > 30 ? 'atrasado' : e > 10 ? 'quase' : '';
      const marca = c.marca === 'beyoung' ? 'Beyoung' : 'Rosa Selvagem';
      return `<li><button class="caixa-ajuda-item" data-cx-conversa="${c.id}">
        <span class="av lg">${esc(c.ini || iniciais(c.cliente))}</span>
        <span class="caixa-ajuda-txt">
          <span class="caixa-linha1"><strong>${esc(c.cliente)}</strong><span class="caixa-canal">${canalIco(c.canal)}${esc(CANAIS[c.canal]?.nome || '')}, ${marca}</span></span>
          <span class="chip alerta">${esc(c.escalou)}</span>
          ${c.resumo ? `<span class="caixa-resumo">${esc(c.resumo)}</span>` : ''}
        </span>
        <span class="caixa-lado">
          <span class="tempo ${cls}">${e ? `esperando há ${esc(desde(Date.now() - e * 60000))}` : `última mensagem ${esc(quando(ultima(c).t))}`}</span>
          <span class="caixa-abrir">Abrir conversa${ico('<path d="m9 6 6 6-6 6"/>')}</span>
        </span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  function blocoAvisos() {
    const naoLidos = st.avisos.filter(a => !a.lida);
    const lista = st.filtro === 'naolidas' ? naoLidos : st.avisos;
    const filtros = `<div class="caixa-filtros" role="tablist" aria-label="Quais avisos mostrar">
      <button role="tab" data-cx-filtro="todas" class="${st.filtro === 'todas' ? 'on' : ''}" aria-selected="${st.filtro === 'todas'}">Todas</button>
      <button role="tab" data-cx-filtro="naolidas" class="${st.filtro === 'naolidas' ? 'on' : ''}" aria-selected="${st.filtro === 'naolidas'}">Não lidas${st.naoLidas ? ` <b>${st.naoLidas}</b>` : ''}</button>
    </div>`;
    const titulo = `<div class="secao caixa-secao caixa-secao-avisos"><span>Avisos para você</span>${filtros}</div>`;

    if (st.erro && !st.avisos.length) {
      return `${titulo}<div class="erro">Não consegui carregar os avisos. Confira se o atendimento está ligado e clique em "Tentar de novo". <button class="btn peq" data-cx-recarregar="1" style="margin-left:8px">Tentar de novo</button></div>`;
    }
    if (!st.carregou) return `${titulo}<div class="caixa-carregando">Carregando os avisos…</div>`;
    if (!lista.length) {
      const [forte, fraco] = st.filtro === 'naolidas'
        ? ['Você leu tudo', 'Os avisos novos aparecem aqui. Em "Todas" ficam os que você já leu.']
        : ['Nenhum aviso ainda', 'Quando alguém passar uma conversa para você, mencionar você numa nota ou a cliente responder, o aviso aparece aqui.'];
      return `${titulo}<div class="vazio caixa-vazio">${ico('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>', 'ico caixa-vazio-ico')}<strong>${forte}</strong><span>${fraco}</span>
        <button class="btn peq" data-cx-ir="conversas" style="margin-top:10px">Ver as conversas</button></div>`;
    }
    const itens = lista.map(a => `<li><button class="caixa-aviso${a.lida ? ' lida' : ''}" data-cx-aviso="${a.id}">
        <span class="caixa-aviso-ico">${ico(icoDe(a.tipo))}${a.lida ? '' : '<i class="caixa-ponto" aria-label="Não lido"></i>'}</span>
        <span class="caixa-aviso-txt">
          <span class="caixa-linha1"><strong>${esc(a.titulo)}</strong><span class="tempo">${esc(quando(a.t))}</span></span>
          <span class="caixa-quem">${canalIco(a.canal)}<span>${esc(a.cliente)}${a.quem ? ` · ${esc(a.quem)}` : ''}</span></span>
          ${a.texto ? `<span class="caixa-texto">${esc(a.texto)}</span>` : ''}
        </span>
      </button></li>`).join('');
    const mais = REAL && st.avisos.length < st.total
      ? `<div class="caixa-mais"><button class="btn peq" data-cx-mais="1" ${st.carregando ? 'disabled' : ''}>Ver avisos mais antigos</button></div>` : '';
    return `${titulo}<ul class="caixa-avisos">${itens}</ul>${mais}`;
  }

  let elPagina = null;
  function desenhar() {
    if (!elPagina) return;
    const acoes = `<button class="btn" data-cx-todos="1" ${st.avisos.some(a => !a.lida) || st.naoLidas ? '' : 'disabled'}>${ico('<path d="m3 12 4 4 8-8"/><path d="m11 16 2 0 8-8"/>')}<span class="caixa-rot">Marcar tudo como lido</span></button>`;
    elPagina.innerHTML = `<div class="pag-in caixa">
      ${cabecalho('Caixa de entrada', 'Os seus avisos e as conversas em que a IA precisa de uma pessoa. Escolha um item para abrir a conversa.', acoes)}
      ${REAL ? '' : '<div class="nota-box caixa-demo">Isto é uma demonstração com exemplos de mentira. Quando o atendimento estiver ligado, aparecem os seus avisos de verdade.</div>'}
      ${blocoAjuda()}
      ${blocoAvisos()}
    </div>`;
  }
  // redesenha só o bloco da IA (as conversas mudam a cada 6 s na tela de conversas)
  function aberta() { return elPagina && !elPagina.hidden && estado.pagina === 'caixa'; }

  async function renderCaixa(el) {
    elPagina = el;
    desenhar();
    await carregar(false);
    if (aberta()) desenhar();
  }

  // ---------- cliques ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-cx-aviso],[data-cx-conversa],[data-cx-filtro],[data-cx-todos],[data-cx-mais],[data-cx-recarregar],[data-cx-ir]');
    if (!el) return;
    const d = el.dataset;
    if (d.cxFiltro) { if (st.filtro === d.cxFiltro) return; st.filtro = d.cxFiltro; st.paginasVistas = 1; desenhar(); carregar(false).then(desenhar); return; }
    if (d.cxTodos) { marcarTodos(el); return; }
    if (d.cxIr) { irPara(d.cxIr); return; }
    if (d.cxRecarregar) { renderCaixa(elPagina); return; }
    if (d.cxMais) { el.disabled = true; el.textContent = 'Carregando…'; carregar(true).then(desenhar); return; }
    if (d.cxConversa) { abrirConversa(d.cxConversa); return; }
    if (d.cxAviso) {
      const a = st.avisos.find(x => String(x.id) === d.cxAviso);
      if (!a) return;
      marcarLido(a);
      if (a.conversa) abrirConversa(a.conversa); else desenhar();
    }
  });

  // ---------- atualização ----------
  // Número do menu: avisos não lidos. Atualiza a cada 30 s; a página aberta também redesenha.
  async function atualizarContador() {
    if (!MENU_PRONTO) return;
    if (!REAL) { st.demo = st.demo || avisosDemo(); if (!st.carregou) { st.avisos = st.demo; st.total = st.demo.length; st.carregou = true; } contarDemo(); return; }
    if (aberta()) { await carregar(false); if (aberta()) desenhar(); return; }
    try {
      const r = await cw('notifications/unread_count');
      mudarContador(typeof r === 'number' ? r : r.data ?? r.unread_count ?? r.count);
    } catch { /* tenta de novo na próxima volta */ }
  }
  // espera o menu ficar pronto (o login e a ligação com o Chatwoot acontecem antes)
  (function esperarMenu() {
    if (!MENU_PRONTO) { setTimeout(esperarMenu, 400); return; }
    setTimeout(atualizarContador, 800);
    setInterval(atualizarContador, 30000);
    setInterval(() => { if (aberta() && !st.carregando) desenhar(); }, 10000);
  })();

  registrarPagina({
    id: 'caixa', nome: 'Caixa de entrada',
    ico: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    niveis: ['dona', 'supervisora', 'atendente'],
    contador: () => st.naoLidas,
    contadorAlerta: false,
    render: el => renderCaixa(el),
  });
})();
