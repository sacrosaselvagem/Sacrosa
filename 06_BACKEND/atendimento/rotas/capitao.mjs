// Capitão: a sala de controle da IA do SAC.
//   GET  /capitao/numeros    -> números de hoje e dos últimos 7 dias (07_LOGS/ia-sac/AAAA-MM-DD.jsonl)
//   POST /capitao/testar     -> mostra o que a IA faria com uma conversa de teste (não manda nada para ninguém)
//   GET  /capitao/perguntas  -> "Perguntas sem resposta na base" do SAC - Aprendizados.md
//   POST /capitao/responder  -> grava a resposta na SAC - Base de Conhecimento.md e risca a pergunta
//   GET  /capitao/base       -> texto da base de conhecimento (só leitura)
//   GET  /capitao/jeito      -> regras de conversa do prompt-ia.md e o modelo em uso
// Só dona e supervisora usam estas rotas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testarIA } from '../ia.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CEREBRO = path.resolve(process.env.RS_CEREBRO || 'C:/Users/Cncept D/Documents/Native Agents/Native Agemts/Rosa Selvagem - Cérebro');
// As notas do SAC ficam na pasta SAC/ do Cérebro (separada em 2026-10-25).
const CEREBRO_SAC = path.join(CEREBRO, 'SAC');
const NOTA_BASE = 'SAC - Base de Conhecimento.md';
const NOTA_APREND = 'SAC - Aprendizados.md';
const SECAO_PERGUNTAS = '## Perguntas sem resposta na base';
const SECAO_RESPOSTAS = '## Respostas da equipe';
const PROMPT = path.resolve(AQUI, '../prompt-ia.md');

const MARCAS = ['Rosa Selvagem', 'Beyoung'];
const CANAIS = ['WhatsApp', 'Instagram', 'Messenger', 'Telegram', 'e-mail', 'chat do site'];
let testesRodando = 0;

// caminho de uma nota do Cérebro, sem deixar sair da pasta
function nota(nome) {
  const f = path.resolve(CEREBRO_SAC, nome);
  if (path.dirname(f) !== CEREBRO_SAC || path.extname(f) !== '.md') throw new Error('Nota fora do Cérebro.');
  return f;
}
const lerNota = nome => fs.readFileSync(nota(nome), 'utf8');
const gravarNota = (nome, txt) => fs.writeFileSync(nota(nome), txt, 'utf8');

const diaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const umaLinha = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// trecho de uma seção "## Título" até a próxima "## " (índices no texto)
function limitesSecao(texto, titulo) {
  const re = new RegExp(`^${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?$`, 'm');
  const achou = re.exec(texto);
  if (!achou) return null;
  const inicio = achou.index;
  const depois = inicio + achou[0].length;
  const prox = texto.slice(depois).search(/\n## /);
  const fim = prox < 0 ? texto.length : depois + prox + 1; // fim aponta para o "#" da próxima seção (ou o fim do arquivo)
  return { inicio, depois, fim };
}

// linhas "- AAAA-MM-DD: pergunta (IA do SAC no Chatwoot)" da seção de perguntas
function lerPerguntas() {
  const texto = lerNota(NOTA_APREND);
  const lim = limitesSecao(texto, SECAO_PERGUNTAS);
  if (!lim) return { abertas: [], respondidas: [] };
  const abertas = [], respondidas = [];
  for (const bruta of texto.slice(lim.depois, lim.fim).split('\n')) {
    const linha = bruta.replace(/\r$/, '');
    if (!/^\s*-\s+/.test(linha)) continue;
    const corpo = linha.replace(/^\s*-\s+/, '');
    if (corpo.startsWith('~~')) {
      const m = corpo.match(/^~~(.*?)~~\s*(.*)$/);
      const dentro = m ? m[1] : corpo.replace(/~~/g, '');
      const d = dentro.match(/^(\d{4}-\d{2}-\d{2}):\s*(.*)$/);
      respondidas.push({ data: d?.[1] || '', texto: limparPergunta(d ? d[2] : dentro), nota: m ? m[2] : '' });
      continue;
    }
    const d = corpo.match(/^(\d{4}-\d{2}-\d{2}):\s*(.*)$/);
    abertas.push({ linha, data: d?.[1] || '', texto: limparPergunta(d ? d[2] : corpo) });
  }
  return { abertas, respondidas };
}
const limparPergunta = s => s.replace(/\s*\(IA do SAC[^)]*\)\s*$/, '').trim();

