// Pedidos da Shopify para o atendimento: acha o pedido pelo número + CPF da compra e traduz status e rastreio.
// Os dois juntos são a "senha" da cliente: sem o CPF certo, nada do pedido é mostrado.
// Configuração em 00_CORE/Configuration/shopify.json (nunca vai ao navegador):
//   modo "desligado" -> sem loja: nenhum pedido (padrão até ligar a Shopify; nada de pedido fictício em produção)
//   modo "teste"  -> pedidos fictícios de 07_LOGS/atendimento/pedidos-teste.json (criados na primeira vez)
//   modo "loja"   -> Admin API (GraphQL) com access_token, ou client_id + client_secret (app do Dev Dashboard)
//   node 06_BACKEND/atendimento/pedidos.mjs buscar 1002 12345678909   -> testa a busca
//   node 06_BACKEND/atendimento/pedidos.mjs avancar 1002              -> (teste) leva o pedido ao próximo passo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const CFG = path.join(RAIZ, '00_CORE/Configuration/shopify.json');
const TESTE = path.join(RAIZ, '07_LOGS/atendimento/pedidos-teste.json');

const lerJson = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return padrao; } };
export const cfgShopify = () => lerJson(CFG, { modo: 'teste' });
export const emTeste = () => cfgShopify().modo === 'teste';
const digitos = s => String(s ?? '').replace(/\D/g, '');
const reais = n => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const ddmm = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ---------- CPF e número do pedido na conversa ----------
export function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// textos: só as mensagens da cliente, da mais antiga para a mais nova. Vale o dado mais recente.
export function extrairIdentificacao(textos) {
  let cpf = '', numero = '';
  for (const t of textos) {
    const s = String(t || '');
    for (const m of s.matchAll(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}(?!\d)/g)) if (cpfValido(m[0])) cpf = digitos(m[0]);
    const semCpf = s.replace(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}(?!\d)/g, ' ')
      .replace(/R\$\s*[\d.,]+/g, ' ').replace(/\d{5}-\d{3}/g, ' ').replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, ' ');
    const n = semCpf.match(/#\s?(\d{3,8})/) || semCpf.match(/pedido\D{0,20}?(\d{3,8})(?!\d)/i) || semCpf.match(/(?<![\d,.])(\d{4,8})(?![\d,.])/);
    if (n) numero = n[1];
  }
  return { cpf, numero };
}

// ---------- Shopify ----------
let tokenCache = { valor: '', ate: 0 };
async function tokenShopify(c) {
  if (c.access_token) return c.access_token;
  if (tokenCache.valor && Date.now() < tokenCache.ate) return tokenCache.valor;
  // app do Dev Dashboard instalado na própria loja: client credentials, token vale ~24 h
  const r = await fetch(`https://${c.loja}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.client_id, client_secret: c.client_secret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Shopify recusou o acesso (${r.status})`);
  tokenCache = { valor: j.access_token, ate: Date.now() + ((j.expires_in || 86400) - 600) * 1000 };
  return tokenCache.valor;
}

const CAMPOS = `id name createdAt processedAt cancelledAt displayFinancialStatus displayFulfillmentStatus note
  totalPriceSet { shopMoney { amount } }
  customer { firstName }
  shippingAddress { firstName city provinceCode company }
  billingAddress { company }
  customAttributes { key value }
  CPF_CAMPO
  shippingLine { title }
  lineItems(first: 20) { nodes { title quantity } }
  fulfillments(first: 5) { createdAt status displayStatus estimatedDeliveryAt inTransitAt deliveredAt
    trackingInfo { number company url }
    events(first: 30, sortKey: HAPPENED_AT, reverse: true) { nodes { id status happenedAt message city province } } }`;
// O CPF do checkout brasileiro fica em localizedFields (versões novas) ou localizationExtensions (antigas).
const CPF_CAMPOS = ['localizedFields(first: 5) { nodes { key value } }', 'localizationExtensions(first: 5) { nodes { key value } }', ''];

