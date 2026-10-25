# Seções do Atendimento: como cada uma é construída

A tela `05_FRONTEND/atendimento/` tem um menu à esquerda igual ao do Droni. Cada item do menu é um **módulo**:
um arquivo em `05_FRONTEND/atendimento/modulos/<id>.js` que se registra sozinho. Se ele precisar de servidor,
tem também `06_BACKEND/atendimento/rotas/<id>.mjs`. Leia também `09_DOCUMENTATION/atendimento-chatwoot.md`.

## Ordem do menu (ids)
`caixa` (Caixa de Entrada), `conversas` (já existe), `capitao` (Capitão), `comentarios` (Comentários: feed, reels,
patrocinados, mencoes, moderacao), `contatos`, `relatorios`, `campanhas`, `ajuda` (Central de Ajuda), `helpdesk`,
`configuracoes` (Geral; as páginas `integracoes`, `usuarios` e `equipe` já existem e entram como filhas de Configurações).

## Registrar uma seção (front)
```js
registrarPagina({
  id: 'contatos', nome: 'Contatos',
  ico: '<path d="..."/>',              // só o miolo de um SVG 24x24 com traço (sem preenchimento)
  niveis: ['dona', 'supervisora', 'atendente'], // quem vê; padrão: todas
  subs: [{ id: 'feed', nome: 'Feed', ico: '...' }], // opcional: itens que abrem embaixo (rota #/id/sub)
  contador: () => 3,                    // opcional: número ao lado do nome (0 esconde)
  contadorAlerta: false,                // true deixa o número com destaque branco
  render(el, sub) { el.innerHTML = `<div class="pag-in">${cabecalho('Contatos', 'Descrição curta')}...</div>`; },
});
```
O `render` é chamado toda vez que a página abre. `el` é o `<main>` da página. Para redesenhar depois de uma ação,
chame o `render` de novo ou atualize só o pedaço. Para o número do menu mudar, chame `renderMenuLateral()`.
O endereço é `#/id` ou `#/id/sub`. Para ir a outra página, use `irPara('id')` ou `irPara('comentarios/reels')`.
Para abrir uma conversa: `irPara('conversas'); abrir(idDaConversa)`.

## O que já existe e pode ser usado (variáveis globais)
| Nome | O que é |
|---|---|
| `$`, `esc(txt)`, `ico(miolo)` | querySelector, escapar HTML (use em TODO texto que veio de fora), SVG de ícone |
| `cabecalho(titulo, desc, acoesHtml)` | cabeçalho padrão da página, com o botão do menu no celular |
| `chamar(url, metodo, corpo)` | fetch JSON que lança `Error(mensagem)` se der erro |
| `cw(caminho, metodo, corpo)` | API da conta do Chatwoot (`/api/v1/accounts/1/<caminho>`) com o login da pessoa |
| `REAL` | true quando está ligado ao Chatwoot; false = demonstração (mostre um exemplo fictício e avise) |
| `MEU_NIVEL` | 'dona', 'supervisora' ou 'atendente' |
| `EQUIPE`, `EU`, `pessoa(id)`, `avatar(id, cls)` | pessoas da equipe (`u<id>`) |
| `estado.convs` | conversas carregadas: `{ id, cliente, canal, marca, dono, escalou, etiquetas, resolvida, msgs, pedido, resumo }` |
| `CANAIS`, `canalIco(c)`, `ASSUNTOS`, `nomeAssunto(id)`, `INBOX` | canais, assuntos da IA, caixas do Chatwoot |
| `iniciais(nome)`, `desde(ms)`, `hora(ms)` | utilidades |
| `toast(txt)` | aviso flutuante curto ("Contato salvo.") |
| `gaveta(titulo, corpoHtml, peHtml)`, `fecharGaveta()` | painel lateral para formulários; o erro vai em `#g-erro` |
| `data-copiar="idDoElemento"` | botão que copia o texto do elemento |
| `IA_LIGADA` | se a IA do SAC está ligada |

## Visual (obrigatório)
- Cinza escuro e branco, sem rosa. Cor só para estado: `var(--ok)`, `var(--warn)` e `var(--bad)` (com `-soft` para fundo).
- Use as classes que já existem em `atendimento.css`: `.pag-in`, `.secao`, `.grade`, `.card`, `.card-top`, `.card-ico`,
  `.desc`, `.card-pe`, `.estado` (`.ligado`/`.espera`), `.btn` (`.prim`, `.fantasma`, `.peq`, `.icone`), `.chip`
  (`.alerta`/`.aviso`), `.campo` (label + input/select/textarea), `.nota-box`, `.erro`, `.sucesso`, `.resumo-num` +
  `.num-card`, `.tabela` + `.linha-u`, `.vazio`, `.codigo`, `.passos`, `.av`.
- CSS novo vai em `05_FRONTEND/atendimento/modulos/<id>.css` (carregue com `<link>` criado pelo próprio módulo) e com
  classes prefixadas pelo id (`.contatos-...`). Não mexa em `atendimento.css`.
- Precisa funcionar no celular (375 px): nada de rolagem para o lado.
- No máximo 1 botão branco (`.prim`) por tela.

## Texto (obrigatório)
Português do Brasil, simples, para uma atendente que não entende de tecnologia. Frases curtas, com letra maiúscula
só no começo. Os botões dizem o que acontece ("Salvar contato", "Responder comentário"). A tela vazia convida a agir
("Nenhum contato ainda. Os contatos aparecem quando alguém manda mensagem."). Os erros dizem o que fazer. Nada de jargão
(webhook, token, API, endpoint) na tela.

## Rotas de servidor (opcional)
`06_BACKEND/atendimento/rotas/<id>.mjs`:
```js
export default async function ({ p, m, req, res, url, s, c, cw, lerCorpo, responder, souDona, nivel, RAIZ, lerJson, gravarJson }) {
  if (!p.startsWith('/capitao')) return false;     // p é o caminho depois de /api/atendimento
  // cw('caminho', { method, body, token: s.token, base: 'conta'|'api'|'plataforma' }) chama o Chatwoot
  responder(res, 200, { ok: true });
  return true;
}
```
Node 24, sem bibliotecas de fora. Segredos ficam em `00_CORE/Configuration/*.json` e nunca vão para o navegador.
Para o servidor carregar uma rota nova, reinicie o serviço: feche o processo `node ... servico.mjs` (o painel liga de
novo sozinho na próxima chamada a `/api/atendimento/...`).

## Regras
- Mexa **só** nos arquivos da sua seção. Os arquivos comuns (`atendimento.js`, `atendimento.css`, `index.html`,
  `servico.mjs`) são do integrador: se precisar de algo neles, escreva no seu relatório final.
- Não mande mensagem para cliente real, não publique nada e não conecte contas de verdade (Meta, Shopify).
  Hoje só existem dados de teste.
- Teste no navegador: http://localhost:8787/atendimento/index.html#/<id> (o login está desligado no teste).
