// Comentários do Instagram e do Facebook: Feed, Reels, Patrocinados, Menções e Moderação.
// Os comentários não vêm do Chatwoot: vêm da Meta pelo servidor (06_BACKEND/atendimento/rotas/comentarios.mjs).
// Sem a Meta conectada, o servidor devolve { conectado: false } e listas vazias: a seção mostra só um convite
// para a dona conectar em Configurações > Integrações (integracoes.js). Não existe exemplo.
// Contrato da seção: 09_DOCUMENTATION/atendimento-modulos.md. Tudo fica dentro da função para não colidir.
'use strict';
(() => {
  if (!document.querySelector('link[href$="modulos/comentarios.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'modulos/comentarios.css'; document.head.appendChild(l);
  }

  const API = '/api/atendimento/comentarios';
  const TIPOS = ['feed', 'reels', 'patrocinados', 'mencoes'];
  const I = {
    menu: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    feed: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m4 15 4.5-4.5 4 4 2.5-2.5L20 17"/><circle cx="15.5" cy="8.5" r="1.3"/>',
    reels: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 8.5h16M9 4l2.5 4.5M14 4l2.5 4.5"/><path d="m10.5 12 4 2.25-4 2.25z"/>',
    patrocinados: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    mencoes: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',
    moderacao: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    responder: '<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5V19"/>',
    ia: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>',
    ocultar: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.8-1.2 2.3-2.7 3.6M6.4 7.4C4.6 8.7 3.4 10.6 3 12c.5 1.5 4 6 9 6 1.6 0 3-.4 4.2-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    mostrar: '<path d="M3 12c.5-1.5 4-6 9-6s8.5 4.5 9 6c-.5 1.5-4 6-9 6s-8.5-4.5-9-6z"/><circle cx="12" cy="12" r="3"/>',
    curtir: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    atualizar: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3.5h3.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5M20 20v-3.5h-3.5"/>',
    abrir: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    aviso: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 15.8v.2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6" fill="currentColor"/>',
    facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z"/>',
    foto: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 15 5-5 4 4 2.5-2.5 5.5 5.5"/>',
  };
  const PAGINAS = {
    feed: { titulo: 'Comentários do feed', desc: 'Comentários nos posts do Instagram e da página do Facebook.' },
    reels: { titulo: 'Comentários dos Reels', desc: 'Comentários nos vídeos curtos do Instagram e do Facebook.' },
    patrocinados: { titulo: 'Comentários dos anúncios', desc: 'Comentários nos posts que estão sendo anunciados. Muita gente pergunta aqui antes de comprar: responda rápido.' },
    mencoes: { titulo: 'Menções', desc: 'Posts de outras pessoas que marcaram a Rosa Selvagem. A sua resposta vira um comentário no post delas.' },
    moderacao: { titulo: 'Moderação', desc: 'Regras para esconder comentários ruins e responder sozinha as perguntas simples.' },
  };
  const ONDE = { feed: 'no feed', reels: 'nos Reels', patrocinados: 'num anúncio', mencoes: 'numa menção' };

  const st = {
    estado: null,          // { conectado, redes, contadores, total, erros, moderacao }
    estadoErro: '',
    posts: {},             // tipo -> { posts, erros, t }
    carregando: {}, erro: {},
    filtro: 'sem',         // 'sem' (sem resposta) | 'todos'
    caixa: null,           // id do comentário com a caixa de resposta aberta
    rascunho: {},          // id -> texto
    sug: {},               // id -> { carregando, resposta, levar_para_direct, observacao, barrado, classe, erro }
    ocupado: {},           // id -> true enquanto uma ação está indo
    recentes: new Set(),   // respondidos/ocultos agora: continuam na tela em "Sem resposta" até trocar de filtro
    mod: null, modErro: '', modCarregando: false,
  };
  let elPag = null, subAtual = 'feed';
  const ligado = () => st.estado?.conectado === true;

  // ---------- servidor ----------
  async function carregarEstado() {
    const antes = ligado(), tinha = !!st.estado;
    try {
      st.estado = await chamar(`${API}/estado`); st.estadoErro = '';
      if (typeof MENU_PRONTO !== 'undefined' && MENU_PRONTO) renderMenuLateral();
    } catch (e) { st.estadoErro = e.message; /* sem o serviço: o número fica zerado */ }
    // conectou ou desconectou: limpa e abre a página de novo (busca os posts); primeira resposta: só redesenha
    const aberta = elPag && !elPag.hidden && location.hash.startsWith('#/comentarios');
    if (antes !== ligado()) { st.posts = {}; st.mod = null; if (aberta) render(elPag, subAtual); }
    else if (!tinha && aberta) desenhar();
  }
  async function carregarPosts(tipo, atualizar) {
    st.carregando[tipo] = true; st.erro[tipo] = '';
    if (elPag && subAtual === tipo) desenhar();
    try {
      const r = await chamar(`${API}/posts?tipo=${tipo}${atualizar ? '&atualizar=1' : ''}`);
      st.posts[tipo] = { ...r, t: Date.now() };
    } catch (e) { st.erro[tipo] = e.message; }
    st.carregando[tipo] = false;
    if (elPag && subAtual === tipo && !elPag.hidden) desenhar();
  }
  async function carregarMod() {
    st.modCarregando = true; st.modErro = '';
    try { st.mod = await chamar(`${API}/moderacao`); } catch (e) { st.modErro = e.message; }
    st.modCarregando = false;
    if (elPag && subAtual === 'moderacao' && !elPag.hidden) desenhar();
  }

  // ---------- utilidades ----------
  const quando = t => { const d = desde(t); return d === 'agora' ? 'agora' : `há ${d}`; };
  const dataCurta = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const arroba = c => c.rede === 'instagram' ? `@${String(c.autor).replace(/^@/, '')}` : c.autor;
  const nomeRede = r => r === 'facebook' ? 'Facebook' : 'Instagram';
  const pendente = c => !c.oculto && !c.respondido;
  function acharComentario(id) {
    for (const t of TIPOS) for (const p of st.posts[t]?.posts || []) for (const c of p.comentarios) if (c.id === id) return { c, p, tipo: t };
    return null;
  }
  // o mesmo comentário pode aparecer em mais de um tipo (um post anunciado também está no feed)
  function emTodos(id, fn) { for (const t of TIPOS) for (const p of st.posts[t]?.posts || []) for (const c of p.comentarios) if (c.id === id) fn(c); }

  // ---------- desenho ----------
  function htmlConectar() {
    const pode = typeof podeVer === 'function' && podeVer('integracoes');
    return `<section class="comentarios-conectar" aria-labelledby="cm-conectar-t">
      <span class="card-ico" aria-hidden="true">${ico(I.menu)}</span>
      <h2 id="cm-conectar-t">O Instagram e o Facebook ainda não estão conectados</h2>
      <p>Depois de conectar, os comentários chegam aqui e a equipe responde sem sair do Atendimento.</p>
      <ul class="comentarios-conectar-lista">
        <li>${ico(I.feed)}<span>Comentários dos posts, dos Reels e dos anúncios.</span></li>
        <li>${ico(I.mencoes)}<span>Posts de clientes que marcaram a Rosa Selvagem.</span></li>
        <li>${ico(I.ia)}<span>Sugestão de resposta da IA, com os preços certos do catálogo.</span></li>
        <li>${ico(I.moderacao)}<span>Xingamento e propaganda somem sozinhos.</span></li>
      </ul>
      ${pode ? '<button class="btn prim" data-cm="integracoes">Conectar Instagram e Facebook</button>'
        : '<div class="nota-box">Peça para a dona conectar em Configurações &gt; Integrações.</div>'}
    </section>`;
  }

  function desenhar() {
    if (!elPag) return;
    const pg = PAGINAS[subAtual];
    if (!ligado()) {
      const corpo = st.estado ? htmlConectar()
        : st.estadoErro ? `<div class="erro">Não consegui ver se o Instagram e o Facebook estão conectados: ${esc(st.estadoErro)}. <button class="btn peq" data-cm="estado">Tentar de novo</button></div>`
        : '<div class="vazio" aria-busy="true"><span class="comentarios-roda" aria-hidden="true"></span>Carregando…</div>';
      elPag.innerHTML = `<div class="pag-in comentarios">${cabecalho(pg.titulo, pg.desc)}${corpo}</div>`;
      return;
    }
    const acoes = subAtual === 'moderacao' ? '' : `<button class="btn icone fantasma" data-cm="atualizar" aria-label="Buscar comentários novos" title="Buscar comentários novos">${ico(I.atualizar)}</button>`;
    // o que está sendo digitado já fica em st.rascunho (evento "input"), então pode redesenhar à vontade
    const rolagem = elPag.scrollTop;
    elPag.innerHTML = `<div class="pag-in comentarios">${cabecalho(pg.titulo, pg.desc, acoes)}${subAtual === 'moderacao' ? htmlModeracao() : htmlPosts(subAtual)}</div>`;
    elPag.scrollTop = rolagem;
    const novo = elPag.querySelector('.comentarios-caixa textarea');
    if (novo && document.activeElement !== novo && st.focar) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); st.focar = false; }
  }

  function htmlPosts(tipo) {
    const d = st.posts[tipo];
    if (!d && st.erro[tipo]) return `<div class="erro">Não consegui carregar os comentários: ${esc(st.erro[tipo])}. <button class="btn peq" data-cm="atualizar">Tentar de novo</button></div>`;
    if (!d) return `<div class="vazio" aria-busy="true"><span class="comentarios-roda" aria-hidden="true"></span>Carregando os comentários…</div>`;
    const todos = d.posts || [];
    const nSem = todos.reduce((n, p) => n + p.comentarios.filter(pendente).length, 0);
    const nTodos = todos.reduce((n, p) => n + p.comentarios.length, 0);
    const visivel = c => st.filtro === 'todos' || pendente(c) || st.recentes.has(c.id);
    const lista = todos.map(p => ({ p, cs: p.comentarios.filter(visivel) })).filter(x => x.cs.length);

    const filtro = `<div class="comentarios-barra">
      <div class="comentarios-filtro" role="group" aria-label="Quais comentários mostrar">
        <button data-cm="filtro" data-v="sem" aria-pressed="${st.filtro === 'sem'}" class="${st.filtro === 'sem' ? 'on' : ''}">Sem resposta <span>${nSem}</span></button>
        <button data-cm="filtro" data-v="todos" aria-pressed="${st.filtro === 'todos'}" class="${st.filtro === 'todos' ? 'on' : ''}">Todos <span>${nTodos}</span></button>
      </div>
      ${st.carregando[tipo] ? '<span class="comentarios-busca muted"><span class="comentarios-roda" aria-hidden="true"></span>Buscando novos…</span>' : ''}
    </div>`;
    const erros = [...(d.erros || []), ...(st.erro[tipo] ? [st.erro[tipo]] : [])];
    const faixaErro = erros.length ? `<div class="erro comentarios-erro">Parte dos comentários não veio: ${esc(erros.join(' · '))}</div>` : '';

    let corpo;
    if (!todos.length) {
      corpo = `<div class="vazio">${ico(I[tipo])}<strong>${tipo === 'mencoes' ? 'Ninguém marcou a marca ainda.' : tipo === 'patrocinados' ? 'Nenhum anúncio no ar agora.' : 'Nenhum post por aqui ainda.'}</strong>
        ${tipo === 'mencoes' ? 'Quando alguém marcar a Rosa Selvagem num post, ele aparece aqui.' : 'Os comentários aparecem aqui assim que alguém comentar.'}</div>`;
    } else if (!lista.length) {
      corpo = `<div class="vazio">${ico('<path d="m5 12 4 4 10-10"/>')}<strong>Tudo respondido por aqui.</strong>Os comentários novos aparecem sozinhos.
        <button class="btn peq" data-cm="filtro" data-v="todos" style="margin-top:8px">Ver todos os comentários</button></div>`;
    } else corpo = lista.map(({ p, cs }) => htmlPost(p, cs, tipo)).join('');
    return filtro + faixaErro + corpo;
  }

  function htmlPost(p, cs, tipo) {
    const nSem = p.comentarios.filter(pendente).length;
    const thumb = p.thumb
      ? `<img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'comentarios-sem-foto'}))">`
      : '<span class="comentarios-sem-foto"></span>';
    const quem = p.autor_post ? `<span><b>${esc(p.rede === 'instagram' ? `@${p.autor_post}` : p.autor_post)}</b> marcou a marca</span>` : '';
    return `<article class="comentarios-post" aria-label="Post de ${esc(dataCurta(p.data))}">
      <header class="comentarios-post-top">
        <div class="comentarios-thumb">${thumb}</div>
        <div class="comentarios-post-info">
          <div class="comentarios-meta">
            <span class="comentarios-rede">${ico(I[p.rede])}${nomeRede(p.rede)}</span>
            <span>${esc(p.formato || 'Post')}</span><span>${esc(dataCurta(p.data))}</span>${quem}
            ${p.anuncio ? `<span class="chip">${esc(p.anuncio)}</span>` : ''}
          </div>
          <p class="comentarios-legenda">${esc(p.legenda || '(sem legenda)')}</p>
        </div>
        <div class="comentarios-post-lado">
          ${nSem ? `<span class="chip aviso">${nSem} sem resposta</span>` : `<span class="chip">Em dia</span>`}
          ${p.link ? `<a class="btn peq fantasma" href="${esc(p.link)}" target="_blank" rel="noopener" title="Abrir o post no ${nomeRede(p.rede)}">${ico(I.abrir)}<span class="comentarios-some">Ver post</span></a>` : ''}
        </div>
      </header>
      <ul class="comentarios-lista">${cs.map(c => htmlComentario(c, p, tipo)).join('')}</ul>
    </article>`;
  }

  function htmlComentario(c, p, tipo) {
    const ocupado = st.ocupado[c.id];
    const chips = [
      c.oculto ? '<span class="chip">Oculto</span>' : '',
      c.respondido ? '<span class="chip comentarios-ok">Respondido</span>' : '',
      c.mencao ? '<span class="chip">Menção</span>' : '',
    ].join('');
    const respostas = (c.respostas || []).map(r => `<div class="comentarios-resp${r.da_marca ? ' marca' : ''}">
        <span class="av sm${r.da_marca ? ' comentarios-av-marca' : ''}" aria-hidden="true">${r.da_marca ? 'RS' : esc(iniciais(r.autor))}</span>
        <div><div class="comentarios-quem"><strong>${r.da_marca ? 'Rosa Selvagem' : esc(c.rede === 'instagram' ? `@${r.autor}` : r.autor)}</strong>
          ${r.auto ? '<span class="chip">Resposta automática</span>' : ''}<span class="muted">${quando(r.data)}</span></div>
          <p>${esc(r.texto)}</p></div></div>`).join('');
    const acoes = `<div class="comentarios-acoes">
        <button class="btn peq fantasma" data-cm="responder" data-cid="${esc(c.id)}" ${ocupado ? 'disabled' : ''}>${ico(I.responder)}Responder</button>
        ${c.oculto ? '' : `<button class="btn peq fantasma" data-cm="sugerir" data-cid="${esc(c.id)}" ${ocupado || st.sug[c.id]?.carregando ? 'disabled' : ''}>${ico(I.ia)}Sugestão da IA</button>`}
        ${c.pode_ocultar ? `<button class="btn peq fantasma" data-cm="ocultar" data-cid="${esc(c.id)}" ${ocupado ? 'disabled' : ''} title="${c.oculto ? 'Todo mundo volta a ver este comentário' : 'Some para o público. Só quem escreveu e os amigos dela continuam vendo.'}">${ico(c.oculto ? I.mostrar : I.ocultar)}${c.oculto ? 'Mostrar de novo' : 'Ocultar'}</button>` : ''}
        ${c.pode_curtir ? `<button class="btn peq fantasma comentarios-curtir${c.curtido ? ' on' : ''}" data-cm="curtir" data-cid="${esc(c.id)}" aria-pressed="${!!c.curtido}" ${ocupado ? 'disabled' : ''}>${ico(I.curtir)}${c.curtido ? 'Curtido' : 'Curtir'}</button>` : ''}
      </div>`;
    return `<li class="comentarios-item${c.oculto ? ' oculto' : ''}" id="cm-${esc(c.id)}">
      <span class="av" aria-hidden="true">${esc(iniciais(String(c.autor).replace(/[._]/g, ' ')))}</span>
      <div class="comentarios-corpo">
        <div class="comentarios-quem"><strong>${esc(arroba(c))}</strong><span class="muted">${quando(c.data)}</span>${chips}</div>
        <p class="comentarios-texto">${esc(c.texto)}</p>
        ${respostas ? `<div class="comentarios-respostas">${respostas}</div>` : ''}
        ${acoes}
        ${st.caixa === c.id ? htmlCaixa(c, p, tipo) : ''}
      </div>
    </li>`;
  }

  function htmlCaixa(c, p, tipo) {
    const s = st.sug[c.id];
    const onde = c.rede === 'facebook' ? 'Messenger' : 'Direct';
    let nota = '';
    if (s?.carregando) nota = `<div class="comentarios-nota"><span class="comentarios-roda" aria-hidden="true"></span>A IA está escrevendo uma sugestão…</div>`;
    else if (s?.erro) nota = `<div class="erro">${esc(s.erro)}</div>`;
    else if (s) {
      const linhas = [];
      if (!s.resposta) linhas.push(`<div class="comentarios-nota aviso">${ico(I.aviso)}<span>A IA acha melhor não responder${s.classe === 'spam' ? ': parece propaganda' : s.classe === 'ofensivo' ? ': parece ofensivo' : ''}. Se for o caso, use "Ocultar".</span></div>`);
      if (s.levar_para_direct) linhas.push(`<div class="comentarios-nota">${ico(I.aviso)}<span>Caso pessoal: a sugestão convida para o ${onde}. Fique de olho lá.</span></div>`);
      if (s.barrado?.length) linhas.push(`<div class="comentarios-nota ruim">${ico(I.aviso)}<span>Confira antes de enviar: ${esc(s.barrado.join('; '))}.</span></div>`);
      if (s.observacao) linhas.push(`<div class="comentarios-nota">${ico(I.ia)}<span>Para você saber: ${esc(s.observacao)}</span></div>`);
      nota = linhas.join('');
    }
    const ph = c.mencao ? `Comentário no post de ${arroba(c)}` : `Responder ${arroba(c)} em público`;
    return `<div class="caixa comentarios-caixa">
      <label class="comentarios-escondido" for="cm-txt">Sua resposta</label>
      <textarea id="cm-txt" rows="3" maxlength="2000" placeholder="${esc(ph)}" ${s?.carregando ? 'disabled' : ''}>${esc(st.rascunho[c.id] || '')}</textarea>
      ${nota ? `<div class="comentarios-notas">${nota}</div>` : ''}
      <div class="caixa-pe">
        <span class="dica">Todo mundo vê. Ctrl+Enter envia.</span>
        <button class="btn peq fantasma" data-cm="cancelar">Cancelar</button>
        <button class="btn peq prim" data-cm="enviar" data-cid="${esc(c.id)}" ${st.ocupado[c.id] || s?.carregando ? 'disabled' : ''}>${st.ocupado[c.id] ? 'Enviando…' : c.mencao ? 'Comentar no post' : 'Responder comentário'}</button>
      </div>
    </div>`;
  }

  // ---------- moderação ----------
  const REGRAS = [
    { k: 'ocultar_ofensivos', titulo: 'Ocultar comentários ofensivos', desc: 'Xingamentos e ataques somem para o público. A IA decide o que é ofensivo. Crítica educada continua aparecendo.' },
    { k: 'ocultar_links', titulo: 'Ocultar links e propaganda', desc: 'Comentários com link, golpe ou "ganhe seguidores" somem na hora.' },
    { k: 'responder_simples', titulo: 'Responder sozinha às perguntas simples', desc: 'Preço, como usar e prazo de entrega, com as mesmas regras da IA do SAC: nunca inventa preço nem promete nada. Reclamação fica sempre para a equipe.' },
  ];
  function htmlModeracao() {
    if (!st.mod && st.modErro) return `<div class="erro">Não consegui abrir a moderação: ${esc(st.modErro)}. <button class="btn peq" data-cm="mod-recarregar">Tentar de novo</button></div>`;
    if (!st.mod) return `<div class="vazio" aria-busy="true"><span class="comentarios-roda" aria-hidden="true"></span>Carregando…</div>`;
    const { moderacao: m, pode_editar: pode, log } = st.mod;
    const trava = pode ? '' : 'disabled';
    const regras = REGRAS.map(r => `<label class="comentarios-regra">
        <span><strong>${r.titulo}</strong><small>${r.desc}</small></span>
        <input type="checkbox" role="switch" class="comentarios-chave" data-cm-regra="${r.k}" ${m[r.k] ? 'checked' : ''} ${trava}>
      </label>`).join('');
    const palavras = (m.palavras_proibidas || []).map(w => `<span class="chip comentarios-palavra">${esc(w)}${pode ? `<button data-cm="tirar-palavra" data-v="${esc(w)}" aria-label="Tirar a palavra ${esc(w)}">${ico(I.x)}</button>` : ''}</span>`).join('');
    const linhas = (log || []).map(l => {
      const rot = l.acao === 'ocultou' ? 'Ocultou' : l.acao === 'respondeu' ? 'Respondeu sozinha' : l.acao === 'nao-respondeu' ? 'Não respondeu' : 'Deu erro';
      const cor = l.acao === 'erro' ? 'alerta' : l.acao === 'nao-respondeu' ? 'aviso' : '';
      const desfazer = l.desfeito ? `<span class="chip">Desfeito</span>`
        : (l.acao === 'ocultou' || (l.acao === 'respondeu' && l.resposta_id)) ? `<button class="btn peq" data-cm="desfazer" data-v="${esc(l.id)}" title="${l.acao === 'ocultou' ? 'Mostrar o comentário de novo para todo mundo' : 'Apagar a resposta automática'}">Desfazer</button>` : '';
      return `<div class="comentarios-log">
        <div class="comentarios-log-txt">
          <div class="comentarios-quem"><span class="chip ${cor}">${rot}</span><span class="muted">${esc(l.motivo || '')}</span></div>
          ${l.autor ? `<p><b>${esc(l.rede === 'instagram' ? `@${l.autor}` : l.autor)}</b> ${esc(ONDE[l.tipo] || '')}: “${esc(String(l.texto || '').slice(0, 220))}”</p>` : ''}
          ${l.resposta ? `<p class="comentarios-log-resp">Resposta: ${esc(l.resposta)}</p>` : ''}
          <span class="muted comentarios-log-quando">${quando(l.ts)}${l.desfeito_por ? ` · desfeito por ${esc(l.desfeito_por)}` : ''}</span>
        </div>
        <div>${desfazer}</div>
      </div>`;
    }).join('');
    return `${pode ? '' : '<div class="nota-box">Só a dona muda estas regras. Você pode ver o que foi feito e desfazer.</div>'}
      <h2 class="secao">Regras</h2>
      <div class="card comentarios-regras">${regras}</div>
      <h2 class="secao">Palavras proibidas</h2>
      <div class="card">
        <p class="desc">Comentário com uma destas palavras fica oculto na hora. Quem escreveu e os amigos dela continuam vendo, então ninguém percebe. Vale para palavras inteiras, com ou sem acento.</p>
        <div class="comentarios-palavras">${palavras || '<span class="muted">Nenhuma palavra ainda.</span>'}</div>
        ${pode ? `<form class="comentarios-add" data-cm-form="palavra">
          <div class="campo"><label for="cm-palavra">Nova palavra</label><input id="cm-palavra" maxlength="40" placeholder="Ex.: golpe" autocomplete="off"></div>
          <button class="btn" type="submit">Adicionar palavra</button>
        </form>` : ''}
      </div>
      <h2 class="secao">O que foi feito sozinho</h2>
      ${linhas ? `<div class="comentarios-logs">${linhas}</div>` : '<div class="vazio"><strong>Nada ainda.</strong>Quando a moderação ocultar ou responder um comentário sozinha, aparece aqui.</div>'}`;
  }

  async function salvarMod(mudanca, aviso) {
    try {
      const r = await chamar(`${API}/moderacao`, 'POST', mudanca);
      st.mod.moderacao = r.moderacao;
      toast(aviso);
    } catch (e) { toast(`Não salvou: ${e.message}`); }
    desenhar();
  }

  // ---------- ações ----------
  function abrirCaixa(id) {
    const ta = elPag?.querySelector('.comentarios-caixa textarea');
    if (ta && st.caixa) st.rascunho[st.caixa] = ta.value;
    st.caixa = id; st.focar = true;
    desenhar();
  }

  async function sugerir(id) {
    const a = acharComentario(id);
    if (!a) return;
    const ta = elPag?.querySelector('.comentarios-caixa textarea');
    if (ta && st.caixa) st.rascunho[st.caixa] = ta.value;
    st.caixa = id;
    st.sug[id] = { carregando: true };
    desenhar();
    try {
      const r = await chamar(`${API}/sugerir`, 'POST', { texto: a.c.texto, autor: a.c.autor, legenda: a.p.legenda, tipo: a.tipo, rede: a.c.rede });
      st.sug[id] = r;
      if (r.resposta) st.rascunho[id] = r.resposta;
      st.focar = true;
    } catch (e) { st.sug[id] = { erro: e.message }; }
    if (subAtual !== 'moderacao') desenhar();
  }

  async function enviar(id) {
    const a = acharComentario(id);
    const ta = elPag.querySelector('.comentarios-caixa textarea');
    const texto = (ta?.value || '').trim();
    if (!a) return;
    if (!texto) { toast('Escreva a resposta antes de enviar.'); ta?.focus(); return; }
    st.rascunho[id] = texto; st.ocupado[id] = true; desenhar();
    try {
      const r = await chamar(`${API}/responder`, 'POST', { id, rede: a.c.rede, post_id: a.p.id, mencao: !!a.c.mencao, texto });
      emTodos(id, c => { c.respostas = [...(c.respostas || []), { id: r.id || `local-${Date.now()}`, autor: 'rosaselvagemoficial', texto, data: Date.now(), da_marca: true }]; c.respondido = true; });
      st.recentes.add(id);
      delete st.rascunho[id]; delete st.sug[id]; st.caixa = null;
      toast(a.c.mencao ? 'Comentário publicado no post.' : 'Resposta publicada.');
      carregarEstado();
    } catch (e) { toast(`Não foi: ${e.message}`); }
    delete st.ocupado[id];
    desenhar();
  }

  async function ocultar(id) {
    const a = acharComentario(id);
    if (!a) return;
    const novo = !a.c.oculto;
    st.ocupado[id] = true; desenhar();
    try {
      await chamar(`${API}/ocultar`, 'POST', { id, rede: a.c.rede, ocultar: novo });
      emTodos(id, c => { c.oculto = novo; });
      st.recentes.add(id);
      if (novo && st.caixa === id) st.caixa = null;
      toast(novo ? 'Comentário oculto. Só quem escreveu e os amigos dela ainda veem.' : 'Comentário visível de novo para todo mundo.');
      st.mod = null; carregarEstado();
    } catch (e) { toast(`Não foi: ${e.message}`); }
    delete st.ocupado[id];
    desenhar();
  }

  async function curtir(id) {
    const a = acharComentario(id);
    if (!a) return;
    const novo = !a.c.curtido;
    st.ocupado[id] = true; desenhar();
    try {
      await chamar(`${API}/curtir`, 'POST', { id, rede: a.c.rede, curtir: novo });
      emTodos(id, c => { c.curtido = novo; });
    } catch (e) { toast(`Não foi: ${e.message}`); }
    delete st.ocupado[id];
    desenhar();
  }

  // ---------- eventos (um ouvinte por página) ----------
  function ligar(el) {
    if (el.dataset.cmLigado) return;
    el.dataset.cmLigado = '1';
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cm]');
      if (!b || !el.contains(b)) return;
      const id = b.dataset.cid, v = b.dataset.v;
      switch (b.dataset.cm) {
        case 'filtro': st.filtro = v; st.recentes.clear(); desenhar(); break;
        case 'atualizar': carregarPosts(subAtual, true); carregarEstado(); break;
        case 'responder': if (st.caixa === id) { st.caixa = null; desenhar(); } else abrirCaixa(id); break;
        case 'sugerir': sugerir(id); break;
        case 'cancelar': st.caixa = null; desenhar(); break;
        case 'enviar': enviar(id); break;
        case 'ocultar': ocultar(id); break;
        case 'curtir': curtir(id); break;
        case 'integracoes': irPara('integracoes'); break;
        case 'estado': st.estadoErro = ''; desenhar(); carregarEstado(); break;
        case 'mod-recarregar': carregarMod(); desenhar(); break;
        case 'tirar-palavra':
          salvarMod({ palavras_proibidas: st.mod.moderacao.palavras_proibidas.filter(w => w !== v) }, `A palavra "${v}" saiu da lista.`);
          break;
        case 'desfazer':
          b.disabled = true;
          chamar(`${API}/desfazer`, 'POST', { log_id: v }).then(() => {
            toast('Desfeito.');
            for (const t of TIPOS) delete st.posts[t];
            carregarMod(); carregarEstado();
          }).catch(err => { b.disabled = false; toast(`Não deu para desfazer: ${err.message}`); });
          break;
      }
    });
    el.addEventListener('change', e => {
      const k = e.target.dataset?.cmRegra;
      if (!k) return;
      const r = REGRAS.find(x => x.k === k);
      salvarMod({ [k]: e.target.checked }, `${r.titulo}: ${e.target.checked ? 'ligado' : 'desligado'}.`);
    });
    el.addEventListener('submit', e => {
      if (e.target.dataset?.cmForm !== 'palavra') return;
      e.preventDefault();
      const inp = el.querySelector('#cm-palavra');
      const w = inp.value.trim().toLowerCase();
      if (!w) { inp.focus(); return; }
      const lista = st.mod.moderacao.palavras_proibidas || [];
      if (lista.includes(w)) { toast('Essa palavra já está na lista.'); return; }
      salvarMod({ palavras_proibidas: [...lista, w] }, `A palavra "${w}" entrou na lista.`);
    });
    el.addEventListener('input', e => { if (e.target.id === 'cm-txt' && st.caixa) st.rascunho[st.caixa] = e.target.value; });
    el.addEventListener('keydown', e => {
      if (e.target.id !== 'cm-txt') return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(st.caixa); }
      if (e.key === 'Escape') { st.caixa = null; desenhar(); }
    });
  }

  function render(el, sub) {
    elPag = el;
    ligar(el);
    subAtual = PAGINAS[sub] ? sub : 'feed';
    if (!sub) { history.replaceState(null, '', '#/comentarios/feed'); estado.sub = 'feed'; }
    if (!ligado()) { /* nada para buscar: a página mostra o convite para conectar */ }
    else if (subAtual === 'moderacao') { if (!st.mod && !st.modCarregando) carregarMod(); }
    else {
      const d = st.posts[subAtual];
      if (!st.carregando[subAtual] && (!d || Date.now() - d.t > 60000)) carregarPosts(subAtual);
    }
    // sem conexão, confere de novo a cada abertura (a dona pode ter acabado de conectar em Integrações)
    if (!st.estado || (!ligado() && !st.estadoErro)) carregarEstado();
    desenhar();
  }

  const conta = t => () => (ligado() && st.estado.contadores?.[t]) || 0;
  registrarPagina({
    id: 'comentarios', nome: 'Comentários', ico: I.menu,
    niveis: ['dona', 'supervisora', 'atendente'],
    subs: [
      { id: 'feed', nome: 'Feed', ico: I.feed, contador: conta('feed') },
      { id: 'reels', nome: 'Reels', ico: I.reels, contador: conta('reels') },
      { id: 'patrocinados', nome: 'Patrocinados', ico: I.patrocinados, contador: conta('patrocinados') },
      { id: 'mencoes', nome: 'Menções', ico: I.mencoes, contador: conta('mencoes') },
      { id: 'moderacao', nome: 'Moderação', ico: I.moderacao },
    ],
    contador: () => (ligado() && st.estado.total) || 0,
    render,
  });

  // número do menu: ao abrir a tela e a cada 2 min. A página aberta busca novos sem atrapalhar quem está digitando.
  carregarEstado();
  setInterval(() => {
    if (document.hidden) return;
    carregarEstado();
    if (ligado() && elPag && !elPag.hidden && subAtual !== 'moderacao' && !st.caixa && !st.carregando[subAtual]) carregarPosts(subAtual);
  }, 120000);
})();