async function graphql(c, query, variables) {
  const r = await fetch(`https://${c.loja}/admin/api/${c.versao_api || '2025-07'}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await tokenShopify(c) },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Shopify respondeu ${r.status}`);
  return j;
}

let cpfCampo = null; // descobre uma vez qual campo de CPF a versão da API aceita
async function pedidosDaLoja(c, filtro) {
  for (const campo of cpfCampo !== null ? [cpfCampo] : CPF_CAMPOS) {
    const j = await graphql(c, `query($q: String!) { orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { ${CAMPOS.replace('CPF_CAMPO', campo)} } } }`, { q: filtro });
    if (j.errors?.some(e => /localized|localization/i.test(e.message))) continue;
    if (j.errors?.length) throw new Error(`Shopify: ${j.errors[0].message}`);
    cpfCampo = campo;
    return j.data.orders.nodes;
  }
  return [];
}
async function pedidoDaLojaPorId(c, id) {
  const j = await graphql(c, `query($id: ID!) { order(id: $id) { ${CAMPOS.replace('CPF_CAMPO', cpfCampo ?? CPF_CAMPOS[0])} } }`, { id });
  if (j.errors?.length) throw new Error(`Shopify: ${j.errors[0].message}`);
  return j.data.order;
}

// O CPF pode estar no campo do checkout, num atributo do pedido, na nota ou no campo "empresa" do endereço.
function cpfsDoPedido(o) {
  const achados = new Set();
  const varrer = v => {
    if (v == null) return;
    if (typeof v === 'object') { for (const x of Object.values(v)) varrer(x); return; }
    for (const m of String(v).matchAll(/\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}/g)) if (cpfValido(m[0])) achados.add(digitos(m[0]));
  };
  varrer([o.localizedFields, o.localizationExtensions, o.customAttributes, o.note, o.billingAddress?.company, o.shippingAddress?.company]);
  return achados;
}

// ---------- pedidos de teste ----------
function cpfDe(base9) { // completa os dígitos verificadores
  const d = base9.split('').map(Number);
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); const r = (s * 10) % 11; d.push(r === 10 ? 0 : r); }
  return d.join('');
}
function diasAtras(n) { return new Date(Date.now() - n * 864e5).toISOString(); }
function criarTeste() {
  const item = (title, quantity = 1) => ({ title, quantity });
  const base = (num, nome, cidade, uf, dias, total, frete, itens, cpf9) => ({
    id: `gid://shopify/Order/teste-${num}`, name: `#${num}`, createdAt: diasAtras(dias), processedAt: diasAtras(dias), cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', note: '', totalPriceSet: { shopMoney: { amount: total } },
    customer: { firstName: nome }, shippingAddress: { firstName: nome, city: cidade, provinceCode: uf, company: '' }, billingAddress: { company: '' },
    customAttributes: [], localizedFields: { nodes: [{ key: 'TAX_CREDENTIAL_BR', value: cpfDe(cpf9) }] },
    shippingLine: { title: frete }, lineItems: { nodes: itens }, fulfillments: [],
  });
  const enviado = (o, dias, cod, eventos) => {
    o.displayFulfillmentStatus = 'FULFILLED';
    o.fulfillments = [{ createdAt: diasAtras(dias), status: 'SUCCESS', displayStatus: 'FULFILLED', estimatedDeliveryAt: null, inTransitAt: null, deliveredAt: null,
      trackingInfo: [{ number: cod, company: 'Correios', url: `https://rastreamento.correios.com.br/app/index.php?objeto=${cod}` }],
      events: { nodes: eventos.map(([status, d, cidade, uf], i) => ({ id: `ev-${cod}-${i}`, status, happenedAt: diasAtras(d), message: '', city: cidade, province: uf })) } }];
    return o;
  };
  const pedidos = [
    base(1001, 'Juliana', 'Recife', 'PE', 2, '99.90', 'SEDEX', [item('Óleo Clareador Corporal 2.0')], '529982247'),
    enviado(base(1002, 'Camila', 'São Paulo', 'SP', 6, '149.80', 'SEDEX', [item('Óleo Clareador Corporal 2.0'), item('Rosa Selvagem - Desodorante Clareador')], '111444777'),
      3, 'AB123456789BR', [['IN_TRANSIT', 2, 'Jaboatão dos Guararapes', 'PE'], ['CONFIRMED', 3, 'Jaboatão dos Guararapes', 'PE']]),
    enviado(base(1003, 'Patrícia', 'Salvador', 'BA', 12, '99.90', 'SEDEX', [item('Óleo Clareador Corporal 2.0')], '987654321'),
      8, 'AB987654321BR', [['DELIVERED', 1, 'Salvador', 'BA'], ['OUT_FOR_DELIVERY', 1, 'Salvador', 'BA'], ['IN_TRANSIT', 5, 'Recife', 'PE']]),
    enviado(base(1004, 'Nathalya', 'Porto Alegre', 'RS', 30, '99.90', 'FLASH', [item('Óleo Clareador Corporal 2.0')], '123456789'),
      26, 'FL938201145BR', [['IN_TRANSIT', 20, 'Curitiba', 'PR'], ['CONFIRMED', 26, 'Jaboatão dos Guararapes', 'PE']]),
  ];
  pedidos[3].fulfillments[0].trackingInfo[0].company = 'Flash Courier';
  fs.mkdirSync(path.dirname(TESTE), { recursive: true });
  fs.writeFileSync(TESTE, JSON.stringify(pedidos, null, 2));
  return pedidos;
}
const pedidosTeste = () => lerJson(TESTE, null) || criarTeste();

