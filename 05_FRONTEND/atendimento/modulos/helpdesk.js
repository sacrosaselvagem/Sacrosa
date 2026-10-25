// Helpdesk: quadro de chamados para casos que levam dias (troca, devolução, reembolso, defeito, extravio).
// Os chamados ficam no servidor (06_BACKEND/atendimento/rotas/helpdesk.mjs -> 07_LOGS/atendimento/chamados.json).
// Também deixa window.abrirChamadoDaConversa(conv) para o menu da conversa abrir um chamado já preenchido.
'use strict';
(() => {
  const API = '/api/atendimento/helpdesk/chamados';
  const COLUNAS = [
    { id: 'novo', nome: 'Novo' },
    { id: 'andamento', nome: 'Em andamento' },
    { id: 'esperando', nome: 'Esperando cliente' },
    { id: 'resolvido', nome: 'Resolvido' },
  ];
  const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  // dias úteis de prazo por assunto; os outros assuntos: 5
  const PRAZO_DIAS = { reembolso: 3, devolucao: 3, troca: 3, defeito: 2, 'problema-no-pedido': 2 };
  // assuntos que costumam virar chamado aparecem primeiro na lista
  const DE_CHAMADO = ['troca', 'devolucao', 'reembolso', 'problema-no-pedido', 'frete-e-entrega', 'rastreio', 'cancelamento', 'reclamacao'];
  const ICO = '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>';
  const HD = { el: null, lista: [], carregado: false, offline: false, erro: null, ver: 'todos', assunto: '', busca: '', col: 'novo', menu: null, arrastando: null };

  if (!document.querySelector('link[href$="modulos/helpdesk.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'modulos/helpdesk.css'; document.head.appendChild(l);
  }

  // ---------- datas ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  function somarDiasUteis(dias, de = new Date()) {
    const d = new Date(de.getFullYear(), de.getMonth(), de.getDate());
    let n = 0;
    while (n < dias) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
    return iso(d);
  }
  const prazoPadrao = (assunto, de) => somarDiasUteis(PRAZO_DIAS[assunto] || 5, de);
  const fmtData = v => (v ? v.split('-').reverse().slice(0, 2).join('/') : '');
  const quando = t => `${new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora(t)}`;
  const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
  const atrasado = c => c.status !== 'resolvido' && c.prazo && c.prazo < hoje();
  const venceHoje = c => c.status !== 'resolvido' && c.prazo === hoje();

  function prazoHtml(c) {
    if (c.status === 'resolvido') return `<span class="hd-prazo">Resolvido${c.resolvido_em ? ` em ${fmtData(iso(new Date(c.resolvido_em)))}` : ''}</span>`;
    if (!c.prazo) return '<span class="hd-prazo">Sem prazo</span>';
    if (atrasado(c)) { const d = diasEntre(c.prazo, hoje()); return `<span class="chip alerta">Atrasado ${d} ${d === 1 ? 'dia' : 'dias'}</span>`; }
    if (venceHoje(c)) return '<span class="chip aviso">Vence hoje</span>';
    return `<span class="hd-prazo">Prazo ${fmtData(c.prazo)}</span>`;
  }

  // ---------- dados ----------
  function exemplos() {
    const t = Date.now(), h = (n) => ({ t: t - n * 3600e3, quem: 'Gabriella', txt: 'Abriu o chamado' });
    return [
      { id: 'd1', protocolo: 'RS-0001', titulo: 'Troca: caixa chegou amassada', cliente: 'Lidiane Moura', conversa: 2, assunto: 'troca', prioridade: 'normal', responsavel: EU, responsavel_nome: pessoa(EU).nome, prazo: somarDiasUteis(2), status: 'novo', criado: t - 3600e3, historico: [h(1)], notas: [] },
      { id: 'd2', protocolo: 'RS-0002', titulo: 'Extravio: pedido #48213 fora do prazo', cliente: 'Nathalya Souza', conversa: 1, assunto: 'problema-no-pedido', prioridade: 'alta', responsavel: EU, responsavel_nome: pessoa(EU).nome, prazo: iso(new Date(t - 2 * 864e5)), status: 'andamento', criado: t - 5 * 864e5, historico: [h(120)], notas: [{ t: t - 100 * 3600e3, quem: 'Gabriella', txt: 'Reclamação aberta com a transportadora.' }] },
      { id: 'd3', protocolo: 'RS-0003', titulo: 'Reembolso do cancelamento', cliente: 'Renata Lins', conversa: 8, assunto: 'reembolso', prioridade: 'normal', responsavel: null, responsavel_nome: '', prazo: hoje(), status: 'esperando', criado: t - 3 * 864e5, historico: [h(72)], notas: [] },
    ];
  }

  async function carregar(redesenhar = true) {
    try {
      HD.lista = await chamar(API);
      HD.offline = false; HD.erro = null;
    } catch (err) {
      if (!REAL) { if (!HD.offline) HD.lista = exemplos(); HD.offline = true; }
      else HD.erro = err.message;
    }
    HD.carregado = true;
    if (typeof MENU_PRONTO !== 'undefined' && MENU_PRONTO) renderMenuLateral();
    if (redesenhar) desenhar();
  }

  async function gravar(id, corpo) {
    if (HD.offline) {
      const c = HD.lista.find(x => x.id === id);
      Object.assign(c, corpo);
      if (corpo.nota) { c.notas.push({ t: Date.now(), quem: pessoa(EU).nome, txt: corpo.nota }); delete c.nota; }
      if ('status' in corpo) c.resolvido_em = corpo.status === 'resolvido' ? Date.now() : null;
      c.historico.push({ t: Date.now(), quem: pessoa(EU).nome, txt: 'Mudou o chamado' });
      return c;
    }
    const novo = await chamar(`${API}/${encodeURIComponent(id)}`, 'PATCH', corpo);
    const i = HD.lista.findIndex(x => x.id === id);
    if (i >= 0) HD.lista[i] = novo;
    return novo;
  }

  // ---------- quadro ----------
  function visiveis() {
    const q = HD.busca.trim().toLowerCase();
    return HD.lista
      .filter(c => HD.ver === 'todos' || c.responsavel === EU)
      .filter(c => !HD.assunto || c.assunto === HD.assunto)
      .filter(c => !q || [c.protocolo, c.titulo, c.cliente].some(s => String(s || '').toLowerCase().includes(q)));
  }

  function ordenar(a, b) {
    const peso = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
    if (a.status === 'resolvido') return (b.resolvido_em || b.atualizado || 0) - (a.resolvido_em || a.atualizado || 0);
    return (atrasado(b) - atrasado(a)) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')) || (peso[a.prioridade] - peso[b.prioridade]);
  }

  function cartao(c) {
    const pri = c.prioridade === 'urgente' ? '<span class="chip alerta">Urgente</span>' : c.prioridade === 'alta' ? '<span class="chip aviso">Alta</span>' : '';
    const menu = HD.menu === c.id ? `<div class="menu hd-menu" role="menu"><div class="titulo">Mover para</div>${COLUNAS.filter(k => k.id !== c.status)
      .map(k => `<button role="menuitem" data-hd-para="${k.id}" data-hd-ch="${esc(c.id)}">${esc(k.nome)}</button>`).join('')}</div>` : '';
    return `<div class="hd-card${atrasado(c) ? ' atrasado' : ''}" draggable="true" tabindex="0" data-hd-abrir="${esc(c.id)}" aria-label="Chamado ${esc(c.protocolo)}: ${esc(c.titulo)}">
      <div class="hd-card-top"><span class="hd-proto">${esc(c.protocolo)}</span>${pri}
        <button class="btn fantasma peq hd-mover" data-hd-mover="${esc(c.id)}" aria-haspopup="menu" aria-expanded="${HD.menu === c.id}" title="Mover para outra coluna">Mover</button></div>
      <div class="hd-titulo">${esc(c.titulo)}</div>
      ${c.cliente ? `<div class="hd-cli">${esc(c.cliente)}</div>` : ''}
      <div class="hd-card-pe"><span class="chip">${esc(nomeAssunto(c.assunto || 'outro'))}</span>${prazoHtml(c)}
        ${c.responsavel ? avatar(c.responsavel, 'sm') : ''}</div>
      ${menu}</div>`;
  }

  function desenhar() {
    const el = HD.el;
    if (!el || estado.pagina !== 'helpdesk') return;
    const lista = visiveis();
    const abertos = HD.lista.filter(c => c.status !== 'resolvido');
    const num = (rot, n) => `<div class="num-card"><span>${rot}</span><strong>${n}</strong></div>`;
    const topo = cabecalho('Helpdesk', 'Casos que levam dias: troca, devolução, reembolso, defeito e extravio. Cada chamado tem protocolo, prazo e histórico.',
      '<div class="hd-acao"><button class="btn prim" data-hd="novo">' + ico('<path d="M12 5v14M5 12h14"/>') + 'Abrir chamado</button></div>');
    if (!HD.carregado) { el.innerHTML = `<div class="pag-in hd-in">${topo}<p class="muted">Carregando os chamados…</p></div>`; return; }
    if (HD.erro) {
      el.innerHTML = `<div class="pag-in hd-in">${topo}<div class="erro">Não consegui carregar os chamados: ${esc(HD.erro)}. Tente de novo em alguns segundos.</div>
        <p style="margin-top:12px"><button class="btn" data-hd="recarregar">Tentar de novo</button></p></div>`;
      return;
    }
    const assuntos = [...DE_CHAMADO, ...ASSUNTOS.map(a => a.id).filter(id => !DE_CHAMADO.includes(id))];
    const cols = COLUNAS.map(k => {
      const itens = lista.filter(c => c.status === k.id).sort(ordenar);
      return `<section class="hd-col${HD.col === k.id ? ' movel-on' : ''}" data-hd-col="${k.id}" aria-label="${k.nome}">
        <div class="hd-col-head">${k.nome}<span class="n">${itens.length}</span></div>
        ${itens.length ? itens.map(cartao).join('') : `<div class="hd-col-vazia">${k.id !== 'novo' ? 'Nada aqui.' : HD.lista.length ? 'Nenhum chamado novo.' : 'Nenhum chamado ainda. Abra um quando o caso for levar mais de um dia.'}</div>`}
      </section>`;
    }).join('');
    el.innerHTML = `<div class="pag-in hd-in">${topo}
      ${HD.offline ? '<div class="nota-box" style="margin-bottom:16px">Isto é um exemplo. Com o serviço de atendimento ligado, os chamados ficam salvos de verdade.</div>' : ''}
      <div class="resumo-num">${num('Abertos', abertos.length)}${num('Atrasados', abertos.filter(atrasado).length)}${num('Vencem hoje', abertos.filter(venceHoje).length)}${num('Resolvidos', HD.lista.length - abertos.length)}</div>
      <div class="hd-ferramentas">
        <div class="hd-seg" role="group" aria-label="Mostrar">${[['meus', 'Meus'], ['todos', 'Todos']].map(([k, v]) => `<button data-hd-ver="${k}" class="${HD.ver === k ? 'on' : ''}" aria-pressed="${HD.ver === k}">${v}</button>`).join('')}</div>
        <select id="hd-f-assunto" aria-label="Assunto"><option value="">Todos os assuntos</option>${assuntos.map(id => `<option value="${id}"${HD.assunto === id ? ' selected' : ''}>${esc(nomeAssunto(id))}</option>`).join('')}</select>
        <input class="hd-busca" id="hd-busca" type="search" placeholder="Buscar chamado" value="${esc(HD.busca)}" aria-label="Buscar chamado">
      </div>
      <div class="hd-tabs" role="tablist">${COLUNAS.map(k => `<button role="tab" data-hd-tab="${k.id}" class="${HD.col === k.id ? 'on' : ''}" aria-selected="${HD.col === k.id}">${k.nome} ${lista.filter(c => c.status === k.id).length}</button>`).join('')}</div>
      <div class="hd-quadro">${cols}</div>
    </div>`;
  }

  async function mover(id, status) {
    const c = HD.lista.find(x => x.id === id);
    HD.menu = null;
    if (!c || c.status === status) { desenhar(); return; }
    const antes = c.status;
    c.status = status; desenhar();
    try {
      await gravar(id, { status });
      toast(`${c.protocolo} foi para "${COLUNAS.find(k => k.id === status).nome}".`);
    } catch (err) { c.status = antes; toast(`Não deu para mover: ${err.message}`); }
    renderMenuLateral(); desenhar();
  }

  // ---------- gaveta: abrir e ver chamado ----------
  const opcoesAssunto = sel => [...DE_CHAMADO, ...ASSUNTOS.map(a => a.id).filter(id => !DE_CHAMADO.includes(id))]
    .map(id => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(nomeAssunto(id))}</option>`).join('');
  const opcoesPrioridade = sel => Object.entries(PRIORIDADES).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('');
  const opcoesPessoa = sel => `<option value="">Ninguém ainda</option>${Object.entries(EQUIPE).map(([id, p]) => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(id === EU ? `${p.nome} (você)` : p.nome)}</option>`).join('')}`;
  function opcoesConversa(sel) {
    const convs = [...estado.convs].sort((a, b) => (a.resolvida - b.resolvida) || a.cliente.localeCompare(b.cliente));
    const extra = sel && !convs.some(c => c.id === sel) ? `<option value="${sel}" selected>Conversa ${sel}</option>` : '';
    return `<option value="">Nenhuma conversa</option>${extra}${convs.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.cliente)} · conversa ${c.id}${c.resolvida ? ' (resolvida)' : ''}</option>`).join('')}`;
  }
  const assuntoDaConversa = c => (c?.etiquetas || []).find(t => DE_CHAMADO.includes(t)) || (c?.etiquetas || [])[0] || 'outro';

  function camposForm(v) {
    return `
      <div class="campo"><label for="hd-conv">Conversa ligada</label>
        <div class="hd-conv"><select id="hd-conv">${opcoesConversa(v.conversa)}</select>
        <button class="btn peq" data-hd="abrir-conv"${v.conversa ? '' : ' hidden'}>Abrir conversa</button></div></div>
      <div class="campo"><label for="hd-titulo">Título</label><input id="hd-titulo" maxlength="140" value="${esc(v.titulo || '')}" placeholder="Ex.: Troca do Óleo Clareador, caixa amassada"></div>
      <div class="campo"><label for="hd-cliente">Cliente</label><input id="hd-cliente" maxlength="120" value="${esc(v.cliente || '')}" placeholder="Nome da cliente"></div>
      <div class="hd-grade2">
        <div class="campo"><label for="hd-assunto">Assunto</label><select id="hd-assunto">${opcoesAssunto(v.assunto)}</select></div>
        <div class="campo"><label for="hd-prioridade">Prioridade</label><select id="hd-prioridade">${opcoesPrioridade(v.prioridade)}</select></div>
        <div class="campo"><label for="hd-resp">Responsável</label><select id="hd-resp">${opcoesPessoa(v.responsavel)}</select></div>
        <div class="campo"><label for="hd-prazo">Prazo</label><input id="hd-prazo" type="date" value="${esc(v.prazo || '')}"><small>Muda sozinho com o assunto. Você pode trocar.</small></div>
      </div>`;
  }

  // dados já preenchidos a partir de uma conversa
  function deConversa(c) {
    const assunto = assuntoDaConversa(c);
    return { conversa: c.id, cliente: c.cliente, assunto, titulo: `${nomeAssunto(assunto)}: ${c.cliente}`, nota: c.resumo || '' };
  }

  let FORM = null; // { id?, criadoEm, prazoManual }

  function abrirCriar(pre = {}) {
    const v = { prioridade: 'normal', responsavel: EU, assunto: 'troca', ...pre };
    v.prazo = v.prazo || prazoPadrao(v.assunto);
    FORM = { id: null, criadoEm: new Date(), prazoManual: false };
    gaveta('Abrir chamado', `
      <p class="muted" style="font-size:13px;margin-top:-4px">Use para o caso que leva mais de um dia. O chamado ganha um protocolo para passar à cliente.</p>
      ${camposForm(v)}
      <div class="campo"><label for="hd-nota">Nota para a equipe <span class="muted" style="font-weight:400">(opcional)</span></label>
        <textarea id="hd-nota" class="hd-textarea" maxlength="2000" placeholder="O que já foi feito, o que falta, número do pedido…">${esc(v.nota || '')}</textarea></div>`,
      '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-hd="criar">Abrir chamado</button>');
  }

  function abrirChamado(id) {
    const c = HD.lista.find(x => x.id === id);
    if (!c) { toast('Este chamado não existe mais.'); return; }
    HD.menu = null;
    FORM = { id, criadoEm: new Date(c.criado || Date.now()), prazoManual: false };
    const notas = c.notas?.length ? `<ul class="hd-notas">${[...c.notas].reverse().map(n => `<li>${esc(n.txt)}<small>${esc(n.quem)}, ${quando(n.t)}</small></li>`).join('')}</ul>` : '';
    const hist = `<ul class="hd-hist">${[...(c.historico || [])].reverse().map(h => `<li>${esc(h.txt)}<small>${esc(h.quem)}, ${quando(h.t)}</small></li>`).join('')}</ul>`;
    gaveta(`Chamado ${esc(c.protocolo)}`, `
      <div class="hd-faixa">${prazoHtml(c)}<span>Aberto por ${esc(c.criado_por || 'alguém da equipe')} em ${quando(c.criado || Date.now())}</span></div>
      <div class="campo"><label for="hd-status">Situação</label><select id="hd-status">${COLUNAS.map(k => `<option value="${k.id}"${k.id === c.status ? ' selected' : ''}>${k.nome}</option>`).join('')}</select></div>
      ${camposForm(c)}
      <div class="campo"><label for="hd-nota">Notas</label>${notas}
        <textarea id="hd-nota" class="hd-textarea" maxlength="2000" placeholder="Escreva uma nota nova para a equipe"></textarea></div>
      <div class="campo"><label>Histórico</label>${hist}</div>`,
      `<button class="btn fantasma" data-fechar="1">Fechar</button><button class="btn prim" data-hd="salvar">Salvar mudanças</button>`);
  }

  function lerForm() {
    const resp = $('#hd-resp').value || null;
    return {
      titulo: $('#hd-titulo').value.trim(), cliente: $('#hd-cliente').value.trim(),
      conversa: Number($('#hd-conv').value) || null, assunto: $('#hd-assunto').value, prioridade: $('#hd-prioridade').value,
      responsavel: resp, responsavel_nome: resp ? pessoa(resp).nome : '', prazo: $('#hd-prazo').value || null,
    };
  }
  const erroForm = msg => { $('#g-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`; };

  async function criar(botao) {
    const v = lerForm(), nota = $('#hd-nota').value.trim();
    if (!v.titulo) { erroForm('Escreva um título curto para o chamado.'); $('#hd-titulo').focus(); return; }
    botao.disabled = true; botao.textContent = 'Abrindo…';
    try {
      let novo;
      if (HD.offline) {
        const n = HD.lista.reduce((a, c) => Math.max(a, Number(c.protocolo.replace(/\D/g, ''))), 0) + 1;
        novo = { id: `d${Date.now()}`, protocolo: `RS-${String(n).padStart(4, '0')}`, ...v, status: 'novo', criado: Date.now(), criado_por: pessoa(EU).nome,
          historico: [{ t: Date.now(), quem: pessoa(EU).nome, txt: 'Abriu o chamado' }], notas: nota ? [{ t: Date.now(), quem: pessoa(EU).nome, txt: nota }] : [] };
      } else novo = await chamar(API, 'POST', { ...v, nota });
      HD.lista.push(novo);
      fecharGaveta();
      toast(`Chamado ${novo.protocolo} aberto.`);
      renderMenuLateral(); desenhar();
    } catch (err) { botao.disabled = false; botao.textContent = 'Abrir chamado'; erroForm(`Não abriu: ${err.message}`); }
  }

  async function salvar(botao) {
    const c = HD.lista.find(x => x.id === FORM?.id);
    if (!c) { fecharGaveta(); return; }
    const v = { ...lerForm(), status: $('#hd-status').value }, nota = $('#hd-nota').value.trim();
    if (!v.titulo) { erroForm('O título não pode ficar vazio.'); $('#hd-titulo').focus(); return; }
    const mud = {};
    for (const k of ['titulo', 'cliente', 'conversa', 'assunto', 'prioridade', 'responsavel', 'prazo', 'status']) if ((c[k] ?? null) !== (v[k] ?? null)) mud[k] = v[k];
    if ('responsavel' in mud) mud.responsavel_nome = v.responsavel_nome;
    if (nota) mud.nota = nota;
    if (!Object.keys(mud).length) { fecharGaveta(); return; }
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      await gravar(c.id, mud);
      fecharGaveta(); toast(`Chamado ${c.protocolo} salvo.`);
      renderMenuLateral(); desenhar();
    } catch (err) { botao.disabled = false; botao.textContent = 'Salvar mudanças'; erroForm(`Não salvou: ${err.message}`); }
  }

  function abrirConversa() {
    const id = Number($('#hd-conv')?.value);
    if (!id) return;
    fecharGaveta();
    if (!estado.convs.some(c => c.id === id)) toast('Essa conversa não está na lista agora. Ela pode estar resolvida há mais de um dia.');
    irPara('conversas'); abrir(id);
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    if (HD.menu && !e.target.closest('[data-hd-mover],.hd-menu')) { HD.menu = null; desenhar(); }
    const el = e.target.closest('[data-hd],[data-hd-ver],[data-hd-tab],[data-hd-mover],[data-hd-para],[data-hd-abrir]');
    if (!el) return;
    const d = el.dataset;
    if (d.hdPara) { mover(d.hdCh, d.hdPara); return; }
    if (d.hdMover) { e.stopPropagation(); HD.menu = HD.menu === d.hdMover ? null : d.hdMover; desenhar(); return; }
    if (d.hdVer) { HD.ver = d.hdVer; desenhar(); return; }
    if (d.hdTab) { HD.col = d.hdTab; desenhar(); return; }
    if (d.hdAbrir) { abrirChamado(d.hdAbrir); return; }
    switch (d.hd) {
      case 'novo': abrirCriar(); break;
      case 'criar': criar(el); break;
      case 'salvar': salvar(el); break;
      case 'abrir-conv': abrirConversa(); break;
      case 'recarregar': HD.erro = null; HD.carregado = false; desenhar(); carregar(); break;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset?.hdAbrir) { e.preventDefault(); abrirChamado(e.target.dataset.hdAbrir); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'hd-f-assunto') { HD.assunto = t.value; desenhar(); return; }
    if (t.id === 'hd-prazo') { if (FORM) FORM.prazoManual = true; return; }
    if (t.id === 'hd-assunto' && FORM && !FORM.prazoManual) { $('#hd-prazo').value = prazoPadrao(t.value, FORM.criadoEm); return; }
    if (t.id === 'hd-conv') {
      const id = Number(t.value);
      document.querySelector('[data-hd="abrir-conv"]').hidden = !id;
      const c = estado.convs.find(x => x.id === id);
      if (!c || FORM?.id) return; // num chamado já aberto, trocar a conversa não mexe no resto
      const p = deConversa(c);
      if (!$('#hd-cliente').value.trim()) $('#hd-cliente').value = p.cliente;
      if (!$('#hd-titulo').value.trim()) $('#hd-titulo').value = p.titulo;
      $('#hd-assunto').value = p.assunto;
      if (!FORM.prazoManual) $('#hd-prazo').value = prazoPadrao(p.assunto, FORM.criadoEm);
      if (!$('#hd-nota').value.trim() && p.nota) $('#hd-nota').value = p.nota;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'hd-busca') return;
    HD.busca = e.target.value;
    const pos = e.target.selectionStart;
    desenhar();
    const b = $('#hd-busca'); if (b) { b.focus(); b.setSelectionRange(pos, pos); }
  });

  // arrastar e soltar (computador)
  document.addEventListener('dragstart', e => {
    const card = e.target.closest?.('.hd-card');
    if (!card) return;
    HD.arrastando = card.dataset.hdAbrir;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', HD.arrastando);
    card.classList.add('arrastando');
  });
  document.addEventListener('dragend', () => {
    HD.arrastando = null;
    document.querySelectorAll('.hd-card.arrastando, .hd-col.alvo').forEach(x => x.classList.remove('arrastando', 'alvo'));
  });
  document.addEventListener('dragover', e => {
    const col = HD.arrastando && e.target.closest?.('.hd-col');
    if (!col) return;
    e.preventDefault();
    document.querySelectorAll('.hd-col.alvo').forEach(x => x !== col && x.classList.remove('alvo'));
    col.classList.add('alvo');
  });
  document.addEventListener('drop', e => {
    const col = HD.arrastando && e.target.closest?.('.hd-col');
    if (!col) return;
    e.preventDefault();
    const id = HD.arrastando;
    HD.arrastando = null;
    mover(id, col.dataset.hdCol);
  });

  // chamado aberto a partir da conversa (menu de três pontos na conversa)
  window.abrirChamadoDaConversa = c => {
    if (!c) { abrirCriar(); return; }
    const p = deConversa(c);
    abrirCriar({ ...p, prazo: prazoPadrao(p.assunto) });
  };

  registrarPagina({
    id: 'helpdesk', nome: 'Helpdesk', ico: ICO,
    contador: () => HD.lista.filter(atrasado).length, contadorAlerta: true,
    render(el) { HD.el = el; desenhar(); carregar(); },
  });

  carregar(false);
  setInterval(() => { if (!$('#gaveta').innerHTML && !HD.arrastando && !HD.menu) carregar(estado.pagina === 'helpdesk'); }, 60000);
})();
