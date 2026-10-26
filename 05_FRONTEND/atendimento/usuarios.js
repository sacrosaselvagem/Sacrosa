// Página Usuários (só a dona vê): convidar pessoas, escolher o nível, gerar senha nova e remover.
// E a troca da própria senha, que qualquer pessoa faz pelo menu da conta.
'use strict';

const NIVEIS_DESC = {
  dona: 'Faz tudo: conversas, equipe, integrações, usuários e acessos.',
  supervisora: 'Atende, acompanha a equipe e o que a dona liberar abaixo.',
  atendente: 'Atende as conversas do seu setor e o que a dona liberar abaixo.',
};
let USUARIOS = [];
let ACESSOS = null; // { permissoes, tabela: { supervisora: {perm: bool}, atendente: {...} }, setores: [{id, nome}] }

async function renderUsuarios() {
  const alvo = $('#pag-usuarios');
  const menu = '<button class="btn icone fantasma abrir-menu" data-acao="menu-lateral" aria-label="Abrir menu"><svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';
  const cabeca = `<div class="pag-head" style="align-items:flex-start">${menu}<div style="flex:1"><h1>Usuários</h1><p>Quem entra no atendimento, em que setor trabalha e o que cada nível pode fazer.</p></div>
    ${REAL ? '<button class="btn prim" data-acao="convidar">Convidar pessoa</button>' : ''}</div>`;
  if (!REAL) { alvo.innerHTML = `<div class="pag-in">${cabeca}<div class="nota-box">Na demonstração não dá para convidar ninguém. Ligue o Chatwoot para usar esta página.</div></div>`; return; }
  try { [USUARIOS, ACESSOS] = await Promise.all([chamar('/api/atendimento/usuarios'), chamar('/api/atendimento/acessos')]); }
  catch (err) { alvo.innerHTML = `<div class="pag-in">${cabeca}<div class="erro">Não consegui carregar os usuários: ${esc(err.message)}</div></div>`; return; }
  const nomeSetor = id => ACESSOS.setores.find(t => t.id === id)?.nome || `time ${id}`;
  const linhas = USUARIOS.sort((a, b) => a.nome.localeCompare(b.nome)).map(u => {
    const souEu = `u${u.id}` === EU;
    const setores = (u.setores || []).map(nomeSetor);
    return `<div class="linha-u">
      <div class="quem"><span class="av lg">${esc(iniciais(u.nome))}</span><div style="min-width:0"><strong>${esc(u.nome)}${souEu ? ' (você)' : ''}</strong><span>${esc(u.email)}</span>
        <span class="setores-u">${setores.length ? `Setor: ${esc(setores.join(', '))}` : u.nivel === 'atendente' ? 'Sem setor: vê só as conversas sem setor e as dela' : 'Sem setor'}</span></div></div>
      <select data-nivel="${u.id}" aria-label="Nível de ${esc(u.nome)}" ${souEu ? 'disabled title="Você não pode mudar o seu próprio nível"' : ''}>
        ${Object.entries(NIVEIS_NOMES).map(([k, v]) => `<option value="${k}" ${u.nivel === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <div class="acoes-u"><button class="btn peq" data-setores="${u.id}">Setor</button>${souEu ? '' : `<button class="btn peq" data-nova-senha="${u.id}">Nova senha</button><button class="btn fantasma peq" data-remover="${u.id}">Remover</button>`}</div>
    </div>`;
  }).join('');
  const chave = (nivel, perm, ligado, rotulo) => `<button type="button" class="configuracoes-switch${ligado ? ' on' : ''}" role="switch" aria-checked="${ligado}" aria-label="${esc(rotulo)}" data-acesso="${perm}" data-acesso-nivel="${nivel}"><i></i></button>`;
  const acessos = Object.entries(ACESSOS.permissoes).map(([k, p]) => `<div class="acesso-linha">
      <div><strong>${esc(p.nome)}</strong><span>${esc(p.desc)}</span></div>
      <div class="acesso-col">${chave('supervisora', k, ACESSOS.tabela.supervisora[k], `${p.nome} para supervisora`)}</div>
      <div class="acesso-col">${chave('atendente', k, ACESSOS.tabela.atendente[k], `${p.nome} para atendente`)}</div>
    </div>`).join('');
  alvo.innerHTML = `<div class="pag-in">${cabeca}
    <div class="tabela">${linhas}</div>
    <div class="secao">Acessos por nível</div>
    <p class="desc">A dona pode tudo. Integrações, usuários, ligar a IA e estes acessos são só dela. O que estiver desligado some da tela e o sistema também bloqueia.</p>
    <div class="tabela acessos">
      <div class="acesso-linha cab"><div></div><div class="acesso-col">Supervisora</div><div class="acesso-col">Atendente</div></div>
      ${acessos}
    </div>
  </div>`;
}

async function mudarAcesso(botao) {
  const ligado = !botao.classList.contains('on');
  const { acesso: permissao, acessoNivel: nivel } = botao.dataset;
  botao.disabled = true;
  try {
    await chamar('/api/atendimento/acessos', 'POST', { nivel, permissao, ligado });
    botao.classList.toggle('on', ligado); botao.setAttribute('aria-checked', ligado);
    ACESSOS.tabela[nivel][permissao] = ligado;
    toast(`${ACESSOS.permissoes[permissao].nome}: ${ligado ? 'liberado' : 'bloqueado'} para ${NIVEIS_NOMES[nivel].toLowerCase()}. Vale na próxima vez que ela abrir o sistema.`);
  } catch (err) { toast(`Não deu certo: ${err.message}`); }
  botao.disabled = false;
}

function abrirSetores(p) {
  gaveta(`Setor de ${esc(p.nome.split(' ')[0])}`, `
    <p class="desc">A pessoa recebe as conversas desses setores. A atendente que não pode "ver todas as conversas" só vê as do setor dela, as que estão com ela e as que ainda não têm setor.</p>
    <div class="setores-op">${ACESSOS.setores.map(t => `<label><input type="checkbox" name="s-setor" value="${t.id}" ${(p.setores || []).includes(t.id) ? 'checked' : ''}> ${esc(t.nome)}</label>`).join('')}</div>`,
    `<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-acao="salvar-setores" data-uid="${p.id}">Salvar</button>`);
}
async function salvarSetores(botao) {
  const setores = [...document.querySelectorAll('input[name=s-setor]:checked')].map(x => Number(x.value));
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    await chamar(`/api/atendimento/usuarios/${botao.dataset.uid}/setores`, 'POST', { setores });
    fecharGaveta(); toast('Setor salvo.'); renderUsuarios();
  } catch (err) { botao.disabled = false; botao.textContent = 'Salvar'; $('#g-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`; }
}

function gaveta(titulo, corpo, pe) {
  $('#gaveta').innerHTML = `<div class="fundo" data-fechar="1">
    <div class="gaveta" role="dialog" aria-modal="true" aria-labelledby="g-titulo">
      <div class="gaveta-head"><h2 id="g-titulo">${titulo}</h2>
        <button class="btn icone fantasma" data-fechar="1" aria-label="Fechar">${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="gaveta-corpo">${corpo}<div id="g-erro"></div></div>
      <div class="gaveta-pe">${pe}</div>
    </div></div>`;
  $('#gaveta').querySelector('input:not([type=radio])')?.focus();
}

// mensagem pronta para mandar pelo WhatsApp para a pessoa nova
function mostrarAcesso(titulo, nome, email, senha) {
  const link = `${location.origin}/atendimento/index.html`;
  const msg = `Oi, ${nome.split(' ')[0]}! Seu acesso ao atendimento da Rosa Selvagem:\n\nEndereço: ${link}\nE-mail: ${email}\nSenha: ${senha}\n\nDepois de entrar, troque a senha no menu da sua conta (os três pontinhos embaixo, à esquerda).`;
  gaveta(titulo, `
    <div class="sucesso">Pronto. Mande estes dados para ${esc(nome.split(' ')[0])}. A senha só aparece agora.</div>
    <dl class="acesso"><dt>Endereço</dt><dd>${esc(link)}</dd><dt>E-mail</dt><dd>${esc(email)}</dd><dt>Senha</dt><dd>${esc(senha)}</dd></dl>
    <div class="campo"><label>Mensagem pronta</label><div class="codigo"><pre id="g-msg">${esc(msg)}</pre><button class="btn peq" data-copiar="g-msg">Copiar</button></div></div>`,
    '<button class="btn prim" data-fechar="1">Feito</button>');
}

function abrirConvite() {
  gaveta('Convidar pessoa', `
    <div class="campo"><label for="u-nome">Nome</label><input id="u-nome" autocomplete="off" placeholder="Carla Souza"></div>
    <div class="campo"><label for="u-email">E-mail</label><input id="u-email" type="email" autocomplete="off" placeholder="carla@rosaselvagemoficial.com.br"></div>
    <div class="campo"><label>Nível</label><div class="niveis">
      ${Object.entries(NIVEIS_NOMES).map(([k, v]) => `<label class="nivel-op"><input type="radio" name="u-nivel" value="${k}" ${k === 'atendente' ? 'checked' : ''}><span><b>${v}</b><span>${NIVEIS_DESC[k]}</span></span></label>`).join('')}
    </div></div>
    ${ACESSOS?.setores?.length ? `<div class="campo"><label>Setor <span class="muted" style="font-weight:400">(a atendente vê só as conversas do setor dela)</span></label><div class="setores-op">
      ${ACESSOS.setores.map(t => `<label><input type="checkbox" name="u-setor" value="${t.id}"> ${esc(t.nome)}</label>`).join('')}</div></div>` : ''}`,
    '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-acao="criar-usuario">Criar acesso</button>');
}

async function criarUsuario(botao) {
  const nome = $('#u-nome').value.trim(), email = $('#u-email').value.trim();
  const nivel = document.querySelector('input[name=u-nivel]:checked')?.value;
  if (!nome) return void ($('#g-erro').innerHTML = '<div class="erro">Escreva o nome da pessoa.</div>');
  if (!/^\S+@\S+\.\S+$/.test(email)) return void ($('#g-erro').innerHTML = '<div class="erro">Confira o e-mail.</div>');
  botao.disabled = true; botao.textContent = 'Criando…';
  try {
    const setores = [...document.querySelectorAll('input[name=u-setor]:checked')].map(x => Number(x.value));
    const r = await chamar('/api/atendimento/usuarios', 'POST', { nome, email, nivel, setores });
    renderUsuarios();
    mostrarAcesso('Acesso criado', nome, r.email, r.senha);
  } catch (err) {
    botao.disabled = false; botao.textContent = 'Criar acesso';
    $('#g-erro').innerHTML = `<div class="erro">${/taken|already|em uso/i.test(err.message) ? 'Esse e-mail já tem acesso.' : esc(err.message)}</div>`;
  }
}

function abrirTrocarSenha() {
  gaveta('Trocar minha senha', `
    <div class="campo"><label for="s-atual">Senha atual</label><input id="s-atual" type="password" autocomplete="current-password"></div>
    <div class="campo"><label for="s-nova">Senha nova</label><input id="s-nova" type="password" autocomplete="new-password"><small>Pelo menos 6 caracteres, com letra maiúscula, minúscula, número e um símbolo (como ! ou @).</small></div>`,
    '<button class="btn fantasma" data-fechar="1">Cancelar</button><button class="btn prim" data-acao="salvar-senha">Salvar senha</button>');
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-acao="convidar"],[data-acao="criar-usuario"],[data-acao="salvar-senha"],[data-nova-senha],[data-remover],[data-setores],[data-acao="salvar-setores"],[data-acesso]');
  if (!el) return;
  const u = id => USUARIOS.find(x => x.id === Number(id));
  if (el.dataset.acesso) { mudarAcesso(el); return; }
  if (el.dataset.setores) { abrirSetores(u(el.dataset.setores)); return; }
  if (el.dataset.acao === 'salvar-setores') { salvarSetores(el); return; }
  if (el.dataset.acao === 'convidar') abrirConvite();
  else if (el.dataset.acao === 'criar-usuario') criarUsuario(el);
  else if (el.dataset.acao === 'salvar-senha') {
    el.disabled = true;
    try {
      await chamar('/api/atendimento/minha-senha', 'POST', { atual: $('#s-atual').value, nova: $('#s-nova').value });
      fecharGaveta(); toast('Senha trocada.');
    } catch (err) {
      el.disabled = false;
      $('#g-erro').innerHTML = `<div class="erro">${/current|atual|invalid/i.test(err.message) ? 'A senha atual não confere.' : 'A senha nova precisa de maiúscula, minúscula, número e símbolo, com pelo menos 6 caracteres.'}</div>`;
    }
  } else if (el.dataset.novaSenha) {
    const p = u(el.dataset.novaSenha);
    if (!confirm(`Gerar uma senha nova para ${p.nome}? A senha antiga para de funcionar.`)) return;
    try { const r = await chamar(`/api/atendimento/usuarios/${p.id}/senha`, 'POST', {}); mostrarAcesso('Senha nova', p.nome, p.email, r.senha); }
    catch (err) { toast(`Não deu certo: ${err.message}`); }
  } else if (el.dataset.remover) {
    const p = u(el.dataset.remover);
    if (!confirm(`Remover o acesso de ${p.nome}? As conversas dela continuam no histórico.`)) return;
    try { await chamar(`/api/atendimento/usuarios/${p.id}`, 'DELETE', {}); toast(`${p.nome} não tem mais acesso.`); renderUsuarios(); }
    catch (err) { toast(`Não deu certo: ${err.message}`); }
  }
});

document.addEventListener('change', async e => {
  const id = e.target.dataset?.nivel;
  if (!id) return;
  const p = USUARIOS.find(x => x.id === Number(id));
  try {
    await chamar(`/api/atendimento/usuarios/${id}`, 'PATCH', { nivel: e.target.value });
    toast(`${p.nome} agora é ${NIVEIS_NOMES[e.target.value].toLowerCase()}.`);
    renderUsuarios();
  } catch (err) { toast(`Não deu certo: ${err.message}`); renderUsuarios(); }
});
