// Relatórios do atendimento: junta os números do Chatwoot (API de relatórios v2) e o registro da IA do SAC.
//   GET /api/atendimento/relatorios?periodo=hoje|7|30
// Só dona e supervisora. Usa o login de quem pediu (s.token). Contrato: 09_DOCUMENTATION/atendimento-modulos.md
import fs from 'node:fs';
import path from 'node:path';

const FUSO = -3; // horário de Brasília
const DIA = 86400;
const PERIODOS = { hoje: 1, 7: 7, 30: 30 };

// meia-noite de hoje no horário de Brasília, em segundos
function inicioDeHoje() {
  const agora = Math.floor(Date.now() / 1000), off = FUSO * 3600;
  return Math.floor((agora + off) / DIA) * DIA - off;
}

async function v2(c, token, caminho) {
  const r = await fetch(`${c.url.replace(/\/$/, '')}/api/v2/accounts/${c.conta}/${caminho}`, {
    headers: { api_access_token: token, Accept: 'application/json' },
  });
  const txt = await r.text();
  let j; try { j = txt ? JSON.parse(txt) : {}; } catch { j = {}; }
  if (!r.ok) {
    const e = new Error(r.status === 401 || r.status === 403 ? 'Seu acesso não pode ver os relatórios.' : `O Chatwoot não respondeu os relatórios (${r.status}).`);
    e.status = r.status === 401 || r.status === 403 ? 403 : 502; throw e;
  }
  return j;
}

// registro da IA (07_LOGS/ia-sac/AAAA-MM-DD.jsonl): última decisão de cada conversa no período
function lerIA(RAIZ, desde, ate) {
  const pasta = path.join(RAIZ, '07_LOGS/ia-sac');
  const porConversa = new Map();
  let arquivos = [];
  try { arquivos = fs.readdirSync(pasta).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)); } catch { /* sem registro ainda */ }
  // só os dias do período (com um dia de folga por causa do fuso)
  const primeiro = new Date((desde - DIA) * 1000).toISOString().slice(0, 10);
  for (const f of arquivos.filter(f => f.slice(0, 10) >= primeiro).sort()) {
    for (const linha of fs.readFileSync(path.join(pasta, f), 'utf8').split('\n')) {
      if (!linha.trim()) continue;
      let x; try { x = JSON.parse(linha); } catch { continue; }
      const t = Date.parse(x.ts) / 1000;
      if (!x.conversa || !(t >= desde && t <= ate)) continue;
      const atual = porConversa.get(x.conversa) || { escalou: false, respondeu: false, decisoes: 0 };
      atual.decisoes++;
      if (String(x.acao).startsWith('escalar')) atual.escalou = true;
      if (x.acao === 'responder') atual.respondeu = true;
      porConversa.set(x.conversa, atual);
    }
  }
  const lista = [...porConversa.values()];
  return {
    conversas: lista.length,
    so_ia: lista.filter(x => !x.escalou).length,
    passou_equipe: lista.filter(x => x.escalou).length,
    respostas: lista.filter(x => x.respondeu).length,
  };
}

export default async function ({ p, m, res, url, s, c, responder, nivel, RAIZ }) {
  if (p !== '/relatorios') return false;
  if (m !== 'GET') { responder(res, 405, { erro: 'Use GET.' }); return true; }
  if (!['dona', 'supervisora'].includes(nivel)) { responder(res, 403, { erro: 'Só a dona e a supervisora veem os relatórios.' }); return true; }

  const periodo = PERIODOS[url.searchParams.get('periodo')] ? url.searchParams.get('periodo') : '7';
  const dias = PERIODOS[periodo];
  const ate = Math.floor(Date.now() / 1000);
  const desde = inicioDeHoje() - (dias - 1) * DIA;
  const agrupar = dias === 1 ? 'hour' : 'day';
  const q = `since=${desde}&until=${ate}`;
  const serie = metrica => v2(c, s.token, `reports?metric=${metrica}&type=account&${q}&group_by=${agrupar}&timezone_offset=${FUSO}`);

  const [resumo, recebidas, resolvidas, pessoas, caixas, etiquetas] = await Promise.all([
    v2(c, s.token, `reports/summary?type=account&${q}&timezone_offset=${FUSO}`),
    serie('conversations_count'),
    serie('resolutions_count'),
    v2(c, s.token, `summary_reports/agent?${q}`),
    v2(c, s.token, `summary_reports/inbox?${q}`),
    v2(c, s.token, `summary_reports/label?${q}`),
  ]);

  // a série vem com um ponto por hora/dia; junta recebidas e resolvidas pelo horário
  const resolvMap = new Map((resolvidas || []).map(x => [x.timestamp, x.value]));
  const pontos = (recebidas || []).map(x => ({ t: x.timestamp, recebidas: Number(x.value) || 0, resolvidas: Number(resolvMap.get(x.timestamp)) || 0 }));

  responder(res, 200, {
    periodo, desde, ate, agrupar,
    resumo: {
      recebidas: resumo.conversations_count || 0,
      resolvidas: resumo.resolutions_count || 0,
      primeira_resposta: resumo.avg_first_response_time ?? null, // segundos
      resolucao: resumo.avg_resolution_time ?? null, // segundos
      anterior: {
        recebidas: resumo.previous?.conversations_count || 0,
        resolvidas: resumo.previous?.resolutions_count || 0,
        primeira_resposta: resumo.previous?.avg_first_response_time ?? null,
        resolucao: resumo.previous?.avg_resolution_time ?? null,
      },
    },
    serie: pontos,
    pessoas: (pessoas || []).map(x => ({ id: x.id, conversas: x.conversations_count || 0, resolvidas: x.resolved_conversations_count || 0, primeira_resposta: x.avg_first_response_time ?? null })),
    caixas: (caixas || []).map(x => ({ id: x.id, conversas: x.conversations_count || 0, resolvidas: x.resolved_conversations_count || 0 })),
    assuntos: (etiquetas || []).map(x => ({ nome: x.name, conversas: x.conversations_count || 0 })).filter(x => x.conversas > 0),
    ia: lerIA(RAIZ, desde, ate),
  });
  return true;
}
