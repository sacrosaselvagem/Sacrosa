// Conexão com a loja Shopify (Integrações > Shopify). As chaves ficam em 00_CORE/Configuration/shopify.json
// e nunca voltam para o navegador. Com a loja ligada, a IA acha o pedido pelo telefone do WhatsApp,
// pelo número + CPF, ou só pelo CPF / só pelo e-mail da compra (ver pedidos.mjs).
//
//   GET  /shopify/conexao                                         conectado?, nome e endereço da loja (sem chaves)
//   POST /shopify/conectar  { loja, access_token | client_id + client_secret }   (só a dona; confere na Shopify antes de salvar)
//   POST /shopify/desconectar                                     (só a dona; apaga as chaves e desliga a loja)
import { cfgShopify, testarLoja, salvarShopify } from '../pedidos.mjs';

const resumo = c => ({
  conectado: c.modo === 'loja' && !!c.loja,
  teste: c.modo === 'teste',
  loja: c.modo === 'loja' ? c.loja : '',
  nome: c.modo === 'loja' ? c.nome_loja || '' : '',
  conectado_em: c.modo === 'loja' ? c.conectado_em || '' : '',
  conectado_por: c.modo === 'loja' ? c.conectado_por || '' : '',
});

// aceita "rosaselvagem", "rosaselvagem.myshopify.com" ou o link do admin
function dominio(txt) {
  const t = String(txt || '').trim().toLowerCase().replace(/^https?:\/\//, '');
  const admin = t.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  const nome = admin ? admin[1] : t.split('/')[0].replace(/\.myshopify\.com$/, '');
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(nome)) return '';
  return `${nome}.myshopify.com`;
}

export default async function ({ p, m, req, res, s, lerCorpo, responder, souDona }) {
  if (!p.startsWith('/shopify')) return false;
  if (p === '/shopify/conexao' && m === 'GET') {
    responder(res, 200, { ...resumo(cfgShopify()), pode_editar: !!souDona });
    return true;
  }
  if (p === '/shopify/conectar' && m === 'POST') {
    if (!souDona) { responder(res, 403, { erro: 'Só a dona pode conectar a loja.' }); return true; }
    const b = await lerCorpo(req);
    const loja = dominio(b.loja);
    const access_token = String(b.access_token || '').trim();
    const client_id = String(b.client_id || '').trim(), client_secret = String(b.client_secret || '').trim();
    if (!loja) { responder(res, 400, { erro: 'Endereço da loja inválido. Use o que termina em .myshopify.com.' }); return true; }
    if (!access_token && !(client_id && client_secret)) { responder(res, 400, { erro: 'Cole o token de acesso (shpat_…) ou o Client ID e o Client secret.' }); return true; }
    const atual = cfgShopify();
    const nova = { ...atual, loja, access_token: access_token || '', client_id: access_token ? '' : client_id, client_secret: access_token ? '' : client_secret };
    let shop;
    try { shop = await testarLoja(nova); }
    catch (e) {
      const msg = /401|403|recusou|access denied|invalid api key/i.test(e.message) ? 'a Shopify recusou as chaves. Confira se copiou certo e se o app está instalado na loja'
        : /read_orders|scope|access to|protected customer/i.test(e.message) ? 'as chaves não têm permissão de ler pedidos. No app, libere read_orders, read_customers e read_fulfillments e o acesso a dados protegidos de clientes'
        : /404|ENOTFOUND|fetch failed/i.test(e.message) ? 'não achei essa loja. Confira o endereço .myshopify.com'
        : e.message.slice(0, 160);
      responder(res, 400, { erro: msg });
      return true;
    }
    const c = salvarShopify({ ...nova, modo: 'loja', nome_loja: shop.name, conectado_em: new Date().toISOString(), conectado_por: s?.nome || 'dona' });
    responder(res, 200, { ok: true, ...resumo(c) });
    return true;
  }
  if (p === '/shopify/desconectar' && m === 'POST') {
    if (!souDona) { responder(res, 403, { erro: 'Só a dona pode desconectar a loja.' }); return true; }
    const c = salvarShopify({ modo: 'desligado', access_token: '', client_id: '', client_secret: '', nome_loja: '', conectado_em: '', conectado_por: '' });
    responder(res, 200, { ok: true, ...resumo(c) });
    return true;
  }
  return false;
}
