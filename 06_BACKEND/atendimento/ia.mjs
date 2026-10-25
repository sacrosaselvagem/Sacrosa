// IA do SAC no Chatwoot: o "filtro" do atendimento.
// Toda conversa nova chega com status "pending" (a IA está cuidando). A cada poucos segundos este módulo
// procura conversas pending com mensagem nova da cliente, espera ela terminar de digitar, pergunta ao
// Claude o que fazer e então:
//   responder -> manda 1 a 3 balões, com pausa de digitação, como a IA do SAC
//   escalar   -> manda um aviso acolhedor, abre a conversa para a equipe com motivo, sugestão e resumo
//   ignorar   -> não manda nada
// Sempre marca os assuntos (etiquetas) e atualiza o resumo. Respostas com preço ou link fora do catálogo
// são barradas pela trava e viram escalação.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { extrairIdentificacao, localizarPedido, atualizarPedido, paraPrompt, paraCard } from './pedidos.mjs';
import { acompanhar, atualizarCard } from './acompanhamento.mjs';

export const ASSUNTOS = [
  { id: 'reembolso', nome: 'Reembolso', desc: 'Quer o dinheiro de volta ou estorno' },
  { id: 'devolucao', nome: 'Devolução', desc: 'Quer devolver o produto' },
  { id: 'troca', nome: 'Troca', desc: 'Quer trocar o produto' },
  { id: 'cancelamento', nome: 'Cancelamento', desc: 'Quer cancelar a compra' },
  { id: 'problema-no-pedido', nome: 'Problema no pedido', desc: 'Defeito, avaria, item errado ou faltando, cobrança errada' },
  { id: 'frete-e-entrega', nome: 'Frete e entrega', desc: 'Prazo, frete, atraso, endereço' },
  { id: 'rastreio', nome: 'Rastreio', desc: 'Onde está o pedido ou o código de rastreio' },
  { id: 'duvida-de-produto', nome: 'Dúvida de produto', desc: 'Para que serve, ingredientes, resultado, qual escolher' },
  { id: 'como-usar', nome: 'Como usar', desc: 'Modo de uso, frequência, cuidados' },
  { id: 'pagamento', nome: 'Pagamento', desc: 'PIX, cartão, boleto, parcelamento, cupom' },
  { id: 'quer-comprar', nome: 'Quer comprar', desc: 'Interesse em comprar, pediu link ou preço' },
  { id: 'saude-e-reacao', nome: 'Saúde e reação', desc: 'Alergia, irritação, gravidez, pele sensível' },
  { id: 'reclamacao', nome: 'Reclamação', desc: 'Insatisfação forte, Procon, Reclame Aqui' },
  { id: 'revenda-e-parceria', nome: 'Revenda e parceria', desc: 'Atacado, revenda, influenciadora, imprensa' },
  { id: 'elogio', nome: 'Elogio', desc: 'Elogio ou depoimento' },
  { id: 'outro', nome: 'Outro', desc: 'Nada acima' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    acao: { type: 'string', enum: ['responder', 'escalar', 'ignorar'] },
    mensagens: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    assuntos: { type: 'array', items: { type: 'string', enum: ASSUNTOS.map(a => a.id) }, minItems: 1, maxItems: 3 },
    motivo: { type: 'string' },
    observacao: { type: 'string' },
    resumo: { type: 'string' },
    sugestao_equipe: { type: 'string' },
    pergunta_sem_resposta: { type: 'string' },
  },
  required: ['acao', 'mensagens', 'assuntos', 'motivo', 'observacao', 'resumo', 'sugestao_equipe', 'pergunta_sem_resposta'],
};

const CEREBRO = process.env.RS_CEREBRO || 'C:/Users/Cncept D/Documents/Native Agents/Native Agemts/Rosa Selvagem - Cérebro';
const MOTOR = process.env.RS_MOTOR || 'C:/Users/Cncept D/.rosa-motor';
const CLAUDE = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || 'C:/Users/Cncept D', '.local/bin/claude.exe');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const LOGS = path.join(RAIZ, '07_LOGS/ia-sac');

