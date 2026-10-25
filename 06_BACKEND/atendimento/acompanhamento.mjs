// Acompanhamento de entrega: depois que a cliente se identifica (número do pedido + CPF), a IA passa a vigiar o
// pedido e avisa na própria conversa quando ele muda de fase (postado, saiu para entrega, problema, entregue).
// Lista em 07_LOGS/atendimento/acompanhamentos.json. Ajustes em shopify.json > acompanhamento.
//   - De madrugada (silencio_de .. silencio_ate, no fuso da equipe) segura o aviso e manda de manhã.
//   - Conversa com alguém da equipe (status "open"): vira nota interna para a atendente, não mensagem.
//   - WhatsApp fora da janela de 24 h: só com modelo aprovado (shopify.json > modelo_whatsapp); sem ele, nota interna.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atualizarPedido, paraCard, cfgShopify, emTeste } from './pedidos.mjs';
import { perguntarClaude, problemas, extrasDoPedido } from './ia.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const ARQ = path.join(RAIZ, '07_LOGS/atendimento/acompanhamentos.json');
const LOGS = path.join(RAIZ, '07_LOGS/ia-sac');

const lerJson = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return padrao; } };
const gravar = lista => { fs.mkdirSync(path.dirname(ARQ), { recursive: true }); fs.writeFileSync(ARQ, JSON.stringify(lista, null, 2)); };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const log = obj => { fs.mkdirSync(LOGS, { recursive: true }); fs.appendFileSync(path.join(LOGS, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), acompanhamento: true, ...obj }) + '\n'); };

const ajustes = () => ({ intervalo_minutos: 30, intervalo_minutos_teste: 1, silencio_de: 21, silencio_ate: 8, parar_apos_dias: 60, ...(cfgShopify().acompanhamento || {}) });
// fases que viram aviso para a cliente; "transito" depois de "postado" é só movimentação e não avisa
const AVISA = new Set(['postado', 'transito', 'saiu', 'problema', 'retirada', 'entregue']);
const FINAL = new Set(['entregue', 'cancelado']);

export const listarAcompanhamentos = () => lerJson(ARQ, {});

export function acompanhar({ pedido, conversa, contato, cliente }) {
  const lista = listarAcompanhamentos();
  if (FINAL.has(pedido.marco)) { if (lista[pedido.id]) { delete lista[pedido.id]; gravar(lista); } return false; }
  const antes = lista[pedido.id];
  lista[pedido.id] = {
    ...(antes || { desde: new Date().toISOString(), avisos: [] }),
    num: pedido.num, conversa, contato, cliente, status: pedido.status, rot: pedido.rot, rastreio: pedido.rastreio,
    // a cliente acabou de ver o status atual na conversa: o próximo aviso é só quando mudar
    chave: pedido.chave, marco: pedido.marco, atrasado: pedido.atrasado, verificado_em: new Date().toISOString(),
  };
  gravar(lista);
  return !antes;
}

export function pararAcompanhamento(id) {
  const lista = listarAcompanhamentos();
  if (!lista[id]) return false;
  delete lista[id]; gravar(lista); return true;
}

function horaLocal() {
  let fuso = 'America/Recife';
  try { fuso = JSON.parse(fs.readFileSync(path.join(RAIZ, '00_CORE/Configuration/atendimento-geral.json'), 'utf8')).horario?.fuso || fuso; } catch { /* padrão */ }
  return Number(new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
}
function emSilencio() {
  const a = ajustes(), h = horaLocal();
  return a.silencio_de > a.silencio_ate ? (h >= a.silencio_de || h < a.silencio_ate) : (h >= a.silencio_de && h < a.silencio_ate);
}

// ---------- texto do aviso ----------
const SCHEMA = { type: 'object', properties: { mensagens: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 } }, required: ['mensagens'] };

