// Conectar canais com um clique (Integrações). Só a dona.
//   POST /canais/whatsapp   { marca, token, numero }                   -> acha sozinho a conta (WABA) e o ID do número na Meta,
//                                                                         cria a caixa e registra o webhook. Aceita também waba_id / phone_number_id.
//   POST /canais/telegram   { marca, token }                           -> cria a caixa; o Chatwoot registra o webhook no Telegram
//   POST /canais/site       { marca, url, boasvindas }                 -> cria o chat do site e devolve o código para colar
//   POST /canais/instagram                                             -> devolve o endereço do login do Instagram (OAuth da Meta)
//   GET  /canais/messenger                                             -> devolve o endereço da tela do Chatwoot que conecta a página do Facebook
//   POST /canais/preparar                                              -> deixa pronta toda caixa nova (equipe, distribuição, IA)
//   GET  /canais/app-meta                                              -> o app da Meta já está no sistema? + endereços para colar na Meta
//   POST /canais/app-meta   { app_id, app_secret, ig_app_id, ig_app_secret } -> confere na Meta e grava no Chatwoot (sem reiniciar)
// Toda caixa criada aqui (ou pelo login da Meta) recebe: toda a equipe como membro, a distribuição automática de
// Configurações > Geral e a IA do SAC, se ela estiver ligada e a marca estiver liberada.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MARCAS = { rosa: 'Rosa Selvagem', beyoung: 'Beyoung' };
const GRAPH = 'https://graph.facebook.com/v22.0';

async function graph(caminho, tk) {
  const r = await fetch(`${GRAPH}/${caminho}${caminho.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(tk)}`);
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.message || 'erro da Meta');
  return j;
}