export function avancarTeste(numero) {
  const lista = pedidosTeste();
  const o = lista.find(x => digitos(x.name) === digitos(numero));
  if (!o) throw new Error('pedido de teste não encontrado');
  const agora = new Date().toISOString(), cod = `AB${digitos(numero).padStart(9, '0')}BR`;
  const f = o.fulfillments[0];
  const ev = status => f.events.nodes.unshift({ id: `ev-${cod}-${f.events.nodes.length}-${Date.now()}`, status, happenedAt: agora, message: '', city: o.shippingAddress.city, province: o.shippingAddress.provinceCode });
  if (!f) {
    o.displayFulfillmentStatus = 'FULFILLED';
    o.fulfillments = [{ createdAt: agora, status: 'SUCCESS', displayStatus: 'FULFILLED', trackingInfo: [{ number: cod, company: 'Correios', url: `https://rastreamento.correios.com.br/app/index.php?objeto=${cod}` }], events: { nodes: [] } }];
  } else {
    const ultimo = f.events.nodes[0]?.status;
    if (!ultimo || ultimo === 'CONFIRMED' || ultimo === 'LABEL_PRINTED') ev('IN_TRANSIT');
    else if (ultimo === 'IN_TRANSIT') ev('OUT_FOR_DELIVERY');
    else if (ultimo === 'OUT_FOR_DELIVERY') ev('DELIVERED');
    else throw new Error('esse pedido já foi entregue');
  }
  fs.writeFileSync(TESTE, JSON.stringify(lista, null, 2));
  return resumir(o);
}

// ---------- status em português ----------
const EVENTOS = {
  LABEL_PRINTED: 'etiqueta gerada', LABEL_PURCHASED: 'etiqueta gerada', CONFIRMED: 'postado', READY_FOR_PICKUP: 'disponível para retirada',
  IN_TRANSIT: 'em trânsito', OUT_FOR_DELIVERY: 'saiu para entrega', ATTEMPTED_DELIVERY: 'tentativa de entrega sem sucesso',
  DELIVERED: 'entregue', FAILURE: 'problema na entrega', DELAYED: 'atrasado na transportadora', CARRIER_PICKED_UP: 'coletado pela transportadora',
};
function diasUteisEntre(de, ate = new Date()) {
  let n = 0; const d = new Date(de);
  while (d < ate) { d.setDate(d.getDate() + 1); if (d <= ate && d.getDay() % 6 !== 0) n++; }
  return n;
}
// prazos da Base de Conhecimento: postagem em até 5 dias úteis; SEDEX 5 a 10; FLASH 7 a 15 (dias úteis após a postagem)
const PRAZO_MAX = { sedex: 10, flash: 15 };