function reserva(item, p) { // se o Claude falhar, um texto simples e humano
  const nome = p.primeiro_nome || item.cliente?.split(' ')[0] || '';
  const oi = nome ? `Oi, ${nome}!` : 'Oi!';
  return {
    postado: [`${oi} Seu pedido ${p.num} acabou de ser postado 💗`, `O código de rastreio é ${p.rastreio}${p.url_rastreio ? `, dá pra acompanhar por aqui: ${p.url_rastreio}` : ''}. Qualquer movimentação eu te conto.`],
    transito: [`${oi} Seu pedido ${p.num} já está a caminho 💗`, `O código de rastreio é ${p.rastreio}. Qualquer novidade eu te aviso por aqui.`],
    saiu: [`${oi} Seu pedido ${p.num} saiu para entrega hoje 🌹 Fica de olho que ele chega aí ainda hoje.`],
    problema: [`${oi} A transportadora marcou uma tentativa de entrega do pedido ${p.num} que não deu certo.`, 'Já pedi pra equipe olhar com a transportadora e te dou um retorno por aqui.'],
    retirada: [`${oi} Seu pedido ${p.num} está disponível para retirada. O código é ${p.rastreio}.`],
    entregue: [`${oi} Consta aqui que o seu pedido ${p.num} foi entregue 💗 Espero que você ame!`, 'Se não estiver com você, me avisa que eu vejo na hora.'],
  }[p.marco] || [`${oi} Novidade do pedido ${p.num}: ${p.rot.toLowerCase()}.`];
}

async function redigir(item, p, anterior, historico) {
  const sistema = fs.readFileSync(path.join(AQUI, 'prompt-rastreio.md'), 'utf8');
  const entrada = [
    `Nome da cliente: ${item.cliente || p.primeiro_nome || 'Cliente'}`,
    `Fase anterior: ${anterior || 'nenhuma'}. Fase nova: ${p.rot} (${p.marco}).`,
    `Dados do pedido:\n${(await import('./pedidos.mjs')).paraPrompt(p)}`,
    `Últimas mensagens da conversa (da mais antiga para a mais nova):\n${historico.join('\n') || '(nenhuma)'}`,
    'Escreva o aviso.',
  ].join('\n\n');
  try {
    const r = await perguntarClaude(sistema, entrada, ajustes().modelo || 'sonnet', SCHEMA);
    const textos = (r.mensagens || []).map(s => s.trim()).filter(Boolean).slice(0, 2);
    if (textos.length) return textos;
  } catch (e) { log({ pedido: p.num, erro_redigir: e.message }); }
  return reserva(item, p);
}

// ---------- envio ----------
async function avisar({ cfg, cw }, item, p, anterior) {
  const sistema = cfg().token, bot = cfg().ia?.token;
  const conv = await cw(`conversations/${item.conversa}`, { token: sistema });
  const msgs = (await cw(`conversations/${item.conversa}/messages`, { token: sistema })).payload || [];
  const historico = msgs.filter(m => m.message_type !== 2 && !m.private && m.content).slice(-8)
    .map(m => `${m.message_type === 0 ? 'Cliente' : 'Atendimento'}: ${m.content}`);
  const textos = await redigir(item, p, anterior, historico);
  const extras = extrasDoPedido(p);
  const barrado = textos.flatMap(t => problemas(t, extras));

  const ib = await cw(`inboxes/${conv.inbox_id}`, { token: sistema }).catch(() => null);
  const ultimaDaCliente = Math.max(0, ...msgs.filter(m => m.message_type === 0).map(m => m.created_at));
  const foraDaJanela = /whatsapp/i.test(ib?.channel_type || '') && Date.now() - ultimaDaCliente * 1000 > 23.8 * 3600e3;
  const nota = async motivo => cw(`conversations/${item.conversa}/messages`, { method: 'POST', token: sistema,
    body: { content: `📦 Pedido ${p.num}: ${p.rot}. ${motivo}\n\nAviso sugerido para a cliente:\n${textos.join('\n')}`, message_type: 'outgoing', private: true } });

  if (conv.status === 'open') { await nota('A conversa está com a equipe, então não mandei nada para a cliente.'); return 'nota-equipe'; }
  if (barrado.length) { await nota(`O aviso foi barrado pela trava (${barrado.join('; ')}).`); return 'nota-barrado'; }
  if (foraDaJanela) {
    const modelo = cfgShopify().modelo_whatsapp;
    if (!modelo?.name) { await nota('Já passou a janela de 24 h do WhatsApp e ainda não há modelo de mensagem aprovado, então não deu para avisar a cliente.'); return 'nota-janela'; }
    const valores = { nome: p.primeiro_nome || item.cliente || '', pedido: p.num, status: p.rot, rastreio: p.rastreio, link: p.url_rastreio || '' };
    await cw(`conversations/${item.conversa}/messages`, { method: 'POST', token: bot, body: {
      content: textos.join('\n'), message_type: 'outgoing',
      template_params: { name: modelo.name, category: modelo.category || 'UTILITY', language: modelo.language || 'pt_BR',
        processed_params: Object.fromEntries((modelo.parametros || ['nome', 'pedido', 'status']).map((k, i) => [String(i + 1), valores[k] ?? ''])) },
    } });
    return 'modelo-whatsapp';
  }
  for (const t of textos) {
    await cw(`conversations/${item.conversa}/toggle_typing_status`, { method: 'POST', body: { typing_status: 'on' }, token: bot }).catch(() => {});
    await dormir(Math.min(6000, 1200 + t.length * 28));
    await cw(`conversations/${item.conversa}/messages`, { method: 'POST', body: { content: t, message_type: 'outgoing' }, token: bot });
  }
  return 'mensagem';
}

