// Simulador: você é a cliente, num chat com cara de WhatsApp, e a Rosa (IA do SAC) responde como responderia de
// verdade: espera você terminar de escrever, mostra "digitando…" e manda os balões com pausa. Nada sai do sistema.
// Servidor: POST /api/atendimento/capitao/testar (rotas/capitao.mjs), que roda a mesma IA das clientes sem enviar nada.
'use strict';

(() => {
  if (!document.querySelector('link[data-mod="simulador"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'modulos/simulador.css'; l.dataset.mod = 'simulador';
    document.head.appendChild(l);
  }

  const GUARDA = 'rs-simulador';
  const ESPERA = 4000; // igual à IA de verdade: espera a cliente parar de digitar
  const S = carregar() || { marca: 'Rosa Selvagem', nome: 'Cliente', msgs: [], bastidores: false };
  let digitando = false, timer = null, rodando = false;

  function carregar() { try { return JSON.parse(sessionStorage.getItem(GUARDA)); } catch { return null; } }
  function guardar() { try { sessionStorage.setItem(GUARDA, JSON.stringify(S)); } catch { /* aba anônima */ } }
  const hh = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  registrarPagina({
    id: 'simulador', nome: 'Simular conversa', niveis: ['dona', 'supervisora'],
    ico: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    render(el) {
      el.innerHTML = `<div class="sim-pag">
        ${cabecalho('Simular conversa', 'Converse como se fosse uma cliente no WhatsApp. A Rosa responde do jeito que vai responder de verdade. Nada é enviado para ninguém.')}
        <div class="sim-ajustes">
          <label>Marca <select id="sim-marca"><option>Rosa Selvagem</option><option>Beyoung</option></select></label>
          <label>Seu nome <input id="sim-nome" maxlength="40" placeholder="Cliente"></label>
          <label class="sim-check"><input type="checkbox" id="sim-bast"> Mostrar bastidores</label>
          <button class="btn fantasma peq" data-sim="nova">Nova conversa</button>
        </div>
        <div class="sim-fone">
          <header class="sim-topo">
            <span class="sim-av">${ico(BRILHO)}</span>
            <div><strong id="sim-titulo"></strong><span id="sim-status">online</span></div>
          </header>
          <div class="sim-chat" id="sim-chat"></div>
          <form class="sim-pe" id="sim-form">
            <input id="sim-texto" autocomplete="off" placeholder="Mensagem" aria-label="Mensagem">
            <button class="sim-enviar" aria-label="Enviar">${ico('<path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/>')}</button>
          </form>
        </div>
      </div>`;
      $('#sim-marca').value = S.marca;
      $('#sim-nome').value = S.nome === 'Cliente' ? '' : S.nome;
      $('#sim-bast').checked = S.bastidores;
      desenhar();
      if (!REAL) S.aviso = 'O simulador só funciona com o atendimento ligado.';
      $('#sim-texto').focus();
    },
  });

  function desenhar() {
    const chat = document.getElementById('sim-chat');
    if (!chat) return;
    $('#sim-titulo').textContent = S.marca;
    $('#sim-status').textContent = digitando ? 'digitando…' : 'online';
    let ultimoDia = '';
    const linhas = S.msgs.map(m => {
      if (m.de === 'nota') return S.bastidores ? `<div class="sim-nota">${esc(m.txt)}</div>` : '';
      const dia = new Date(m.t).toLocaleDateString('pt-BR');
      const sep = dia !== ultimoDia ? `<div class="sim-dia">${dia === new Date().toLocaleDateString('pt-BR') ? 'Hoje' : dia}</div>` : '';
      ultimoDia = dia;
      const minha = m.de === 'cliente';
      return `${sep}<div class="sim-msg ${minha ? 'eu' : 'ela'}"><span>${esc(m.txt).replace(/\n/g, '<br>')}</span><em>${hh(m.t)}${minha ? ` <b class="sim-tique${m.lida ? ' lida' : ''}">✓✓</b>` : ''}</em></div>`;
    }).join('');
    const vazio = !S.msgs.length ? `<div class="sim-dica">Escreva como uma cliente escreveria. Exemplos: "oi, vcs entregam em manaus?", "meu pedido não chegou", "quanto tá o óleo?"</div>` : '';
    chat.innerHTML = vazio + linhas + (digitando ? '<div class="sim-msg ela sim-digit"><i></i><i></i><i></i></div>' : '') + (S.aviso ? `<div class="sim-nota">${esc(S.aviso)}</div>` : '');
    chat.scrollTop = chat.scrollHeight;
  }

  // a cliente pode mandar várias mensagens seguidas; a Rosa só responde quando ela para
  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(responder, ESPERA);
  }

  async function responder() {
    if (rodando) return agendar();
    const pendentes = S.msgs.filter(m => m.de === 'cliente' && !m.lida);
    if (!pendentes.length || !REAL) return;
    rodando = true;
    pendentes.forEach(m => { m.lida = true; });
    desenhar();
    await dormir(700);
    digitando = true; desenhar();
    try {
      const r = await chamar('/api/atendimento/capitao/testar', 'POST', {
        marca: S.marca, canal: 'WhatsApp', cliente: S.nome || 'Cliente',
        mensagens: S.msgs.filter(m => m.de !== 'nota').map(m => ({ de: m.de === 'cliente' ? 'cliente' : 'ia', txt: m.txt })),
      });
      // chegou mensagem nova enquanto ela pensava: responde tudo junto na próxima
      if (S.msgs.some(m => m.de === 'cliente' && !m.lida)) { digitando = false; rodando = false; return agendar(); }
      const baloes = r.barrado?.length ? [] : (r.mensagens || []);
      for (const [i, txt] of baloes.entries()) {
        if (i) { digitando = true; desenhar(); }
        await dormir(Math.min(6000, 1000 + txt.length * 25));
        digitando = false;
        S.msgs.push({ de: 'ia', txt, t: Date.now() });
        guardar(); desenhar();
        await dormir(500);
      }
      const nota = r.barrado?.length ? `Bastidores: a trava barrou a resposta (${r.barrado.join('; ')}). Na vida real, ninguém responde e a conversa vai para a equipe.`
        : r.acao === 'escalar' ? `Bastidores: aqui a Rosa passaria a conversa para a equipe. Motivo: ${r.motivo}. Assuntos: ${(r.assuntos || []).map(nomeAssunto).join(', ')}.`
        : r.acao === 'ignorar' ? 'Bastidores: a Rosa não respondeu porque a mensagem não pedia resposta.'
        : `Bastidores: respondeu sozinha. Assuntos: ${(r.assuntos || []).map(nomeAssunto).join(', ')}. Levou ${r.segundos} s para pensar.`;
      S.msgs.push({ de: 'nota', txt: nota, t: Date.now() });
    } catch (err) {
      S.msgs.push({ de: 'nota', txt: `A Rosa não respondeu: ${err.message}`, t: Date.now() });
      S.bastidores = true; const c = $('#sim-bast'); if (c) c.checked = true;
    } finally {
      digitando = false; rodando = false;
      guardar(); desenhar();
    }
  }

  document.addEventListener('submit', e => {
    if (e.target.id !== 'sim-form') return;
    e.preventDefault();
    const campo = $('#sim-texto'), txt = campo.value.trim();
    if (!txt) return;
    S.aviso = REAL ? null : S.aviso;
    S.msgs.push({ de: 'cliente', txt, t: Date.now() });
    campo.value = '';
    guardar(); desenhar(); agendar();
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'sim-texto' && timer && e.target.value) agendar(); // ainda digitando: a Rosa espera
    if (e.target.id === 'sim-nome') { S.nome = e.target.value.trim() || 'Cliente'; guardar(); }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'sim-marca') { S.marca = e.target.value; guardar(); desenhar(); }
    if (e.target.id === 'sim-bast') { S.bastidores = e.target.checked; guardar(); desenhar(); }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-sim="nova"]')) return;
    clearTimeout(timer);
    S.msgs = []; S.aviso = REAL ? null : S.aviso; digitando = false;
    guardar(); desenhar(); $('#sim-texto')?.focus();
  });
})();
