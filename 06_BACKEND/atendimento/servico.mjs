// Serviço de atendimento: login de cada pessoa, usuários e níveis, ponte para o Chatwoot e a IA do SAC.
// Roda em 127.0.0.1:8790; o painel (server.ps1) repassa /api/atendimento/* para cá.
// Os tokens ficam aqui (00_CORE/Configuration/chatwoot.json e a sessão de cada pessoa) e nunca vão ao navegador.
//   node 06_BACKEND/atendimento/servico.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { iniciarIA, ASSUNTOS } from './ia.mjs';
import { iniciarAcompanhamento } from './acompanhamento.mjs';

const PORTA = Number(process.env.RS_PORTA) || 8790;
const HOST = process.env.RS_HOST || '127.0.0.1'; // na VPS (Docker) é 0.0.0.0, atrás do Caddy
// cookie só por HTTPS quando atrás do Caddy
const seguro = req => req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const CONF = path.join(RAIZ, '00_CORE/Configuration');
const CFG = path.join(CONF, 'chatwoot.json');
const NIVEIS_ARQ = path.join(CONF, 'atendimento-niveis.json');
const SESSOES_ARQ = path.join(CONF, 'atendimento-sessoes.json');
const DIAS_SESSAO = 30;

// Hierarquia: o Chatwoot só tem administrador e agente; a supervisora é um nível nosso por cima.
export const NIVEIS = {
  dona: { nome: 'Dona', desc: 'Faz tudo: conversas, equipe, integrações e usuários.', papel: 'administrator' },
  supervisora: { nome: 'Supervisora', desc: 'Atende, vê a equipe e passa conversas para quem estiver livre.', papel: 'agent' },
  atendente: { nome: 'Atendente', desc: 'Atende as conversas.', papel: 'agent' },
};

const lerJson = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return padrao; } };
const gravarJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const cfg = () => lerJson(CFG, null);
const semTokens = txt => txt.replace(/"(access_token|pubsub_token|password|hmac_token|secret|website_token)"\s*:\s*"[^"]*"/g, '"$1":null');