export function resumir(o) {
  const f = (o.fulfillments || []).find(x => x.status !== 'CANCELLED') || null;
  const tr = f ? [].concat(f.trackingInfo || [])[0] || null : null;
  const eventos = (f?.events?.nodes || []).map(e => ({ id: e.id, status: e.status, nome: EVENTOS[e.status] || e.status.toLowerCase(), quando: e.happenedAt, local: [e.city, e.province].filter(Boolean).join(' - ') }));
  const ultimo = eventos[0] || null;
  const envio = o.shippingLine?.title || '';
  const pago = o.processedAt || o.createdAt;
  let status, rot, passo, marco;
  if (o.cancelledAt) [status, rot, passo, marco] = ['cancelado', 'Cancelado', 0, 'cancelado'];
  else if (!/PAID|PARTIALLY_REFUNDED/.test(o.displayFinancialStatus || '')) [status, rot, passo, marco] = ['separacao', 'Aguardando pagamento', 0, 'pagamento'];
  else if (!f) [status, rot, passo, marco] = ['separacao', 'Em separação', 2, 'separacao'];
  else if (ultimo?.status === 'DELIVERED' || f.deliveredAt) [status, rot, passo, marco] = ['entregue', 'Entregue', 4, 'entregue'];
  else if (ultimo?.status === 'OUT_FOR_DELIVERY') [status, rot, passo, marco] = ['transito', 'Saiu para entrega', 3, 'saiu'];
  else if (ultimo?.status === 'ATTEMPTED_DELIVERY' || ultimo?.status === 'FAILURE') [status, rot, passo, marco] = ['atrasado', ultimo.status === 'FAILURE' ? 'Problema na entrega' : 'Tentativa sem sucesso', 3, 'problema'];
  else if (ultimo?.status === 'READY_FOR_PICKUP') [status, rot, passo, marco] = ['transito', 'Disponível para retirada', 3, 'retirada'];
  else if (ultimo?.status === 'IN_TRANSIT' || ultimo?.status === 'CARRIER_PICKED_UP') [status, rot, passo, marco] = ['transito', 'Em trânsito', 3, 'transito'];
  else [status, rot, passo, marco] = ['transito', 'Postado', 3, 'postado'];

  // fora do prazo da política: avisa a IA e a equipe
  let atrasado = false;
  if (!o.cancelledAt && status !== 'entregue') {
    if (!f) atrasado = diasUteisEntre(pago) > 5;
    else { const max = PRAZO_MAX[Object.keys(PRAZO_MAX).find(k => envio.toLowerCase().includes(k))] || 15; atrasado = diasUteisEntre(f.createdAt) > max; }
  }
  if (atrasado && status !== 'atrasado') { status = 'atrasado'; rot = `${rot} · fora do prazo`; }

  return {
    id: o.id, num: o.name, primeiro_nome: o.customer?.firstName || o.shippingAddress?.firstName || '',
    cidade: [o.shippingAddress?.city, o.shippingAddress?.provinceCode].filter(Boolean).join(' - '),
    status, rot, passo, marco, atrasado, chave: `${marco}|${ultimo?.id || ''}|${tr?.number || ''}`,
    itens: (o.lineItems?.nodes || []).map(i => `${i.quantity}x ${i.title}`).join(', '),
    total: reais(o.totalPriceSet?.shopMoney?.amount), total_num: Number(o.totalPriceSet?.shopMoney?.amount || 0),
    envio, data: ddmm(o.createdAt), comprado_em: o.createdAt, postado_em: f?.createdAt || null,
    rastreio: tr?.number || 'ainda não postado', transportadora: tr?.company || '', url_rastreio: tr?.url || '',
    previsao: f?.estimatedDeliveryAt || null, eventos: eventos.slice(0, 8), ultimo_evento: ultimo,
  };
}

