// "Falar com a Rosa": chat interno da equipe com a IA do SAC (a orquestradora do atendimento).
// A IA conversa como uma colega: explica o que fez, ajuda a responder e aprende o que a equipe ensina
// (o aprendizado vai para "SAC - Aprendizados.md" e a IA das clientes passa a usar na próxima resposta).
//   GET  /rosa/historico           -> { mensagens: [{ de: 'eu'|'rosa', txt, t, conversa? , aprendizado? }] }
//   POST /rosa/mensagem            -> { texto, conversa_id? } -> { resposta, aprendizado }
//   POST /rosa/limpar              -> apaga o histórico desta pessoa
// O histórico de cada pessoa fica em 07_LOGS/atendimento/rosa/<id>.jsonl (as últimas 20 trocas vão no pedido).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CEREBRO = process.env.RS_CEREBRO || 'C:/Users/Cncept D/Documents/Native Agents/Native Agemts/Rosa Selvagem - Cérebro';
const CLAUDE = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || 'C:/Users/Cncept D', '.local/bin/claude.exe');
const NIVEIS = { dona: 'dona', supervisora: 'supervisora', atendente: 'atendente' };

const SCHEMA = {
  type: 'object',
  properties: {
    resposta: { type: 'string' },
    aprendizado: { type: 'string' },
  },
  required: ['resposta', 'aprendizado'],
};

const ler = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const hoje = () => new Date().toISOString().slice(0, 10);
let emUso = 0;

function secao(texto, titulo) {
  const i = texto.indexOf(`## ${titulo}`);
  if (i < 0) return '';
  const resto = texto.slice(i);
  const fim = resto.indexOf('\n## ', 4);
  return fim < 0 ? resto : resto.slice(0, fim);
}

function perguntar(sistema, mensagem) {
  return new Promise((ok, falha) => {
    const args = ['-p', '--model', 'opus', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
      '--system-prompt', sistema, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', ''];
    const p = spawn(CLAUDE, args, { windowsHide: true });
    let out = '', err = '';
    const limite = setTimeout(() => { p.kill(); falha(new Error('a Rosa demorou demais para responder. Tente de novo.')); }, 90000);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(limite); falha(e); });
    p.on('close', () => {
      clearTimeout(limite);
      try {
        const j = JSON.parse(out);
        if (j.is_error || !j.structured_output) throw new Error(j.result || 'sem resposta');
        ok(j.structured_output);
      } catch (e) { falha(new Error(`a Rosa não conseguiu responder (${e.message.slice(0, 160)} ${err.slice(-160)})`)); }
    });
    p.stdin.end(mensagem);
  });
}

// o que a equipe ensina vira linha em "Respostas corrigidas ou aprovadas pela equipe"
function guardarAprendizado(texto, quem, nivel) {
  const f = path.join(CEREBRO, 'SAC', 'SAC - Aprendizados.md');
  const nota = ler(f);
  if (!nota) return false;
  const marca = nivel === 'atendente' ? ' (a confirmar pela dona ou supervisora)' : '';
  const linha = `- ${hoje()}: ${texto.replace(/\s+/g, ' ').trim()} (ensinado por ${quem} no chat com a Rosa)${marca}`;
  const titulo = '## Respostas corrigidas ou aprovadas pela equipe';
  const i = nota.indexOf(titulo);
  let novo;
  if (i < 0) novo = `${nota.trimEnd()}\n\n${titulo}\n${linha}\n`;
  else {
    const fim = nota.indexOf('\n## ', i + titulo.length);
    const corte = fim < 0 ? nota.length : fim;
    novo = `${nota.slice(0, corte).trimEnd()}\n${linha}\n${nota.slice(corte)}`;
  }
  fs.writeFileSync(f, novo);
  return true;
}

function decisoesDeHoje(RAIZ) {
  const linhas = ler(path.join(RAIZ, `07_LOGS/ia-sac/${hoje()}.jsonl`)).trim().split('\n').filter(Boolean).slice(-40);
  if (!linhas.length) return '(nenhuma conversa atendida hoje ainda)';
  return linhas.map(l => {
    try {
      const x = JSON.parse(l);
      if (x.erro) return `- conversa #${x.conversa}: deu erro (${x.erro})`;
      return `- ${x.ts?.slice(11, 16)} conversa #${x.conversa}: ${x.acao}${x.assuntos?.length ? `, assuntos ${x.assuntos.join(', ')}` : ''}${x.motivo ? `, motivo: ${x.motivo}` : ''}`;
    } catch { return ''; }
  }).filter(Boolean).join('\n');
}