// ---------- números ----------
function lerRegistros(RAIZ, dias) {
  const pasta = path.join(RAIZ, '07_LOGS/ia-sac');
  const linhas = [];
  // os arquivos têm a data UTC no nome; lê um dia a mais para cobrir o fuso
  for (let i = 0; i <= dias; i++) {
    const nome = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10) + '.jsonl';
    let txt = '';
    try { txt = fs.readFileSync(path.join(pasta, nome), 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) {
      if (!l.trim()) continue;
      try { linhas.push(JSON.parse(l)); } catch { /* linha cortada */ }
    }
  }
  return linhas.filter(r => r.ts).sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

function resumir(regs) {
  const respondidas = regs.filter(r => r.acao === 'responder').length;
  const passadas = regs.filter(r => r.acao === 'escalar' || r.acao === 'escalar-barrado').length;
  const barradas = regs.filter(r => r.acao === 'escalar-barrado').length;
  const ignoradas = regs.filter(r => r.acao === 'ignorar').length;
  const erros = regs.filter(r => r.erro && r.conversa).length;
  const tempos = regs.filter(r => r.acao && Number.isFinite(r.segundos)).map(r => r.segundos);
  const base = respondidas + passadas;
  return {
    respondidas, passadas, barradas, ignoradas, erros,
    resolvida_pct: base ? Math.round((respondidas / base) * 100) : null,
    tempo_medio: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
  };
}

function numeros(RAIZ) {
  const regs = lerRegistros(RAIZ, 7);
  const hoje = diaLocal();
  const dias = [];
  for (let i = 6; i >= 0; i--) dias.push(diaLocal(new Date(Date.now() - i * 864e5)));
  const doDia = d => regs.filter(r => diaLocal(new Date(r.ts)) === d);
  const semana = regs.filter(r => dias.includes(diaLocal(new Date(r.ts))));
  const contarAssuntos = lista => {
    const n = {};
    for (const r of lista) for (const a of r.assuntos || []) n[a] = (n[a] || 0) + 1;
    return Object.entries(n).map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  };
  return {
    hoje: { ...resumir(doDia(hoje)), assuntos: contarAssuntos(doDia(hoje)) },
    semana: { ...resumir(semana), assuntos: contarAssuntos(semana) },
    por_dia: dias.map(d => { const r = resumir(doDia(d)); return { dia: d, respondidas: r.respondidas, passadas: r.passadas }; }),
    ultimas: semana.filter(r => r.conversa && (r.acao || r.erro)).slice(-20).reverse().map(r => ({
      ts: r.ts, conversa: r.conversa, acao: r.acao || 'erro', assuntos: r.assuntos || [],
      motivo: umaLinha(r.erro ? 'A IA não conseguiu responder e passou para a equipe.' : r.motivo).slice(0, 400), segundos: r.segundos ?? null,
    })),
  };
}

// ---------- jeito de falar ----------
function jeito(c) {
  const txt = fs.readFileSync(PROMPT, 'utf8').split('\n---')[0];
  const trocar = s => s.replaceAll('{{MARCA}}', 'marca').replaceAll('{{PERSONA}}', 'a assistente').replaceAll('{{CANAL}}', 'canal');
  const blocos = {};
  let atual = null;
  for (const l of txt.split('\n')) {
    const h = l.match(/^#\s+(.+)/);
    if (h) { atual = h[1].trim(); blocos[atual] = []; continue; }
    if (atual && /^\s*-\s+/.test(l)) blocos[atual].push(trocar(l.replace(/^\s*-\s+/, '').trim()));
  }
  return {
    conversa: blocos['Como você conversa'] || [],
    regras: blocos['Regras que você nunca quebra'] || [],
    modelo: c.ia?.modelo || 'opus',
    espera_segundos: c.ia?.espera_segundos || 6,
    ligada: !!c.ia?.ligada,
  };
}

// ---------- responder uma pergunta ----------
function responderPergunta({ linha, pergunta, resposta }) {
  pergunta = umaLinha(pergunta).replace(/\*\*/g, '').replace(/~~/g, '');
  resposta = umaLinha(resposta).replace(/~~/g, '');
  if (!pergunta || pergunta.length > 600) return { status: 400, erro: 'Escreva a pergunta (até 600 letras).' };
  if (resposta.length < 3 || resposta.length > 2000) return { status: 400, erro: 'Escreva a resposta (até 2000 letras).' };
  if (!/[.!?…)]$/.test(resposta)) resposta += '.';

  const aprend = lerNota(NOTA_APREND);
  const lim = limitesSecao(aprend, SECAO_PERGUNTAS);
  if (!lim) return { status: 409, erro: 'Não achei a lista de perguntas na nota de aprendizados.' };
  const trecho = aprend.slice(lim.depois, lim.fim);
  const alvo = String(linha || '');
  // a linha tem que existir inteira, sozinha, dentro da seção
  const linhas = trecho.split('\n');
  const idx = linhas.findIndex(l => l.replace(/\r$/, '') === alvo);
  if (!alvo || idx < 0 || !/^\s*-\s+/.test(alvo) || alvo.includes('~~')) return { status: 409, erro: 'Essa pergunta mudou ou já foi respondida. Atualize a página.' };

  const hoje = diaLocal();
  const cr = linhas[idx].endsWith('\r') ? '\r' : '';
  const recuo = alvo.match(/^\s*-\s+/)[0];
  linhas[idx] = `${recuo}~~${alvo.slice(recuo.length)}~~ respondida em ${hoje}${cr}`;
  const novoAprend = aprend.slice(0, lim.depois) + linhas.join('\n') + aprend.slice(lim.fim);

  const base = lerNota(NOTA_BASE);
  const nl = base.includes('\r\n') ? '\r\n' : '\n';
  const linhaBase = `- ${hoje}: **${pergunta}** ${resposta}`;
  let novaBase;
  const limB = limitesSecao(base, SECAO_RESPOSTAS);
  if (limB) {
    // entra no fim da seção, depois da última linha com texto
    const sec = base.slice(limB.depois, limB.fim);
    const semFim = sec.replace(/(\r?\n)*$/, '');
    const sobra = sec.slice(semFim.length);
    novaBase = base.slice(0, limB.depois) + semFim + nl + linhaBase + (sobra || nl) + base.slice(limB.fim);
  } else {
    const corpo = base.replace(/(\r?\n)*$/, '');
    novaBase = corpo + nl + nl + SECAO_RESPOSTAS + nl
      + '(Respostas que a equipe escreveu no Capitão para as perguntas que a IA não sabia. A IA usa daqui em diante.)' + nl + nl
      + linhaBase + nl;
  }

  gravarNota(NOTA_BASE, novaBase);
  try { gravarNota(NOTA_APREND, novoAprend); }
  catch (e) { gravarNota(NOTA_BASE, base); throw e; } // não deixa uma nota gravada pela metade
  return { status: 200, ok: true, linha: linhaBase };
}

export default async function ({ p, m, req, res, c, lerCorpo, responder, pode, RAIZ }) {
  if (!p.startsWith('/capitao')) return false;
  if (!pode('treinar_ia')) { responder(res, 403, { erro: 'Seu acesso não inclui treinar e testar a IA.' }); return true; }

  if (p === '/capitao/numeros' && m === 'GET') {
    responder(res, 200, { ...numeros(RAIZ), ia_ligada: !!c.ia?.ligada, modelo: c.ia?.modelo || 'opus' });
    return true;
  }

  if (p === '/capitao/perguntas' && m === 'GET') {
    try {
      const { abertas, respondidas } = lerPerguntas();
      responder(res, 200, { abertas, respondidas: respondidas.slice(-20).reverse() });
    } catch (e) { responder(res, 500, { erro: `Não consegui ler a nota de aprendizados: ${e.message}` }); }
    return true;
  }

  if (p === '/capitao/responder' && m === 'POST') {
    const corpo = await lerCorpo(req);
    try {
      const r = responderPergunta(corpo || {});
      responder(res, r.status, r.ok ? { ok: true, linha: r.linha } : { erro: r.erro });
    } catch (e) { responder(res, 500, { erro: `Não consegui gravar no Cérebro: ${e.message}. Feche a nota no Obsidian e tente de novo.` }); }
    return true;
  }

  if (p === '/capitao/base' && m === 'GET') {
    try {
      const st = fs.statSync(nota(NOTA_BASE));
      responder(res, 200, { texto: lerNota(NOTA_BASE), atualizada: st.mtime.toISOString() });
    } catch (e) { responder(res, 500, { erro: `Não consegui ler a base: ${e.message}` }); }
    return true;
  }

  if (p === '/capitao/jeito' && m === 'GET') {
    try { responder(res, 200, jeito(c)); }
    catch (e) { responder(res, 500, { erro: `Não consegui ler o jeito de falar: ${e.message}` }); }
    return true;
  }

  if (p === '/capitao/testar' && m === 'POST') {
    const { marca, canal, cliente, mensagens } = await lerCorpo(req);
    const lista = Array.isArray(mensagens) ? mensagens.slice(-30) : [];
    const limpas = lista
      .filter(x => x && (x.de === 'cliente' || x.de === 'ia') && typeof x.txt === 'string' && x.txt.trim())
      .map(x => ({ de: x.de, txt: x.txt.trim().slice(0, 2000) }));
    if (!limpas.length || limpas[limpas.length - 1].de !== 'cliente') { responder(res, 400, { erro: 'Escreva uma mensagem como se fosse a cliente.' }); return true; }
    if (testesRodando >= 2) { responder(res, 429, { erro: 'Já tem testes rodando. Espere um pouco e tente de novo.' }); return true; }
    testesRodando++;
    try {
      const r = await testarIA({
        marca: MARCAS.includes(marca) ? marca : 'Rosa Selvagem',
        canal: CANAIS.includes(canal) ? canal : 'WhatsApp',
        cliente: umaLinha(cliente).slice(0, 60) || 'Cliente',
        mensagens: limpas,
        modelo: c.ia?.modelo || 'opus',
      });
      responder(res, 200, r);
    } catch (e) {
      responder(res, 502, { erro: `A IA não respondeu (${umaLinha(e.message).slice(0, 200)}). Tente de novo em instantes.` });
    } finally { testesRodando--; }
    return true;
  }

  responder(res, 404, { erro: 'rota desconhecida' });
  return true;
}