// Com o token e o número (ou o ID do número), descobre a conta do WhatsApp Business e o ID do número.
// Contas: as que o token enxerga (debug_token) e, se não der, as das empresas do token (/me/businesses).
const soDigitos = t => String(t || '').replace(/\D/g, '');
function mesmoNumero(a, b) {
  const x = soDigitos(a).replace(/^55/, ''), y = soDigitos(b).replace(/^55/, '');
  if (!x || !y) return false;
  const sem9 = n => n.length === 11 && n[2] === '9' ? n.slice(0, 2) + n.slice(3) : n; // celular com e sem o 9 na frente
  return x === y || sem9(x) === sem9(y);
}
// ---------- app da Meta (Instagram e Messenger) ----------
// Os segredos vão só para o Chatwoot (tabela installation_configs, que ele lê na hora). Aqui fica o que não é segredo:
// os IDs dos apps e os tokens de verificação dos webhooks (00_CORE/Configuration/meta-app.json).
function gravarNoChatwoot(container, valores) {
  return new Promise((ok, falha) => {
    const ruby = "cfg = JSON.parse(STDIN.read); cfg.each { |k, v| c = InstallationConfig.find_or_initialize_by(name: k); c.value = v; c.locked = false; c.save! }; puts 'gravado'";
    const p = spawn('docker', ['exec', '-i', container, 'bundle', 'exec', 'rails', 'runner', ruby], { windowsHide: true });
    let saida = '';
    p.stdout.on('data', d => { saida += d; });
    p.stderr.on('data', d => { saida += d; });
    p.on('error', e => falha(new Error(`não consegui falar com o Chatwoot (${e.message})`)));
    p.on('close', cod => (cod === 0 && /gravado/.test(saida) ? ok() : falha(new Error(`o Chatwoot não gravou (${saida.trim().split(/\n/).pop()?.slice(0, 160)})`))));
    p.stdin.end(JSON.stringify(valores));
  });
}
// WhatsApp: a Meta só deixa mandar as mensagens de um número para cá depois que o app tem o webhook do WhatsApp
// ligado no nível do app. Isso pede a chave secreta do app (o token não basta). Com ela no Chatwoot, liga o webhook
// do app e aponta cada número para cá. Devolve [{ numero, ok, erro }].
const RUBY_WEBHOOK_WA = `
app_id = GlobalConfigService.load('FB_APP_ID', ''); sec = GlobalConfigService.load('FB_APP_SECRET', '')
if app_id.blank? || sec.blank? then puts 'R ' + { erro: 'sem-app' }.to_json; exit end
canais = Channel::Whatsapp.where(provider: 'whatsapp_cloud').to_a
if canais.empty? then puts 'R ' + { erro: 'sem-whatsapp' }.to_json; exit end
g = 'https://graph.facebook.com/v22.0'
url = ->(c) { "#{ENV['FRONTEND_URL']}/webhooks/whatsapp/#{c.phone_number}" }
c0 = canais.first
r = HTTParty.post("#{g}/#{app_id}/subscriptions", body: { object: 'whatsapp_business_account', callback_url: url.(c0), verify_token: c0.provider_config['webhook_verify_token'], fields: 'messages', access_token: "#{app_id}|#{sec}" })
app = { ok: r.code == 200, erro: (JSON.parse(r.body)['error']['message'] rescue nil) }
numeros = canais.map do |c|
  pc = c.provider_config
  s = HTTParty.post("#{g}/#{pc['business_account_id']}/subscribed_apps", headers: { 'Authorization' => "Bearer #{pc['api_key']}", 'Content-Type' => 'application/json' },
    body: { override_callback_uri: url.(c), verify_token: pc['webhook_verify_token'] }.to_json)
  { numero: c.phone_number, caixa: c.inbox&.name, ok: s.code == 200, erro: (JSON.parse(s.body)['error']['message'] rescue nil) }
end
puts 'R ' + { app: app, numeros: numeros }.to_json`;
function rodarNoChatwoot(container, ruby, entrada = '') {
  return new Promise((ok, falha) => {
    const p = spawn('docker', ['exec', '-i', container, 'bundle', 'exec', 'rails', 'runner', ruby], { windowsHide: true });
    let saida = '';
    p.stdout.on('data', d => { saida += d; });
    p.stderr.on('data', d => { saida += d; });
    p.on('error', e => falha(new Error(`não consegui falar com o Chatwoot (${e.message})`)));
    p.on('close', () => { const l = saida.split(/\n/).find(x => x.startsWith('R ')); l ? ok(JSON.parse(l.slice(2))) : falha(new Error(`o Chatwoot não respondeu (${saida.trim().split(/\n/).pop()?.slice(0, 160)})`)); });
    p.stdin.end(entrada);
  });
}
export const ligarWebhooksWhatsApp = container => rodarNoChatwoot(container, RUBY_WEBHOOK_WA);

async function conferirApp(id, segredo) {
  const r = await fetch(`${GRAPH}/${id}?fields=name&access_token=${encodeURIComponent(`${id}|${segredo}`)}`);
  const j = await r.json().catch(() => ({}));
  if (j.error || !j.name) throw new Error(j.error?.message || 'a Meta não reconheceu o app');
  return j.name;
}