async function chamarCw(caminho, { method = 'GET', body, token, base = 'conta' } = {}) {
  const c = cfg();
  const prefixo = base === 'conta' ? `/api/v1/accounts/${c.conta}/` : base === 'plataforma' ? '/platform/api/v1/' : '/api/v1/';
  const r = await fetch(c.url.replace(/\/$/, '') + prefixo + caminho, {
    method, headers: { api_access_token: token || c.token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let j = {};
  try { j = txt ? JSON.parse(txt) : {}; } catch { j = { texto: txt }; }
  if (!r.ok) {
    const e = new Error(j.message || j.error || (j.errors && [].concat(j.errors).join(', ')) || `Chatwoot respondeu ${r.status}`);
    e.status = r.status; throw e;
  }
  return j;
}
const cw = (caminho, op = {}) => chamarCw(caminho, op);

// ---------- sessões ----------
let usuariaSistema = null;
const sessoes = new Map(Object.entries(lerJson(SESSOES_ARQ, {})));
const salvarSessoes = () => gravarJson(SESSOES_ARQ, Object.fromEntries(sessoes));
function sessaoDe(req) {
  const id = (req.headers.cookie || '').match(/(?:^|;\s*)atd=([a-f0-9]{64})/)?.[1];
  const s = id && sessoes.get(id);
  if (!s) return null;
  if (Date.now() - s.criada > DIAS_SESSAO * 864e5) { sessoes.delete(id); salvarSessoes(); return null; }
  return { id, ...s };
}
const nivelDe = (userId, papel) => lerJson(NIVEIS_ARQ, {})[userId] || (papel === 'administrator' ? 'dona' : 'atendente');

function senhaProvisoria() {
  const n = crypto.randomInt(1000, 9999), l = 'abcdefghjkmnpqrstuvwxyz';
  return `Rosa${n}!${l[crypto.randomInt(l.length)]}${l[crypto.randomInt(l.length)]}`;
}

// ---------- HTTP ----------
function responder(res, status, obj, cabecalhos = {}) {
  const corpo = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhos });
  res.end(corpo);
}
const lerCorpo = req => new Promise(ok => {
  const partes = [];
  req.on('data', d => partes.push(d));
  req.on('end', () => { const t = Buffer.concat(partes).toString('utf8'); try { ok(t ? JSON.parse(t) : {}); } catch { ok({}); } });
});

async function rota(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname.replace(/^\/api\/atendimento/, '');
  const m = req.method;
  const c = cfg();
  if (!c?.url || !c.token) return responder(res, 503, { erro: 'Chatwoot não configurado' });

  if (p === '/config') return responder(res, 200, { configurado: true });

  if (p === '/login' && m === 'POST') {
    const { email, senha } = await lerCorpo(req);
    const r = await fetch(c.url.replace(/\/$/, '') + '/auth/sign_in', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password: senha }),
    });
    const j = await r.json().catch(() => ({}));
    const d = j.data;
    if (!r.ok || !d?.access_token) return responder(res, 401, { erro: 'E-mail ou senha não conferem.' });
    const conta = (d.accounts || []).find(a => a.id === Number(c.conta));
    if (!conta) return responder(res, 403, { erro: 'Este usuário não faz parte da equipe da Rosa Selvagem.' });
    const id = crypto.randomBytes(32).toString('hex');
    sessoes.set(id, { token: d.access_token, userId: d.id, nome: d.available_name || d.name, email: d.email, papel: conta.role, criada: Date.now() });
    salvarSessoes();
    return responder(res, 200, { ok: true }, { 'Set-Cookie': `atd=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS_SESSAO * 86400}${seguro(req)}` });
  }

  let s = sessaoDe(req);
  // Sem login (chatwoot.json "login_obrigatorio": false, o padrão no teste): entra direto como a usuária de sistema.
  // Antes de ir para a VPS, ligue o login de novo.
  if (!s && c.login_obrigatorio !== true) {
    if (!usuariaSistema) {
      const p0 = await cw('profile', { base: 'api' });
      usuariaSistema = { id: null, token: c.token, userId: p0.id, nome: p0.available_name || p0.name, email: p0.email, papel: 'administrator', livre: true };
    }
    s = usuariaSistema;
  }
  if (!s) return responder(res, 401, { erro: 'login' });
  const souDona = nivelDe(s.userId, s.papel) === 'dona';

  if (p === '/sair' && m === 'POST') {
    sessoes.delete(s.id); salvarSessoes();
    return responder(res, 200, { ok: true }, { 'Set-Cookie': `atd=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${seguro(req)}` });
  }
  if (p === '/eu') return responder(res, 200, { login_livre: !!s.livre, id: s.userId, nome: s.nome, email: s.email, nivel: nivelDe(s.userId, s.papel), niveis: NIVEIS, assuntos: ASSUNTOS, ia_ligada: !!c.ia?.ligada });
  if (p === '/perfil') return responder(res, 200, semTokens(JSON.stringify(await cw('profile', { token: s.token, base: 'api' }))));
  if (p === '/perfil/disponibilidade' && m === 'POST') {
    const { availability } = await lerCorpo(req);
    await cw('profile/availability', { method: 'POST', base: 'api', token: s.token, body: { profile: { availability: String(availability), account_id: Number(c.conta) } } });
    return responder(res, 200, { ok: true });
  }
  if (p === '/minha-senha' && m === 'POST') {
    const { atual, nova } = await lerCorpo(req);
    await cw('profile', { method: 'PUT', base: 'api', token: s.token, body: { profile: { current_password: atual, password: nova, password_confirmation: nova } } });
    return responder(res, 200, { ok: true });
  }

  // ---------- usuários ----------
  if (p === '/usuarios' && m === 'GET') {
    const agentes = await cw('agents');
    const niveis = lerJson(NIVEIS_ARQ, {});
    return responder(res, 200, agentes.map(a => ({
      id: a.id, nome: a.available_name || a.name, email: a.email, nivel: niveis[a.id] || (a.role === 'administrator' ? 'dona' : 'atendente'),
      disponibilidade: a.availability_status, confirmado: a.confirmed,
    })));
  }
  if (p.startsWith('/usuarios') && !souDona) return responder(res, 403, { erro: 'Só a dona pode mexer nos usuários.' });
  if (p === '/usuarios' && m === 'POST') {
    const { nome, email, nivel } = await lerCorpo(req);
    if (!nome?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !NIVEIS[nivel]) return responder(res, 400, { erro: 'Preencha nome, e-mail e nível.' });
    const senha = senhaProvisoria();
    const u = await cw('users', { method: 'POST', base: 'plataforma', token: c.token_plataforma, body: { name: nome.trim(), display_name: nome.trim(), email: email.trim().toLowerCase(), password: senha } });
    await cw(`accounts/${c.conta}/account_users`, { method: 'POST', base: 'plataforma', token: c.token_plataforma, body: { user_id: u.id, role: NIVEIS[nivel].papel } });
    const caixas = (await cw('inboxes')).payload || [];
    for (const ib of caixas) await cw('inbox_members', { method: 'POST', body: { inbox_id: ib.id, user_ids: [u.id] } }).catch(() => {});
    const niveis = lerJson(NIVEIS_ARQ, {}); niveis[u.id] = nivel; gravarJson(NIVEIS_ARQ, niveis);
    return responder(res, 200, { id: u.id, email: u.email, senha });
  }
  let mm;
  if ((mm = p.match(/^\/usuarios\/(\d+)$/))) {
    const uid = Number(mm[1]);
    if (m === 'PATCH') {
      const { nivel } = await lerCorpo(req);
      if (!NIVEIS[nivel]) return responder(res, 400, { erro: 'Nível inválido.' });
      if (uid === s.userId && nivel !== 'dona') return responder(res, 400, { erro: 'Você não pode tirar o seu próprio acesso de dona.' });
      await cw(`accounts/${c.conta}/account_users`, { method: 'POST', base: 'plataforma', token: c.token_plataforma, body: { user_id: uid, role: NIVEIS[nivel].papel } });
      const niveis = lerJson(NIVEIS_ARQ, {}); niveis[uid] = nivel; gravarJson(NIVEIS_ARQ, niveis);
      return responder(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (uid === s.userId) return responder(res, 400, { erro: 'Você não pode remover a si mesma.' });
      await cw(`accounts/${c.conta}/account_users`, { method: 'DELETE', base: 'plataforma', token: c.token_plataforma, body: { user_id: uid } });
      for (const [k, v] of sessoes) if (v.userId === uid) sessoes.delete(k);
      salvarSessoes();
      return responder(res, 200, { ok: true });
    }
  }
  if ((mm = p.match(/^\/usuarios\/(\d+)\/senha$/)) && m === 'POST') {
    const uid = Number(mm[1]), senha = senhaProvisoria();
    await cw(`users/${uid}`, { method: 'PATCH', base: 'plataforma', token: c.token_plataforma, body: { password: senha } });
    for (const [k, v] of sessoes) if (v.userId === uid) sessoes.delete(k);
    salvarSessoes();
    return responder(res, 200, { senha });
  }

  // ---------- IA do SAC ----------
  if (p === '/ia' && m === 'POST') {
    if (!souDona) return responder(res, 403, { erro: 'Só a dona pode ligar ou desligar a IA.' });
    const { ligada } = await lerCorpo(req);
    const caixas = (await cw('inboxes')).payload || [];
    for (const ib of caixas) await cw(`inboxes/${ib.id}/set_agent_bot`, { method: 'POST', body: { agent_bot: ligada ? c.ia.bot_id : null } });
    const novo = cfg(); novo.ia.ligada = !!ligada; gravarJson(CFG, novo);
    return responder(res, 200, { ligada: !!ligada, caixas: caixas.length });
  }

  // ---------- rotas das seções (06_BACKEND/atendimento/rotas/*.mjs) ----------
  for (const r of await carregarRotas()) {
    const tratou = await r({ p, m, req, res, url, s, c, cw, lerCorpo, responder, souDona, nivel: nivelDe(s.userId, s.papel), RAIZ, lerJson, gravarJson });
    // vale também a rota que respondeu e esqueceu de devolver true
    if (tratou || res.headersSent) return;
  }

  // ---------- ponte genérica para a conta, com o token de quem está logada ----------
  if ((mm = p.match(/^\/cw\/([\w\-/]{1,200})$/)) && !mm[1].includes('..')) {
    const corpo = m === 'GET' ? undefined : await lerCorpo(req);
    const r = await fetch(`${c.url.replace(/\/$/, '')}/api/v1/accounts/${c.conta}/${mm[1]}${url.search}`, {
      method: m, headers: { api_access_token: s.token, 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return responder(res, r.status, semTokens(await r.text()));
  }
  return responder(res, 404, { erro: 'rota desconhecida' });
}

// Cada arquivo em rotas/ exporta "default async function (ctx)" e devolve true se respondeu.
let rotasCache = null;
async function carregarRotas() {
  if (rotasCache) return rotasCache;
  const pasta = path.join(AQUI, 'rotas');
  const arquivos = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter(f => f.endsWith('.mjs')).sort() : [];
  rotasCache = [];
  for (const f of arquivos) {
    try {
      const r = (await import(pathToFileURL(path.join(pasta, f)).href)).default;
      if (typeof r === 'function') rotasCache.push(r); else console.error(`rota ${f}: sem export default`);
    }
    catch (e) { console.error(`rota ${f}:`, e.message); }
  }
  return rotasCache;
}

// garante as etiquetas de assunto no Chatwoot
async function criarEtiquetas() {
  const existentes = new Set(((await cw('labels')).payload || []).map(l => l.title));
  for (const a of ASSUNTOS) {
    if (!existentes.has(a.id)) await cw('labels', { method: 'POST', body: { title: a.id, description: `${a.nome}: ${a.desc}`, color: '#71717A', show_on_sidebar: true } }).catch(() => {});
  }
}

// a tela do atendimento também é servida aqui (mais rápido que o painel, que atende um pedido por vez)
const TELA = path.join(RAIZ, '05_FRONTEND/atendimento');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
function servirTela(req, res) {
  const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (caminho === '/' || caminho === '/atendimento' || caminho === '/atendimento/') { res.writeHead(302, { Location: '/atendimento/index.html' }); return res.end(); }
  const arq = path.resolve(TELA, '.' + caminho.replace(/^\/atendimento/, ''));
  if (!arq.startsWith(TELA + path.sep) || !fs.existsSync(arq) || !fs.statSync(arq).isFile()) return responder(res, 404, { erro: 'não encontrado' });
  res.writeHead(200, { 'Content-Type': `${TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
}

http.createServer((req, res) => {
  if (req.method === 'GET' && !req.url.startsWith('/api/')) return servirTela(req, res);
  rota(req, res).catch(e => {
    if (res.headersSent) { console.error(`${req.method} ${req.url}: erro depois de responder: ${e.message}`); return; }
    responder(res, e.status && e.status < 500 ? e.status : 502, { erro: e.message });
  });
}).listen(PORTA, HOST, () => console.log(`Atendimento em http://${HOST}:${PORTA}`));

criarEtiquetas().catch(e => console.error('etiquetas:', e.message));
iniciarIA({ cfg, cw });
iniciarAcompanhamento({ cfg, cw });