const ler = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const dormir = ms => new Promise(r => setTimeout(r, ms));
const hoje = () => new Date().toISOString().slice(0, 10);
const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function log(obj) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(path.join(LOGS, `${hoje()}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
}

// ---------- contexto ----------
function catalogo() {
  try { return JSON.parse(ler(path.join(MOTOR, 'catalogo.json'))) || []; } catch { return []; }
}
function configSac() {
  try { return JSON.parse(ler(path.join(MOTOR, 'config.json'))).sac || {}; } catch { return {}; }
}
function secao(texto, titulo) {
  const i = texto.indexOf(`## ${titulo}`);
  if (i < 0) return '';
  const resto = texto.slice(i);
  const fim = resto.indexOf('\n## ', 4);
  return fim < 0 ? resto : resto.slice(0, fim);
}
function produtosDaConversa(texto) {
  const palavras = new Set(semAcento(texto).match(/[a-z]{4,}/g) || []);
  const comuns = new Set(['para', 'voce', 'voces', 'esta', 'esse', 'essa', 'isso', 'pedido', 'quero', 'como', 'qual', 'quando', 'obrigada', 'tudo', 'bem', 'boa', 'tarde', 'noite', 'chegou', 'ainda']);
  const pontos = catalogo().map(p => {
    const alvo = semAcento(`${p.titulo} ${(p.tags || []).join(' ')} ${p.tipo || ''}`);
    let n = 0;
    for (const w of palavras) if (!comuns.has(w) && alvo.includes(w)) n++;
    return { p, n };
  }).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  if (!pontos.length) return '(nenhum produto citado na conversa; se ela perguntar de um produto, diga que vai confirmar e escale)';
  return pontos.map(({ p }) => [
    `- ${p.titulo}: R$ ${Number(p.preco).toFixed(2).replace('.', ',')}${Number(p.preco_de) > Number(p.preco) ? ` (de R$ ${Number(p.preco_de).toFixed(2).replace('.', ',')})` : ''}, ${p.disponivel ? 'disponível' : 'esgotado'}, link: ${p.url}`,
    `  ${String(p.descricao || '').replace(/\s+/g, ' ').slice(0, 500)}`,
  ].join('\n')).join('\n');
}

// horário da equipe salvo em Configurações > Geral (00_CORE/Configuration/atendimento-geral.json)
// assunto mais sério primeiro: é ele que decide o time quando a conversa tem mais de um
const GRAVIDADE = ['reclamacao', 'saude-e-reacao', 'reembolso', 'devolucao', 'troca', 'problema-no-pedido', 'cancelamento', 'pagamento',
  'rastreio', 'frete-e-entrega', 'revenda-e-parceria', 'quer-comprar', 'duvida-de-produto', 'como-usar', 'elogio', 'outro'];
function timeDoAssunto(assuntos) {
  try {
    const rota = JSON.parse(ler(path.join(RAIZ, '00_CORE/Configuration/atendimento-geral.json'))).roteamento || {};
    const a = [...assuntos].sort((x, y) => GRAVIDADE.indexOf(x) - GRAVIDADE.indexOf(y)).find(x => rota[x]);
    return a ? rota[a] : null;
  } catch { return null; }
}

function horarioEquipe() {
  try { const g = JSON.parse(ler(path.join(RAIZ, '00_CORE/Configuration/atendimento-geral.json'))); return g.texto_ia ? `

## Horário da equipe (Configurações)
${g.texto_ia}
` : ''; } catch { return ''; }
}

// ---------- pedido da cliente (Shopify) ----------
// O número do pedido e o CPF da compra, juntos, liberam o pedido. Sem os dois, a IA pede o que falta.
// Na conversa ficam pedido_id / pedido_num (já identificada) e pedido_tentativas (erros), para não deixar adivinhar.
const MAX_TENTATIVAS = 3;
async function contextoPedido(attrs, textosCliente) {
  const novos = {};
  try {
    if (attrs.pedido_id) {
      const p = await atualizarPedido(attrs.pedido_id);
      if (p) return { pedido: p, novos, texto: `A cliente já se identificou nesta conversa. Dados atualizados agora do sistema:\n${paraPrompt(p)}` };
    }
    const tentativas = Number(attrs.pedido_tentativas || 0);
    if (tentativas >= MAX_TENTATIVAS) return { novos, texto: `A cliente já errou o número do pedido ou o CPF ${tentativas} vezes. Não procure mais: diga com carinho que vai pedir para alguém da equipe localizar e escale (assunto rastreio).` };
    const { cpf, numero } = extrairIdentificacao(textosCliente);
    if (cpf && numero) {
      const combo = `${numero}:${cpf.slice(-4)}`;
      const r = await localizarPedido({ numero, cpf });
      if (r.ok) {
        Object.assign(novos, { pedido_id: r.pedido.id, pedido_num: r.pedido.num, pedido_tentativas: 0 });
        return { pedido: r.pedido, novos, texto: `Pedido localizado agora, com número e CPF conferidos:\n${paraPrompt(r.pedido)}` };
      }
      // a mesma tentativa errada não conta duas vezes
      if (attrs.pedido_ultima_tentativa !== combo) Object.assign(novos, { pedido_tentativas: tentativas + 1, pedido_ultima_tentativa: combo });
      const porque = { 'nao-encontrado': 'nenhum pedido com esse número', 'cpf-nao-confere': 'o CPF não confere com o do pedido', 'sem-cpf-no-pedido': 'o pedido existe, mas não tem CPF gravado para conferir' }[r.motivo];
      if (r.motivo === 'sem-cpf-no-pedido') return { novos, texto: `Não deu para conferir a identidade (${porque}). Não passe nenhum dado do pedido: diga que alguém da equipe vai confirmar e escale (assunto rastreio).` };
      return { novos, texto: `A cliente mandou o pedido ${numero} e um CPF, mas não bateu (${porque}; tentativa ${tentativas + 1} de ${MAX_TENTATIVAS}). Não diga qual dos dois está errado nem se o pedido existe. Peça com leveza para ela conferir o número do pedido (está no e-mail de confirmação da compra) e o CPF usado na compra.` };
    }
    if (numero) return { novos, texto: `A cliente mandou o número do pedido (${numero}), mas ainda não o CPF. Para localizar, peça o CPF usado na compra, de um jeito natural.` };
    if (cpf) return { novos, texto: 'A cliente mandou o CPF, mas ainda não o número do pedido. Peça o número do pedido (está no e-mail de confirmação da compra).' };
    return { novos, texto: 'Nenhum pedido identificado ainda. Se ela quiser saber do pedido, peça o número do pedido e o CPF usado na compra, numa frase só e de um jeito natural.' };
  } catch (e) {
    log({ erro_pedido: e.message });
    return { novos, texto: 'O sistema de pedidos não respondeu agora. Não invente status: diga que vai conferir com a equipe e escale (assunto rastreio).' };
  }
}

// o link de rastreio, o total e os preços do pedido localizado passam pela trava
export const extrasDoPedido = p => p ? {
  dominios: p.url_rastreio ? [p.url_rastreio.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()] : [],
  precos: [p.total_num],
} : {};

function montarPrompt({ marca, canal, conversa, pedido = '' }) {
  const modelo = ler(path.join(AQUI, 'prompt-ia.md'));
  return modelo
    .replace('{{PEDIDO}}', pedido || '(nenhuma conversa de pedido)')
    .replaceAll('{{MARCA}}', marca).replaceAll('{{CANAL}}', canal)
    .replaceAll('{{PERSONA}}', marca === 'Rosa Selvagem' ? 'a Rosa' : 'a assistente virtual')
    .replace('{{ASSUNTOS}}', ASSUNTOS.map(a => `- ${a.id}: ${a.desc}`).join('\n'))
    .replace('{{BASE}}', ler(path.join(CEREBRO, 'SAC', 'SAC - Base de Conhecimento.md')) + horarioEquipe())
    .replace('{{APRENDIZADOS}}', ler(path.join(CEREBRO, 'SAC', 'SAC - Aprendizados.md')))
    .replace('{{OFERTAS}}', secao(ler(path.join(CEREBRO, 'Decisões.md')), 'Preços e ofertas') || '(nenhuma oferta registrada)')
    .replace('{{PRODUTOS}}', produtosDaConversa(conversa));
}

// ---------- custo do dia ----------
// Cada resposta da IA tem um custo na Anthropic. Somamos por dia em 07_LOGS/ia-sac/custo-AAAA-MM-DD.json;
// ao passar do teto (chatwoot.json > ia.teto_diario_usd), a IA para de responder e passa tudo para a equipe.
const arqCusto = () => path.join(LOGS, `custo-${hoje()}.json`);
export function custoHoje() {
  try { return JSON.parse(ler(arqCusto())) || { usd: 0, chamadas: 0 }; } catch { return { usd: 0, chamadas: 0 }; }
}
function registrarCusto(usd) {
  const n = Number(usd);
  if (!(n > 0)) return;
  const c = custoHoje();
  c.usd = Math.round((c.usd + n) * 10000) / 10000; c.chamadas = (c.chamadas || 0) + 1;
  try { fs.mkdirSync(LOGS, { recursive: true }); fs.writeFileSync(arqCusto(), JSON.stringify(c)); } catch { /* sem disco: segue */ }
}

// ---------- Claude ----------
// imagens: [{ media_type, data(base64) }]. Com foto, a conversa vai pelo stdin em stream-json (texto + blocos de imagem).
export function perguntarClaude(sistema, conversa, modelo, schema = SCHEMA, imagens = []) {
  const comFoto = imagens.length > 0;
  return new Promise((ok, falha) => {
    const args = ['-p', '--model', modelo, '--output-format', comFoto ? 'stream-json' : 'json', ...(comFoto ? ['--input-format', 'stream-json', '--verbose'] : []),
      '--json-schema', JSON.stringify(schema),
      '--system-prompt', sistema, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', ''];
    const p = spawn(CLAUDE, args, { windowsHide: true });
    let out = '', err = '';
    const seg = comFoto ? 120 : 90;
    const limite = setTimeout(() => { p.kill(); falha(new Error(`o Claude passou de ${seg} s`)); }, seg * 1000);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(limite); falha(e); });
    p.on('close', codigo => {
      clearTimeout(limite);
      try {
        const j = comFoto
          ? out.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).find(x => x?.type === 'result') || {}
          : JSON.parse(out);
        if (j.is_error || !j.structured_output) throw new Error(j.result || 'sem resposta estruturada');
        registrarCusto(j.total_cost_usd);
        ok(j.structured_output);
      } catch (e) { falha(new Error(`Claude (código ${codigo}): ${e.message} ${err.slice(-300)}`)); }
    });
    p.stdin.end(comFoto
      ? JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: conversa },
        ...imagens.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }))] } }) + '\n'
      : conversa);
  });
}

