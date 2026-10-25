// Contatos: lista de clientes, busca, ficha com dados, último pedido, notas e conversas; editar e criar contato.
// Contrato da seção: 09_DOCUMENTATION/atendimento-modulos.md. Tudo fica dentro da função para não colidir com outros módulos.
// Lista: usa a busca do Chatwoot com "%" (traz todo mundo), porque a lista comum dele esconde quem não tem telefone
// nem e-mail (ex.: quem só falou pelo Instagram).
'use strict';
(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'modulos/contatos.css';
  document.head.appendChild(css);

  const st = {
    lista: [], pagina: 0, temMais: false, busca: '', canal: null,
    carregando: false, erro: '', carregou: false,
    sel: null,            // id do contato aberto
    det: null,            // { id, conversas, etiquetas, notas, carregando, erro }
    vista: 'lista',       // no celular: 'lista' ou 'ficha'
  };
  let elPagina = null;

  // ---------- conversões ----------
  function foneBonito(f) {
    if (!f) return '';
    const d = String(f).replace(/\D/g, '');
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
      const ddd = d.slice(2, 4), n = d.slice(4);
      return `(${ddd}) ${n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`}`;
    }
    return String(f);
  }
  // o Chatwoot só aceita telefone no formato +5511987654321
  function foneParaSalvar(txt) {
    const t = String(txt || '').trim();
    if (!t) return null;
    let d = t.replace(/\D/g, '');
    if (!t.startsWith('+') && (d.length === 10 || d.length === 11)) d = `55${d}`;
    return `+${d}`;
  }
  const instaDe = aa => {
    const u = aa?.social_profiles?.instagram || aa?.social_instagram_user_name || '';
    return u ? `@${String(u).replace(/^@/, '')}` : '';
  };

  function contatoDe(x) {
    const aa = x.additional_attributes || {}, ca = x.custom_attributes || {};
    const caixas = (x.contact_inboxes || []).map(ci => ci.inbox).filter(Boolean);
    const canais = [...new Set(caixas.map(ib => INBOX[ib.id]?.canal || canalDoInbox(ib)))];
    const marcas = [...new Set(caixas.map(ib => /beyoung/i.test(ib.name || '') ? 'beyoung' : 'rosa'))];
    const nome = x.name || foneBonito(x.phone_number) || x.email || 'Sem nome';
    return {
      id: x.id, nome, ini: iniciais(nome), fone: x.phone_number || '', email: x.email || '',
      cidade: aa.city || '', insta: instaDe(aa), canais, marcas,
      pedido: lerObjeto(ca.ultimo_pedido), ultima: (x.last_activity_at || x.created_at || 0) * 1000, bruto: x,
    };
  }

  // na demonstração, os contatos saem das conversas de exemplo
  function contatosDemo() {
    const vistos = new Map();
    for (const c of estado.convs) {
      if (vistos.has(c.cliente)) continue;
      const ult = c.msgs?.at(-1)?.t || Date.now();
      vistos.set(c.cliente, {
        id: -(vistos.size + 1), nome: c.cliente, ini: c.ini || iniciais(c.cliente), fone: c.fone ? `+55${c.fone.replace(/\D/g, '')}` : '',
        email: c.email || '', cidade: c.cidade || '', insta: c.insta || '', canais: [c.canal], marcas: [c.marca],
        pedido: c.pedido || null, ultima: ult, demoConvs: [c.id], bruto: {},
      });
    }
    return [...vistos.values()].sort((a, b) => b.ultima - a.ultima);
  }

  // ---------- dados ----------
  async function carregarLista(mais) {
    if (st.carregando) return;
    st.carregando = true; st.erro = '';
    try {
      if (!REAL) {
        st.demo = st.demo || contatosDemo();
        const q = st.busca.trim().toLowerCase();
        st.lista = st.demo.filter(c => !q || [c.nome, c.fone, c.email].some(v => v && v.toLowerCase().includes(q)));
        st.temMais = false; st.pagina = 1;
      } else {
        const pagina = mais ? st.pagina + 1 : 1;
        const q = st.busca.trim() || '%';
        const r = await cw(`contacts/search?q=${encodeURIComponent(q)}&sort=-last_activity_at&page=${pagina}`);
        const lote = (r.payload || []).map(contatoDe);
        st.lista = mais ? [...st.lista, ...lote.filter(c => !st.lista.some(o => o.id === c.id))] : lote;
        st.temMais = !!r.meta?.has_more;
        st.pagina = pagina;
      }
      st.carregou = true;
    } catch (err) { st.erro = err.message; }
    finally { st.carregando = false; }
  }

  async function carregarFicha(id) {
    const det = { id, conversas: null, etiquetas: [], notas: [], erro: '' };
    st.det = det;
    desenharFicha();
    if (!REAL) {
      const c = st.lista.find(x => x.id === id);
      det.conversas = estado.convs.filter(v => c?.demoConvs?.includes(v.id)).map(v => ({
        id: v.id, canal: v.canal, caixa: CANAIS[v.canal]?.nome || '', status: v.resolvida ? 'resolved' : v.dono === 'ia' ? 'pending' : 'open',
        dono: v.dono && v.dono !== 'ia' ? v.dono : null, texto: ultima(v).txt, t: ultima(v).t, motivo: v.escalou,
      }));
      det.etiquetas = [...new Set(estado.convs.filter(v => c?.demoConvs?.includes(v.id)).flatMap(v => v.etiquetas))];
      det.notas = st.notasDemo?.[id] || [];
      if (st.det === det) desenharFicha();
      return;
    }
    const [convs, etqs, notas, contato] = await Promise.allSettled([
      cw(`contacts/${id}/conversations`), cw(`contacts/${id}/labels`), cw(`contacts/${id}/notes`), cw(`contacts/${id}`),
    ]);
    if (st.det !== det) return;
    if (convs.status === 'fulfilled') {
      det.conversas = (convs.value.payload || []).map(x => {
        const ult = x.last_non_activity_message || (x.messages || []).at(-1);
        return {
          id: x.id, canal: INBOX[x.inbox_id]?.canal || 'site', caixa: INBOX[x.inbox_id]?.nome || '', status: x.status,
          dono: x.meta?.assignee ? `u${x.meta.assignee.id}` : null, texto: ult ? textoDe(ult) : '',
          t: (x.last_activity_at || x.timestamp || x.created_at || 0) * 1000, motivo: x.status === 'open' ? x.custom_attributes?.motivo_ia : '',
          etiquetas: x.labels || [],
        };
      }).sort((a, b) => b.t - a.t);
    } else { det.conversas = []; det.erro = 'Não consegui carregar as conversas deste contato.'; }
    const daConversa = det.conversas.flatMap(c => c.etiquetas || []);
    det.etiquetas = [...new Set([...(etqs.status === 'fulfilled' ? etqs.value.payload || [] : []), ...daConversa])];
    det.notas = notas.status === 'fulfilled' ? (Array.isArray(notas.value) ? notas.value : notas.value.payload || []) : [];
    // a ficha completa pode trazer dados mais novos que a lista
    if (contato.status === 'fulfilled') {
      const novo = contatoDe(contato.value.payload || contato.value);
      const i = st.lista.findIndex(c => c.id === id);
      if (i >= 0) st.lista[i] = novo; else st.lista.unshift(novo);
    }
    desenharFicha();
  }

  // ---------- desenho ----------
  const marcaNome = m => m === 'beyoung' ? 'Beyoung' : 'Rosa Selvagem';
  const quando = t => { if (!t) return ''; const d = desde(t); return d === 'agora' ? 'agora' : `há ${d}`; };

  function desenhar() {
    if (!elPagina) return;
    const acoes = `<button class="btn prim" data-ct-novo="1">${ico('<path d="M12 5v14M5 12h14"/>')}<span>Novo contato</span></button>`;
    elPagina.innerHTML = `<div class="pag-in contatos">
      ${cabecalho('Contatos', 'Todas as clientes que já falaram com a gente. Escolha um nome para ver os dados, o último pedido e as conversas.', acoes)}
      ${REAL ? '' : '<div class="nota-box contatos-demo">Isto é uma demonstração com clientes de mentira. O que você mudar aqui não fica salvo.</div>'}
      <div class="contatos-split" data-view="${st.vista}">
        <section class="contatos-lista" aria-label="Lista de contatos">
          <label class="busca contatos-busca">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="ct-busca" type="search" placeholder="Buscar por nome, telefone ou e-mail" autocomplete="off" aria-label="Buscar contato" value="${esc(st.busca)}">
          </label>
          <div class="contatos-chips" id="ct-chips"></div>
          <div id="ct-lista"></div>
        </section>
        <section class="contatos-ficha" id="ct-ficha" aria-label="Ficha do contato"></section>
      </div>
    </div>`;
    desenharLista();
    desenharFicha();
  }

  function desenharLista() {
    const alvo = elPagina?.querySelector('#ct-lista');
    if (!alvo) return;
    // filtro por canal (só os canais que aparecem na lista)
    const canais = Object.keys(CANAIS).filter(k => st.lista.some(c => c.canais.includes(k)));
    if (st.canal && !canais.includes(st.canal)) st.canal = null;
    elPagina.querySelector('#ct-chips').innerHTML = canais.length > 1
      ? `<button class="contatos-chip${st.canal ? '' : ' on'}" data-ct-canal="">Todos</button>${canais.map(k => `<button class="contatos-chip${st.canal === k ? ' on' : ''}" data-ct-canal="${k}">${canalIco(k)}${esc(CANAIS[k].nome)}</button>`).join('')}`
      : '';

    if (st.erro && !st.lista.length) {
      alvo.innerHTML = `<div class="erro">Não consegui carregar os contatos. Confira se o atendimento está ligado e tente de novo. <button class="btn peq" data-ct-recarregar="1" style="margin-left:8px">Tentar de novo</button></div>`;
      return;
    }
    if (!st.carregou) { alvo.innerHTML = '<div class="contatos-carregando">Carregando os contatos…</div>'; return; }
    const lista = st.lista.filter(c => !st.canal || c.canais.includes(st.canal));
    if (!lista.length) {
      alvo.innerHTML = st.busca.trim() || st.canal
        ? `<div class="vazio contatos-vazio"><strong>Ninguém encontrado</strong><span>Confira se o nome, o telefone ou o e-mail estão certos, ou crie o contato.</span><button class="btn peq" data-ct-novo="1" style="margin-top:10px">Criar contato</button></div>`
        : `<div class="vazio contatos-vazio"><strong>Nenhum contato ainda</strong><span>Os contatos aparecem quando alguém manda mensagem. Você também pode criar um agora.</span><button class="btn peq" data-ct-novo="1" style="margin-top:10px">Criar contato</button></div>`;
      return;
    }
    alvo.innerHTML = `<ul class="contatos-itens">${lista.map(c => {
      const linha2 = [foneBonito(c.fone), c.email, c.cidade].filter(Boolean)[0] || c.insta
        || (c.canais.length ? `Falou pelo ${c.canais.map(k => CANAIS[k]?.nome || k).join(' e pelo ')}` : 'Sem telefone e sem e-mail');
      return `<li><button class="contatos-item${st.sel === c.id ? ' on' : ''}" data-ct-abrir="${c.id}" aria-current="${st.sel === c.id}">
        <span class="av lg">${esc(c.ini)}</span>
        <span class="contatos-item-txt"><strong>${esc(c.nome)}</strong><span>${esc(linha2)}</span></span>
        <span class="contatos-item-lado"><span class="contatos-canais">${c.canais.map(k => `<span title="${esc(CANAIS[k]?.nome || '')}">${canalIco(k)}</span>`).join('')}</span><span class="tempo">${esc(quando(c.ultima))}</span></span>
      </button></li>`;
    }).join('')}</ul>
    ${st.temMais ? `<div class="contatos-mais"><button class="btn peq" data-ct-mais="1" ${st.carregando ? 'disabled' : ''}>Ver mais contatos</button></div>` : ''}`;
  }

  function cartaoPedido(p) {
    if (!p) return '<p class="muted" style="font-size:13px">Nenhum pedido encontrado para este contato.</p>';
    return `<div class="pedido ${esc(p.status)}">
      <div class="pedido-top"><b>Pedido ${esc(p.num)}</b><span class="status ${esc(p.status)}">${esc(p.rot)}</span></div>
      <div class="trilha" title="Aprovado, separado, enviado, entregue">${[1, 2, 3, 4].map(i => `<i class="${i <= p.passo ? 'f' : ''}"></i>`).join('')}</div>
      <div class="itens">${esc(p.itens)}</div>
      <div class="linha"><span>Total</span><span>${esc(p.total)}</span></div>
      <div class="linha"><span>Envio</span><span>${esc(p.envio)}</span></div>
      <div class="linha"><span>Rastreio</span><span>${esc(p.rastreio)}</span></div>
      <div class="linha"><span>Comprado em</span><span>${esc(p.data)}</span></div>
    </div>`;
  }

  function statusConversa(v) {
    if (v.status === 'resolved') return '<span class="chip">Resolvida</span>';
    if (v.status === 'pending') return `<span class="chip">${ico(BRILHO)}Com a IA</span>`;
    if (v.status === 'snoozed') return '<span class="chip">Adiada</span>';
    if (v.motivo && !v.dono) return `<span class="chip alerta">IA pediu ajuda: ${esc(v.motivo)}</span>`;
    if (v.dono) return `<span class="chip">${v.dono === EU ? 'Com você' : `Com ${esc(pessoa(v.dono).nome)}`}</span>`;
    return '<span class="chip aviso">Ninguém pegou</span>';
  }

  function desenharFicha() {
    const alvo = elPagina?.querySelector('#ct-ficha');
    if (!alvo) return;
    const c = st.lista.find(x => x.id === st.sel);
    if (!c) {
      alvo.innerHTML = `<div class="contatos-nada">${ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', 'ico contatos-nada-ico')}<strong>Escolha um contato</strong><span>Os dados, o último pedido e as conversas da cliente aparecem aqui.</span></div>`;
      return;
    }
    const det = st.det?.id === c.id ? st.det : null;
    const dados = [['Telefone', foneBonito(c.fone)], ['E-mail', c.email], ['Cidade', c.cidade], ['Instagram', c.insta]];
    const conversas = !det || det.conversas === null
      ? '<p class="muted" style="font-size:13px">Carregando as conversas…</p>'
      : det.erro ? `<div class="erro">${esc(det.erro)}</div>`
      : !det.conversas.length ? '<p class="muted" style="font-size:13px">Nenhuma conversa com esta cliente ainda.</p>'
      : `<ul class="contatos-convs">${det.conversas.map(v => `<li class="contatos-conv">
          <div class="contatos-conv-top"><span class="contatos-conv-canal">${canalIco(v.canal)}${esc(v.caixa || CANAIS[v.canal]?.nome || '')}</span><span class="tempo">${esc(quando(v.t))}</span></div>
          ${v.texto ? `<p class="contatos-conv-txt">${esc(v.texto)}</p>` : ''}
          <div class="contatos-conv-pe">${statusConversa(v)}<button class="btn peq" data-ct-conversa="${v.id}">Abrir conversa</button></div>
        </li>`).join('')}</ul>`;
    const etiquetas = det?.etiquetas?.length
      ? `<div class="etiquetas">${det.etiquetas.map(t => `<span class="chip">${esc(nomeAssunto(t))}</span>`).join('')}</div>`
      : '<p class="muted" style="font-size:13px">Sem etiquetas.</p>';
    const notas = det ? `${(det.notas || []).length ? `<ul class="contatos-notas">${det.notas.map(n => `<li><p>${esc(n.content)}</p><span>${esc(n.user?.available_name || n.user?.name || 'Equipe')}, ${esc(quando((typeof n.created_at === 'number' ? n.created_at * 1000 : Date.parse(n.created_at)) || 0))}</span></li>`).join('')}</ul>` : ''}
      <div class="campo contatos-nota-campo"><label for="ct-nota">Nova nota (só a equipe vê)</label>
        <textarea id="ct-nota" rows="2" placeholder="Ex.: prefere ser chamada à tarde."></textarea></div>
      <div><button class="btn peq" data-ct-nota="${c.id}">Salvar nota</button></div>` : '';

    alvo.innerHTML = `
      <div class="contatos-ficha-topo">
        <button class="btn icone fantasma contatos-voltar" data-ct-voltar="1" aria-label="Voltar para a lista">${ico('<path d="m15 18-6-6 6-6"/>')}</button>
        <span class="av xl">${esc(c.ini)}</span>
        <div class="contatos-ficha-nome"><strong>${esc(c.nome)}</strong>
          <span>${c.canais.map(k => `<i class="contatos-ficha-canal">${canalIco(k)}${esc(CANAIS[k]?.nome || '')}</i>`).join('')}${c.marcas.length ? `<i class="contatos-ficha-canal">${c.marcas.map(marcaNome).join(', ')}</i>` : ''}</span></div>
        <button class="btn peq" data-ct-editar="${c.id}">${ico('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>')}Editar</button>
      </div>
      <div class="ctx-bloco"><h3>Dados</h3><dl class="dados">${dados.map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">Não informado</span>'}</dd>`).join('')}</dl></div>
      <div class="ctx-bloco"><h3>Último pedido</h3>${cartaoPedido(c.pedido)}</div>
      <div class="ctx-bloco"><h3>Conversas</h3>${conversas}</div>
      <div class="ctx-bloco"><h3>Etiquetas</h3>${etiquetas}</div>
      <div class="ctx-bloco"><h3>Notas sobre a cliente</h3>${notas || '<p class="muted" style="font-size:13px">Carregando…</p>'}</div>`;
  }

  function abrirContato(id) {
    st.sel = id; st.vista = 'ficha';
    elPagina?.querySelector('.contatos-split')?.setAttribute('data-view', 'ficha');
    desenharLista();
    carregarFicha(id).catch(err => toast(`Não consegui abrir o contato: ${err.message}`));
    elPagina?.querySelector('#ct-ficha')?.scrollTo?.(0, 0);
    if (window.innerWidth <= 980) elPagina?.scrollTo?.(0, 0);
  }

  // ---------- formulários ----------
  function erroAmigavel(msg) {
    const m = String(msg || '');
    if (/e-?mail.*(taken|já|uso|existe)/i.test(m)) return 'Já existe um contato com esse e-mail. Busque por ele na lista.';
    if (/(phone|telefone).*(taken|já|uso|existe)/i.test(m)) return 'Já existe um contato com esse telefone. Busque por ele na lista.';
    if (/e164|(phone|telefone).*(invalid|inválid|formato)/i.test(m)) return 'O telefone precisa ter DDD. Exemplo: (11) 98765-4321.';
    if (/e-?mail.*(invalid|inválid)/i.test(m)) return 'Esse e-mail não parece certo. Confira e tente de novo.';
    if (/name.*blank|nome/i.test(m)) return 'Escreva o nome da cliente.';
    return `Não consegui salvar (${m}). Confira os dados e tente de novo.`;
  }

  function camposContato(c = {}) {
    return `
      <div class="campo"><label for="ct-f-nome">Nome</label><input id="ct-f-nome" autocomplete="off" value="${esc(c.nome && c.nome !== 'Sem nome' ? c.nome : '')}" placeholder="Maria da Silva"></div>
      <div class="campo"><label for="ct-f-fone">Telefone com DDD</label><input id="ct-f-fone" type="tel" autocomplete="off" value="${esc(foneBonito(c.fone))}" placeholder="(11) 98765-4321"></div>
      <div class="campo"><label for="ct-f-email">E-mail</label><input id="ct-f-email" type="email" autocomplete="off" value="${esc(c.email || '')}" placeholder="maria@gmail.com"></div>
      <div class="campo"><label for="ct-f-cidade">Cidade</label><input id="ct-f-cidade" autocomplete="off" value="${esc(c.cidade || '')}" placeholder="Recife, PE"></div>
      <div class="campo"><label for="ct-f-insta">Instagram</label><input id="ct-f-insta" autocomplete="off" value="${esc(c.insta || '')}" placeholder="@maria"></div>`;
  }
  const valor = id => ($(`#${id}`)?.value || '').trim();

  function abrirEditar(id) {
    const c = st.lista.find(x => x.id === id);
    if (!c) return;
    gaveta('Editar contato', camposContato(c),
      `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-ct-salvar="${c.id}">Salvar contato</button>`);
  }

  function abrirNovo() {
    const caixas = Object.entries(INBOX);
    const opcoes = caixas.length
      ? caixas.map(([id, ib]) => `<option value="${id}">${esc(ib.nome)}</option>`).join('')
      : '<option value="">Nenhum canal ligado</option>';
    gaveta('Novo contato', `${camposContato()}
      <div class="campo"><label for="ct-f-caixa">Por onde ela fala com a gente</label><select id="ct-f-caixa">${opcoes}</select>
        <small>É por este canal que a conversa com ela vai começar.</small></div>`,
      '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-ct-criar="1">Criar contato</button>');
  }

  function lerFormulario() {
    const nome = valor('ct-f-nome'), fone = valor('ct-f-fone'), email = valor('ct-f-email');
    if (!nome) return { erro: 'Escreva o nome da cliente.' };
    if (fone && fone.replace(/\D/g, '').length < 10) return { erro: 'O telefone precisa ter DDD. Exemplo: (11) 98765-4321.' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: 'Esse e-mail não parece certo. Confira e tente de novo.' };
    return { nome, fone: foneParaSalvar(fone), email: email || null, cidade: valor('ct-f-cidade'), insta: valor('ct-f-insta').replace(/^@/, '') };
  }
  const mostrarErro = txt => { const e = $('#g-erro'); if (e) e.innerHTML = `<div class="erro">${esc(txt)}</div>`; };

  async function salvar(id, botao) {
    const f = lerFormulario();
    if (f.erro) { mostrarErro(f.erro); return; }
    const c = st.lista.find(x => x.id === id);
    if (!c) return;
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      if (REAL) {
        const aa = c.bruto?.additional_attributes || {};
        const sociais = { ...(aa.social_profiles || {}) };
        if (f.insta) sociais.instagram = f.insta; else delete sociais.instagram;
        const r = await cw(`contacts/${id}`, 'PUT', {
          name: f.nome, phone_number: f.fone, email: f.email,
          additional_attributes: { city: f.cidade || null, social_profiles: sociais },
        });
        const novo = contatoDe(r.payload || r);
        st.lista = st.lista.map(x => x.id === id ? novo : x);
      } else {
        Object.assign(c, { nome: f.nome, ini: iniciais(f.nome), fone: f.fone || '', email: f.email || '', cidade: f.cidade, insta: f.insta ? `@${f.insta}` : '' });
      }
      fecharGaveta();
      toast('Contato salvo.');
      desenharLista(); desenharFicha();
    } catch (err) {
      botao.disabled = false; botao.textContent = 'Salvar contato';
      mostrarErro(erroAmigavel(err.message));
    }
  }

  async function criar(botao) {
    const f = lerFormulario();
    if (f.erro) { mostrarErro(f.erro); return; }
    const caixa = Number(valor('ct-f-caixa')) || null;
    botao.disabled = true; botao.textContent = 'Criando…';
    try {
      let novoId;
      if (REAL) {
        const corpo = { name: f.nome, phone_number: f.fone, email: f.email, additional_attributes: { city: f.cidade || null, ...(f.insta ? { social_profiles: { instagram: f.insta } } : {}) } };
        if (caixa) corpo.inbox_id = caixa;
        const r = await cw('contacts', 'POST', corpo);
        const x = r.payload?.contact || r.payload || r;
        novoId = x.id;
        st.busca = '';
        await carregarLista(false);
        if (!st.lista.some(c => c.id === novoId)) st.lista.unshift(contatoDe(x));
      } else {
        novoId = -(Date.now() % 100000);
        const ib = INBOX[caixa];
        st.demo = st.demo || contatosDemo();
        const novo = { id: novoId, nome: f.nome, ini: iniciais(f.nome), fone: f.fone || '', email: f.email || '', cidade: f.cidade, insta: f.insta ? `@${f.insta}` : '', canais: [ib?.canal || 'whatsapp'], marcas: [ib?.marca || 'rosa'], pedido: null, ultima: Date.now(), demoConvs: [], bruto: {} };
        st.demo.unshift(novo); st.lista.unshift(novo);
      }
      fecharGaveta();
      toast('Contato criado.');
      st.canal = null;
      desenhar();
      abrirContato(novoId);
    } catch (err) {
      botao.disabled = false; botao.textContent = 'Criar contato';
      mostrarErro(erroAmigavel(err.message));
    }
  }

  async function salvarNota(id, botao) {
    const campo = $('#ct-nota');
    const txt = (campo?.value || '').trim();
    if (!txt) { toast('Escreva a nota antes de salvar.'); campo?.focus(); return; }
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      if (REAL) await cw(`contacts/${id}/notes`, 'POST', { content: txt });
      else {
        st.notasDemo = st.notasDemo || {};
        (st.notasDemo[id] = st.notasDemo[id] || []).unshift({ content: txt, user: { name: pessoa(EU).nome }, created_at: Math.floor(Date.now() / 1000) });
      }
      toast('Nota salva.');
      await carregarFicha(id);
    } catch (err) {
      botao.disabled = false; botao.textContent = 'Salvar nota';
      toast(`Não consegui salvar a nota. Tente de novo. (${err.message})`);
    }
  }

  // Abre a conversa (usa a função da Caixa de entrada se ela estiver carregada; senão, faz aqui)
  async function abrirConversa(id) {
    if (typeof window.abrirConversaPorId === 'function') return window.abrirConversaPorId(id);
    let c = estado.convs.find(x => x.id === id);
    if (!c && REAL) {
      try { c = convDe(await cw(`conversations/${id}`)); estado.convs.push(c); }
      catch (err) { toast(`Não consegui abrir essa conversa. (${err.message})`); return; }
    }
    if (!c) return;
    irPara('conversas'); abrir(id);
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ct-abrir],[data-ct-voltar],[data-ct-canal],[data-ct-mais],[data-ct-novo],[data-ct-editar],[data-ct-salvar],[data-ct-criar],[data-ct-conversa],[data-ct-nota],[data-ct-recarregar]');
    if (!el) return;
    const d = el.dataset;
    if (d.ctAbrir) { abrirContato(Number(d.ctAbrir)); return; }
    if (d.ctVoltar) { st.vista = 'lista'; elPagina?.querySelector('.contatos-split')?.setAttribute('data-view', 'lista'); return; }
    if (d.ctCanal !== undefined) { st.canal = d.ctCanal || null; desenharLista(); return; }
    if (d.ctMais) { el.disabled = true; el.textContent = 'Carregando…'; carregarLista(true).then(desenharLista); return; }
    if (d.ctNovo) { abrirNovo(); return; }
    if (d.ctEditar) { abrirEditar(Number(d.ctEditar)); return; }
    if (d.ctSalvar) { salvar(Number(d.ctSalvar), el); return; }
    if (d.ctCriar) { criar(el); return; }
    if (d.ctConversa) { abrirConversa(Number(d.ctConversa)); return; }
    if (d.ctNota) { salvarNota(Number(d.ctNota), el); return; }
    if (d.ctRecarregar) { renderContatos(elPagina); }
  });

  let pausaBusca = null;
  document.addEventListener('input', e => {
    if (e.target.id !== 'ct-busca') return;
    st.busca = e.target.value;
    clearTimeout(pausaBusca);
    pausaBusca = setTimeout(async () => { await carregarLista(false); desenharLista(); }, 350);
  });
  // Enter no formulário da gaveta salva
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.id?.startsWith('ct-f-')) return;
    e.preventDefault();
    $('[data-ct-salvar],[data-ct-criar]')?.click();
  });

  async function renderContatos(el) {
    elPagina = el;
    desenhar();
    await carregarLista(false);
    if (elPagina === el && !el.hidden) { desenharLista(); if (st.sel) carregarFicha(st.sel).catch(() => {}); }
  }

  registrarPagina({
    id: 'contatos', nome: 'Contatos',
    ico: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    niveis: ['dona', 'supervisora', 'atendente'],
    render: el => renderContatos(el),
  });
})();
