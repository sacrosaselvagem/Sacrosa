// Rastreios: pedidos que a IA está acompanhando até a entrega. A cada mudança (postado, saiu para entrega,
// problema, entregue) ela avisa a cliente na própria conversa. Dados: /api/atendimento/rastreios (rotas/rastreios.mjs).
'use strict';
(() => {
  if (!document.querySelector('link[href$="modulos/rastreios.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'modulos/rastreios.css'; document.head.appendChild(l);
  }
  const API = '/api/atendimento/rastreios';
  const RS = { dados: null, erro: null, el: null };
  const FASES = { postado: 'Postado', transito: 'A caminho', saiu: 'Saiu para entrega', problema: 'Problema na entrega', retirada: 'Para retirada', entregue: 'Entregue' };
  const COMO = { mensagem: 'mensagem para a cliente', 'modelo-whatsapp': 'modelo do WhatsApp', 'nota-equipe': 'nota para a equipe', 'nota-barrado': 'nota (barrado pela trava)', 'nota-janela': 'nota (fora das 24 h)', 'nota-atraso': 'nota de atraso' };
  const quando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  async function carregar() {
    try { RS.dados = await chamar(API); RS.erro = null; } catch (e) { RS.erro = e.message; }
    desenhar();
  }

  function cartao(x) {
    const avisos = (x.avisos || []).slice(-4).reverse();
    return `<div class="card rastreios-card" data-id="${esc(x.id)}">
      <div class="card-top rastreios-topo">
        <div><b>Pedido ${esc(x.num)}</b><div class="desc">${esc(x.cliente || 'Cliente')}</div></div>
        <span class="status ${esc(x.status)}">${esc(x.rot)}</span>
      </div>
      <dl class="rastreios-dados">
        <dt>Rastreio</dt><dd>${esc(x.rastreio || 'ainda não postado')}</dd>
        <dt>Acompanhando desde</dt><dd>${esc(quando(x.desde))}</dd>
        <dt>Última conferida</dt><dd>${esc(quando(x.verificado_em))}</dd>
      </dl>
      <div class="rastreios-avisos">${avisos.length
        ? avisos.map(a => `<div><span>${esc(quando(a.ts))}</span> ${esc(FASES[a.fase] || a.fase)} · ${esc(COMO[a.como] || a.como)}</div>`).join('')
        : '<div class="muted">Nenhum aviso ainda. A cliente recebe o próximo quando o pedido andar.</div>'}</div>
      <div class="card-pe rastreios-acoes">
        <button class="btn peq" data-rs="abrir">Abrir conversa</button>
        <button class="btn peq fantasma" data-rs="verificar">Conferir agora</button>
        ${RS.dados?.teste ? '<button class="btn peq fantasma" data-rs="avancar">Simular próximo passo</button>' : ''}
        <button class="btn peq fantasma" data-rs="parar">Parar de avisar</button>
      </div>
    </div>`;
  }

  function desenhar() {
    const el = RS.el;
    if (!el) return;
    const d = RS.dados, lista = d?.lista || [];
    const aviso = d?.teste
      ? '<div class="nota-box">Modo de teste: os pedidos são fictícios (#1001 a #1004). Quando a loja for ligada, aparecem os pedidos de verdade.</div>'
      : d && !d.loja_ligada ? '<div class="nota-box">A loja ainda não está ligada. Quando ligar a Shopify, a IA passa a acompanhar os pedidos das clientes até a entrega e eles aparecem aqui.</div>' : '';
    const corpo = RS.erro ? `<div class="erro">Não consegui carregar os rastreios: ${esc(RS.erro)}. Atualize a página.</div>`
      : !d ? '<div class="vazio">Carregando…</div>'
      : !lista.length ? '<div class="vazio"><strong>Nenhum pedido sendo acompanhado.</strong><span>Quando a IA acha o pedido de uma cliente (pelo WhatsApp da compra, pelo CPF ou pelo e-mail), passa a avisar ela de cada passo da entrega.</span></div>'
      : `<div class="grade rastreios-grade">${lista.map(cartao).join('')}</div>`;
    el.innerHTML = `<div class="pag-in">${cabecalho('Rastreios', 'Pedidos que a IA acompanha até a entrega. A cliente recebe um aviso na conversa a cada passo, menos de madrugada.')}
      ${aviso}${corpo}</div>`;
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-rs]');
    if (!b || !RS.el?.contains(b)) return;
    const id = b.closest('[data-id]').dataset.id, item = RS.dados.lista.find(x => x.id === id), acao = b.dataset.rs;
    if (acao === 'abrir') { irPara('conversas'); abrir(item.conversa); return; }
    if (acao === 'parar' && !confirm(`Parar de avisar a cliente sobre o pedido ${item.num}?`)) return;
    b.disabled = true; b.textContent = acao === 'parar' ? 'Parando…' : 'Conferindo…';
    try {
      const r = await chamar(`${API}/${encodeURIComponent(id)}/${acao}`, 'POST', {});
      toast(acao === 'parar' ? 'Pronto, ela não recebe mais avisos desse pedido.'
        : r.resultado === 'sem-mudanca' ? 'Conferido: nada mudou ainda.'
        : r.resultado === 'esperando-amanhecer' ? 'O pedido andou. O aviso sai de manhã.'
        : `Pedido agora: ${r.status}. ${r.resultado === 'mensagem' ? 'A cliente foi avisada.' : 'A equipe recebeu uma nota na conversa.'}`);
    } catch (err) { toast(err.message); }
    carregar();
  });

  registrarPagina({
    id: 'rastreios', nome: 'Rastreios',
    ico: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    contador: () => RS.dados?.lista?.length || 0,
    render(el) { RS.el = el; desenhar(); carregar(); },
  });
})();