// ---------- trava (a mesma regra do sac.py) ----------
export function problemas(texto, extras = {}) {
  const c = configSac();
  const max = c.max_caracteres || 900, dominios = [...(c.dominios_permitidos || ['rosaselvagemoficial.com.br', 'wa.me']), ...(extras.dominios || [])];
  const precos = new Set([...(c.precos_extras_permitidos || []), ...(extras.precos || [])].map(n => Math.round(Number(n) * 100) / 100));
  for (const p of catalogo()) for (const k of ['preco', 'preco_de']) if (Number(p[k])) precos.add(Math.round(Number(p[k]) * 100) / 100);
  const erros = [];
  if (texto.length > max) erros.push(`mensagem com ${texto.length} caracteres`);
  for (const url of texto.match(/(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?/gi) || []) {
    const dominio = url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    if (!url.includes('@') && !dominios.some(d => dominio === d || dominio.endsWith(`.${d}`))) erros.push(`link fora do site: ${url}`);
  }
  for (const [, v] of texto.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)) {
    const n = Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) / 100;
    if (!precos.has(n)) erros.push(`preço R$ ${v} fora do catálogo`);
  }
  return erros;
}

function anotarPergunta(pergunta) {
  const f = path.join(CEREBRO, 'SAC', 'SAC - Aprendizados.md');
  const texto = ler(f);
  if (!texto || semAcento(texto).includes(semAcento(pergunta).slice(0, 60))) return;
  const linha = `- ${hoje()}: ${pergunta} (IA do SAC no Chatwoot)\n`;
  const i = texto.indexOf('\n## Padrões das clientes');
  fs.writeFileSync(f, i < 0 ? texto + linha : texto.slice(0, i) + '\n' + linha.trimEnd() + texto.slice(i));
}

