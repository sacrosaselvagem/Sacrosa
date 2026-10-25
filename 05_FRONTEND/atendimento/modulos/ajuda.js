// Central de Ajuda: os artigos da página pública de ajuda do Chatwoot (perguntas frequentes).
// Fala com 06_BACKEND/atendimento/rotas/ajuda.mjs (as escritas usam o acesso de administradora lá, porque a
// supervisora não pode escrever artigos no Chatwoot). Contrato em 09_DOCUMENTATION/atendimento-modulos.md.
'use strict';
(() => {
  const API = '/api/atendimento/ajuda';
  const AJ = { el: null, dados: null, erro: null, carregando: false, filtro: 'todos', busca: '', props: null };
  const ICO_LIVRO = '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/>';
  const ICO_COPIA = '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';
  const ICO_ABRIR = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';

  if (!document.querySelector('link[href$="modulos/ajuda.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'modulos/ajuda.css'; document.head.appendChild(l);
  }

  // exemplo fictício para quando a tela não está ligada ao Chatwoot
  const DEMO = {
    base: 'http://localhost:3000', portal: { slug: 'rosa-selvagem', nome: 'Ajuda Rosa Selvagem', locale: 'pt_BR' },
    categorias: [{ id: 1, nome: 'Entrega e frete' }, { id: 2, nome: 'Trocas e cancelamentos' }],
    artigos: [
      { id: 1, slug: 'exemplo-prazo', titulo: 'Qual o prazo de entrega?', texto: 'O pedido é postado em até **5 dias úteis** depois da aprovação do pagamento.', status: 'published', categoria_id: 1, atualizado: Date.now() - 864e5, visitas: 12 },
      { id: 2, slug: 'exemplo-troca', titulo: 'Como trocar um produto', texto: 'Você pode pedir a troca em até 7 dias depois do recebimento.', status: 'draft', categoria_id: 2, atualizado: Date.now() - 3600e3, visitas: 0 },
    ],
  };

  const linkPortal = () => `${AJ.dados.base}/hc/${AJ.dados.portal.slug}/${AJ.dados.portal.locale}`;
  const linkArtigo = a => `${AJ.dados.base}/hc/${AJ.dados.portal.slug}/articles/${a.slug}`;
  const dataCurta = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  async function carregar() {
    if (AJ.carregando) return;
    AJ.carregando = true;
    try {
      AJ.dados = REAL ? await chamar(`${API}/dados`) : JSON.parse(JSON.stringify(AJ.dados?.demo ? AJ.dados : { ...DEMO, demo: true }));
      AJ.erro = null;
    } catch (err) { AJ.erro = err.message; }
    AJ.carregando = false;
    desenhar();
  }

  function desenhar() {
    const el = AJ.el;
    if (!el || estado.pagina !== 'ajuda') return;
    const temPortal = AJ.dados?.portal;
    const acoes = temPortal ? `<div class="ajuda-acoes">
        <button class="btn" data-aj="sugerir">${ico('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>')}Criar artigos com a base do SAC</button>
        <button class="btn prim" data-aj="novo">${ico('<path d="M12 5v14M5 12h14"/>')}Novo artigo</button></div>` : '';
    const topo = cabecalho('Central de Ajuda', 'Perguntas frequentes que a cliente lê sozinha, a qualquer hora. O rascunho só a equipe vê. O publicado aparece na página de ajuda.', acoes);
    let corpo = '';
    if (!AJ.dados && !AJ.erro) corpo = '<div class="ajuda-carregando"><span class="ajuda-roda"></span>Carregando os artigos…</div>';
    else if (AJ.erro) corpo = `<div class="erro">Não consegui abrir a Central de Ajuda: ${esc(AJ.erro)}. Confira se o Chatwoot está ligado e tente de novo.</div>
      <p style="margin-top:12px"><button class="btn" data-aj="recarregar">Tentar de novo</button></p>`;
    else if (!temPortal) corpo = `<div class="card" style="max-width:560px">
        <div class="card-top"><span class="card-ico">${ico(ICO_LIVRO)}</span><h3>A Central de Ajuda ainda não existe</h3></div>
        <p class="desc">Vamos criar a página "Ajuda Rosa Selvagem". Depois você escreve os artigos aqui e manda o link para as clientes.</p>
        <div class="card-pe"><button class="btn prim" data-aj="criar-portal">Criar a Central de Ajuda</button></div></div>`;
    else corpo = conteudo();
    el.innerHTML = `<div class="pag-in ajuda-in">${topo}${AJ.dados?.demo ? '<div class="nota-box" style="margin-bottom:16px">Isto é um exemplo. Quando a tela estiver ligada ao Chatwoot, os artigos de verdade aparecem aqui.</div>' : ''}${corpo}</div>`;
  }

  function conteudo() {
    const d = AJ.dados;
    const pub = d.artigos.filter(a => a.status === 'published'), ras = d.artigos.filter(a => a.status === 'draft');
    const q = AJ.busca.trim().toLowerCase();
    const lista = d.artigos
      .filter(a => a.status !== 'archived')
      .filter(a => AJ.filtro === 'todos' || (AJ.filtro === 'publicados' ? a.status === 'published' : a.status === 'draft'))
      .filter(a => !q || a.titulo.toLowerCase().includes(q) || a.texto.toLowerCase().includes(q))
      .sort((a, b) => a.id - b.id);
    const grupos = [...d.categorias.map(c => ({ ...c, itens: lista.filter(a => a.categoria_id === c.id) })),
      { id: null, nome: 'Sem categoria', itens: lista.filter(a => !d.categorias.some(c => c.id === a.categoria_id)) }].filter(g => g.itens.length);
    const num = (rot, n) => `<div class="num-card"><span>${rot}</span><strong>${n}</strong></div>`;
    const seg = [['todos', 'Todos'], ['publicados', 'Publicados'], ['rascunhos', 'Rascunhos']]
      .map(([k, v]) => `<button data-aj-filtro="${k}" class="${AJ.filtro === k ? 'on' : ''}" aria-pressed="${AJ.filtro === k}">${v}</button>`).join('');
    const vazio = !d.artigos.length
      ? `<div class="vazio"><strong>Nenhum artigo ainda</strong><span>Comece com "Criar artigos com a base do SAC": a gente prepara os rascunhos e você só revisa.</span></div>`
      : !lista.length ? '<div class="vazio"><strong>Nada com esse filtro</strong><span>Troque o filtro ou apague a busca.</span></div>' : '';
    return `
      <div class="ajuda-portal">
        <span class="card-ico">${ico(ICO_LIVRO)}</span>
        <div class="ajuda-portal-txt"><strong>${esc(d.portal.nome)}</strong>
          <a class="ajuda-link" id="aj-link-portal" href="${esc(linkPortal())}" target="_blank" rel="noopener">${esc(linkPortal())}</a></div>
        <div class="ajuda-portal-acoes">
          <button class="btn peq" data-aj-copiar="${esc(linkPortal())}">${ico(ICO_COPIA)}Copiar link</button>
          <a class="btn peq fantasma" href="${esc(linkPortal())}" target="_blank" rel="noopener">${ico(ICO_ABRIR)}Abrir página</a>
        </div>
      </div>
      <div class="resumo-num" style="margin-top:16px">${num('Publicados', pub.length)}${num('Rascunhos', ras.length)}${num('Visitas nos artigos', d.artigos.reduce((s, a) => s + (a.visitas || 0), 0))}</div>
      <div class="ajuda-ferramentas">
        <div class="ajuda-seg" role="group" aria-label="Mostrar">${seg}</div>
        <input class="ajuda-busca" id="aj-busca" type="search" placeholder="Buscar artigo" value="${esc(AJ.busca)}" aria-label="Buscar artigo">
      </div>
      ${vazio}
      ${grupos.map(g => `<div class="secao">${esc(g.nome)} · ${g.itens.length}</div>
        <div class="ajuda-lista">${g.itens.map(linha).join('')}</div>`).join('')}`;
  }

  function linha(a) {
    const pub = a.status === 'published';
    return `<div class="ajuda-item">
      <div class="ajuda-item-txt">
        <button class="ajuda-item-titulo" data-aj-editar="${a.id}">${esc(a.titulo || '(sem título)')}</button>
        <div class="ajuda-item-meta"><span class="estado ${pub ? 'ligado' : 'espera'}">${pub ? 'Publicado' : 'Rascunho'}</span>
          <span>Mudado em ${dataCurta(a.atualizado)}</span>${pub && a.visitas ? `<span>${a.visitas} ${a.visitas === 1 ? 'visita' : 'visitas'}</span>` : ''}</div>
      </div>
      <div class="ajuda-item-acoes">
        ${pub ? `<button class="btn peq fantasma" data-aj-copiar="${esc(linkArtigo(a))}" title="Copiar o link do artigo">${ico(ICO_COPIA)}Copiar link</button>` : ''}
        <button class="btn peq" data-aj-editar="${a.id}">Editar</button>
      </div></div>`;
  }

  // ---------- editor ----------
  function opcoesCategoria(sel) {
    return `<option value="">Sem categoria</option>${AJ.dados.categorias.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}<option value="__nova">Nova categoria…</option>`;
  }

  function abrirEditor(id) {
    const a = id ? AJ.dados.artigos.find(x => x.id === id) : null;
    if (id && !a) { toast('Este artigo não existe mais.'); carregar(); return; }
    const pub = a?.status === 'published';
    const corpo = `
      <div class="campo"><label for="aj-titulo">Título</label>
        <input id="aj-titulo" maxlength="200" value="${esc(a?.titulo || '')}" placeholder="Ex.: Qual o prazo de entrega?"></div>
      <div class="campo"><label for="aj-cat">Categoria</label>
        <select id="aj-cat">${opcoesCategoria(a?.categoria_id || null)}</select>
        <input id="aj-cat-nova" placeholder="Nome da categoria nova" maxlength="80" hidden></div>
      <div class="campo"><label for="aj-texto">Texto</label>
        <textarea id="aj-texto" class="ajuda-texto" placeholder="Escreva como se falasse com a cliente.">${esc(a?.texto || '')}</textarea>
        <small>Linha em branco separa parágrafos. **palavra** fica em negrito. Comece a linha com "- " para fazer uma lista.</small></div>
      <div class="campo"><label>Situação</label>
        <div class="ajuda-sit">
          <label><input type="radio" name="aj-sit" value="draft"${pub ? '' : ' checked'}><span>Rascunho<small>Só a equipe vê.</small></span></label>
          <label><input type="radio" name="aj-sit" value="published"${pub ? ' checked' : ''}><span>Publicado<small>Aparece na página de ajuda.</small></span></label>
        </div></div>
      ${pub ? `<div class="campo"><label>Link do artigo</label><div class="ajuda-portal" style="padding:10px 12px">
        <a class="ajuda-link" style="flex:1" href="${esc(linkArtigo(a))}" target="_blank" rel="noopener">${esc(linkArtigo(a))}</a>
        <button class="btn peq" data-aj-copiar="${esc(linkArtigo(a))}">${ico(ICO_COPIA)}Copiar</button></div></div>` : ''}`;
    const pe = `${a ? `<button class="btn fantasma ajuda-pe-esq" data-aj-apagar="${a.id}">Apagar artigo</button>` : ''}
      <button class="btn fantasma" data-fechar="1">Cancelar</button>
      <button class="btn prim" data-aj-salvar="${a ? a.id : ''}">${a ? 'Salvar artigo' : 'Criar artigo'}</button>`;
    gaveta(a ? 'Editar artigo' : 'Novo artigo', corpo, pe);
  }

  async function garantirCategoria() {
    const sel = $('#aj-cat').value;
    if (sel !== '__nova') return sel ? Number(sel) : null;
    const nome = $('#aj-cat-nova').value.trim();
    if (!nome) throw new Error('Escreva o nome da categoria nova.');
    if (!REAL) { const id = Date.now(); AJ.dados.categorias.push({ id, nome }); return id; }
    const r = await chamar(`${API}/categorias`, 'POST', { nome });
    return r.id;
  }

  async function salvar(id, botao) {
    const titulo = $('#aj-titulo').value.trim(), texto = $('#aj-texto').value;
    const status = document.querySelector('input[name="aj-sit"]:checked')?.value || 'draft';
    const erro = msg => { $('#g-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`; };
    if (!titulo) { erro('Escreva o título do artigo.'); $('#aj-titulo').focus(); return; }
    if (status === 'published' && !texto.trim()) { erro('Para publicar, escreva o texto. Ou salve como rascunho.'); $('#aj-texto').focus(); return; }
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      const categoria_id = await garantirCategoria();
      const corpo = { titulo, texto, status, categoria_id };
      if (!REAL) {
        const a = id ? AJ.dados.artigos.find(x => x.id === id) : { id: Date.now(), slug: `exemplo-${Date.now()}`, visitas: 0 };
        Object.assign(a, corpo, { atualizado: Date.now() });
        if (!id) AJ.dados.artigos.push(a);
      } else if (id) await chamar(`${API}/artigos/${id}`, 'PATCH', corpo);
      else await chamar(`${API}/artigos`, 'POST', corpo);
      fecharGaveta();
      toast(status === 'published' ? 'Artigo publicado. Já aparece na página de ajuda.' : 'Rascunho salvo.');
      if (REAL) await carregar(); else desenhar();
    } catch (err) {
      botao.disabled = false; botao.textContent = id ? 'Salvar artigo' : 'Criar artigo';
      erro(`Não salvou: ${err.message}`);
    }
  }

  async function apagar(id) {
    const a = AJ.dados.artigos.find(x => x.id === id);
    if (!a || !confirm(`Apagar o artigo "${a.titulo}"? Não dá para desfazer.`)) return;
    try {
      if (REAL) await chamar(`${API}/artigos/${id}`, 'DELETE');
      else AJ.dados.artigos = AJ.dados.artigos.filter(x => x.id !== id);
      fecharGaveta(); toast('Artigo apagado.');
      if (REAL) await carregar(); else desenhar();
    } catch (err) { $('#g-erro').innerHTML = `<div class="erro">Não apagou: ${esc(err.message)}</div>`; }
  }

  async function criarPortal(botao) {
    if (!REAL) { toast('Na demonstração nada é criado de verdade.'); return; }
    botao.disabled = true; botao.textContent = 'Criando…';
    try { await chamar(`${API}/portal`, 'POST', {}); toast('Central de Ajuda criada.'); AJ.dados = null; desenhar(); await carregar(); }
    catch (err) { botao.disabled = false; botao.textContent = 'Criar a Central de Ajuda'; toast(`Não deu certo: ${err.message}`); }
  }

  // ---------- artigos a partir da base do SAC ----------
  const normal = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  async function sugerir() {
    AJ.props = null;
    gaveta('Criar artigos com a base do SAC', `<div class="ajuda-carregando"><span class="ajuda-roda"></span>Lendo a base do SAC e escrevendo os rascunhos. Leva uns 30 segundos.</div>`,
      '<button class="btn fantasma" data-fechar="1">Cancelar</button>');
    try {
      const r = REAL ? await chamar(`${API}/sugestoes`, 'POST', {})
        : { fonte: 'base', artigos: [{ titulo: 'Qual o prazo de entrega?', categoria: 'Entrega e frete', texto: 'Exemplo da demonstração.' }] };
      if (!$('#gaveta').innerHTML) return; // fechou enquanto esperava
      const existentes = new Set(AJ.dados.artigos.map(a => normal(a.titulo)));
      AJ.props = r.artigos.map(a => ({ ...a, repetido: existentes.has(normal(a.titulo)) }));
      const itens = AJ.props.map((a, i) => `<div class="ajuda-prop">
        <div class="ajuda-prop-top"><input type="checkbox" id="aj-p${i}" data-aj-prop="${i}"${a.repetido ? '' : ' checked'}>
          <label for="aj-p${i}"><strong>${esc(a.titulo)}</strong><span class="muted" style="font-size:12.5px">${esc(a.categoria)}${a.repetido ? ' · já existe um artigo com esse título' : ''}</span></label></div>
        <details><summary>Ver o texto</summary><pre>${esc(a.texto)}</pre></details></div>`).join('');
      gaveta('Criar artigos com a base do SAC', `
        <p class="muted" style="font-size:13.5px">Os textos foram escritos só com o que está na base do SAC. Eles entram como <b>rascunho</b>: leia cada um, ajuste e publique quando estiver tudo certo.</p>
        ${r.fonte === 'base' ? '<div class="nota-box">A IA não respondeu agora, então os textos foram montados com as frases da própria base. Revise com mais calma.</div>' : ''}
        ${itens}`,
        `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-aj-criar-props="1">Criar ${AJ.props.filter(a => !a.repetido).length} rascunhos</button>`);
    } catch (err) {
      if (!$('#gaveta').innerHTML) return;
      gaveta('Criar artigos com a base do SAC', `<div class="erro">Não consegui preparar os artigos: ${esc(err.message)}. Tente de novo em alguns minutos.</div>`,
        '<button class="btn fantasma" data-fechar="1">Fechar</button>');
    }
  }

  function contarMarcados() {
    const n = document.querySelectorAll('[data-aj-prop]:checked').length;
    const b = document.querySelector('[data-aj-criar-props]');
    if (b) { b.textContent = `Criar ${n} ${n === 1 ? 'rascunho' : 'rascunhos'}`; b.disabled = !n; }
  }

  async function criarProps(botao) {
    const escolhidos = [...document.querySelectorAll('[data-aj-prop]:checked')].map(x => AJ.props[+x.dataset.ajProp]);
    if (!escolhidos.length) return;
    botao.disabled = true;
    let feitos = 0;
    try {
      const cats = new Map(AJ.dados.categorias.map(c => [c.nome.toLowerCase(), c.id]));
      for (const a of escolhidos) {
        botao.textContent = `Criando ${feitos + 1} de ${escolhidos.length}…`;
        let cat = cats.get(a.categoria.toLowerCase());
        if (cat === undefined) {
          cat = REAL ? (await chamar(`${API}/categorias`, 'POST', { nome: a.categoria })).id : Date.now() + feitos;
          cats.set(a.categoria.toLowerCase(), cat);
          if (!REAL) AJ.dados.categorias.push({ id: cat, nome: a.categoria });
        }
        const corpo = { titulo: a.titulo, texto: a.texto, status: 'draft', categoria_id: cat };
        if (REAL) await chamar(`${API}/artigos`, 'POST', corpo);
        else AJ.dados.artigos.push({ id: Date.now() + feitos, slug: `exemplo-${feitos}`, ...corpo, atualizado: Date.now(), visitas: 0 });
        feitos++;
      }
      fecharGaveta();
      toast(`${feitos} ${feitos === 1 ? 'rascunho criado' : 'rascunhos criados'}. Revise e publique quando estiver tudo certo.`);
      AJ.filtro = 'rascunhos';
    } catch (err) {
      botao.disabled = false; botao.textContent = 'Tentar de novo';
      $('#g-erro').innerHTML = `<div class="erro">Criei ${feitos} e parei: ${esc(err.message)}.</div>`;
    }
    if (REAL) await carregar(); else desenhar();
  }

  function copiar(txt) {
    navigator.clipboard.writeText(txt).then(() => toast('Link copiado.'), () => toast('Não deu para copiar. Selecione o link e copie.'));
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-aj],[data-aj-filtro],[data-aj-editar],[data-aj-salvar],[data-aj-apagar],[data-aj-copiar],[data-aj-criar-props]');
    if (!el) return;
    const d = el.dataset;
    if (d.ajCopiar) { copiar(d.ajCopiar); return; }
    if (d.ajFiltro) { AJ.filtro = d.ajFiltro; desenhar(); return; }
    if (d.ajEditar) { abrirEditor(+d.ajEditar); return; }
    if (d.ajSalvar !== undefined) { salvar(d.ajSalvar ? +d.ajSalvar : null, el); return; }
    if (d.ajApagar) { apagar(+d.ajApagar); return; }
    if (d.ajCriarProps) { criarProps(el); return; }
    switch (d.aj) {
      case 'novo': abrirEditor(null); break;
      case 'sugerir': sugerir(); break;
      case 'criar-portal': criarPortal(el); break;
      case 'recarregar': AJ.erro = null; desenhar(); carregar(); break;
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'aj-cat') { const nova = e.target.value === '__nova'; $('#aj-cat-nova').hidden = !nova; if (nova) $('#aj-cat-nova').focus(); }
    if (e.target.dataset?.ajProp !== undefined) contarMarcados();
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'aj-busca') return;
    AJ.busca = e.target.value;
    const pos = e.target.selectionStart;
    desenhar();
    const b = $('#aj-busca'); if (b) { b.focus(); b.setSelectionRange(pos, pos); }
  });

  registrarPagina({
    id: 'ajuda', nome: 'Central de Ajuda', niveis: ['dona', 'supervisora'], ico: ICO_LIVRO,
    render(el) { AJ.el = el; desenhar(); carregar(); },
  });
})();
