// Campanhas: mensagens automáticas.
//  (a) Mensagem no site: aparece no chat do site para quem abre uma página e fica X segundos (campanha "ongoing"
//      do Chatwoot numa caixa Channel::WebWidget). Cria, edita, pausa, ativa e apaga de verdade.
//  (b) Mensagem em massa no WhatsApp ("one_off"): o formulário aparece, mas o envio fica desligado até o WhatsApp
//      oficial estar conectado e com modelos aprovados pela Meta. O servidor também bloqueia (rotas/campanhas.mjs).
'use strict';
(() => {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'modulos/campanhas.css';
  document.head.appendChild(css);

  const camp = { el: null, lista: [], caixas: [], etiquetas: [], erro: null, carregado: false, rascunho: null };
  const ICO_SITE = '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>';
  const ICO_MASSA = '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 10h6M9 13h4"/>';
  const ICO_MAIS = '<path d="M12 5v14M5 12h14"/>';

  // ---------- exemplo (modo demonstração) ----------
  const EXEMPLO = {
    caixas: [{ id: 1, name: 'Chat do site Rosa Selvagem', channel_type: 'Channel::WebWidget', website_url: 'https://rosaselvagemoficial.com.br' }],
    lista: [{ id: 1, title: 'Boas-vindas na página do óleo', message: 'Oi! Ficou com alguma dúvida sobre o Óleo Clareador? Estou aqui para ajudar. 🌹', enabled: true, campaign_type: 'ongoing',
      inbox: { id: 1, name: 'Chat do site Rosa Selvagem' }, trigger_rules: { url: 'https://rosaselvagemoficial.com.br/products/oleo-clareador', time_on_page: 20 }, trigger_only_during_business_hours: false }],
    etiquetas: ['quer-comprar', 'elogio', 'duvida-de-produto'],
  };

  async function carregar() {
    camp.erro = null;
    try {
      if (REAL) {
        const [lista, caixas, etiquetas] = await Promise.all([cw('campaigns'), cw('inboxes'), cw('labels').catch(() => ({ payload: [] }))]);
        camp.lista = Array.isArray(lista) ? lista : lista.payload || [];
        camp.caixas = (caixas.payload || []).filter(c => c.channel_type === 'Channel::WebWidget');
        camp.etiquetas = (etiquetas.payload || []).map(l => l.title);
      } else if (!camp.carregado) {
        camp.lista = structuredClone(EXEMPLO.lista); camp.caixas = EXEMPLO.caixas; camp.etiquetas = EXEMPLO.etiquetas;
      }
    } catch (err) { camp.erro = err.message; }
    camp.carregado = true;
    desenhar();
  }

  // ---------- textos ----------
  const raiz = u => String(u || '').replace(/\/+$/, '');
  const todasPaginas = (url, caixa) => !!caixa && raiz(url) === `${raiz(caixa.website_url)}/*`;
  const caixaDe = id => camp.caixas.find(c => c.id === Number(id));
  function ondeAparece(url, caixa) {
    if (todasPaginas(url, caixa)) return `qualquer página do site ${esc(raiz(caixa.website_url).replace(/^https?:\/\//, ''))}`;
    return `a página <b>${esc(url)}</b>`;
  }
  function quemVe(c) {
    const caixa = caixaDe(c.inbox_id ?? c.inbox?.id) || c.inbox;
    const r = c.trigger_rules || {}, seg = Number(r.time_on_page) || 0;
    return `Quem abrir ${ondeAparece(r.url, caixa)} e ficar ${seg ? `${seg} ${seg === 1 ? 'segundo' : 'segundos'}` : 'alguns segundos'} vai ver esta mensagem no chat${c.trigger_only_during_business_hours ? ', só no horário de atendimento' : ''}.`;
  }

  // ---------- página ----------
  function tipos() {
    const temSite = camp.caixas.length > 0;
    return `<div class="grade">
      <div class="card">
        <div class="card-top"><div class="card-ico">${ico(ICO_SITE)}</div><h3>Mensagem no site</h3></div>
        <p class="desc">Uma mensagem que aparece sozinha no chat do site para quem está olhando uma página. Por exemplo: quem fica 20 segundos na página do óleo recebe "Ficou com alguma dúvida?".</p>
        <div class="card-pe">${!camp.carregado ? '<span class="estado">Verificando…</span>' : `<span class="estado ${temSite ? 'ligado' : 'espera'}">${temSite ? 'Pode usar' : 'Falta conectar o chat do site'}</span>`}
          ${temSite ? `<button class="btn peq" data-camp-nova="site">Criar mensagem</button>` : ''}</div>
      </div>
      <div class="card">
        <div class="card-top"><div class="card-ico">${ico(ICO_MASSA)}</div><h3>Mensagem em massa no WhatsApp</h3></div>
        <p class="desc">Uma mensagem mandada de uma vez para muitas clientes, escolhidas pela etiqueta, no dia e hora marcados. Só funciona com o WhatsApp oficial conectado e com modelos de mensagem aprovados pela Meta.</p>
        <div class="card-pe"><span class="estado espera">Ainda não disponível</span><button class="btn peq fantasma" data-camp-nova="massa">Ver como vai ser</button></div>
      </div>
    </div>`;
  }

  function linha(c) {
    const site = c.campaign_type !== 'one_off';
    const ativa = site ? c.enabled : c.campaign_status === 'active';
    const estado = site ? (ativa ? '<span class="estado ligado">Ativa</span>' : '<span class="estado">Pausada</span>')
      : `<span class="estado ${c.campaign_status === 'completed' ? '' : 'espera'}">${c.campaign_status === 'completed' ? 'Enviada' : 'Agendada'}</span>`;
    const acoes = site ? `
        <button class="btn peq" data-camp-editar="${c.id}">Editar</button>
        <button class="btn peq" data-camp-ligar="${c.id}" data-camp-para="${ativa ? '0' : '1'}">${ativa ? 'Pausar' : 'Ativar'}</button>
        <button class="btn peq icone fantasma" data-camp-apagar="${c.id}" aria-label="Apagar ${esc(c.title)}" title="Apagar">${ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>`
      : '<span class="muted" style="font-size:12.5px">Feita fora desta tela</span>';
    return `<div class="campanhas-linha">
      <div class="campanhas-info">
        <div class="campanhas-titulo">${ico(site ? ICO_SITE : ICO_MASSA)}<strong>${esc(c.title)}</strong>${estado}</div>
        <p class="campanhas-msg">“${esc(c.message)}”</p>
        <p class="campanhas-quem">${site ? quemVe(c) : 'Mensagem em massa.'}</p>
      </div>
      <div class="campanhas-acoes">${acoes}</div>
    </div>`;
  }

  function desenhar() {
    const el = camp.el;
    if (!el) return;
    let lista;
    if (camp.erro) lista = `<div class="erro">Não consegui buscar as campanhas: ${esc(camp.erro)}. Confira se o Chatwoot está ligado e tente de novo.</div><p style="margin-top:12px"><button class="btn" data-camp-recarregar="1">Tentar de novo</button></p>`;
    else if (!camp.carregado) lista = '<div class="vazio"><span>Buscando as campanhas…</span></div>';
    else if (!camp.lista.length) lista = `<div class="tabela"><div class="vazio"><strong>Nenhuma campanha ainda</strong><span>Crie uma mensagem no site para falar com quem está olhando os produtos.</span></div></div>`;
    else lista = `<div class="tabela">${camp.lista.map(linha).join('')}</div>`;
    const botao = camp.caixas.length ? `<button class="btn prim" data-camp-nova="site">${ico(ICO_MAIS)}<span>Nova mensagem no site</span></button>` : '';
    el.innerHTML = `<div class="pag-in campanhas">
      ${cabecalho('Campanhas', 'Mensagens que aparecem sozinhas para as clientes. Antes de salvar, a tela mostra quem vai ver.', botao)}
      ${!REAL ? '<div class="nota-box">Isto é uma demonstração. Nada do que você fizer aqui é salvo.</div>' : ''}
      <div class="secao">Os dois tipos</div>
      ${tipos()}
      <div class="secao">Suas campanhas</div>
      ${lista}
    </div>`;
  }

  // ---------- formulário: mensagem no site ----------
  function formSite(c) {
    const r = c?.trigger_rules || {};
    const caixa = caixaDe(c?.inbox?.id ?? c?.inbox_id) || camp.caixas[0];
    const todas = !c || todasPaginas(r.url, caixa);
    const pessoas = Object.values(EQUIPE).filter(p => p.cwId);
    camp.rascunho = { id: c?.id || null };
    gaveta(c ? 'Editar mensagem no site' : 'Nova mensagem no site', `
      <div class="campo"><label for="cp-titulo">Nome da campanha</label>
        <input id="cp-titulo" maxlength="80" value="${esc(c?.title || '')}" placeholder="Ex.: Dúvida na página do óleo">
        <small>Só a equipe vê este nome.</small></div>
      <div class="campo"><label for="cp-msg">Mensagem</label>
        <textarea id="cp-msg" class="campanhas-texto" rows="4" maxlength="500" placeholder="Ex.: Oi! Ficou com alguma dúvida sobre o produto? Estou aqui para ajudar.">${esc(c?.message || '')}</textarea>
        <small>É o que a visitante vai ler no chat do site.</small></div>
      ${camp.caixas.length > 1 ? `<div class="campo"><label for="cp-caixa">Chat de qual site</label>
        <select id="cp-caixa">${camp.caixas.map(x => `<option value="${x.id}" ${x.id === caixa?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`
        : `<input type="hidden" id="cp-caixa" value="${caixa?.id || ''}">`}
      <fieldset class="campo campanhas-escolha"><legend>Onde aparece</legend>
        <label><input type="radio" name="cp-onde" value="todas" ${todas ? 'checked' : ''}> Em todas as páginas do site</label>
        <label><input type="radio" name="cp-onde" value="uma" ${todas ? '' : 'checked'}> Só numa página</label>
        <input id="cp-url" type="url" ${todas ? 'hidden' : ''} value="${todas ? '' : esc(r.url || '')}" placeholder="Cole o endereço da página, ex.: https://rosaselvagemoficial.com.br/products/oleo">
      </fieldset>
      <div class="campo"><label for="cp-seg">Depois de quantos segundos na página</label>
        <input id="cp-seg" type="number" min="1" max="600" step="1" value="${Number(r.time_on_page) || 15}" inputmode="numeric"></div>
      <div class="campo"><label for="cp-quem">Quem aparece mandando</label>
        <select id="cp-quem"><option value="">Rosa Selvagem (sem nome de pessoa)</option>
          ${pessoas.map(p => `<option value="${p.cwId}" ${c?.sender?.id === p.cwId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      <label class="campanhas-check"><input type="checkbox" id="cp-horario" ${c?.trigger_only_during_business_hours ? 'checked' : ''}> Mostrar só no horário de atendimento</label>`,
      `<button class="btn" data-fechar="1">Cancelar</button><button class="btn prim" data-camp-conferir="1">Conferir e salvar</button>`);
  }

  function lerFormSite() {
    const caixa = caixaDe($('#cp-caixa')?.value);
    const todas = document.querySelector('input[name="cp-onde"]:checked')?.value !== 'uma';
    const url = todas ? `${raiz(caixa?.website_url)}/*` : $('#cp-url').value.trim();
    const dados = {
      title: $('#cp-titulo').value.trim(), message: $('#cp-msg').value.trim(), inbox_id: caixa?.id,
      sender_id: $('#cp-quem').value ? Number($('#cp-quem').value) : null,
      trigger_only_during_business_hours: $('#cp-horario').checked,
      trigger_rules: { url, time_on_page: Math.round(Number($('#cp-seg').value)) },
    };
    if (!dados.title) return [null, 'Dê um nome para a campanha.'];
    if (!dados.message) return [null, 'Escreva a mensagem que a visitante vai ler.'];
    if (!caixa) return [null, 'Não achei o chat do site. Conecte o chat do site em Integrações.'];
    if (todas && !caixa.website_url) return [null, 'O chat do site está sem o endereço do site. Escolha "Só numa página" e cole o endereço.'];
    if (!/^https?:\/\/\S+\.\S+/.test(url)) return [null, 'O endereço da página precisa começar com https://. Copie o endereço direto do navegador.'];
    const s = dados.trigger_rules.time_on_page;
    if (!(s >= 1 && s <= 600)) return [null, 'Os segundos precisam ser um número de 1 a 600.'];
    return [dados, null];
  }

  // passo de confirmação: diz exatamente quem vai ver antes de salvar
  function conferir() {
    const [dados, erro] = lerFormSite();
    if (erro) { $('#g-erro').innerHTML = `<div class="erro">${esc(erro)}</div>`; return; }
    camp.rascunho = { ...camp.rascunho, dados, form: $('#gaveta .gaveta-corpo').innerHTML, valores: valoresForm() };
    const remetente = dados.sender_id ? pessoa(`u${dados.sender_id}`).nome : 'Rosa Selvagem';
    gaveta('Confira antes de salvar', `
      <div class="campanhas-conferir">
        <h3>Quem vai ver</h3>
        <p>${quemVe(dados)}</p>
        <p class="muted">A mensagem vai aparecer como enviada por ${esc(remetente)}. Ela não vai para o WhatsApp nem para o Instagram, só para o chat do site.</p>
      </div>
      <div class="campo"><label>A mensagem</label><div class="campanhas-balao">${esc(dados.message)}</div></div>
      <p class="muted" style="font-size:12.5px">Ela começa a aparecer assim que você salvar. Para parar, use Pausar na lista.</p>`,
      `<button class="btn" data-camp-voltar="1">Voltar e mudar</button><button class="btn prim" data-camp-salvar="1">${camp.rascunho.id ? 'Salvar mudanças' : 'Salvar e ativar'}</button>`);
  }

  // guarda o que foi digitado para o "Voltar e mudar"
  function valoresForm() {
    const v = {};
    document.querySelectorAll('#gaveta input, #gaveta select, #gaveta textarea').forEach(i => {
      if (!i.id && i.type !== 'radio') return;
      v[i.id || `${i.name}=${i.value}`] = i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value;
    });
    return v;
  }
  function voltar() {
    const r = camp.rascunho;
    gaveta(r.id ? 'Editar mensagem no site' : 'Nova mensagem no site', '', `<button class="btn" data-fechar="1">Cancelar</button><button class="btn prim" data-camp-conferir="1">Conferir e salvar</button>`);
    $('#gaveta .gaveta-corpo').innerHTML = r.form;
    for (const [k, v] of Object.entries(r.valores)) {
      const i = k.includes('=') ? document.querySelector(`#gaveta input[name="${k.split('=')[0]}"][value="${k.split('=')[1]}"]`) : document.getElementById(k);
      if (!i) continue;
      if (typeof v === 'boolean') i.checked = v; else i.value = v;
    }
    $('#g-erro').innerHTML = '';
    $('#cp-url').hidden = document.querySelector('input[name="cp-onde"]:checked')?.value !== 'uma';
  }

  async function salvar(botao) {
    const r = camp.rascunho;
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      if (REAL) {
        if (r.id) await cw(`campaigns/${r.id}`, 'PATCH', { campaign: r.dados });
        else await cw('campaigns', 'POST', { campaign: { ...r.dados, enabled: true } });
      } else {
        const caixa = caixaDe(r.dados.inbox_id);
        const novo = { ...r.dados, id: r.id || Date.now(), enabled: true, campaign_type: 'ongoing', inbox: { id: caixa.id, name: caixa.name }, sender: r.dados.sender_id ? { id: r.dados.sender_id } : null };
        if (r.id) Object.assign(camp.lista.find(x => x.id === r.id), novo, { enabled: camp.lista.find(x => x.id === r.id).enabled });
        else camp.lista.push(novo);
      }
      fecharGaveta();
      toast(r.id ? 'Mudanças salvas.' : 'Mensagem no site criada e ativa.');
      carregar();
    } catch (err) {
      botao.disabled = false; botao.textContent = r.id ? 'Salvar mudanças' : 'Salvar e ativar';
      $('#g-erro').innerHTML = `<div class="erro">Não salvou: ${esc(err.message)}. Volte, confira os dados e tente de novo.</div>`;
    }
  }

  // ---------- pausar, ativar, apagar ----------
  async function ligar(id, ativar, botao) {
    const c = camp.lista.find(x => x.id === id);
    if (ativar && !botao.dataset.campCerto) {
      // ativar volta a mostrar a mensagem: confirma quem vai ver
      gaveta('Ativar esta mensagem?', `<div class="campanhas-conferir"><h3>Quem vai ver</h3><p>${quemVe(c)}</p></div>
        <div class="campo"><label>A mensagem</label><div class="campanhas-balao">${esc(c.message)}</div></div>`,
        `<button class="btn" data-fechar="1">Cancelar</button><button class="btn prim" data-camp-ligar="${id}" data-camp-para="1" data-camp-certo="1">Ativar mensagem</button>`);
      return;
    }
    botao.disabled = true;
    try {
      if (REAL) await cw(`campaigns/${id}`, 'PATCH', { campaign: { enabled: ativar } });
      else c.enabled = ativar;
      fecharGaveta();
      toast(ativar ? 'Mensagem ativa de novo.' : 'Mensagem pausada. Ninguém mais vê até você ativar.');
      carregar();
    } catch (err) {
      botao.disabled = false;
      if ($('#g-erro')) $('#g-erro').innerHTML = `<div class="erro">Não deu certo: ${esc(err.message)}</div>`;
      else toast(`Não deu certo: ${err.message}`);
    }
  }

  function perguntarApagar(id) {
    const c = camp.lista.find(x => x.id === id);
    gaveta('Apagar campanha?', `<p>A campanha <b>${esc(c.title)}</b> vai ser apagada e a mensagem para de aparecer no site. Isso não dá para desfazer.</p>
      <p class="muted">Se quiser só parar por um tempo, use Pausar.</p>`,
      `<button class="btn" data-fechar="1">Cancelar</button><button class="btn campanhas-perigo" data-camp-apagar-sim="${id}">Apagar campanha</button>`);
  }
  async function apagar(id, botao) {
    botao.disabled = true;
    try {
      if (REAL) await cw(`campaigns/${id}`, 'DELETE');
      else camp.lista = camp.lista.filter(x => x.id !== id);
      fecharGaveta(); toast('Campanha apagada.'); carregar();
    } catch (err) { botao.disabled = false; $('#g-erro').innerHTML = `<div class="erro">Não apagou: ${esc(err.message)}</div>`; }
  }

  // ---------- formulário: mensagem em massa (só para ver; envio desligado) ----------
  function formMassa() {
    const amanha = new Date(Date.now() + 864e5); amanha.setHours(10, 0, 0, 0);
    const local = new Date(amanha - amanha.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    gaveta('Mensagem em massa no WhatsApp', `
      <div class="nota-box campanhas-aviso">
        <b>Ainda não dá para enviar.</b> O WhatsApp só deixa mandar mensagem para muitas clientes de uma vez quando:
        <ol class="passos" style="margin-top:12px">
          <li><span>O <b>WhatsApp oficial</b> da Rosa Selvagem está conectado aqui. Hoje ainda não está.</span></li>
          <li><span>A mensagem é um <b>modelo aprovado pela Meta</b>. Texto livre é bloqueado pelo WhatsApp.</span></li>
        </ol>
        <p style="margin-top:12px">Quando os dois estiverem prontos, o botão de agendar passa a funcionar. Abaixo dá para ver como vai ser.</p>
      </div>
      <div class="campo"><label for="cm-titulo">Nome da campanha</label><input id="cm-titulo" placeholder="Ex.: Aviso da Black Friday"><small>Só a equipe vê este nome.</small></div>
      <div class="campo"><label for="cm-modelo">Modelo de mensagem</label>
        <select id="cm-modelo" disabled><option>Nenhum modelo aprovado ainda</option></select>
        <small>Os modelos são criados e aprovados na Meta.</small></div>
      <div class="campo"><label for="cm-etiqueta">Quem recebe</label>
        <select id="cm-etiqueta"><option value="">Escolha uma etiqueta</option>${camp.etiquetas.map(t => `<option value="${esc(t)}">${esc(nomeAssunto(t))}</option>`).join('')}</select>
        <small id="cm-quem">Só as clientes com a etiqueta escolhida recebem.</small></div>
      <div class="campo"><label for="cm-quando">Dia e hora do envio</label><input id="cm-quando" type="datetime-local" value="${local}"></div>`,
      `<button class="btn" data-fechar="1">Fechar</button><button class="btn prim" disabled title="Precisa do WhatsApp oficial e de modelos aprovados">Agendar envio</button>`);
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-camp-nova],[data-camp-editar],[data-camp-ligar],[data-camp-apagar],[data-camp-apagar-sim],[data-camp-conferir],[data-camp-voltar],[data-camp-salvar],[data-camp-recarregar]');
    if (!b) return;
    const d = b.dataset;
    if (d.campNova === 'site') formSite(null);
    else if (d.campNova === 'massa') formMassa();
    else if (d.campEditar) formSite(camp.lista.find(x => String(x.id) === d.campEditar));
    else if (d.campLigar) ligar(Number(d.campLigar), d.campPara === '1', b);
    else if (d.campApagar) perguntarApagar(Number(d.campApagar));
    else if (d.campApagarSim) apagar(Number(d.campApagarSim), b);
    else if (d.campConferir) conferir();
    else if (d.campVoltar) voltar();
    else if (d.campSalvar) salvar(b);
    else if (d.campRecarregar) carregar();
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'cp-onde') {
      const uma = e.target.value === 'uma';
      $('#cp-url').hidden = !uma;
      if (uma) $('#cp-url').focus();
    }
    if (e.target.id === 'cm-etiqueta') {
      $('#cm-quem').textContent = e.target.value
        ? `Receberiam todas as clientes com a etiqueta "${nomeAssunto(e.target.value)}" que já falaram com a Rosa Selvagem pelo WhatsApp.`
        : 'Só as clientes com a etiqueta escolhida recebem.';
    }
  });

  registrarPagina({
    id: 'campanhas', nome: 'Campanhas',
    ico: '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    niveis: ['dona'],
    render(el) {
      camp.el = el;
      desenhar();
      carregar();
    },
  });
})();