// ---------- mídia: fotos e áudios da cliente ----------
// Fotos vão para o Claude como imagem; áudios são transcritos (transcrever.py, faster-whisper) e entram no texto.
// Qualquer falha cai no texto antigo ("[mandou uma foto]"): a IA nunca quebra por causa de mídia.
const PYTHON = process.env.RS_PYTHON || 'C:/Users/Cncept D/.rosa-motor/venv/Scripts/python.exe';
const FFMPEG = process.env.RS_FFMPEG || 'ffmpeg';
const ARQ_TRANSCRICOES = path.join(LOGS, 'transcricoes.json');
const MAX_FOTO = 5 * 1024 * 1024, MAX_AUDIO = 10 * 1024 * 1024, MAX_FOTO_CLAUDE = 3.7 * 1024 * 1024; // a API aceita até 5 MB em base64
const NOME_ANEXO = { audio: 'um áudio', image: 'uma foto', video: 'um vídeo', location: 'uma localização', contact: 'um contato' };

const lerTranscricoes = () => { try { return JSON.parse(ler(ARQ_TRANSCRICOES)) || {}; } catch { return {}; } };
function gravarTranscricao(id, dados) {
  const t = lerTranscricoes();
  t[id] = { ...(t[id] || {}), ...dados };
  try { fs.mkdirSync(LOGS, { recursive: true }); fs.writeFileSync(ARQ_TRANSCRICOES, JSON.stringify(t, null, 1)); } catch { /* sem disco: segue */ }
}

