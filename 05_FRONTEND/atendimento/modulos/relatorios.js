// Relatórios: números do atendimento por período (Hoje, 7 dias, 30 dias).
// Dados: GET /api/atendimento/relatorios?periodo=... (06_BACKEND/atendimento/rotas/relatorios.mjs),
// que junta os relatórios do Chatwoot e o registro da IA do SAC. Sem Chatwoot, mostra um exemplo.
'use strict';
(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'modulos/relatorios.css';
  document.head.appendChild(css);

  const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']];
  const rel = { periodo: '7', dados: null, erro: null, carregando: false, el: null, pedido: 0 };

  // ---------- formatação ----------
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  function tempo(seg) {
    if (seg === null || seg === undefined || Number.isNaN(Number(seg))) return '—';
    const s = Math.round(Number(seg));
    if (s < 60) return s <= 0 ? 'na hora' : 'menos de 1 min';
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), r = min % 60;
    if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
    const d = Math.floor(h / 24), rh = h % 24;
    return rh ? `${d} d ${rh} h` : `${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  const quando = (t, agrupar) => {
    const d = new Date(t * 1000);
    return agrupar === 'hour'
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  const quandoLongo = (t, agrupar) => {
    const d = new Date(t * 1000);
    if (agrupar === 'hour') {
      const h = d.getHours();
      return `Das ${String(h).padStart(2, '0')}h às ${String((h + 1) % 24).padStart(2, '0')}h`;
    }
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/^./, c => c.toUpperCase());
  };

  // ---------- exemplo (modo demonstração) ----------
  function exemplo(periodo) {
    const dias = periodo === 'hoje' ? 1 : Number(periodo);
    const agrupar = dias === 1 ? 'hour' : 'day';
    const agora = Math.floor(Date.now() / 1000), passo = agrupar === 'hour' ? 3600 : 86400;
    const n = agrupar === 'hour' ? new Date().getHours() + 1 : dias;
    const base = agrupar === 'hour' ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d / 1000; })() : agora - (dias - 1) * 86400;
    const serie = Array.from({ length: n }, (_, i) => {
      const v = agrupar === 'hour' ? Math.max(0, Math.round(3 + 4 * Math.sin((i - 8) / 4))) : 18 + ((i * 7) % 11);
      return { t: base + i * passo, recebidas: v, resolvidas: Math.round(v * .8) };
    });
    const tot = serie.reduce((a, x) => a + x.recebidas, 0), res = serie.reduce((a, x) => a + x.resolvidas, 0);
    return {
      periodo, agrupar, exemplo: true,
      resumo: { recebidas: tot, resolvidas: res, primeira_resposta: 260, resolucao: 5400, anterior: { recebidas: Math.round(tot * .9), resolvidas: Math.round(res * .85), primeira_resposta: 340, resolucao: 6100 } },
      serie,
      pessoas: Object.keys(EQUIPE).map((k, i) => ({ id: k, conversas: Math.round(tot * [.3, .25, .1][i % 3]), resolvidas: Math.round(res * [.3, .22, .08][i % 3]), primeira_resposta: [180, 420, 900][i % 3] })),
      caixas: [['whatsapp', .55], ['instagram', .25], ['site', .12], ['messenger', .08]].map(([canal, f]) => ({ canal, conversas: Math.round(tot * f) })),
      assuntos: [['frete-e-entrega', .3], ['rastreio', .2], ['duvida-de-produto', .15], ['troca', .1], ['cancelamento', .08]].map(([nome, f]) => ({ nome, conversas: Math.round(tot * f) })),
      ia: { conversas: Math.round(tot * .7), so_ia: Math.round(tot * .45), passou_equipe: Math.round(tot * .25) },
    };
  }

  // ---------- busca ----------
  async function carregar() {
    const meu = ++rel.pedido;
    rel.carregando = true; rel.erro = null;
    desenhar();
    try {
      const d = REAL ? await chamar(`/api/atendimento/relatorios?periodo=${rel.periodo}`) : exemplo(rel.periodo);
      if (meu !== rel.pedido) return;
      rel.dados = d;
    } catch (err) {
      if (meu !== rel.pedido) return;
      rel.erro = err.message;
    }
    rel.carregando = false;
    desenhar();
  }

  // ---------- desenho ----------
  function seletor() {
    return `<div class="relatorios-periodo" role="group" aria-label="Período">${PERIODOS.map(([id, nome]) =>
      `<button type="button" data-rel-periodo="${id}" aria-pressed="${rel.periodo === id}" class="${rel.periodo === id ? 'on' : ''}">${nome}</button>`).join('')}</div>`;
  }

  function nomeAnterior() {
    return rel.periodo === '7' ? 'Nos 7 dias antes' : rel.periodo === '30' ? 'Nos 30 dias antes' : '';
  }

  function cartao(rotulo, valor, explica, antes) {
    return `<div class="num-card relatorios-card">
      <span>${rotulo}</span><strong>${valor}</strong>
      <p class="relatorios-explica">${explica}</p>
      ${antes ? `<p class="relatorios-antes">${antes}</p>` : ''}
    </div>`;
  }

  function cartoes(d) {
    const r = d.resumo, a = r.anterior || {}, ant = nomeAnterior();
    const ia = d.ia || { conversas: 0, so_ia: 0 };
    const pct = ia.conversas ? Math.round(ia.so_ia / ia.conversas * 100) : null;
    return `<div class="resumo-num relatorios-cards">
      ${cartao('Conversas recebidas', num(r.recebidas), 'Quantas conversas novas chegaram, de todos os canais.', ant && `${ant}: ${num(a.recebidas)}`)}
      ${cartao('Conversas resolvidas', num(r.resolvidas), 'Quantas vezes uma conversa foi marcada como resolvida.', ant && `${ant}: ${num(a.resolvidas)}`)}
      ${cartao('Tempo até a primeira resposta', tempo(r.primeira_resposta), 'Em média, quanto a cliente esperou até alguém da equipe responder. Se a IA atendeu antes, conta a partir da hora em que ela passou a conversa.', ant && a.primeira_resposta != null && `${ant}: ${tempo(a.primeira_resposta)}`)}
      ${cartao('Tempo até resolver', tempo(r.resolucao), 'Em média, quanto tempo passou da chegada da conversa até ela ser resolvida.', ant && a.resolucao != null && `${ant}: ${tempo(a.resolucao)}`)}
      ${cartao('Resolvidas só pela IA', pct === null ? '—' : `${pct}%`,
        pct === null ? 'A IA do SAC não atendeu nenhuma conversa neste período.'
          : `${ia.conversas === 1 ? 'Da 1 conversa que passou' : `Das ${num(ia.conversas)} conversas que passaram`} pela IA, ${ia.so_ia === 1 ? '1 foi atendida' : `${num(ia.so_ia)} foram atendidas`} só por ela, sem ninguém da equipe.`)}
    </div>`;
  }

  // gráfico de colunas: conversas recebidas por dia (ou por hora, em Hoje)
  function grafico(d, largura) {
    const pts = d.serie || [];
    const total = pts.reduce((a, x) => a + x.recebidas, 0);
    if (!pts.length || !total) return `<div class="relatorios-semdados">Nenhuma conversa chegou neste período.</div>`;
    const W = Math.max(280, Math.floor(largura)), H = 200, esq = 34, dir = 8, topo = 14, base = 26;
    const max = Math.max(...pts.map(x => x.recebidas));
    // topo do eixo em número redondo
    const passoY = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
    const topoY = Math.max(passoY, Math.ceil(max / passoY) * passoY);
    const altura = H - topo - base, faixa = (W - esq - dir) / pts.length;
    const larg = Math.max(2, Math.min(24, faixa - 2));
    const y = v => topo + altura - v / topoY * altura;
    const linhas = [];
    for (let v = 0; v <= topoY; v += passoY) {
      linhas.push(`<line x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}" class="relatorios-grade"/><text x="${esq - 6}" y="${y(v) + 4}" text-anchor="end" class="relatorios-eixo">${v}</text>`);
    }
    // rótulos de baixo: poucos, para não encavalar
    const cabe = Math.max(1, Math.floor((W - esq - dir) / 46));
    const cada = Math.ceil(pts.length / cabe);
    const barras = pts.map((p, i) => {
      const x = esq + i * faixa + (faixa - larg) / 2, h = Math.max(0, y(0) - y(p.recebidas));
      const r = Math.min(4, larg / 2, h);
      // ponta de cima arredondada, base reta
      const forma = h > 0 ? `<path class="relatorios-barra" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + larg - r} Q${x + larg},${y(0) - h} ${x + larg},${y(0) - h + r} V${y(0)} Z"/>` : '';
      const rot = i % cada === 0 ? `<text x="${x + larg / 2}" y="${H - 8}" text-anchor="middle" class="relatorios-eixo">${quando(p.t, d.agrupar)}</text>` : '';
      return `<g class="relatorios-col" data-rel-i="${i}">${forma}<rect class="relatorios-alvo" x="${esq + i * faixa}" y="${topo}" width="${faixa}" height="${altura}"/>${rot}</g>`;
    }).join('');
    return `<div class="relatorios-grafico" id="rel-grafico">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Conversas recebidas ${d.agrupar === 'hour' ? 'por hora hoje' : 'por dia'}. Total: ${total}.">
        ${linhas.join('')}${barras}
      </svg>
      <div class="relatorios-dica" id="rel-dica" hidden></div>
    </div>
    <details class="relatorios-tabela-ver"><summary>Ver em tabela</summary>
      <table class="relatorios-tab"><thead><tr><th>${d.agrupar === 'hour' ? 'Hora' : 'Dia'}</th><th>Recebidas</th><th>Resolvidas</th></tr></thead>
      <tbody>${pts.filter(p => p.recebidas || p.resolvidas).map(p => `<tr><td>${quandoLongo(p.t, d.agrupar)}</td><td>${num(p.recebidas)}</td><td>${num(p.resolvidas)}</td></tr>`).join('')}</tbody></table>
    </details>`;
  }

  function ranking(titulo, explica, itens, vazio) {
    const max = Math.max(1, ...itens.map(x => x.n));
    const lista = itens.length ? `<ol class="relatorios-rank">${itens.map(x => `
      <li><div class="relatorios-rank-nome">${x.ico || ''}<span>${esc(x.nome)}</span><b>${num(x.n)}</b></div>
        <div class="relatorios-trilho"><i style="width:${Math.max(2, x.n / max * 100)}%"></i></div></li>`).join('')}</ol>`
      : `<div class="relatorios-semdados">${vazio}</div>`;
    return `<div class="card relatorios-bloco"><div><h3>${titulo}</h3><p class="desc">${explica}</p></div>${lista}</div>`;
  }

  function porAssunto(d) {
    const itens = (d.assuntos || []).map(a => ({ nome: nomeAssunto(a.nome), n: a.conversas })).sort((a, b) => b.n - a.n).slice(0, 8);
    return ranking('Por assunto', 'Os assuntos que mais apareceram. A IA marca o assunto de cada conversa.', itens, 'Nenhuma conversa com assunto marcado neste período.');
  }

  function porCanal(d) {
    const soma = {};
    for (const c of d.caixas || []) {
      const canal = c.canal || INBOX[c.id]?.canal || 'site';
      soma[canal] = (soma[canal] || 0) + c.conversas;
    }
    const itens = Object.entries(soma).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
      .map(([canal, n]) => ({ nome: CANAIS[canal]?.nome || canal, n, ico: CANAIS[canal] ? canalIco(canal) : '' }));
    return ranking('Por canal', 'De onde as conversas vieram.', itens, 'Nenhuma conversa chegou neste período.');
  }

  function porPessoa(d) {
    const linhas = (d.pessoas || [])
      .map(x => ({ ...x, chave: String(x.id).startsWith('u') || !REAL ? x.id : `u${x.id}` }))
      .filter(x => !REAL || EQUIPE[x.chave] || x.conversas || x.resolvidas)
      .sort((a, b) => b.resolvidas - a.resolvidas || b.conversas - a.conversas);
    if (!linhas.length) return `<div class="relatorios-semdados">Ninguém da equipe atendeu neste período.</div>`;
    return `<div class="tabela relatorios-pessoas">
      <div class="relatorios-pessoa relatorios-pessoa-cab" aria-hidden="true"><span>Pessoa</span><span>Resolvidas</span><span>Primeira resposta</span></div>
      ${linhas.map(x => `<div class="relatorios-pessoa">
        <div class="relatorios-quem">${avatar(x.chave)}<strong>${esc(pessoa(x.chave).nome)}</strong></div>
        <div><small>Resolvidas</small>${num(x.resolvidas)} <span class="muted">de ${num(x.conversas)}</span></div>
        <div><small>Primeira resposta</small>${tempo(x.primeira_resposta)}</div>
      </div>`).join('')}
    </div>`;
  }

  function desenhar() {
    const el = rel.el;
    if (!el || el.hidden) return;
    const d = rel.dados;
    let corpo;
    if (rel.erro) {
      corpo = `<div class="erro">Não consegui buscar os números: ${esc(rel.erro)}. Confira se o Chatwoot está ligado e tente de novo.</div>
        <p style="margin-top:12px"><button class="btn" data-rel-recarregar="1">Tentar de novo</button></p>`;
    } else if (!d) {
      corpo = `<div class="relatorios-semdados">Buscando os números…</div>`;
    } else {
      corpo = `
        ${d.exemplo ? '<div class="nota-box">Estes números são um exemplo. Quando o atendimento estiver ligado ao Chatwoot, aparecem os números de verdade.</div>' : ''}
        <div class="${rel.carregando ? 'relatorios-carregando' : ''}">
        ${cartoes(d)}
        <div class="secao">Conversas recebidas ${d.agrupar === 'hour' ? 'por hora' : 'por dia'}</div>
        <div class="card relatorios-bloco"><p class="desc">${d.agrupar === 'hour' ? 'Quantas conversas chegaram em cada hora de hoje.' : 'Quantas conversas chegaram em cada dia. Passe o dedo ou o mouse numa coluna para ver o número.'}</p><div id="rel-espaco"></div></div>
        <div class="secao">De onde vêm e sobre o quê</div>
        <div class="relatorios-dupla">${porAssunto(d)}${porCanal(d)}</div>
        <div class="secao">Por pessoa</div>
        <p class="relatorios-explica" style="margin:-4px 0 12px">Quantas conversas cada pessoa resolveu e quanto tempo, em média, levou para dar a primeira resposta.</p>
        ${porPessoa(d)}
        </div>`;
    }
    el.innerHTML = `<div class="pag-in relatorios">${cabecalho('Relatórios', 'Como o atendimento está indo. Escolha o período para ver os números.', seletor())}${corpo}</div>`;
    desenharGrafico();
  }

  function desenharGrafico() {
    const alvo = rel.el?.querySelector('#rel-espaco');
    if (!alvo || !rel.dados) return;
    alvo.innerHTML = grafico(rel.dados, alvo.clientWidth || 600);
  }

  // dica ao passar o mouse ou tocar numa coluna
  function mostrarDica(g) {
    const d = rel.dados, dica = rel.el?.querySelector('#rel-dica');
    if (!d || !dica) return;
    rel.el.querySelectorAll('.relatorios-col.on').forEach(x => x.classList.remove('on'));
    if (!g) { dica.hidden = true; return; }
    const p = d.serie[+g.dataset.relI];
    g.classList.add('on');
    dica.innerHTML = `<b>${quandoLongo(p.t, d.agrupar)}</b><span>${num(p.recebidas)} recebidas</span><span>${num(p.resolvidas)} resolvidas</span>`;
    dica.hidden = false;
    const caixa = rel.el.querySelector('#rel-grafico').getBoundingClientRect(), r = g.querySelector('.relatorios-alvo').getBoundingClientRect();
    const x = r.left - caixa.left + r.width / 2;
    dica.style.left = `${Math.min(Math.max(x - dica.offsetWidth / 2, 0), caixa.width - dica.offsetWidth)}px`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rel-periodo],[data-rel-recarregar]');
    if (b) {
      if (b.dataset.relPeriodo && b.dataset.relPeriodo !== rel.periodo) { rel.periodo = b.dataset.relPeriodo; carregar(); }
      else if (b.dataset.relRecarregar) carregar();
      return;
    }
    const g = e.target.closest('.relatorios-col');
    if (g) mostrarDica(g);
  });
  document.addEventListener('mouseover', e => {
    if (!rel.el || rel.el.hidden) return;
    const g = e.target.closest?.('.relatorios-col');
    if (g) mostrarDica(g);
    else if (e.target.closest?.('#rel-grafico') === null && !rel.el.querySelector('#rel-dica')?.hidden) mostrarDica(null);
  });
  let espera;
  window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => { if (rel.el && !rel.el.hidden) desenharGrafico(); }, 150); });

  registrarPagina({
    id: 'relatorios', nome: 'Relatórios',
    ico: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    niveis: ['dona', 'supervisora'],
    render(el) {
      rel.el = el;
      carregar();
    },
  });
})();
