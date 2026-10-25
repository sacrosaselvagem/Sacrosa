// Rastreios: pedidos que a IA está acompanhando até a entrega (acompanhamento.mjs).
//   GET  /rastreios                 -> { teste, loja_ligada, lista: [...] }
//   POST /rastreios/<id>/parar      -> para de avisar a cliente desse pedido
//   POST /rastreios/<id>/verificar  -> confere o pedido agora (em vez de esperar o próximo ciclo)
//   POST /rastreios/<id>/avancar    -> só no modo de teste: leva o pedido fictício ao próximo passo e confere
import { listarAcompanhamentos, pararAcompanhamento, verificarAgora } from '../acompanhamento.mjs';
import { avancarTeste, emTeste, cfgShopify } from '../pedidos.mjs';

export default async function ({ p, m, res, c, cw, responder }) {
  if (!p.startsWith('/rastreios')) return false;
  const ctx = { cfg: () => c, cw };
  if (p === '/rastreios' && m === 'GET') {
    const lista = Object.entries(listarAcompanhamentos()).map(([id, x]) => ({ id, ...x }))
      .sort((a, b) => String(b.verificado_em).localeCompare(String(a.verificado_em)));
    responder(res, 200, { teste: emTeste(), loja_ligada: cfgShopify().modo === 'loja', lista });
    return true;
  }
  const mm = p.match(/^\/rastreios\/(.+)\/(parar|verificar|avancar)$/);
  if (mm && m === 'POST') {
    const id = decodeURIComponent(mm[1]), acao = mm[2];
    const item = listarAcompanhamentos()[id];
    if (!item) { responder(res, 404, { erro: 'Esse pedido não está mais sendo acompanhado.' }); return true; }
    if (acao === 'parar') { pararAcompanhamento(id); responder(res, 200, { ok: true }); return true; }
    if (acao === 'avancar') {
      if (!emTeste()) { responder(res, 403, { erro: 'Só dá para simular com os pedidos de teste.' }); return true; }
      avancarTeste(item.num);
    }
    const r = await verificarAgora(ctx, id);
    responder(res, 200, { ok: true, resultado: r?.resultado || 'parou', status: r?.pedido?.rot || '' });
    return true;
  }
  return false;
}