// Baixa o anexo. Dentro do Docker o data_url traz o endereço público: se falhar, tenta de novo pelo endereço interno (base).
async function baixarAnexo(dataUrl, max, base) {
  const trocar = (u, b) => { const x = new URL(u), y = new URL(b); x.protocol = y.protocol; x.host = y.host; return x.href; };
  const tentar = async (url, b) => {
    for (let i = 0; i < 5; i++) {
      if (b) url = trocar(url, b);
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const destino = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && destino) { url = new URL(destino, url).href; continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (Number(r.headers.get('content-length')) > max) throw new Error('arquivo grande demais');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) throw new Error('arquivo grande demais');
      return buf;
    }
    throw new Error('redirecionamentos demais');
  };
  try { return await tentar(dataUrl); } catch (e) {
    if (!base || /grande demais/.test(e.message)) throw e;
    return await tentar(dataUrl, base);
  }
}

function tipoImagem(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (b.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// roda um programa com limite de tempo; devolve o stdout
function rodar(bin, args, { entrada, segundos = 60 } = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = '';
    const limite = setTimeout(() => { p.kill(); falha(new Error(`${path.basename(bin)} passou de ${segundos} s`)); }, segundos * 1000);
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(limite); falha(e); });
    p.on('close', codigo => { clearTimeout(limite); const b = Buffer.concat(out); codigo === 0 ? ok(b) : falha(new Error(`${path.basename(bin)} (código ${codigo}): ${(b.toString() + err).slice(-300)}`)); });
    p.stdin.on('error', () => {});
    p.stdin.end(entrada);
  });
}