// ---------- busca ----------
// -> { ok: true, pedido } | { ok: false, motivo: 'nao-encontrado' | 'cpf-nao-confere' | 'sem-cpf-no-pedido' }
export async function localizarPedido({ numero, cpf }) {
  const c = cfgShopify(), n = digitos(numero), doc = digitos(cpf);
  if (c.modo !== 'loja' && c.modo !== 'teste') return { ok: false, motivo: 'loja-desligada' };
  const nodes = c.modo === 'loja'
    ? await pedidosDaLoja(c, `name:${c.prefixo_pedido ?? '#'}${n}`)
    : pedidosTeste().filter(o => digitos(o.name) === n);
  const o = nodes.find(x => digitos(x.name) === n);
  if (!o) return { ok: false, motivo: 'nao-encontrado' };
  const cpfs = cpfsDoPedido(o);
  if (!cpfs.size) return { ok: false, motivo: 'sem-cpf-no-pedido' };
  if (!cpfs.has(doc)) return { ok: false, motivo: 'cpf-nao-confere' };
  return { ok: true, pedido: resumir(o) };
}

export async function atualizarPedido(id) {
  const c = cfgShopify();
  if (c.modo !== 'loja' && c.modo !== 'teste') return null;
  const o = c.modo === 'loja' ? await pedidoDaLojaPorId(c, id) : pedidosTeste().find(x => x.id === id);
  return o ? resumir(o) : null;
}

// o que o card "Último pedido" da conversa mostra (contato.custom_attributes.ultimo_pedido)
export const paraCard = p => ({ num: p.num, status: p.status, rot: p.rot, passo: p.passo, itens: p.itens, total: p.total, envio: p.envio || p.transportadora, rastreio: p.rastreio, data: p.data });

// texto para o prompt da IA: só fatos, sem endereço
export function paraPrompt(p) {
  const linhas = [
    `Pedido ${p.num} de ${p.primeiro_nome || 'a cliente'}, comprado em ${p.data}. Itens: ${p.itens}. Total: ${p.total}.`,
    `Situação agora: ${p.rot}.${p.atrasado ? ' ATENÇÃO: passou do prazo da política.' : ''}`,
    `Envio: ${p.envio || '-'}.${p.transportadora ? ` Transportadora: ${p.transportadora}.` : ''} Código de rastreio: ${p.rastreio}.${p.url_rastreio ? ` Link de rastreio: ${p.url_rastreio}` : ''}`,
    p.postado_em ? `Postado em ${ddmm(p.postado_em)} (${diasUteisEntre(p.postado_em)} dias úteis atrás).` : `Ainda não foi postado; pago há ${diasUteisEntre(p.comprado_em)} dias úteis (o prazo de postagem é de até 5 dias úteis).`,
    p.previsao ? `Previsão de entrega da transportadora: ${ddmm(p.previsao)}.` : '',
    p.eventos.length ? `Movimentações (mais nova primeiro): ${p.eventos.map(e => `${ddmm(e.quando)} ${e.nome}${e.local ? ` em ${e.local}` : ''}`).join('; ')}.` : '',
    `Cidade de entrega: ${p.cidade}.`,
  ];
  return linhas.filter(Boolean).join('\n');
}

// ---------- linha de comando ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  const sai = x => console.log(JSON.stringify(x, null, 2));
  if (cmd === 'buscar') localizarPedido({ numero: a, cpf: b }).then(sai, e => console.error(e.message));
  else if (cmd === 'avancar') sai(avancarTeste(a));
  else if (cmd === 'teste') sai(pedidosTeste().map(o => ({ pedido: o.name, cpf: o.localizedFields.nodes[0].value, ...((r) => ({ status: r.rot }))(resumir(o)) })));
  else console.log('uso: node pedidos.mjs buscar NUMERO CPF | avancar NUMERO | teste');
}
