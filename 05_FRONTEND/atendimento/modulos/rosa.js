// "Falar com a Rosa": a equipe conversa com a IA do SAC como com uma colega.
// Ela explica o que fez, ajuda a responder clientes e aprende o que a equipe ensina.
// Servidor: 06_BACKEND/atendimento/rotas/rosa.mjs. Contrato: 09_DOCUMENTATION/atendimento-modulos.md.
'use strict';

(() => {
  if (!document.querySelector('link[data-mod="rosa"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'modulos/rosa.css'; l.dataset.mod = 'rosa';
    document.head.appendChild(l);
  }

  const R = { msgs: null, anexo: null, pensando: false, inicio: 0, erro: null };
  const IDEIAS = [
    'Por que você passou a última conversa para a equipe?',
    'Me ajuda a responder uma cliente brava com o atraso',
    'Como funciona a troca mesmo?',
    'Quando perguntarem se o óleo mancha a roupa, fala que não mancha',
  ];

  // chamado pelo menu de três pontos da conversa
  window.perguntarRosaSobre = c => { R.anexo = { id: c.id, nome: c.cliente }; irPara('rosa'); };

  registrarPagina({
    id: 'rosa', nome: 'Falar com a Rosa',
    ico: '<path d="M4 5h16v11H9l-5 4z"/><path d="M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    render(el) {
      el.innerHTML = `<div class="rosa-pag">
        ${cabecalho('Falar com a Rosa', 'A Rosa é a IA que atende as clientes primeiro. Pergunte por que ela fez algo, peça ajuda para responder ou ensine como a gente faz.',
          '<button class="btn fantasma peq" data-rs="limpar">Limpar conversa</button>')}
        <div class="rosa-msgs" id="rs-msgs" aria-live="polite"></div>
        <div class="rosa-composer">
          <div id="rs-anexo"></div>
          <div class="caixa">
            <textarea id="rs-texto" rows="2" placeholder="Escreva para a Rosa. Enter envia, Shift + Enter pula linha."></textarea>
            <div class="caixa-pe"><span class="dica">${REAL ? 'O que você ensinar aqui, ela passa a usar com as clientes.' : ''}</span><button class="btn prim peq" data-rs="enviar">Enviar</button></div>
          </div>
        </div>
      </div>`;
      desenhar(); carregar();
    },
  });

  async function carregar() {
    if (!REAL) { R.msgs = []; R.erro = 'A Rosa só conversa quando o atendimento está ligado.'; return desenhar(); }
    try { R.msgs = (await chamar('/api/atendimento/rosa/historico')).mensagens || []; R.erro = null; }
    catch (err) { R.msgs = []; R.erro = `Não consegui abrir a conversa: ${err.message}`; }
    desenhar();
  }

  const html = t => esc(t).replace(/\n/g, '<br>');

  function desenhar() {
    const box = document.getElementById('rs-msgs');
    if (!box) return;
    const eu = typeof pessoa === 'function' ? pessoa(EU).nome : 'Você';
    let corpo = '';
    if (R.msgs === null) corpo = '<p class="muted rosa-centro">Carregando…</p>';
    else if (!R.msgs.length && !R.pensando) {
      corpo = `<div class="rosa-vazio">
        <span class="av xl ia">${ico(BRILHO)}</span>
        <strong>Oi, ${esc(eu.split(' ')[0])}! Sou a Rosa.</strong>
        <p>Pode me perguntar qualquer coisa sobre o atendimento, pedir ajuda com uma cliente ou me ensinar um jeito melhor de responder.</p>
        <div class="rosa-ideias">${IDEIAS.map(i => `<button class="chip" data-rs="ideia">${esc(i)}</button>`).join('')}</div>
      </div>`;
    } else {
      corpo = R.msgs.map((x, i) => x.de === 'eu'
        ? `<div class="rosa-msg eu"><div class="bolha">${html(x.txt)}</div><div class="info">${x.conversa ? `sobre a conversa #${x.conversa}, ` : ''}${hora(x.t)}</div></div>`
        : `<div class="rosa-msg ela">
            <span class="av ia">${ico(BRILHO)}</span>
            <div><div class="bolha">${html(x.txt)}</div>
              ${x.aprendizado ? `<div class="rosa-aprendi">${ico('<path d="m5 12 4 4 10-10"/>')}Aprendi e guardei: ${esc(x.aprendizado)}</div>` : ''}
              <div class="info">Rosa, ${hora(x.t)} <button class="rosa-copiar" data-rs="copiar" data-i="${i}">Copiar</button></div></div>
          </div>`).join('');
      if (R.pensando) corpo += `<div class="rosa-msg ela"><span class="av ia">${ico(BRILHO)}</span><div><div class="bolha rosa-digitando"><i></i><i></i><i></i></div><div class="info">Rosa está pensando… <span id="rs-seg">${Math.round((Date.now() - R.inicio) / 1000)} s</span></div></div></div>`;
    }
    if (R.erro) corpo += `<div class="erro rosa-erro">${esc(R.erro)}</div>`;
    box.innerHTML = corpo;
    box.scrollTop = box.scrollHeight;
    const an = document.getElementById('rs-anexo');
    if (an) an.innerHTML = R.anexo ? `<button class="chip filtro rosa-anexo" data-rs="tirar-anexo">Sobre a conversa com ${esc(R.anexo.nome)}${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>` : '';
  }

  async function enviar(texto) {
    const campo = document.getElementById('rs-texto');
    texto = (texto ?? campo?.value ?? '').trim();
    if (!texto || R.pensando || !REAL) return;
    const anexo = R.anexo;
    R.msgs.push({ de: 'eu', txt: texto, t: Date.now(), ...(anexo ? { conversa: anexo.id } : {}) });
    R.pensando = true; R.inicio = Date.now(); R.erro = null; R.anexo = null;
    if (campo) campo.value = '';
    desenhar();
    const relogio = setInterval(() => { const s = document.getElementById('rs-seg'); if (s) s.textContent = `${Math.round((Date.now() - R.inicio) / 1000)} s`; }, 1000);
    try {
      const r = await chamar('/api/atendimento/rosa/mensagem', 'POST', { texto, conversa_id: anexo?.id || null });
      R.msgs.push({ de: 'rosa', txt: r.resposta, t: Date.now(), ...(r.aprendizado ? { aprendizado: r.aprendizado } : {}) });
      if (r.aprendizado) toast('A Rosa guardou o que você ensinou.');
    } catch (err) {
      R.erro = err.message;
      R.anexo = anexo;
      if (campo && !campo.value) campo.value = texto;
      R.msgs.pop();
    } finally {
      clearInterval(relogio);
      R.pensando = false;
      desenhar();
      document.getElementById('rs-texto')?.focus();
    }
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-rs]');
    if (!el) return;
    const a = el.dataset.rs;
    if (a === 'enviar') enviar();
    else if (a === 'ideia') enviar(el.textContent);
    else if (a === 'tirar-anexo') { R.anexo = null; desenhar(); }
    else if (a === 'copiar') {
      navigator.clipboard.writeText(R.msgs[Number(el.dataset.i)].txt).then(() => toast('Copiado.'), () => toast('Não deu para copiar. Selecione o texto.'));
    } else if (a === 'limpar') {
      if (!R.msgs?.length || !confirm('Apagar esta conversa com a Rosa? O que ela aprendeu continua guardado.')) return;
      chamar('/api/atendimento/rosa/limpar', 'POST', {}).then(() => { R.msgs = []; desenhar(); }, err => toast(`Não deu certo: ${err.message}`));
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target.id !== 'rs-texto' || e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    enviar();
  });
})();