// foto grande demais ou num formato que o Claude não lê (HEIC...): vira JPEG de até 1568 px pelo ffmpeg
const paraJpeg = buf => rodar(FFMPEG, ['-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', "scale='min(1568,iw)':-2", '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { entrada: buf, segundos: 30 });

async function transcrever(buf, id) {
  fs.mkdirSync(LOGS, { recursive: true });
  const tmp = path.join(LOGS, `tmp-audio-${id}-${Date.now()}`);
  fs.writeFileSync(tmp, buf);
  try {
    const out = (await rodar(PYTHON, [path.join(AQUI, 'transcrever.py'), tmp], { segundos: 120 })).toString().trim().split('\n').pop();
    const j = JSON.parse(out);
    if (j.erro) throw new Error(j.erro);
    return String(j.texto || '').trim();
  } finally { fs.rmSync(tmp, { force: true }); }
}

// Últimas 10 mensagens da cliente com anexo: até 3 fotos e 3 áudios (os mais recentes).
// Devolve { textos: Map(anexo -> texto na conversa), imagens: [{ media_type, data }], notas: [{ id, texto }] (áudios sem nota ainda) }
async function prepararMidia(msgs, base, conversa) {
  const textos = new Map(), imagens = [], notas = [];
  const anexos = msgs.filter(m => m.message_type === 0 && !m.private && m.attachments?.length).slice(-10).flatMap(m => m.attachments);
  const fotos = await Promise.all(anexos.filter(a => a.file_type === 'image' && a.data_url).slice(-3).map(async a => {
    try {
      let buf = await baixarAnexo(a.data_url, MAX_FOTO, base);
      let tipo = tipoImagem(buf);
      if (!tipo || buf.length > MAX_FOTO_CLAUDE) { buf = await paraJpeg(buf); tipo = 'image/jpeg'; }
      if (buf.length > MAX_FOTO_CLAUDE) throw new Error('foto grande demais mesmo reduzida');
      return { id: a.id, media_type: tipo, data: buf.toString('base64') };
    } catch (e) { log({ conversa, anexo: a.id, erro_foto: e.message }); return null; }
  }));
  for (const f of fotos.filter(Boolean)) {
    imagens.push({ media_type: f.media_type, data: f.data });
    textos.set(f.id, `[mandou uma foto: é a imagem ${imagens.length} anexada]`);
  }
  const cache = lerTranscricoes();
  for (const a of anexos.filter(a => a.file_type === 'audio' && a.data_url).slice(-3)) {
    try {
      let texto = cache[a.id]?.texto;
      if (typeof texto !== 'string') {
        const t0 = Date.now();
        texto = await transcrever(await baixarAnexo(a.data_url, MAX_AUDIO, base), a.id);
        gravarTranscricao(a.id, { texto, conversa, ts: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000) });
      }
      if (!cache[a.id]?.nota) notas.push({ id: a.id, texto });
      textos.set(a.id, texto ? `[áudio transcrito] ${texto}` : '[mandou um áudio sem fala que deu para entender]');
    } catch (e) { log({ conversa, anexo: a.id, erro_audio: e.message }); }
  }
  return { textos, imagens, notas };
}

// ---------- teste (Capitão): mostra o que a IA faria, sem mandar nada para ninguém ----------
// mensagens: [{ de: 'cliente' | 'ia', txt }]
export async function testarIA({ marca = 'Rosa Selvagem', canal = 'WhatsApp', cliente = 'Cliente', mensagens = [], modelo = 'opus' }) {
  const linhas = mensagens.map(m => `${m.de === 'cliente' ? cliente : 'Você (IA)'}: ${m.txt}`);
  const conversa = `Nome da cliente: ${cliente}\nCanal: ${canal}\n\nConversa (da mais antiga para a mais nova):\n${linhas.join('\n')}\n\nResponda à última mensagem da cliente.`;
  const t0 = Date.now();
  const ped = await contextoPedido({}, mensagens.filter(m => m.de === 'cliente').map(m => m.txt));
  const r = await perguntarClaude(montarPrompt({ marca, canal, conversa, pedido: ped.texto }), conversa, modelo);
  return { ...r, pedido: ped.pedido ? paraCard(ped.pedido) : null, barrado: (r.mensagens || []).flatMap(t => problemas(t, extrasDoPedido(ped.pedido))), segundos: Math.round((Date.now() - t0) / 1000) };
}

// ---------- ciclo ----------
export function iniciarIA({ cfg, cw }) {
  const vistas = new Map();      // conversa -> created_at da última mensagem da cliente já tratada
  const andamento = new Set();
  const inicio = Date.now() / 1000;
  const sistema = () => cfg().token;
  const bot = () => cfg().ia?.token;

  const nomeCanal = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', telegram: 'Telegram', email: 'e-mail', site: 'chat do site' };
  function canalDo(ib) {
    const t = ib?.channel_type || '', n = semAcento(ib?.name || '').replace(/-/g, '');
    if (/whatsapp/i.test(t)) return 'whatsapp';
    if (/instagram/i.test(t)) return 'instagram';
    if (t === 'Channel::FacebookPage') return 'messenger';
    if (t === 'Channel::Telegram') return 'telegram';
    if (t === 'Channel::Email') return 'email';
    if (t === 'Channel::WebWidget') return 'site';
    return ['whatsapp', 'instagram', 'messenger', 'telegram', 'email'].find(k => n.includes(k)) || 'site';
  }

  // manda um aviso curto e abre a conversa para a equipe, sem perguntar nada ao Claude
  async function passarSemIA(c, motivo) {
    const aviso = cfg().ia?.mensagem_espera || 'Oi! Recebemos sua mensagem 💗 Já já alguém da nossa equipe te responde por aqui.';
    const jaAvisou = (c.messages || []).some(m => m.message_type === 1 && !m.private);
    if (!jaAvisou) await cw(`conversations/${c.id}/messages`, { method: 'POST', body: { content: aviso, message_type: 'outgoing' }, token: bot() }).catch(() => {});
    await cw(`conversations/${c.id}/custom_attributes`, { method: 'POST', body: { custom_attributes: { ...(c.custom_attributes || {}), motivo_ia: motivo } }, token: sistema() });
    await cw(`conversations/${c.id}/toggle_status`, { method: 'POST', body: { status: 'open' }, token: sistema() });
    log({ conversa: c.id, acao: 'escalar-sem-ia', motivo });
  }

  async function tratar(id, marcaTempo) {
    andamento.add(id);
    const t0 = Date.now();
    let midia = { textos: new Map(), imagens: [], notas: [] };
    try {
      const c = await cw(`conversations/${id}`, { token: sistema() });
      if (c.status !== 'pending') return;
      const ib = await cw(`inboxes/${c.inbox_id}`, { token: sistema() }).catch(() => null);
      const canal = canalDo(ib), marca = /beyoung/i.test(ib?.name || '') ? 'Beyoung' : 'Rosa Selvagem';
      const marcasLiberadas = cfg().ia?.marcas || ['Rosa Selvagem'];
      if (!marcasLiberadas.includes(marca)) return await passarSemIA(c, `A IA ainda não atende a ${marca}`);
      const teto = Number(cfg().ia?.teto_diario_usd ?? 30);
      if (teto > 0 && custoHoje().usd >= teto) return await passarSemIA(c, 'A IA chegou no teto de gasto do dia');
      const msgs = (await cw(`conversations/${id}/messages`, { token: sistema() })).payload || [];
      const cliente = c.meta?.sender?.name || 'Cliente';
      // fotos viram imagem para o Claude e áudios viram texto; se algo falhar, fica o "[mandou ...]" de sempre
      midia = await prepararMidia(msgs, cfg().url, id).catch(e => { log({ conversa: id, erro_midia: e.message }); return midia; });
      const anexoTxt = a => midia.textos.get(a.id) || `[mandou ${NOME_ANEXO[a.file_type] || 'um arquivo'}]`;
      const linhas = msgs.filter(m => m.message_type !== 2 && !m.private && (m.content || m.attachments?.length)).slice(-30).map(m => {
        const quem = m.message_type === 0 ? cliente : (m.sender_type === 'AgentBot' || m.sender?.type === 'agent_bot') ? 'Você (IA)' : `${m.sender?.name || 'Equipe'} (equipe)`;
        const anexo = (m.attachments || []).map(a => ` ${anexoTxt(a)}`).join('');
        return `${quem}: ${m.content || ''}${anexo}`;
      });
      const fotosTxt = midia.imagens.length ? `\n\nAs ${midia.imagens.length === 1 ? 'foto que a cliente mandou está anexada' : `${midia.imagens.length} fotos que a cliente mandou estão anexadas, na ordem da conversa`}. Olhe com atenção antes de responder.` : '';
      const conversa = `Nome da cliente: ${cliente}\nCanal: ${nomeCanal[canal]}\n\nConversa (da mais antiga para a mais nova):\n${linhas.join('\n')}${fotosTxt}\n\nResponda à última mensagem da cliente.`;
      const ditos = msgs.filter(m => m.message_type === 0).flatMap(m => [m.content, ...(m.attachments || []).filter(a => a.file_type === 'audio').map(a => midia.textos.get(a.id)?.replace('[áudio transcrito] ', ''))]).filter(Boolean);
      const ped = await contextoPedido(c.custom_attributes || {}, ditos);
      const r = await perguntarClaude(montarPrompt({ marca, canal: nomeCanal[canal], conversa, pedido: ped.texto }), conversa, cfg().ia?.modelo || 'opus', SCHEMA, midia.imagens);

      // a cliente mandou mais coisa enquanto a IA pensava: recomeça com tudo junto
      const agora = await cw(`conversations/${id}`, { token: sistema() });
      const ult = agora.last_non_activity_message;
      if (agora.status !== 'pending') return;
      if (ult && ult.message_type === 0 && ult.created_at > marcaTempo) { vistas.delete(id); return; }

      let acao = r.acao, motivo = r.motivo;
      const textos = (r.mensagens || []).map(s => s.trim()).filter(Boolean).slice(0, 3);
      const barrado = textos.flatMap(t => problemas(t, extrasDoPedido(ped.pedido)));
      if (barrado.length && acao !== 'ignorar') { acao = 'escalar-barrado'; motivo = `Resposta barrada pela trava (${barrado.join('; ')})`; }

      const enviar = async texto => {
        await cw(`conversations/${id}/toggle_typing_status`, { method: 'POST', body: { typing_status: 'on' }, token: bot() }).catch(() => {});
        await dormir(Math.min(6000, 1200 + texto.length * 28));
        await cw(`conversations/${id}/messages`, { method: 'POST', body: { content: texto, message_type: 'outgoing' }, token: bot() });
      };

      if (acao === 'responder' || acao === 'escalar') for (const t of textos) await enviar(t);

      const attrs = { ...(agora.custom_attributes || {}), ...ped.novos, resumo_ia: r.resumo, observacao_ia: acao === 'escalar-barrado' ? motivo : (r.observacao || '') };
      if (!attrs.observacao_ia) delete attrs.observacao_ia;
      if (acao.startsWith('escalar')) {
        attrs.motivo_ia = acao === 'escalar-barrado' ? 'Resposta da IA precisa de revisão' : (motivo || 'Precisa de alguém da equipe');
        attrs.sugestao_ia = acao === 'escalar-barrado' ? textos.join('\n\n') : (r.sugestao_equipe || '');
        attrs.sugestao_fonte = acao === 'escalar-barrado' ? motivo : 'Base de conhecimento do SAC';
        if (!attrs.sugestao_ia) { delete attrs.sugestao_ia; delete attrs.sugestao_fonte; }
      }
      await cw(`conversations/${id}/custom_attributes`, { method: 'POST', body: { custom_attributes: attrs }, token: sistema() });
      const etiquetas = [...new Set([...(agora.labels || []), ...(r.assuntos || [])])];
      await cw(`conversations/${id}/labels`, { method: 'POST', body: { labels: etiquetas }, token: sistema() });
      // o contato também guarda os assuntos, para a equipe achar depois em Contatos
      const contatoId = agora.meta?.sender?.id;
      if (contatoId) {
        const doContato = await cw(`contacts/${contatoId}/labels`, { token: sistema() }).catch(() => ({ payload: [] }));
        const todas = [...new Set([...(doContato.payload || []), ...(r.assuntos || [])])];
        await cw(`contacts/${contatoId}/labels`, { method: 'POST', body: { labels: todas }, token: sistema() }).catch(() => {});
      }
      // pedido identificado: aparece no card "Último pedido" e passa a ser acompanhado até a entrega
      if (ped.pedido) {
        if (contatoId) await atualizarCard({ cfg, cw }, contatoId, ped.pedido);
        if (acao === 'responder' || acao === 'escalar') acompanhar({ pedido: ped.pedido, conversa: id, contato: contatoId, cliente });
      }
      let time = null;
      if (acao.startsWith('escalar')) {
        // vai para o time do assunto mais sério (Configurações > Geral > Para onde vai cada assunto)
        time = timeDoAssunto(r.assuntos || []);
        if (time) await cw(`conversations/${id}/assignments`, { method: 'POST', body: { team_id: time }, token: sistema() }).catch(e => log({ conversa: id, erro_time: e.message }));
        await cw(`conversations/${id}/toggle_status`, { method: 'POST', body: { status: 'open' }, token: sistema() });
      }
      if (r.pergunta_sem_resposta?.trim()) try { anotarPergunta(r.pergunta_sem_resposta.trim()); } catch { /* o Cérebro pode estar aberto no Obsidian */ }

      log({ conversa: id, acao, assuntos: r.assuntos, time, motivo, observacao: r.observacao, segundos: Math.round((Date.now() - t0) / 1000), baloes: textos.length, fotos: midia.imagens.length, audios: [...midia.textos.values()].filter(t => t.startsWith('[áudio')).length });
    } catch (e) {
      log({ conversa: id, erro: e.message });
      // falhou: passa para a equipe em vez de deixar a cliente sem resposta
      await cw(`conversations/${id}/custom_attributes`, { method: 'POST', body: { custom_attributes: { motivo_ia: 'A IA não conseguiu responder' } }, token: sistema() }).catch(() => {});
      await cw(`conversations/${id}/toggle_status`, { method: 'POST', body: { status: 'open' }, token: sistema() }).catch(() => {});
    } finally {
      // transcrição do áudio vira nota interna (uma vez por áudio), para a equipe ler sem ouvir
      for (const n of midia.notas) {
        await cw(`conversations/${id}/messages`, { method: 'POST', body: { content: `Áudio transcrito pela IA: ${n.texto || '(sem fala que deu para entender)'}`, message_type: 'outgoing', private: true }, token: sistema() })
          .then(() => gravarTranscricao(n.id, { nota: true }))
          .catch(e => log({ conversa: id, anexo: n.id, erro_nota: e.message }));
      }
      andamento.delete(id);
    }
  }

  async function ciclo() {
    const c = cfg();
    if (!c?.ia?.ligada || !c.ia.token) return;
    const espera = (c.ia.espera_segundos || 6) * 1000;
    for (let p = 1; p <= 4; p++) {
      const r = await cw(`conversations?status=pending&assignee_type=all&page=${p}`, { token: sistema() });
      const lote = r.data?.payload || [];
      for (const x of lote) {
        const u = x.last_non_activity_message;
        if (!u || u.message_type !== 0 || andamento.has(x.id)) continue;
        if ((vistas.get(x.id) || 0) >= u.created_at) continue;
        if (u.created_at < inicio - 2 * 3600) { vistas.set(x.id, u.created_at); continue; } // não responde mensagem antiga ao ligar
        if (Date.now() - u.created_at * 1000 < espera) continue; // espera a cliente terminar de escrever
        if (andamento.size >= (Number(c.ia.simultaneas) || 6)) return;
        vistas.set(x.id, u.created_at);
        tratar(x.id, u.created_at);
      }
      if (lote.length < 25) break;
    }
  }

  (async () => {
    for (;;) {
      try { await ciclo(); } catch (e) { log({ erro_ciclo: e.message }); }
      await dormir(3000);
    }
  })();
}
