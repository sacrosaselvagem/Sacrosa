// Central de Ajuda: a página pública de perguntas frequentes do Chatwoot (portal, categorias e artigos).
// No Chatwoot só o administrador pode escrever artigos; a supervisora é "agent" lá. Por isso as escritas passam
// por aqui com o token de sistema, depois de conferir o nível de quem pediu (dona ou supervisora).
//   GET    /ajuda/dados               portal, categorias, artigos e o endereço público
//   POST   /ajuda/portal              cria a "Ajuda Rosa Selvagem" (slug rosa-selvagem, pt_BR)
//   POST   /ajuda/categorias          { nome }
//   POST   /ajuda/artigos             { titulo, categoria_id, texto, status }
//   PATCH  /ajuda/artigos/:id         idem
//   DELETE /ajuda/artigos/:id
//   POST   /ajuda/sugestoes           propõe artigos escritos só com a base do SAC (Claude; sem ele, extrai as seções)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SLUG = 'rosa-selvagem';
const LOCALE = 'pt_BR';
const CEREBRO = process.env.RS_CEREBRO || 'C:/Users/Cncept D/Documents/Native Agents/Native Agemts/Rosa Selvagem - Cérebro';
const BASE_SAC = path.join(CEREBRO, 'SAC', 'SAC - Base de Conhecimento.md');
const CLAUDE = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || 'C:/Users/Cncept D', '.local/bin/claude.exe');
const CATEGORIAS = ['Entrega e frete', 'Trocas e cancelamentos', 'Fale com a gente'];

