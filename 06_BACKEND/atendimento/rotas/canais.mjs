// Conectar canais com um clique (Integrações). Só a dona.
//   POST /canais/whatsapp   { marca, waba_id, phone_number_id, token } -> confere na Meta, cria a caixa e registra o webhook sozinho
//   POST /canais/telegram   { marca, token }                           -> cria a caixa; o Chatwoot registra o webhook no Telegram
//   POST /canais/site       { marca, url, boasvindas }                 -> cria o chat do site e devolve o código para colar
//   POST /canais/instagram                                             -> devolve o endereço do login do Instagram (OAuth da Meta)
//   GET  /canais/messenger                                             -> devolve o endereço da tela do Chatwoot que conecta a página do Facebook
//   POST /canais/preparar                                              -> deixa pronta toda caixa nova (equipe, distribuição, IA)
// Toda caixa criada aqui (ou pelo login da Meta) recebe: toda a equipe como membro, a distribuição automática de
// Configurações > Geral e a IA do SAC, se ela estiver ligada e a marca estiver liberada.
import fs from 'node:fs';
import path from 'node:path';

const MARCAS = { rosa: 'Rosa Selvagem', beyoung: 'Beyoung' };

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
      const waba = String(b.waba_id || '').trim(), fone = String(b.phone_number_id || '').trim(), tk = String(b.token || '').trim();
      if (!/^\d{6,}$/.test(waba) || !/^\d{6,}$/.test(fone)) { responder(res, 400, { erro: 'Os dois IDs são só números. Confira na Meta.' }); return true; }
      if (tk.length < 30) { responder(res, 400, { erro: 'Cole o token de acesso permanente inteiro.' }); return true; }
      // o Chatwoot confere tudo na Meta, cria a caixa e inscreve o app para receber as mensagens (webhook)
      const r = await cw('whatsapp/manual/connect', { method: 'POST', token, body: { waba_id: waba, phone_number_id: fone, access_token: tk, inbox_name: nomeCaixa('WhatsApp', b.marca) } });
      await preparar({ id: r.id, name: r.name });
      responder(res, 200, { id: r.id, nome: r.name, webhook_ok: !!r.webhook_setup, webhook_erro: r.webhook_error ? erroClaro(r.webhook_error) : null });
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
    responder(res, e.status && e.status < 500 ? 400 : 502, { erro: erroClaro(e.message) });
    return true;
  }
  return false;
}
