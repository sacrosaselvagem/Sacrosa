// Mandar foto ou arquivo numa conversa (o navegador manda em base64; aqui vira o envio "multipart" do Chatwoot).
//   POST /anexo  { conversa, nome, tipo, base64, texto?, privado? }
// Usa o login de quem está mandando, para a mensagem sair no nome dela.
const LIMITE = 15 * 1024 * 1024;

export default async function ({ p, m, req, res, s, c, lerCorpo, responder }) {
  if (p !== '/anexo') return false;
  if (m !== 'POST') { responder(res, 405, { erro: 'use POST' }); return true; }
  const b = await lerCorpo(req);
  const conversa = Number(b.conversa);
  if (!conversa || !b.base64) { responder(res, 400, { erro: 'Escolha um arquivo.' }); return true; }
  const dados = Buffer.from(String(b.base64), 'base64');
  if (dados.length > LIMITE) { responder(res, 400, { erro: 'O arquivo passa de 15 MB. Mande um menor.' }); return true; }
  const nome = String(b.nome || 'arquivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

  const form = new FormData();
  if (String(b.texto || '').trim()) form.append('content', String(b.texto).trim());
  form.append('message_type', 'outgoing');
  if (b.privado) form.append('private', 'true');
  form.append('attachments[]', new Blob([dados], { type: String(b.tipo || 'application/octet-stream') }), nome);

  const r = await fetch(`${c.url.replace(/\/$/, '')}/api/v1/accounts/${c.conta}/conversations/${conversa}/messages`, {
    method: 'POST', headers: { api_access_token: s.token }, body: form,
  });
  const txt = await r.text();
  if (!r.ok) {
    let erro = `o sistema de mensagens respondeu ${r.status}`;
    try { const j = JSON.parse(txt); erro = j.message || j.error || erro; } catch { /* resposta sem JSON */ }
    responder(res, 400, { erro: `Não enviou o arquivo: ${erro}` });
    return true;
  }
  responder(res, 200, { ok: true });
  return true;
}