const slugify = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'categoria';
const resumoDe = txt => String(txt || '').replace(/[*_#>`[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);

async function acharPortal(cw) {
  const lista = (await cw('portals')).payload || [];
  return lista.find(x => x.slug === SLUG) || lista.find(x => !x.archived) || null;
}

async function todosArtigos(cw, slug) {
  const todos = [];
  for (let pg = 1; pg <= 20; pg++) {
    const r = await cw(`portals/${slug}/articles?page=${pg}`);
    const lote = r.payload || [];
    todos.push(...lote);
    if (lote.length < 25) break;
  }
  return todos.map(a => ({
    id: a.id, slug: a.slug, titulo: a.title || '', texto: a.content || '', status: a.status,
    categoria_id: a.category?.id || null, atualizado: (a.updated_at || 0) * 1000, visitas: a.views || 0,
  }));
}

function corpoArtigo(v, autor) {
  const art = {};
  if ('titulo' in v) art.title = String(v.titulo || '').trim().slice(0, 200);
  if ('texto' in v) { art.content = String(v.texto || ''); art.description = resumoDe(v.texto); }
  if ('categoria_id' in v) art.category_id = Number(v.categoria_id) || null;
  if ('status' in v) art.status = v.status === 'published' ? 'published' : 'draft';
  if (autor) art.author_id = autor;
  return art;
}

// ---------- sugestões a partir da base do SAC ----------
const SCHEMA = {
  type: 'object',
  properties: {
    artigos: {
      type: 'array', minItems: 5, maxItems: 8,
      items: {
        type: 'object',
        properties: { titulo: { type: 'string' }, categoria: { type: 'string', enum: CATEGORIAS }, texto: { type: 'string' } },
        required: ['titulo', 'categoria', 'texto'],
      },
    },
  },
  required: ['artigos'],
};

const PROMPT = `Você escreve os artigos da página de ajuda (perguntas frequentes) da Rosa Selvagem, uma marca de cosméticos.
Quem lê é a cliente, no site. Você recebe a base de conhecimento do SAC (texto interno da equipe).

Regras, sem exceção:
- Use SOMENTE fatos que estão escritos na base. Não invente prazo, valor, regra, horário, link, telefone nem promessa.
- Itens marcados como "Em aberto" NÃO são fatos: não escreva sobre eles. Se um tema depende disso, diga só o que a base
  confirma e oriente a cliente a falar com a gente pelos contatos da base.
- Não fale de robô, IA, escalar, equipe interna, Shopify nem de instruções para a atendente. Transforme a regra em
  orientação para a cliente ("Se você não achou o código, olhe a caixa de spam...").
- Português do Brasil simples, frases curtas, tratando a cliente por "você". Sem emoji.
- Formato Markdown simples: parágrafos curtos, listas com "- ", negrito com **. Sem títulos (#). De 50 a 180 palavras.
- Escreva de 5 a 8 artigos, um por tema, sem repetir: Prazo de entrega, Frete, Rastreio do pedido, Troca e devolução,
  Produto com avaria na entrega, Cancelamento, Formas de contato. Pule um tema se a base não tiver fato suficiente.
- Categoria: "Entrega e frete" (prazo, frete, rastreio, endereço), "Trocas e cancelamentos" (troca, devolução,
  avaria, cancelamento, reembolso) ou "Fale com a gente" (contatos).
- Título curto, como a cliente procuraria ("Qual o prazo de entrega?", "Como rastrear meu pedido").

A base vem a seguir.`;

function perguntarClaude(base) {
  return new Promise((ok, falha) => {
    const args = ['-p', '--model', 'sonnet', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
      '--system-prompt', PROMPT, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', ''];
    const p = spawn(CLAUDE, args, { windowsHide: true });
    let out = '', err = '';
    const limite = setTimeout(() => { p.kill(); falha(new Error('demorou demais')); }, 150000);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(limite); falha(e); });
    p.on('close', () => {
      clearTimeout(limite);
      try {
        const j = JSON.parse(out);
        if (j.is_error || !j.structured_output?.artigos?.length) throw new Error(j.result || 'sem resposta');
        ok(j.structured_output.artigos);
      } catch (e) { falha(new Error(`${e.message} ${err.slice(-200)}`)); }
    });
    p.stdin.end(base);
  });
}

// Sem o Claude: monta os artigos com as frases da própria base (sem os itens "Em aberto" e sem as instruções internas).
function extrair(base) {
  const secoes = {};
  let atual = null;
  for (const linha of base.split(/\r?\n/)) {
    const h = linha.match(/^##\s+(.+)/);
    if (h) { atual = h[1].trim(); secoes[atual] = []; continue; }
    if (!atual) continue;
    if (/^\s*-\s+/.test(linha)) secoes[atual].push(linha.replace(/^\s*-\s+/, '').trim());
    else if (/^\s{2,}\S/.test(linha) && secoes[atual].length) secoes[atual][secoes[atual].length - 1] += ` ${linha.trim()}`;
  }
  const limpa = s => s.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').replace(/~~[^~]*~~/g, '').trim();
  const interno = s => /em aberto|robô|escal|shopify|catalogo\.json|motor|\[\[/i.test(s);
  const pegar = (sec, re) => (secoes[sec] || []).filter(b => re.test(b) && !interno(b)).map(b => `- ${limpa(b)}`);
  const temas = [
    ['Qual o prazo de entrega?', 'Entrega e frete', pegar('Envio e prazos', /entregamos|postagem|SEDEX|atraso/i)],
    ['Como funciona o frete?', 'Entrega e frete', pegar('Envio e prazos', /frete|endereço errado/i)],
    ['Como rastrear meu pedido', 'Entrega e frete', (secoes['Envio e prazos'] || []).filter(b => /rastreamento/i.test(b)).map(b => `- ${limpa(b.split(/\.\s+Se a cliente/)[0])}.`)],
    ['Troca e devolução', 'Trocas e cancelamentos', pegar('Troca e devolução', /dias|custo|reembolso|avaria/i)],
    ['Cancelamento do pedido', 'Trocas e cancelamentos', pegar('Cancelamento', /.*/)],
    ['Formas de contato', 'Fale com a gente', pegar('Empresa e contatos', /whatsapp|telefone|e-mail|site/i)],
  ];
  return temas.filter(t => t[2].length).map(([titulo, categoria, linhas]) => ({ titulo, categoria, texto: linhas.join('\n') }));
}

export default async function ({ p, m, req, res, s, c, cw, lerCorpo, responder, nivel }) {
  if (!p.startsWith('/ajuda')) return false;
  if (!['dona', 'supervisora'].includes(nivel)) { responder(res, 403, { erro: 'Só a dona e a supervisora mexem na Central de Ajuda.' }); return true; }
  const base = String(c.url_publica || c.url || '').replace(/\/$/, '');

  if (p === '/ajuda/dados' && m === 'GET') {
    const portal = await acharPortal(cw);
    if (!portal) { responder(res, 200, { base, portal: null, categorias: [], artigos: [] }); return true; }
    const [cats, artigos] = await Promise.all([cw(`portals/${portal.slug}/categories`), todosArtigos(cw, portal.slug)]);
    responder(res, 200, {
      base,
      portal: { slug: portal.slug, nome: portal.name, locale: portal.config?.default_locale || LOCALE },
      categorias: (cats.payload || []).map(x => ({ id: x.id, nome: x.name, slug: x.slug })),
      artigos,
    });
    return true;
  }

  if (p === '/ajuda/portal' && m === 'POST') {
    const existe = await acharPortal(cw);
    if (existe) { responder(res, 200, { slug: existe.slug }); return true; }
    const r = await cw('portals', {
      method: 'POST',
      body: { portal: { name: 'Ajuda Rosa Selvagem', slug: SLUG, page_title: 'Ajuda Rosa Selvagem', header_text: 'Como podemos ajudar?',
        homepage_link: 'https://rosaselvagemoficial.com.br', color: '#18181B', config: { default_locale: LOCALE, allowed_locales: [LOCALE] } } },
    });
    responder(res, 200, { slug: r.slug });
    return true;
  }

  const portal = p.startsWith('/ajuda/sugestoes') ? null : await acharPortal(cw);
  if (!portal && !p.startsWith('/ajuda/sugestoes')) { responder(res, 400, { erro: 'Crie a Central de Ajuda primeiro.' }); return true; }

  if (p === '/ajuda/categorias' && m === 'POST') {
    const { nome } = await lerCorpo(req);
    const n = String(nome || '').trim().slice(0, 80);
    if (!n) { responder(res, 400, { erro: 'Escreva o nome da categoria.' }); return true; }
    const cats = (await cw(`portals/${portal.slug}/categories`)).payload || [];
    const igual = cats.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (igual) { responder(res, 200, { id: igual.id, nome: igual.name }); return true; }
    let slug = slugify(n);
    if (cats.some(x => x.slug === slug)) slug += `-${Date.now().toString(36)}`;
    const r = await cw(`portals/${portal.slug}/categories`, { method: 'POST', body: { category: { name: n, slug, locale: portal.config?.default_locale || LOCALE } } });
    responder(res, 200, { id: r.payload?.id ?? r.id, nome: n });
    return true;
  }

  if (p === '/ajuda/artigos' && m === 'POST') {
    const v = await lerCorpo(req);
    if (!String(v.titulo || '').trim()) { responder(res, 400, { erro: 'Escreva o título do artigo.' }); return true; }
    if (v.status === 'published' && !String(v.texto || '').trim()) { responder(res, 400, { erro: 'Para publicar, escreva o texto do artigo.' }); return true; }
    const r = await cw(`portals/${portal.slug}/articles`, { method: 'POST', body: { article: corpoArtigo({ status: 'draft', ...v }, s.userId) } });
    responder(res, 200, { id: r.payload?.id ?? r.id, slug: r.payload?.slug ?? r.slug });
    return true;
  }

  const mm = p.match(/^\/ajuda\/artigos\/(\d+)$/);
  if (mm && m === 'PATCH') {
    const v = await lerCorpo(req);
    if ('titulo' in v && !String(v.titulo || '').trim()) { responder(res, 400, { erro: 'O título não pode ficar vazio.' }); return true; }
    if (v.status === 'published' && 'texto' in v && !String(v.texto || '').trim()) { responder(res, 400, { erro: 'Para publicar, escreva o texto do artigo.' }); return true; }
    await cw(`portals/${portal.slug}/articles/${mm[1]}`, { method: 'PATCH', body: { article: corpoArtigo(v) } });
    responder(res, 200, { ok: true });
    return true;
  }
  if (mm && m === 'DELETE') {
    await cw(`portals/${portal.slug}/articles/${mm[1]}`, { method: 'DELETE' });
    responder(res, 200, { ok: true });
    return true;
  }

  if (p === '/ajuda/sugestoes' && m === 'POST') {
    let texto = '';
    try { texto = fs.readFileSync(BASE_SAC, 'utf8'); } catch { responder(res, 500, { erro: 'Não achei a base do SAC no Cérebro.' }); return true; }
    try {
      const artigos = await perguntarClaude(texto);
      responder(res, 200, { fonte: 'ia', artigos: artigos.map(a => ({ titulo: a.titulo.trim(), categoria: a.categoria, texto: a.texto.trim() })) });
    } catch (e) {
      console.error('ajuda/sugestoes:', e.message);
      responder(res, 200, { fonte: 'base', artigos: extrair(texto) });
    }
    return true;
  }

  responder(res, 404, { erro: 'rota desconhecida' });
  return true;
}