const claro = msg => Object.assign(new Error(msg), { claro: true }); // mensagem já em português, sem tradução
async function acharWhatsApp(tk, numero, conta) {
  let eu;
  try { eu = await graph('me?fields=id,name', tk); }
  catch (e) { throw claro(/expired|session has expired/i.test(e.message) ? 'Esse token já venceu. Gere um token permanente (de usuário do sistema) e cole de novo.' : 'A Meta não aceitou o token. Copie de novo, inteiro.'); }
  const wabas = new Set(), pista = { tipo: '', permissoes: [], tentativas: [] };
  const tentar = async (nome, fn) => { try { const n = wabas.size; await fn(); pista.tentativas.push(`${nome}: ${wabas.size - n}`); } catch (e) { pista.tentativas.push(`${nome}: ${String(e.message).slice(0, 90)}`); } };
  // 1) o ID da conta, se ela colou (ou se o "número" é na verdade o ID da conta)
  for (const id of [soDigitos(conta), soDigitos(numero)].filter(x => x.length >= 14)) {
    await tentar(`id ${id}`, async () => { const l = await graph(`${id}/phone_numbers?fields=id&limit=1`, tk); if (l.data) wabas.add(id); });
  }
  // 2) as contas que o token enxerga
  await tentar('debug_token', async () => {
    const d = await graph(`debug_token?input_token=${encodeURIComponent(tk)}`, tk);
    pista.tipo = d.data?.type || '';
    pista.permissoes = d.data?.scopes || [];
    for (const g of d.data?.granular_scopes || []) if (/^whatsapp_business_(management|messaging)$/.test(g.scope)) (g.target_ids || []).forEach(id => wabas.add(id));
  });
  if (!pista.permissoes.length) await tentar('permissoes', async () => { const p = await graph('me/permissions', tk); pista.permissoes = (p.data || []).filter(x => x.status === 'granted').map(x => x.permission); });
  // 3) usuário do sistema: contas atribuídas a ele
  if (!wabas.size) await tentar('atribuidas', async () => { const l = await graph(`${eu.id}/assigned_whatsapp_business_accounts?fields=id&limit=50`, tk); (l.data || []).forEach(w => wabas.add(w.id)); });
  // 4) as empresas do token (precisa de business_management). Usuário do sistema não lista empresas em /me/businesses:
  //    acha a empresa pelas páginas e contas de anúncio atribuídas a ele.
  if (!wabas.size) await tentar('empresas', async () => {
    const empresas = new Set(((await graph('me/businesses?fields=id&limit=50', tk).catch(() => ({}))).data || []).map(b => b.id));
    for (const ativo of ['assigned_pages', 'assigned_ad_accounts', 'accounts']) {
      const l = await graph(`me/${ativo}?fields=business{id}&limit=50`, tk).catch(() => ({}));
      for (const x of l.data || []) if (x.business?.id) empresas.add(x.business.id);
    }
    for (const b of [...empresas].map(id => ({ id }))) for (const tipo of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const l = await graph(`${b.id}/${tipo}?fields=id&limit=50`, tk).catch(() => ({}));
      (l.data || []).forEach(w => wabas.add(w.id));
    }
  });
  if (!wabas.size) {
    registrar({ etapa: 'whatsapp-sem-conta', tipo: pista.tipo, permissoes: pista.permissoes, tentativas: pista.tentativas });
    const faltaPerm = ['whatsapp_business_management', 'whatsapp_business_messaging'].filter(x => pista.permissoes.length && !pista.permissoes.includes(x));
    throw claro(faltaPerm.length
      ? `O token não tem a permissão ${faltaPerm.join(' e ')}. Gere o token de novo marcando ${faltaPerm.join(' e ')}.`
      : 'A Meta não disse a qual conta do WhatsApp esse token pertence. Cole também o "ID da conta do WhatsApp Business": em developers.facebook.com, no app, WhatsApp > Configuração da API, logo abaixo do número.');
  }
  const todos = [];
  for (const waba of wabas) {
    const l = await graph(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=50`, tk).catch(() => ({}));
    for (const n of l.data || []) todos.push({ waba, id: n.id, numero: n.display_phone_number, nome: n.verified_name, status: n.status });
  }
  todos.sort((a, b) => (a.status === 'CONNECTED' ? 0 : 1) - (b.status === 'CONNECTED' ? 0 : 1)); // o mesmo número em duas contas: vale o ativo
  const alvo = soDigitos(numero).length >= 14 && wabas.has(soDigitos(numero)) ? '' : soDigitos(numero);
  const achado = alvo ? todos.find(n => n.id === alvo || mesmoNumero(n.numero, alvo)) : todos.length === 1 ? todos[0] : null;
  if (achado) return achado;
  if (!todos.length) throw claro('A conta do WhatsApp Business desse token não tem nenhum número cadastrado.');
  throw claro(`${alvo ? 'Esse número não está nesse token.' : 'Esse token tem mais de um número.'} Números que ele enxerga: ${todos.map(n => `${n.numero}${n.nome ? ` (${n.nome})` : ''}`).join(', ')}.`);
}
// registro sem token, para entender o que a Meta respondeu
function registrar(o) {
  try {
    const f = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../07_LOGS/atendimento/canais.jsonl');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n');
  } catch { /* só registro */ }
}

// as mensagens de erro do Chatwoot e da Meta vêm em inglês: traduz as comuns
function erroClaro(msg) {
  const m = String(msg || '');
  if (/does not belong to the WABA/i.test(m)) return 'Esse ID do número não pertence a essa conta do WhatsApp Business. Confira os dois IDs.';
  if (/verification/i.test(m)) return 'O número ainda não terminou a verificação na Meta. Termine lá e tente de novo.';
  if (/already connected/i.test(m)) return 'Esse número já está conectado aqui.';
  if (/access token|OAuthException|expired|Invalid OAuth/i.test(m)) return 'A Meta não aceitou o token. Gere um token permanente de novo e cole aqui.';
  if (/whatsapp_business_messaging|permission/i.test(m)) return 'O token não tem a permissão de mandar mensagens do WhatsApp (whatsapp_business_messaging).';
  if (/template/i.test(m)) return 'O token não consegue ler os modelos de mensagem. Dê a permissão whatsapp_business_management.';
  if (/Bot token|invalid token/i.test(m) || (/Unauthorized|401/i.test(m) && /telegram|bot/i.test(m))) return 'O Telegram não aceitou o token do robô. Copie de novo no @BotFather.';
  return m;
}

export default async function ({ p, m, req, res, s, c, cw, lerCorpo, responder, souDona, RAIZ, lerJson, gravarJson }) {
  if (!p.startsWith('/canais')) return false;
  if (!souDona) { responder(res, 403, { erro: 'Só a dona conecta canais.' }); return true; }
  const token = c.token; // o servidor usa o acesso de administração para criar e preparar as caixas
  const publica = (c.url_publica || '').replace(/\/$/, '');
  const ARQ_PRONTAS = path.join(RAIZ, '07_LOGS/atendimento/caixas-preparadas.json');

  async function preparar(ib) {
    const geral = lerJson(path.join(RAIZ, '00_CORE/Configuration/atendimento-geral.json'), {});
    const agentes = await cw('agents', { token }).catch(() => []);
    const ids = (agentes || []).map(a => a.id);
    if (ids.length) await cw('inbox_members', { method: 'POST', token, body: { inbox_id: ib.id, user_ids: ids } }).catch(() => {});
    const auto = geral.distribuicao?.automatica !== false;
    await cw(`inboxes/${ib.id}`, { method: 'PATCH', token, body: { enable_auto_assignment: auto } }).catch(() => {});
    const marca = /beyoung/i.test(ib.name || '') ? 'Beyoung' : 'Rosa Selvagem';
    // a IA entra na caixa mesmo para marca ainda não liberada: ela manda o aviso de espera e passa para a equipe
    if (c.ia?.ligada && c.ia?.bot_id) await cw(`inboxes/${ib.id}/set_agent_bot`, { method: 'POST', token, body: { agent_bot: c.ia.bot_id } }).catch(() => {});
    const prontas = lerJson(ARQ_PRONTAS, {});
    prontas[ib.id] = { nome: ib.name, marca, em: new Date().toISOString() };
    fs.mkdirSync(path.dirname(ARQ_PRONTAS), { recursive: true });
    gravarJson(ARQ_PRONTAS, prontas);
  }

  const nomeCaixa = (canal, marca) => `${canal} ${MARCAS[marca] || 'Rosa Selvagem'}`;

  try {
    if (p === '/canais/whatsapp' && m === 'POST') {
      const b = await lerCorpo(req);
      const tk = String(b.token || '').trim();
      if (tk.length < 30) { responder(res, 400, { erro: 'Cole o token de acesso inteiro.' }); return true; }
      let waba = soDigitos(b.waba_id), fone = soDigitos(b.phone_number_id);
      if (!waba || !fone) {
        const n = await acharWhatsApp(tk, b.numero || b.phone_number_id, b.conta || b.waba_id);
        waba = n.waba; fone = n.id;
      }
      // o Chatwoot confere tudo na Meta, cria a caixa e inscreve o app para receber as mensagens (webhook)
      const r = await cw('whatsapp/manual/connect', { method: 'POST', token, body: { waba_id: waba, phone_number_id: fone, access_token: tk, inbox_name: String(b.nome || '').trim().slice(0, 60) || nomeCaixa('WhatsApp', b.marca) } });
      await preparar({ id: r.id, name: r.name });
      let webhook_erro = r.webhook_error ? erroClaro(r.webhook_error) : null;
      if (/must be subscribed to receive messages/i.test(r.webhook_error || '')) {
        // falta o webhook do WhatsApp no nível do app: se a chave do app já estiver aqui, liga sozinho
        const w = await ligarWebhooksWhatsApp(c.chatwoot_container || 'chatwoot-rosa-rails-1').catch(e => ({ erro: e.message }));
        const meu = (w.numeros || []).find(x => x.caixa === r.name);
        webhook_erro = meu?.ok ? null : w.erro === 'sem-app'
          ? 'Falta um passo para as mensagens chegarem: em Integrações > App da Meta, cole o ID e a chave secreta do app do token. O sistema liga o resto sozinho.'
          : `A Meta não ligou o recebimento: ${meu?.erro || w.app?.erro || w.erro}`;
      }
      responder(res, 200, { id: r.id, nome: r.name, webhook_ok: !webhook_erro, webhook_erro });
      return true;
    }
    if (p === '/canais/telegram' && m === 'POST') {
      const b = await lerCorpo(req);
      const tk = String(b.token || '').trim();
      if (!/^\d+:[\w-]{30,}$/.test(tk)) { responder(res, 400, { erro: 'O token do robô tem o formato 123456789:ABC… Copie de novo no @BotFather.' }); return true; }
      const ib = await cw('inboxes', { method: 'POST', token, body: { name: nomeCaixa('Telegram', b.marca), channel: { type: 'telegram', bot_token: tk } } });
      await preparar(ib);
      responder(res, 200, { id: ib.id, nome: ib.name });
      return true;
    }
    if (p === '/canais/site' && m === 'POST') {
      const b = await lerCorpo(req);
      const url = String(b.url || '').trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) { responder(res, 400, { erro: 'Escreva o endereço completo do site, começando com https://' }); return true; }
      const ib = await cw('inboxes', { method: 'POST', token, body: { name: nomeCaixa('Chat do site', b.marca), channel: { type: 'web_widget', website_url: url, widget_color: '#18181b', welcome_title: 'Fale com a gente', welcome_tagline: String(b.boasvindas || '').trim() || 'Oi! Como podemos te ajudar?' } } });
      await preparar(ib);
      responder(res, 200, { id: ib.id, nome: ib.name, codigo: ib.web_widget_script || null });
      return true;
    }
    if (p === '/canais/instagram' && m === 'POST') {
      if (!publica) { responder(res, 409, { erro: 'O Instagram só conecta com o sistema na VPS (endereço público com HTTPS).' }); return true; }
      const r = await cw('instagram/authorization', { method: 'POST', token, body: {} });
      if (!r.url) { responder(res, 409, { erro: 'O app da Meta ainda não está configurado no servidor (INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET no .env).' }); return true; }
      responder(res, 200, { url: r.url });
      return true;
    }
    if (p === '/canais/messenger' && m === 'GET') {
      if (!publica) { responder(res, 409, { erro: 'O Messenger só conecta com o sistema na VPS (endereço público com HTTPS).' }); return true; }
      responder(res, 200, { url: `${publica}/app/accounts/${c.conta}/settings/inboxes/new` });
      return true;
    }
    if (p === '/canais/app-meta') {
      const ARQ = path.join(RAIZ, '00_CORE/Configuration/meta-app.json');
      const salvo = lerJson(ARQ, {});
      const enderecos = () => {
        const a = lerJson(ARQ, {});
        const base = publica || '(endereço público do Chatwoot)';
        return {
          facebook: !!a.app_id, instagram: !!a.ig_app_id, nome: a.nome || '', nome_ig: a.nome_ig || '', publica: !!publica,
          dominio: base.replace(/^https?:\/\//, ''),
          messenger_webhook: `${base}/bot`, instagram_webhook: `${base}/webhooks/instagram`,
          instagram_retorno: `${base}/instagram/callback`, verificacao: a.verificacao || '',
        };
      };
      if (m === 'GET') { responder(res, 200, enderecos()); return true; }
      if (m === 'POST') {
        const b = await lerCorpo(req);
        const app_id = soDigitos(b.app_id), app_secret = String(b.app_secret || '').trim();
        const ig_app_id = soDigitos(b.ig_app_id), ig_app_secret = String(b.ig_app_secret || '').trim();
        if (!app_id || app_secret.length < 20) { responder(res, 400, { erro: 'Cole o ID do app e a chave secreta do app (Configurações do app > Básico).' }); return true; }
        if (ig_app_id && ig_app_secret.length < 20) { responder(res, 400, { erro: 'Cole também a chave secreta do app do Instagram.' }); return true; }
        let nome, nome_ig = '';
        try { nome = await conferirApp(app_id, app_secret); }
        catch (e) { responder(res, 400, { erro: `A Meta não aceitou o ID e a chave do app: ${e.message}. Copie de novo em Configurações do app > Básico.` }); return true; }
        if (ig_app_id) {
          try { nome_ig = await conferirApp(ig_app_id, ig_app_secret); }
          catch (e) { responder(res, 400, { erro: `A Meta não aceitou o ID e a chave do app do Instagram: ${e.message}. Copie de novo em Instagram > Configuração da API com login do Instagram.` }); return true; }
        }
        const verificacao = salvo.verificacao || crypto.randomBytes(18).toString('hex');
        const valores = { FB_APP_ID: app_id, FB_APP_SECRET: app_secret, FB_VERIFY_TOKEN: verificacao, IG_VERIFY_TOKEN: verificacao, INSTAGRAM_VERIFY_TOKEN: verificacao };
        if (ig_app_id) Object.assign(valores, { INSTAGRAM_APP_ID: ig_app_id, INSTAGRAM_APP_SECRET: ig_app_secret });
        await gravarNoChatwoot(c.chatwoot_container || 'chatwoot-rosa-rails-1', valores);
        gravarJson(ARQ, { ...salvo, app_id, nome, ...(ig_app_id ? { ig_app_id, nome_ig } : {}), verificacao, em: new Date().toISOString(), por: s?.nome || 'dona' });
        // com a chave do app, os números de WhatsApp já conectados passam a receber as mensagens
        const whatsapp = await ligarWebhooksWhatsApp(c.chatwoot_container || 'chatwoot-rosa-rails-1').catch(e => ({ erro: e.message }));
        responder(res, 200, { ok: true, ...enderecos(), whatsapp });
        return true;
      }
    }
    if (p === '/canais/preparar' && m === 'POST') {
      // caixas criadas pelo login da Meta (Instagram, Messenger) não passaram por aqui: prepara agora
      const prontas = lerJson(ARQ_PRONTAS, {});
      const caixas = (await cw('inboxes', { token })).payload || [];
      const novas = caixas.filter(ib => !prontas[ib.id]);
      for (const ib of novas) await preparar(ib);
      responder(res, 200, { preparadas: novas.map(ib => ib.name) });
      return true;
    }
  } catch (e) {
    responder(res, e.claro || (e.status && e.status < 500) ? 400 : 502, { erro: e.claro ? e.message : erroClaro(e.message) });
    return true;
  }
  return false;
}
