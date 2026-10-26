// Campanhas: trava em cima da ponte /cw/campaigns.
// - Só a dona cria, muda, pausa ou apaga campanha.
// - Só aceita "Mensagem no site" (campanha contínua numa caixa do tipo chat do site).
//   Mensagem em massa (one_off: WhatsApp/SMS) fica bloqueada aqui até o WhatsApp oficial e os modelos aprovados.
// A leitura (GET) segue pela ponte genérica. Contrato: 09_DOCUMENTATION/atendimento-modulos.md
const TIPO_SITE = 'Channel::WebWidget';
const semTokens = txt => txt.replace(/"(access_token|pubsub_token|password|hmac_token|secret)"\s*:\s*"[^"]*"/g, '"$1":null');

export default async function ({ p, m, req, res, s, cw, lerCorpo, responder, pode }) {
  const mm = p.match(/^\/cw\/campaigns(?:\/(\d+))?$/);
  if (!mm || m === 'GET') return false;
  if (!pode('campanhas')) { responder(res, 403, { erro: 'Seu acesso não inclui as campanhas.' }); return true; }
  const id = mm[1];
  const op = { token: s.token };

  if (m === 'DELETE' && id) {
    await cw(`campaigns/${id}`, { ...op, method: 'DELETE' });
    responder(res, 200, { ok: true });
    return true;
  }
  if (!((m === 'POST' && !id) || ((m === 'PATCH' || m === 'PUT') && id))) {
    responder(res, 405, { erro: 'Ação não aceita.' });
    return true;
  }

  const corpo = await lerCorpo(req);
  const camp = corpo.campaign || corpo;
  let inboxId = camp.inbox_id;
  if (!inboxId && id) inboxId = (await cw(`campaigns/${id}`, op)).inbox?.id;
  if (!inboxId) { responder(res, 400, { erro: 'Escolha onde a mensagem vai aparecer.' }); return true; }
  const caixa = await cw(`inboxes/${inboxId}`, op);
  if (caixa.channel_type !== TIPO_SITE) {
    responder(res, 400, { erro: 'Por enquanto só dá para criar mensagem no chat do site. A mensagem em massa no WhatsApp precisa do WhatsApp oficial conectado e de modelos aprovados pela Meta.' });
    return true;
  }
  // nunca deixa passar agendamento ou público de envio em massa
  const limpo = { ...camp };
  delete limpo.scheduled_at; delete limpo.audience; delete limpo.template_params;
  const r = await cw(id ? `campaigns/${id}` : 'campaigns', { ...op, method: id ? 'PATCH' : 'POST', body: { campaign: limpo } });
  responder(res, 200, semTokens(JSON.stringify(r)));
  return true;
}