async function atualizarCard({ cfg, cw }, contato, p) {
  if (!contato) return;
  const atual = await cw(`contacts/${contato}`, { token: cfg().token }).catch(() => null);
  const attrs = { ...(atual?.payload?.custom_attributes || atual?.custom_attributes || {}), ultimo_pedido: paraCard(p) };
  await cw(`contacts/${contato}`, { method: 'PUT', body: { custom_attributes: attrs }, token: cfg().token }).catch(e => log({ erro_card: e.message }));
}
export { atualizarCard };

// ---------- ciclo ----------
export async function verificarAgora(ctx, id) {
  const lista = listarAcompanhamentos(), item = lista[id];
  if (!item) return null;
  const p = await atualizarPedido(id);
  if (!p) { delete lista[id]; gravar(lista); return null; }
  item.verificado_em = new Date().toISOString();
  Object.assign(item, { status: p.status, rot: p.rot, rastreio: p.rastreio });
  let resultado = 'sem-mudanca';
  const virouAtraso = p.atrasado && !item.atrasado;
  if (p.chave !== item.chave || virouAtraso) {
    const anterior = item.marco;
    const deveAvisar = (AVISA.has(p.marco) && p.marco !== anterior && !(p.marco === 'transito' && anterior === 'postado')) || virouAtraso;
    if (deveAvisar && emSilencio()) {
      resultado = 'esperando-amanhecer'; // não grava a chave: manda quando acabar o silêncio
    } else {
      if (deveAvisar) {
        resultado = virouAtraso && p.marco === anterior
          ? await (async () => { // atraso: a equipe precisa agir; a cliente não recebe "está atrasado" do robô
            await ctx.cw(`conversations/${item.conversa}/messages`, { method: 'POST', token: ctx.cfg().token,
              body: { content: `⏰ Pedido ${p.num} passou do prazo da política (${p.rot}). Vale falar com a transportadora antes que a cliente pergunte.`, message_type: 'outgoing', private: true } });
            return 'nota-atraso';
          })()
          : await avisar(ctx, item, p, anterior);
        item.avisos.push({ ts: new Date().toISOString(), fase: p.marco, como: resultado });
      }
      Object.assign(item, { chave: p.chave, marco: p.marco, atrasado: p.atrasado });
      await atualizarCard(ctx, item.contato, p);
    }
  }
  const velho = Date.now() - new Date(item.desde).getTime() > ajustes().parar_apos_dias * 864e5;
  if ((FINAL.has(item.marco) && resultado !== 'esperando-amanhecer') || velho) delete lista[id];
  else lista[id] = item;
  // regrava por cima da versão atual (a IA pode ter acrescentado outro pedido enquanto este era verificado)
  const atual = listarAcompanhamentos();
  if (lista[id]) atual[id] = lista[id]; else delete atual[id];
  gravar(atual);
  if (resultado !== 'sem-mudanca') log({ pedido: p.num, conversa: item.conversa, fase: p.marco, resultado });
  return { resultado, pedido: p };
}

export function iniciarAcompanhamento(ctx) {
  const rodando = new Set();
  (async () => {
    for (;;) {
      try {
        const a = ajustes(), intervalo = (emTeste() ? a.intervalo_minutos_teste : a.intervalo_minutos) * 60e3;
        for (const [id, item] of Object.entries(listarAcompanhamentos())) {
          if (rodando.has(id) || Date.now() - new Date(item.verificado_em || 0).getTime() < intervalo) continue;
          rodando.add(id);
          await verificarAgora(ctx, id).catch(e => log({ pedido: item.num, erro: e.message })).finally(() => rodando.delete(id));
        }
      } catch (e) { log({ erro_ciclo: e.message }); }
      await dormir(30e3);
    }
  })();
}