export default async function ({ p, m, req, res, s, cw, lerCorpo, responder, nivel, RAIZ }) {
  if (!p.startsWith('/rosa')) return false;
  const pasta = path.join(RAIZ, '07_LOGS/atendimento/rosa');
  const arq = path.join(pasta, `${Number(s.userId) || 'sistema'}.jsonl`);
  const historico = () => ler(arq).trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const anotar = obj => { fs.mkdirSync(pasta, { recursive: true }); fs.appendFileSync(arq, JSON.stringify(obj) + '\n'); };

  if (p === '/rosa/historico' && m === 'GET') {
    responder(res, 200, { mensagens: historico().slice(-200) });
    return true;
  }
  if (p === '/rosa/limpar' && m === 'POST') {
    try { fs.unlinkSync(arq); } catch { /* já estava vazio */ }
    responder(res, 200, { ok: true });
    return true;
  }
  if (p === '/rosa/mensagem' && m === 'POST') {
    const corpo = await lerCorpo(req);
    const texto = String(corpo.texto || '').trim().slice(0, 4000);
    if (!texto) { responder(res, 400, { erro: 'Escreva alguma coisa para a Rosa.' }); return true; }
    if (emUso >= 3) { responder(res, 429, { erro: 'A Rosa está conversando com muita gente agora. Tente de novo em alguns segundos.' }); return true; }

    // conversa anexada: a Rosa lê o que a cliente e a equipe já falaram
    let blocoConversa = '';
    const convId = Number(corpo.conversa_id) || null;
    if (convId) {
      try {
        const c = await cw(`conversations/${convId}`, { token: s.token });
        const msgs = ((await cw(`conversations/${convId}/messages`, { token: s.token })).payload || [])
          .filter(x => x.message_type !== 2 && (x.content || x.attachments?.length)).slice(-40);
        const cliente = c.meta?.sender?.name || 'Cliente';
        const ca = c.custom_attributes || {};
        blocoConversa = `---\n# Conversa que ${s.nome} anexou (#${convId}, cliente ${cliente}, status ${c.status})\n` +
          (ca.resumo_ia ? `Resumo que você fez: ${ca.resumo_ia}\n` : '') + (ca.motivo_ia ? `Motivo que você deu para passar para a equipe: ${ca.motivo_ia}\n` : '') +
          msgs.map(x => `${x.message_type === 0 ? cliente : x.private ? `Nota interna de ${x.sender?.name || 'equipe'}` : x.sender?.type === 'agent_bot' ? 'Você (IA)' : `${x.sender?.name || 'Equipe'}`}: ${x.content || '[anexo]'}`).join('\n');
      } catch (e) { blocoConversa = `(não consegui abrir a conversa #${convId}: ${e.message})`; }
    }

    const sistema = ler(path.join(AQUI, '../prompt-colega.md'))
      .replaceAll('{{MARCA_PRINCIPAL}}', 'Rosa Selvagem')
      .replaceAll('{{PESSOA}}', s.nome || 'alguém da equipe')
      .replaceAll('{{NIVEL}}', NIVEIS[nivel] || 'atendente')
      .replace('{{BASE}}', ler(path.join(CEREBRO, 'SAC', 'SAC - Base de Conhecimento.md')))
      .replace('{{APRENDIZADOS}}', ler(path.join(CEREBRO, 'SAC', 'SAC - Aprendizados.md')))
      .replace('{{OFERTAS}}', secao(ler(path.join(CEREBRO, 'Decisões.md')), 'Preços e ofertas') || '(nenhuma oferta registrada)')
      .replace('{{DECISOES}}', decisoesDeHoje(RAIZ))
      .replace('{{CONVERSA}}', blocoConversa);
    const antes = historico().slice(-20).map(x => `${x.de === 'eu' ? s.nome : 'Rosa'}: ${x.txt}`).join('\n');
    const mensagem = `${antes ? `Conversa até agora:\n${antes}\n\n` : ''}${s.nome}: ${texto}\n\nResponda como a Rosa.`;

    anotar({ de: 'eu', txt: texto, t: Date.now(), ...(convId ? { conversa: convId } : {}) });
    emUso++;
    try {
      const r = await perguntar(sistema, mensagem);
      let guardado = false;
      if (r.aprendizado?.trim()) { try { guardado = guardarAprendizado(r.aprendizado, s.nome || 'equipe', nivel); } catch { /* o Obsidian pode estar com o arquivo aberto */ } }
      const resposta = { de: 'rosa', txt: r.resposta.trim(), t: Date.now(), ...(guardado ? { aprendizado: r.aprendizado.trim() } : {}) };
      anotar(resposta);
      responder(res, 200, { resposta: resposta.txt, aprendizado: resposta.aprendizado || null });
    } catch (e) {
      responder(res, 502, { erro: e.message });
    } finally { emUso--; }
    return true;
  }
  return false;
}
