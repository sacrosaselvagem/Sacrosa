// Atendimento: tela própria sobre o Chatwoot. Fala com ele pela ponte do painel
// (/api/atendimento/..., 06_BACKEND/chatwoot-ponte.ps1). Sem Chatwoot configurado,
// abre em modo demonstração com os dados fictícios abaixo.
// A aba Integrações fica em integracoes.js.
'use strict';

let REAL = false;
let EU = 'gabriella';

let EQUIPE = {
  gabriella: { nome: 'Gabriella', ini: 'GA', status: 'online', limite: 8 },
  ana: { nome: 'Ana Carla', ini: 'AC', status: 'online', limite: 8 },
  lucas: { nome: 'Lucas', ini: 'LU', status: 'pausa', limite: 8 },
};
const IA = { nome: 'IA do SAC' };
const BRILHO = '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>';

const CANAIS = {
  whatsapp: { nome: 'WhatsApp', svg: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.4-1.6-1-2-2l1-1-1-2z"/>' },
  instagram: { nome: 'Instagram', svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6" fill="currentColor"/>' },
  messenger: { nome: 'Messenger', svg: '<path d="M12 3.5c-4.7 0-8.5 3.5-8.5 7.9 0 2.5 1.2 4.7 3.2 6.1V21l3-1.6c.7.2 1.5.3 2.3.3 4.7 0 8.5-3.5 8.5-7.9S16.7 3.5 12 3.5z"/><path d="m7.5 13.5 3-3.2 2 2 3.5-2.3-3 3.3-2-2z"/>' },
  telegram: { nome: 'Telegram', svg: '<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 9-7"/>' },
  site: { nome: 'Chat do site', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>' },
  email: { nome: 'E-mail', svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>' },
};

const FILAS = [
  { id: 'mim', nome: 'Minhas', titulo: 'Minhas conversas', desc: 'As conversas que estão com você. As urgentes ficam no topo.', ico: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' },
  { id: 'naoatendidas', nome: 'Não atendidas', titulo: 'Não atendidas', desc: 'A cliente falou por último e está esperando uma pessoa responder.', ico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>', alerta: true },
  { id: 'precisam', nome: 'Não atribuídas', titulo: 'Não atribuídas', desc: 'Ninguém pegou ainda. Urgentes e quem espera há mais tempo ficam no topo.', ico: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>', alerta: true },
  { id: 'mencoes', nome: 'Menções', titulo: 'Menções', desc: 'Conversas em que alguém da equipe marcou você numa nota.', ico: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.9"/>' },
  { id: 'ia', nome: 'Com a IA', titulo: 'Com a IA', desc: 'A IA do SAC está respondendo. Você pode entrar quando quiser.', ico: BRILHO },
  { id: 'todas', nome: 'Todas as conversas', titulo: 'Todas as conversas', desc: 'Tudo que está aberto, de todo mundo.', ico: '<path d="M4 5h16v11H8l-4 4z"/>' },
  { id: 'resolvidas', nome: 'Resolvidas hoje', titulo: 'Resolvidas hoje', desc: 'Se a cliente escrever de novo, a conversa reabre sozinha.', ico: '<path d="m5 12 4 4 10-10"/>' },
];
// sinais que o classificador da IA marca em cada conversa (06_BACKEND/atendimento/classificador.mjs)
const SINAIS = [
  { id: 'urgente', nome: 'Urgentes', ico: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>', teste: c => c.prioridade === 'urgente' },
  { id: 'irritada', nome: 'Clientes irritadas', ico: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 16c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2M8 9l2 1M16 9l-2 1"/>', teste: c => c.sentimento === 'irritada' },
  { id: 'compra', nome: 'Querem comprar', ico: '<path d="M5 7h14l-1.5 9h-11z"/><path d="M9 7a3 3 0 0 1 6 0"/>', teste: c => c.compra },
];
const PESO_PRIO = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const NOME_PRIO = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const NOME_SENT = { irritada: 'Irritada', preocupada: 'Preocupada', neutra: 'Tranquila', feliz: 'Feliz' };
let MENCOES = new Set();
let LABELS = [];

// ---------- páginas: registro ----------
// Cada seção do menu é um módulo que se registra com registrarPagina() no próprio arquivo (modulos/*.js).
// Contrato completo em 09_DOCUMENTATION/atendimento-modulos.md.
const TODOS = ['dona', 'supervisora', 'atendente'];
const MODULOS = {};
let MENU_PRONTO = false;
function registrarPagina(def) {
  MODULOS[def.id] = { niveis: TODOS, subs: null, ...def };
  if (MENU_PRONTO) renderMenuLateral();
}

// ordem do menu da esquerda (igual ao Droni). Itens sem módulo carregado não aparecem.
const MENU = ['visao', 'caixa', 'conversas', 'rosa', 'simulador', 'rastreios', 'comentarios', 'contatos', 'relatorios', 'campanhas', 'ajuda', 'helpdesk', 'configuracoes'];
// páginas que ficam dentro de Configurações
const DENTRO_DE_CONFIG = ['configuracoes', 'capitao', 'integracoes', 'usuarios', 'equipe'];

let MEU_NIVEL = 'dona';
// acessos de quem está logada (vêm do servidor em /eu; a dona tem todos). O servidor também barra: aqui só esconde.
let MINHAS_PERMS = null;
const podeAcesso = perm => MEU_NIVEL === 'dona' || !MINHAS_PERMS || MINHAS_PERMS.has(perm);
// páginas que dependem de um acesso que a dona liga e desliga por nível (Usuários > Acessos por nível)
const PERM_PAGINA = { relatorios: 'relatorios', campanhas: 'campanhas', capitao: 'treinar_ia', simulador: 'treinar_ia', ajuda: 'base_conhecimento', configuracoes: 'configuracoes' };
const podeVer = id => id === 'conversas' || (!!MODULOS[id] && (PERM_PAGINA[id] && MEU_NIVEL !== 'dona' ? podeAcesso(PERM_PAGINA[id]) : MODULOS[id].niveis.includes(MEU_NIVEL)));

// o elemento <main> de cada página (criado na primeira vez)
function pagEl(id) {
  let el = document.getElementById(`pag-${id}`);
  if (!el) {
    el = document.createElement('main');
    el.className = 'pagina pag'; el.id = `pag-${id}`; el.hidden = true;
    $('#app').appendChild(el);
  }
  return el;
}

// cabeçalho padrão das páginas, com o botão de menu do celular
function cabecalho(titulo, desc = '', acoes = '') {
  return `<div class="pag-head" style="align-items:flex-start">
    <button class="btn icone fantasma abrir-menu" data-acao="menu-lateral" aria-label="Abrir menu"><svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <div style="flex:1;min-width:0"><h1>${titulo}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${acoes}</div>`;
}

// páginas que já existiam (equipe, integrações e usuários) entram no registro
registrarPagina({ id: 'equipe', nome: 'Equipe', niveis: ['dona', 'supervisora'], ico: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>', render: () => renderEquipe() });
registrarPagina({ id: 'usuarios', nome: 'Usuários', niveis: ['dona'], ico: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/><path d="M19 4v4M17 6h4"/>', render: () => typeof renderUsuarios === 'function' && renderUsuarios() });
registrarPagina({ id: 'integracoes', nome: 'Integrações', niveis: ['dona'], ico: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>', render: () => typeof renderIntegracoes === 'function' && renderIntegracoes() });

// assuntos que a IA marca nas conversas (a lista oficial vem do servidor em /eu)
let ASSUNTOS = [
  { id: 'reembolso', nome: 'Reembolso' }, { id: 'devolucao', nome: 'Devolução' }, { id: 'troca', nome: 'Troca' },
  { id: 'cancelamento', nome: 'Cancelamento' }, { id: 'problema-no-pedido', nome: 'Problema no pedido' },
  { id: 'frete-e-entrega', nome: 'Frete e entrega' }, { id: 'rastreio', nome: 'Rastreio' }, { id: 'duvida-de-produto', nome: 'Dúvida de produto' },
  { id: 'como-usar', nome: 'Como usar' }, { id: 'pagamento', nome: 'Pagamento' }, { id: 'quer-comprar', nome: 'Quer comprar' },
  { id: 'saude-e-reacao', nome: 'Saúde e reação' }, { id: 'reclamacao', nome: 'Reclamação' }, { id: 'revenda-e-parceria', nome: 'Revenda e parceria' },
  { id: 'elogio', nome: 'Elogio' }, { id: 'outro', nome: 'Outro' },
];
// a IA põe "atendimento" em toda conversa que ela não resolveu e passou para a equipe
const ETIQUETA_HUMANO = 'atendimento';
const nomeAssunto = id => id === ETIQUETA_HUMANO ? 'Atendimento' : ASSUNTOS.find(a => a.id === id)?.nome || id.replace(/-/g, ' ');

const NIVEIS_NOMES = { dona: 'Dona', supervisora: 'Supervisora', atendente: 'Atendente' };
const ROTULO_DISP = { online: 'Disponível', pausa: 'Em pausa', offline: 'Desconectada' };

let RESPOSTAS = [
  { atalho: 'prazo', titulo: 'Prazo de entrega', txt: 'Oi, {nome}! O pedido é postado em até 5 dias úteis depois da aprovação do pagamento. Depois disso, pelo SEDEX leva de 5 a 10 dias úteis e pelo FLASH de 7 a 15, conforme a região. 🌹' },
  { atalho: 'rastreio', titulo: 'Onde está o código de rastreio', txt: 'O código de rastreio vai por e-mail assim que o pedido é postado. Dá uma olhadinha na caixa de spam e de promoções, e confere se é o mesmo e-mail da compra, tá? Se não achar, me manda o número do pedido que eu vejo pra você.' },
  { atalho: 'troca', titulo: 'Como funciona a troca', txt: 'A troca pode ser pedida em até 7 dias depois do recebimento. O produto precisa estar lacrado e na embalagem original. Me conta o número do pedido e o motivo que eu já abro pra você.' },
  { atalho: 'cancelar', titulo: 'Cancelamento', txt: 'O cancelamento pode ser feito em até 24 horas depois da compra. Se foi no cartão, pedimos o estorno e o prazo depende da operadora. Me passa o número do pedido que eu sigo daqui.' },
  { atalho: 'obrigada', titulo: 'Encerrar com carinho', txt: 'Qualquer coisa, é só chamar aqui. Obrigada por escolher a Rosa Selvagem! 💗' },
];

// minutos atrás, para montar horários relativos
const m = n => Date.now() - n * 60000;

const estado = {
  pagina: 'conversas', sub: null, expandido: {}, fila: 'mim', marca: 'todas', assunto: null, menuEu: false, canal: null, busca: '', aberta: null, modo: 'resposta',
  menu: false, eu: 'online', convs: [
    {
      id: 1, cliente: 'Nathalya Souza', ini: 'NS', cor: '#be185d', marca: 'rosa', canal: 'whatsapp', fone: '(81) 98812-4410', email: 'nathalya.s@gmail.com', cidade: 'Recife, PE',
      dono: 'gabriella', escalou: 'Pedido fora do prazo', naoLidas: 2, etiquetas: ['frete-e-entrega'],
      resumo: 'Comprou o Óleo Clareador 2.0 há 19 dias úteis e o pedido ainda não chegou. Já passou do prazo do FLASH. A IA explicou a regra e passou para a equipe.',
      pedido: { num: '#48213', status: 'atrasado', rot: 'Atrasado', passo: 3, itens: '1x Óleo Clareador Corporal 2.0', total: 'R$ 99,90', envio: 'FLASH', rastreio: 'FL938201145BR', data: '24/09' },
      msgs: [
        { de: 'cliente', txt: 'Oi, boa tarde. Meu pedido ainda não chegou', t: m(41) },
        { de: 'ia', txt: 'Oi, Nathalya! Sinto muito pela espera. Me passa o número do pedido pra eu conferir?', t: m(41) },
        { de: 'cliente', txt: '48213', t: m(39) },
        { de: 'ia', txt: 'Obrigada! Vi aqui que já passou do prazo da entrega. Vou chamar alguém da equipe pra resolver isso com você agora mesmo. 🌹', t: m(39) },
        { de: 'evento', txt: 'A IA passou para a equipe: pedido fora do prazo', t: m(39) },
        { de: 'evento', txt: 'Gabriella assumiu a conversa', t: m(30) },
        { de: 'cliente', txt: 'Pois vocês no site estão dizendo que chega em 10 dias', t: m(22) },
        { de: 'cliente', txt: 'Já tem quase um mês', t: m(22) },
      ],
      rascunho: { txt: 'Você tem toda razão, Nathalya, e peço desculpas. Já abri uma reclamação com a transportadora pelo código FL938201145BR. Se não houver atualização em até 2 dias úteis, a gente reenvia o seu Óleo Clareador sem custo. Te aviso por aqui assim que tiver resposta. 💗', fonte: 'Pedido #48213 e política de envio' },
    },
    {
      id: 2, cliente: 'Lidiane Moura', ini: 'LM', cor: '#b45309', marca: 'rosa', canal: 'instagram', email: 'lidi.moura@hotmail.com', cidade: 'Campinas, SP', insta: '@lidimoura',
      dono: null, escalou: 'Pedido de troca', naoLidas: 1, etiquetas: ['troca'],
      resumo: 'Recebeu o produto ontem e quer trocar porque a embalagem chegou amassada. A IA explicou a regra de troca e passou para a equipe.',
      pedido: { num: '#48577', status: 'entregue', rot: 'Entregue', passo: 4, itens: '1x Óleo Clareador Corporal 2.0, 1x Sabonete Esfoliante', total: 'R$ 149,80', envio: 'SEDEX', rastreio: 'SX55120983BR', data: '12/10' },
      msgs: [
        { de: 'cliente', txt: 'Oii! Meu óleo chegou com a caixinha toda amassada 😕 dá pra trocar?', t: m(16) },
        { de: 'ia', txt: 'Oi, Lidiane! Que chato isso. A troca pode ser pedida em até 7 dias depois do recebimento, então você está dentro do prazo. Vou passar para alguém da equipe aprovar, tá? Já já te respondem por aqui.', t: m(16) },
        { de: 'evento', txt: 'A IA passou para a equipe: pedido de troca', t: m(16) },
        { de: 'cliente', txt: 'Ok, obrigada! Mando foto?', t: m(14) },
      ],
      rascunho: { txt: 'Manda sim, Lidiane! Uma foto da caixa e outra do frasco já ajudam. Com as fotos eu aprovo a troca e te passo o código de postagem gratuito.', fonte: 'Política de troca' },
    },
    {
      id: 3, cliente: 'Mirella Anjos da Silva', ini: 'MA', cor: '#4338ca', marca: 'rosa', canal: 'whatsapp', fone: '(21) 99702-3381', cidade: 'Niterói, RJ',
      dono: 'ia', escalou: null, naoLidas: 0, etiquetas: ['como-usar'],
      resumo: 'Perguntou se pode usar o Óleo Clareador na virilha depois da depilação. A IA está respondendo com base na descrição do produto.',
      pedido: null,
      msgs: [
        { de: 'cliente', txt: 'Oi! Posso usar o óleo logo depois de depilar?', t: m(6) },
        { de: 'ia', txt: 'Oi, Mirella! Depois da depilação a pele fica mais sensível, então o ideal é esperar umas 24 horas antes de aplicar. Quer que eu te mande o passo a passo de uso?', t: m(5) },
        { de: 'cliente', txt: 'Quero sim', t: m(1) },
      ],
    },
    {
      id: 4, cliente: 'Tayane Araújo', ini: 'TA', cor: '#0f766e', marca: 'rosa', canal: 'whatsapp', fone: '(11) 98221-0094', cidade: 'São Paulo, SP',
      dono: 'gabriella', escalou: null, naoLidas: 0, etiquetas: [],
      resumo: 'Perguntou se o pedido foi aprovado. Já está aprovado e em separação.',
      pedido: { num: '#48802', status: 'separacao', rot: 'Em separação', passo: 2, itens: '2x Óleo Clareador Corporal 2.0', total: 'R$ 179,80', envio: 'SEDEX', rastreio: 'ainda não postado', data: '21/10' },
      msgs: [
        { de: 'cliente', txt: 'Bom dia! Meu pagamento já caiu?', t: m(80) },
        { de: 'equipe', quem: 'gabriella', txt: 'Bom dia, Tayane! Caiu sim, o seu pedido foi aprovado e está em separação. Em até 5 dias úteis ele é postado e o código chega no seu e-mail. 🌹', t: m(74) },
        { de: 'cliente', txt: 'Perfeito, obrigada!!', t: m(73) },
        { de: 'equipe', quem: 'gabriella', txt: 'Imagina! Qualquer coisa, é só chamar. 💗', t: m(72) },
      ],
    },
    {
      id: 5, cliente: 'Natália Rodrigues Ferreira', ini: 'NR', cor: '#9333ea', marca: 'rosa', canal: 'messenger', cidade: 'Belo Horizonte, MG',
      dono: 'ana', escalou: null, naoLidas: 1, etiquetas: ['rastreio'],
      resumo: 'Quer saber a que horas o entregador passa. Pedido em trânsito pelo SEDEX.',
      pedido: { num: '#48650', status: 'transito', rot: 'Em trânsito', passo: 3, itens: '1x Kit Pele de Seda', total: 'R$ 189,90', envio: 'SEDEX', rastreio: 'SX55198220BR', data: '15/10' },
      msgs: [
        { de: 'cliente', txt: 'O rastreio diz saiu para entrega', t: m(34) },
        { de: 'equipe', quem: 'ana', txt: 'Oba, Natália! Então chega hoje. Os Correios não informam o horário certinho, mas costuma ser até as 18h.', t: m(31) },
        { de: 'cliente', txt: 'Vou conseguir a hora que chegar em casa então, obrigada', t: m(12) },
      ],
    },
    {
      id: 6, cliente: 'Bibyan Doces', ini: 'BD', cor: '#c2410c', marca: 'beyoung', canal: 'whatsapp', fone: '(85) 99140-7720', cidade: 'Fortaleza, CE',
      dono: null, escalou: null, naoLidas: 6, etiquetas: ['revenda-e-parceria'],
      resumo: 'Loja de Fortaleza perguntando sobre preço para revenda. Mandou áudio e figurinhas.',
      pedido: null,
      msgs: [
        { de: 'cliente', txt: 'Boa tarde', t: m(9) },
        { de: 'cliente', txt: 'Vocês vendem no atacado?', t: m(9) },
        { de: 'cliente', txt: '🎤 Áudio (0:42)', t: m(8) },
        { de: 'cliente', txt: 'Tenho uma loja aqui em Fortaleza', t: m(8) },
        { de: 'cliente', txt: '📷 Foto', t: m(4) },
        { de: 'cliente', txt: 'Aguardo', t: m(3) },
      ],
    },
    {
      id: 7, cliente: 'Camila Prado', ini: 'CP', cor: '#0369a1', marca: 'beyoung', canal: 'instagram', cidade: 'Curitiba, PR', insta: '@camilaprado',
      dono: 'ia', escalou: null, naoLidas: 0, etiquetas: [],
      resumo: 'Perguntou o preço do sérum e se tem cupom. A IA respondeu com o preço do catálogo.',
      pedido: null,
      msgs: [
        { de: 'cliente', txt: 'quanto tá o sérum?', t: m(26) },
        { de: 'ia', txt: 'Oi, Camila! O Sérum Beyoung está R$ 89,90 no site, com frete grátis nas condições da loja. Quer o link?', t: m(26) },
        { de: 'cliente', txt: 'quero', t: m(24) },
        { de: 'ia', txt: 'Prontinho, te mandei o link aqui em cima. Qualquer dúvida, é só chamar! 💗', t: m(24) },
      ],
    },
    {
      id: 8, cliente: 'Renata Lins', ini: 'RL', cor: '#15803d', marca: 'rosa', canal: 'site', email: 'renata.lins@outlook.com', cidade: 'Olinda, PE',
      dono: null, escalou: 'Cancelamento', naoLidas: 1, etiquetas: ['cancelamento'],
      resumo: 'Comprou há 3 horas no cartão e quer cancelar. Está dentro das 24 horas.',
      pedido: { num: '#48851', status: 'separacao', rot: 'Aprovado', passo: 1, itens: '1x Óleo Clareador Corporal 2.0', total: 'R$ 99,90', envio: 'SEDEX', rastreio: 'ainda não postado', data: '22/10' },
      msgs: [
        { de: 'cliente', txt: 'Quero cancelar a compra que fiz hoje cedo, comprei errado', t: m(48) },
        { de: 'ia', txt: 'Oi, Renata! Dá pra cancelar sim, porque foi há menos de 24 horas. Como foi no cartão, o estorno depende da operadora. Vou passar para a equipe fazer o cancelamento, tá?', t: m(48) },
        { de: 'evento', txt: 'A IA passou para a equipe: cancelamento', t: m(48) },
        { de: 'cliente', txt: 'Tá bom', t: m(47) },
      ],
      rascunho: { txt: 'Pronto, Renata! O pedido #48851 foi cancelado e o estorno já foi pedido à operadora do cartão. Ele costuma aparecer em até 2 faturas. Se quiser comprar o produto certo, me fala qual que eu te mando o link. 🌹', fonte: 'Política de cancelamento' },
    },
    {
      id: 9, cliente: 'Juliana Matos', ini: 'JM', cor: '#a21caf', marca: 'rosa', canal: 'telegram', cidade: 'Salvador, BA',
      dono: 'ana', escalou: null, naoLidas: 0, etiquetas: [],
      resumo: 'Perguntou o desconto no PIX. Ana respondeu.',
      pedido: null,
      msgs: [
        { de: 'cliente', txt: 'tem desconto no pix?', t: m(55) },
        { de: 'equipe', quem: 'ana', txt: 'Tem sim, Juliana! 5% no PIX, aplicado direto no checkout.', t: m(52) },
        { de: 'nota', quem: 'ana', txt: 'Confirmar com o Renato se os 5% do PIX valem junto com a Black Friday.', t: m(51) },
      ],
    },
    {
      id: 10, cliente: 'Patrícia Gomes', ini: 'PG', cor: '#57534e', marca: 'rosa', canal: 'email', email: 'patricia.gomes@uol.com.br', cidade: 'Goiânia, GO',
      dono: 'gabriella', escalou: null, naoLidas: 0, etiquetas: [], resolvida: true,
      resumo: 'Não achava o código de rastreio. Estava no spam.',
      pedido: { num: '#48399', status: 'entregue', rot: 'Entregue', passo: 4, itens: '1x Óleo Clareador Corporal 2.0', total: 'R$ 99,90', envio: 'SEDEX', rastreio: 'SX55010022BR', data: '02/10' },
      msgs: [
        { de: 'cliente', txt: 'Não recebi o código de rastreio do meu pedido.', t: m(190) },
        { de: 'equipe', quem: 'gabriella', txt: 'Oi, Patrícia! O código vai por e-mail quando o pedido é postado. Pode olhar no spam?', t: m(185) },
        { de: 'cliente', txt: 'Achei! Estava lá mesmo. Obrigada.', t: m(160) },
        { de: 'evento', txt: 'Gabriella resolveu a conversa', t: m(158) },
      ],
    },
    {
      id: 11, cliente: 'Fernanda Rocha', ini: 'FR', cor: '#0e7490', marca: 'rosa', canal: 'instagram', cidade: 'Natal, RN', insta: '@nandarocha',
      dono: 'ia', escalou: null, naoLidas: 0, etiquetas: [], resolvida: true,
      resumo: 'Perguntou o prazo para Natal. A IA respondeu e a cliente agradeceu.',
      pedido: null,
      msgs: [
        { de: 'cliente', txt: 'qual o prazo pra Natal?', t: m(240) },
        { de: 'ia', txt: 'Oi, Fernanda! Postamos em até 5 dias úteis e, pelo SEDEX, chega em 5 a 10 dias úteis aí em Natal. 🌹', t: m(240) },
        { de: 'cliente', txt: 'obrigadaaa', t: m(236) },
        { de: 'evento', txt: 'A IA resolveu a conversa', t: m(230) },
      ],
    },
  ],
};

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (path, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const canalIco = c => `<svg class="ico" viewBox="0 0 24 24" aria-label="${CANAIS[c].nome}">${CANAIS[c].svg}</svg>`;
const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const desde = t => {
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
};
const ultima = c => c.msgs.filter(x => x.de !== 'evento' && x.de !== 'nota').at(-1) || c.msgs.filter(x => x.de !== 'evento').at(-1) || { de: 'evento', txt: '', t: c.criada || Date.now() };
// tempo que a cliente está esperando resposta (só conta se a última fala foi dela)
const espera = c => {
  if (c.resolvida) return 0;
  if (c.esperaDesde !== undefined) return c.esperaDesde ? (Date.now() - c.esperaDesde) / 60000 : 0;
  const u = ultima(c);
  return u.de === 'cliente' ? (Date.now() - u.t) / 60000 : 0;
};
const pessoa = id => EQUIPE[id] || { nome: 'Alguém da equipe', ini: '?' };
const nomeCurto = id => id === 'ia' ? 'IA' : id === EU ? 'Você' : pessoa(id).nome;
const avatar = (quem, cls = '', ponto) => quem === 'ia'
  ? `<span class="av ia ${cls}" title="${IA.nome}">${ico(BRILHO)}</span>`
  : `<span class="av ${cls}" title="${esc(pessoa(quem).nome)}">${esc(pessoa(quem).ini)}${ponto ? `<i class="ponto ${ponto}"></i>` : ''}</span>`;
const carga = id => estado.convs.filter(c => c.dono === id && !c.resolvida).length;
const primeiroNome = c => c.cliente.split(' ')[0];

function naFila(c, fila) {
  switch (fila) {
    case 'mim': return c.dono === EU && !c.resolvida;
    case 'precisam': return !c.dono && !c.resolvida;
    case 'naoatendidas': return !c.resolvida && c.dono !== 'ia' && ultima(c).de === 'cliente';
    case 'mencoes': return MENCOES.has(c.id);
    case 'ia': return c.dono === 'ia' && !c.resolvida;
    case 'todas': return !c.resolvida;
    case 'resolvidas': return !!c.resolvida;
  }
}
function visiveis(fila = estado.fila) {
  const q = estado.busca.trim().toLowerCase();
  return estado.convs
    .filter(c => naFila(c, fila))
    .filter(c => estado.marca === 'todas' || c.marca === estado.marca)
    .filter(c => !estado.canal || c.canal === estado.canal)
    .filter(c => !estado.assunto || c.etiquetas.includes(estado.assunto))
    .filter(c => !estado.time || c.time === estado.time)
    .filter(c => !estado.sinal || SINAIS.find(x => x.id === estado.sinal)?.teste(c))
    .filter(c => !q || [c.cliente, c.pedido?.num, ...c.msgs.map(x => x.txt)].some(s => s && s.toLowerCase().includes(q)))
    .sort((a, b) => fila === 'resolvidas' ? ultima(b).t - ultima(a).t
      : ((PESO_PRIO[a.prioridade] ?? 2) - (PESO_PRIO[b.prioridade] ?? 2)) || (espera(b) - espera(a)) || (ultima(b).t - ultima(a).t));
}

// ---------- menu da esquerda ----------
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const ICO_CONVERSAS = '<path d="M4 5h16v11H8l-4 4z"/>';
const ICO_CONFIG = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';

function itemMenu(id, nome, icone, { on, n, alerta, sub, expandivel, aberto, attr } = {}) {
  const num = n ? `<span class="n${alerta ? ' alerta' : ''}">${n}</span>` : '';
  const seta = expandivel ? `<span class="seta${aberto ? ' aberta' : ''}" data-expandir="${id}" role="button" aria-label="${aberto ? 'Recolher' : 'Abrir'} ${nome}">${ico(CHEVRON)}</span>` : '';
  return `<button class="item${sub ? ' sub' : ''}${on ? ' on' : ''}" ${attr || `data-pagina="${id}"`}>${icone ? ico(icone) : '<span class="bolinha"></span>'}<span class="rot-item">${esc(nome)}</span>${num}${seta}</button>`;
}

function renderMenuLateral() {
  const pg = estado.pagina, partes = [];
  for (const id of MENU) {
    if (id === 'conversas') {
      const aberto = estado.expandido.conversas ?? pg === 'conversas';
      const alerta = visiveis('precisam').length;
      partes.push(itemMenu('conversas', 'Conversas', ICO_CONVERSAS, { on: pg === 'conversas' && !aberto, n: alerta, alerta: true, expandivel: true, aberto }));
      if (aberto) {
        const subs = FILAS.map(f => {
          const n = f.id === 'resolvidas' ? 0 : visiveis(f.id).length;
          return itemMenu(f.id, f.nome, f.ico, { sub: true, on: pg === 'conversas' && estado.fila === f.id && !estado.canal && !estado.assunto && !estado.sinal, n, alerta: f.alerta, attr: `data-fila="${f.id}"` });
        });
        const abertas = estado.convs.filter(c => !c.resolvida && (estado.marca === 'todas' || c.marca === estado.marca));
        const sinais = SINAIS.map(x => [x, abertas.filter(x.teste).length]).filter(x => x[1]);
        if (sinais.length) subs.push('<div class="sub-titulo">Atenção</div>', ...sinais.map(([x, n]) => itemMenu(x.id, x.nome, x.ico, { sub: true, on: estado.sinal === x.id, n, alerta: x.id !== 'compra', attr: `data-sinal="${x.id}"` })));
        const comCaixa = new Set(Object.values(INBOX).map(i => i.canal));
        const canais = Object.entries(CANAIS).map(([cid, ch]) => [cid, ch, abertas.filter(c => c.canal === cid).length]).filter(x => x[2] || comCaixa.has(x[0]));
        if (canais.length) subs.push('<div class="sub-titulo">Canais</div>', ...canais.map(([cid, ch, n]) => itemMenu(cid, ch.nome, ch.svg, { sub: true, on: estado.canal === cid, n, attr: `data-canal="${cid}"` })));
        const times = Object.entries(TIMES).map(([tid, nome]) => [Number(tid), nome, abertas.filter(c => c.time === Number(tid)).length]);
        if (times.length) subs.push('<div class="sub-titulo">Times</div>', ...times.map(([tid, nome, n]) => itemMenu(`t${tid}`, nome, '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>', { sub: true, on: estado.time === tid, n, attr: `data-time="${tid}"` })));
        // etiquetas: as da IA (assuntos), as criadas pela equipe no sistema e as que aparecem nas conversas
        const ids = [...new Set([...ASSUNTOS.map(x => x.id), ...LABELS, ...abertas.flatMap(c => c.etiquetas)])];
        const etiquetas = ids.map(id => [{ id, nome: nomeAssunto(id) }, abertas.filter(c => c.etiquetas.includes(id)).length])
          .filter(x => x[1] || LABELS.includes(x[0].id)).sort((a, b) => b[1] - a[1] || a[0].nome.localeCompare(b[0].nome));
        if (etiquetas.length) subs.push('<div class="sub-titulo">Etiquetas</div>', ...etiquetas.map(([a, n]) => itemMenu(a.id, a.nome, null, { sub: true, on: estado.assunto === a.id, n, attr: `data-assunto="${a.id}"` })));
        partes.push(`<div class="subs">${subs.join('')}</div>`);
      }
      continue;
    }
    if (id === 'configuracoes') {
      const filhos = DENTRO_DE_CONFIG.filter(podeVer);
      if (!filhos.length) continue;
      const aberto = estado.expandido.configuracoes || DENTRO_DE_CONFIG.includes(pg);
      partes.push(itemMenu(filhos[0], 'Configurações', ICO_CONFIG, { on: false, expandivel: true, aberto, attr: `data-pagina="${filhos[0]}" data-expandir-tb="configuracoes"` }));
      if (aberto) partes.push(`<div class="subs">${filhos.map(f => itemMenu(f, f === 'configuracoes' ? 'Geral' : MODULOS[f].nome, MODULOS[f].ico, { sub: true, on: pg === f })).join('')}</div>`);
      continue;
    }
    const mod = MODULOS[id];
    if (!mod || !podeVer(id)) continue;
    const n = mod.contador ? mod.contador() : 0;
    if (mod.subs) {
      const aberto = estado.expandido[id] || pg === id;
      partes.push(itemMenu(id, mod.nome, mod.ico, { on: pg === id && !estado.sub, n, expandivel: true, aberto, alerta: mod.contadorAlerta }));
      if (aberto) partes.push(`<div class="subs">${mod.subs.map(s => itemMenu(`${id}/${s.id}`, s.nome, s.ico, { sub: true, on: pg === id && estado.sub === s.id, n: s.contador ? s.contador() : 0 })).join('')}</div>`);
    } else partes.push(itemMenu(id, mod.nome, mod.ico, { on: pg === id, n, alerta: mod.contadorAlerta }));
  }
  $('#menu-principal').innerHTML = partes.join('');

  const eu = pessoa(EU);
  $('#eu').innerHTML = `<div class="eu-linha">${avatar(EU, '', estado.eu)}<div style="min-width:0;flex:1"><div class="nome">${esc(eu.nome)}</div><div class="sub">${REAL ? `${esc(NIVEIS_NOMES[MEU_NIVEL] || '')}, ` : ''}${estado.eu === 'pausa' ? 'em pausa' : 'recebendo conversas'}</div></div>
      ${REAL && !LOGIN_LIVRE ? `<div class="mais"><button class="btn icone fantasma" data-acao="menu-eu" aria-label="Minha conta" aria-expanded="${estado.menuEu}">${ico('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>')}</button>
        ${estado.menuEu ? `<div class="menu menu-cima" role="menu"><button data-acao="trocar-senha">${ico('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')}<span>Trocar minha senha</span></button><button data-acao="sair">${ico('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')}<span>Sair</span></button></div>` : ''}</div>` : ''}</div>
    <div class="disp" role="group" aria-label="Sua disponibilidade">
      <button data-disp="online" class="${estado.eu === 'pausa' ? '' : 'on'}" aria-pressed="${estado.eu !== 'pausa'}">Disponível</button>
      <button data-disp="pausa" class="${estado.eu === 'pausa' ? 'on' : ''}" aria-pressed="${estado.eu === 'pausa'}">Pausa</button>
    </div>`;
}

// ---------- lista ----------
function renderLista() {
  const f = FILAS.find(x => x.id === estado.fila);
  $('#fila-titulo').textContent = f.titulo;
  $('#fila-desc').textContent = f.desc;
  $('#filas-movel').innerHTML = FILAS.map(x => {
    const n = visiveis(x.id).length;
    return `<button data-fila="${x.id}" class="${estado.fila === x.id ? 'on' : ''}">${x.nome}${n && x.id !== 'resolvidas' ? ` ${n}` : ''}</button>`;
  }).join('');
  const filtros = [];
  if (estado.canal) filtros.push(`<button class="chip filtro" data-limpar="canal">${CANAIS[estado.canal].nome}${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`);
  if (estado.time) filtros.push(`<button class="chip filtro" data-limpar="time">${esc(nomeTime(estado.time))}${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`);
  if (estado.sinal) filtros.push(`<button class="chip filtro" data-limpar="sinal">${esc(SINAIS.find(x => x.id === estado.sinal)?.nome || '')}${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`);
  if (estado.assunto) filtros.push(`<button class="chip filtro" data-limpar="assunto">${esc(nomeAssunto(estado.assunto))}${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`);
  $('#filtros-ativos').innerHTML = filtros.join('');
  $('#filtros-ativos').hidden = !filtros.length;

  const lista = visiveis();
  if (!lista.length) {
    const vazio = {
      naoatendidas: ['Ninguém esperando', 'Toda cliente que falou por último já teve resposta.'],
      mencoes: ['Nenhuma menção', 'Quando alguém marcar você numa nota, a conversa aparece aqui.'],
      mim: ['Nenhuma conversa com você', 'Pegue uma em “Não atribuídas”.'],
      precisam: ['Todo mundo foi atendido', 'Quando a IA pedir ajuda ou chegar alguém sem dono, aparece aqui.'],
      ia: ['A IA não está em nenhuma conversa', 'As conversas novas passam primeiro por ela.'],
      resolvidas: ['Nada resolvido hoje ainda', 'Ao resolver uma conversa, ela vem para cá.'],
    }[estado.fila] || ['Nenhuma conversa aberta', ''];
    const filtro = estado.busca || estado.canal || estado.assunto || estado.sinal || estado.marca !== 'todas';
    $('#convs').innerHTML = `<li class="vazio"><strong>${filtro ? 'Nada com esse filtro' : vazio[0]}</strong><span>${filtro ? 'Tire os filtros acima ou troque a fila.' : vazio[1]}</span></li>`;
    return;
  }
  const mostrarDono = estado.fila === 'todas' || estado.fila === 'resolvidas';
  $('#convs').innerHTML = lista.map(c => {
    const u = ultima(c), e = espera(c);
    const cls = e > 30 ? 'atrasado' : e > 10 ? 'quase' : '';
    const prefixo = { cliente: '', evento: '', ia: 'IA: ', nota: 'Nota: ' }[u.de] ?? `${nomeCurto(u.quem)}: `;
    const tags = [];
    if (!c.resolvida && (c.prioridade === 'urgente' || c.prioridade === 'alta')) tags.push(`<span class="chip prio-${c.prioridade}">${NOME_PRIO[c.prioridade]}</span>`);
    if (!c.resolvida && c.sentimento === 'irritada') tags.push('<span class="chip sent-irritada">Irritada</span>');
    if (!c.resolvida && c.compra) tags.push('<span class="chip compra">Quer comprar</span>');
    if (c.escalou && !c.resolvida && c.dono !== EU) tags.push(`<span class="chip alerta">${esc(c.escalou)}</span>`);
    else if (!c.dono && !c.resolvida) tags.push('<span class="chip aviso">Ninguém pegou</span>');
    if (mostrarDono && c.dono) tags.push(`<span class="chip">${avatar(c.dono, 'sm')}${esc(nomeCurto(c.dono))}</span>`);
    c.etiquetas.slice(0, tags.length > 2 ? 1 : 2).forEach(t => tags.push(`<span class="chip">${esc(nomeAssunto(t))}</span>`));
    return `<li class="conv${estado.aberta === c.id ? ' on' : ''}${c.naoLidas ? '' : ' lida'}" data-id="${c.id}" tabindex="0" aria-current="${estado.aberta === c.id}">
      ${avatar2(c)}
      <span class="canal-mini">${canalIco(c.canal)}</span>
      <div style="min-width:0">
        <span class="cli">${esc(c.cliente)}</span>
        <div class="prev">${esc(prefixo + u.txt)}</div>
        ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
      </div>
      <div class="meta">
        <span class="tempo ${cls}" title="${e ? 'Esperando resposta' : 'Última mensagem'}">${desde(u.t)}</span>
        ${c.naoLidas ? `<span class="nao-lidas">${c.naoLidas}</span>` : ''}
      </div>
    </li>`;
  }).join('');
}
const avatar2 = (c, cls = 'lg') => `<span class="av ${cls}">${esc(c.ini)}</span>`;

// ---------- conversa ----------
function renderChat() {
  // guarda o que a pessoa está escrevendo: a tela se redesenha sozinha a cada atualização
  const caixa = $('#texto'), digitado = caixa?.value || '', focado = document.activeElement === caixa;
  const box0 = $('#msgs'), noFim = !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 80;
  const mesma = renderChat.ultima === estado.aberta;
  renderChat.ultima = estado.aberta;
  desenharChat();
  const nova = $('#texto');
  if (nova && mesma && digitado) nova.value = digitado;
  if (nova && mesma && focado) nova.focus();
  const box = $('#msgs');
  if (box && (!mesma || noFim)) box.scrollTop = box.scrollHeight;
}

function desenharChat() {
  const c = conv();
  if (!c) {
    $('#chat').innerHTML = `<div class="chat-vazio"><div><strong>Escolha uma conversa</strong>A que espera há mais tempo fica no topo da lista.<br><br><kbd>/</kbd> busca &nbsp; <kbd>Ctrl</kbd> + <kbd>Enter</kbd> envia</div></div>`;
    return;
  }
  const minha = c.dono === EU;
  const acoes = [];
  if (c.resolvida) acoes.push(`<button class="btn" data-acao="reabrir">${ico('<path d="M4 12a8 8 0 1 0 2.3-5.6L4 9"/><path d="M4 4v5h5"/>')}<span class="rot">Reabrir</span></button>`);
  else if (!minha) acoes.push(`<button class="btn prim" data-acao="assumir">${ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')}<span class="rot">Assumir</span></button>`);
  else acoes.push(`<button class="btn" data-acao="resolver">${ico('<path d="m5 12 4 4 10-10"/>')}<span class="rot">Resolver</span></button>`);
  if (!c.resolvida) acoes.push(`<div class="mais"><button class="btn icone" data-acao="menu" aria-label="Mais opções" aria-expanded="${estado.menu}">${ico('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>')}</button>${estado.menu ? renderMenu(c) : ''}</div>`);
  acoes.push(`<button class="btn icone fantasma" data-acao="ctx" aria-label="Dados da cliente" title="Dados da cliente">${ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>')}</button>`);

  let faixa = '';
  if (!c.resolvida && c.dono === 'ia') faixa = `<div class="aviso-faixa">${ico(BRILHO)}<span>A IA do SAC está cuidando desta conversa. Se você responder, ela passa para você.</span></div>`;
  else if (!c.resolvida && c.escalou && !minha) faixa = `<div class="aviso-faixa alerta">${ico('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>')}<span>A IA pediu ajuda: <b>${esc(c.escalou)}</b>. Assuma para responder.</span></div>`;
  else if (!c.resolvida && !c.dono) faixa = `<div class="aviso-faixa">${ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/>')}<span>Ninguém pegou esta conversa ainda.</span></div>`;
  else if (!c.resolvida && !minha) faixa = `<div class="aviso-faixa">${avatar(c.dono, 'sm')}<span>Está com <b>${esc(pessoa(c.dono).nome)}</b>.</span></div>`;

  let ultimoDia = '';
  const msgs = c.msgs.map(x => {
    const dia = new Date(x.t).toDateString() === new Date().toDateString() ? 'Hoje' : new Date(x.t).toLocaleDateString('pt-BR');
    const sep = dia !== ultimoDia ? `<div class="dia">${dia}</div>` : '';
    ultimoDia = dia;
    const novo = x.novo ? ' novo' : '';
    if (x.de === 'evento') return `${sep}<div class="evento">${esc(x.txt)}, ${hora(x.t)}</div>`;
    let rot = '';
    if (x.de === 'ia') rot = `${ico(BRILHO)}${IA.nome}`;
    else if (x.de === 'nota') rot = x.quem === EU ? 'Sua nota, só a equipe vê' : `Nota de ${esc(pessoa(x.quem).nome)}, só a equipe vê`;
    else if (x.de === 'equipe') rot = x.quem === EU ? 'Você' : esc(pessoa(x.quem).nome);
    const corpo = anexosHtml(x) + (x.soAnexo ? '' : `<span>${esc(x.txt)}</span>`);
    const falhou = x.falha ? `<div class="falhou">Não foi entregue: ${esc(x.falha)}</div>` : '';
    return `${sep}<div class="msg ${x.de}${novo}${x.anexos?.length ? ' com-anexo' : ''}"><div class="bolha">${corpo}</div>${falhou}<div class="info">${rot ? `<span style="display:inline-flex;align-items:center;gap:4px">${rot}</span>` : ''}<span>${hora(x.t)}</span></div></div>`;
  }).join('');
  c.msgs.forEach(x => delete x.novo);

  const sug = !c.resolvida && c.rascunho && c.dono !== 'ia' ? `<div class="sugestao" aria-label="Sugestão da IA">
      <div class="sugestao-head">${ico(BRILHO)}Sugestão da IA<span class="fonte">Com base em ${esc(c.rascunho.fonte)}</span></div>
      <div class="sugestao-txt">${esc(c.rascunho.txt)}</div>
      <div class="sugestao-acoes">
        <button class="btn prim peq" data-acao="usar">Enviar</button>
        <button class="btn peq" data-acao="editar">Editar antes</button>
        <button class="btn fantasma peq" data-acao="descartar">Descartar</button>
      </div></div>` : '';

  const nota = estado.modo === 'nota';
  const fechada = !c.resolvida && !nota && !c.podeResponder;
  const comp = fechada ? janelaFechadaHtml(c) : c.resolvida
    ? `<div class="encerrada">${ico('<path d="m5 12 4 4 10-10"/>')}<span>Conversa resolvida. Se a cliente escrever, ela reabre sozinha.</span></div>`
    : `<div class="composer"><div class="composer-wrap">
      <div id="respostas"></div>
      <div class="caixa${nota ? ' nota-modo' : ''}">
        <div class="modo" role="tablist">
          <button role="tab" data-modo="resposta" class="${nota ? '' : 'on'}" aria-selected="${!nota}">Responder</button>
          <button role="tab" data-modo="nota" class="${nota ? 'on' : ''}" aria-selected="${nota}">Nota para a equipe</button>
        </div>
        ${estado.anexo ? `<div class="anexo-pronto"><span>📎 ${esc(estado.anexo.name)}</span><button class="btn icone fantasma peq" data-acao="tirar-anexo" aria-label="Tirar o anexo">${ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>` : ''}
        <textarea id="texto" rows="2" placeholder="${nota ? 'Só a equipe vê esta nota.' : `Escreva para ${esc(primeiroNome(c))}. Digite / para usar uma resposta pronta.`}"></textarea>
        <div class="caixa-pe">
          <button class="ferr" title="Mandar foto ou arquivo" aria-label="Mandar foto ou arquivo" data-acao="anexar">${ico('<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>')}</button>
          <button class="ferr" title="Respostas prontas" aria-label="Respostas prontas" data-acao="respostas">${ico('<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>')}</button>
          <button class="ferr" title="Pedir uma sugestão para a IA" aria-label="Pedir uma sugestão para a IA" data-acao="sugerir">${ico(BRILHO)}</button>
          <span class="dica">Ctrl + Enter envia</span>
          <button class="btn prim peq" data-acao="enviar">${nota ? 'Salvar nota' : 'Enviar'}</button>
        </div>
      </div></div></div>`;

  $('#chat').innerHTML = `
    <header class="chat-head">
      <button class="btn icone fantasma voltar" data-acao="voltar" aria-label="Voltar para a lista">${ico('<path d="m15 18-6-6 6-6"/>')}</button>
      ${avatar2(c)}
      <div class="quem"><strong>${esc(c.cliente)}</strong><span>${canalIco(c.canal)}${CANAIS[c.canal].nome}, ${c.marca === 'beyoung' ? 'Beyoung' : 'Rosa Selvagem'}${c.time ? `, time ${esc(nomeTime(c.time))}` : ''}</span></div>
      <div class="acoes">${acoes.join('')}</div>
    </header>
    ${faixa}
    <div class="msgs" id="msgs">${msgs}</div>
    ${sug}${comp}`;
}

function renderMenu(c) {
  const linhas = ['<div class="titulo">Passar para</div>'];
  // sem o acesso "passar conversa", só aparece ela mesma (assumir)
  Object.entries(EQUIPE).filter(([id]) => id !== c.dono && (id === EU || podeAcesso('passar_conversas'))).forEach(([id, p]) => {
    const st = id === EU ? estado.eu : p.status;
    linhas.push(`<button data-passar="${id}">${avatar(id, '', st)}<span>${id === EU ? 'Mim' : esc(p.nome)}</span><span class="sub">${carga(id)} abertas</span></button>`);
  });
  if (Object.keys(TIMES).length) { linhas.push('<div class="titulo">Mandar para o time</div>'); Object.entries(TIMES).forEach(([tid, nome]) => { if (Number(tid) !== c.time) linhas.push(`<button data-acao="time" data-time-id="${tid}">${ico('<path d="M5 12h14M13 6l6 6-6 6"/>')}<span>${esc(nome)}</span></button>`); }); }
  linhas.push('<hr>');
  if (c.dono !== 'ia') linhas.push(`<button data-passar="ia">${avatar('ia')}<span>Devolver para a IA</span></button>`);
  if (c.dono) linhas.push(`<button data-passar="">${ico('<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>')}<span>Deixar sem dono</span></button>`);
  if (typeof window.perguntarRosaSobre === 'function') linhas.push(`<button data-acao="rosa">${ico(BRILHO)}<span>Perguntar à Rosa sobre esta conversa</span></button>`);
  if (typeof window.abrirChamadoDaConversa === 'function') linhas.push(`<button data-acao="chamado">${ico('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>')}<span>Abrir chamado no Helpdesk</span></button>`);
  if (c.dono !== EU) linhas.push(`<button data-acao="resolver">${ico('<path d="m5 12 4 4 10-10"/>')}<span>Resolver</span></button>`);
  return `<div class="menu" role="menu">${linhas.join('')}</div>`;
}

// ---------- dados da cliente ----------
function renderCtx() {
  const c = conv();
  if (!c) { $('#ctx').innerHTML = ''; return; }
  const p = c.pedido;
  const pedido = p ? `<div class="pedido ${esc(p.status)}">
      <div class="pedido-top"><b>Pedido ${esc(p.num)}</b><span class="status ${esc(p.status)}">${esc(p.rot)}</span></div>
      <div class="trilha" title="Aprovado, separado, enviado, entregue">${[1, 2, 3, 4].map(i => `<i class="${i <= p.passo ? 'f' : ''}"></i>`).join('')}</div>
      <div class="itens">${esc(p.itens)}</div>
      <div class="linha"><span>Total</span><span>${esc(p.total)}</span></div>
      <div class="linha"><span>Envio</span><span>${esc(p.envio)}</span></div>
      <div class="linha"><span>Rastreio</span><span>${esc(p.rastreio)}</span></div>
      <div class="linha"><span>Comprado em</span><span>${esc(p.data)}</span></div>
    </div>` : '<p class="muted" style="font-size:13px">Nenhum pedido encontrado para este contato.</p>';
  const dados = [['Telefone', c.fone], ['E-mail', c.email], ['Instagram', c.insta], ['Cidade', c.cidade]].filter(x => x[1]);
  $('#ctx').innerHTML = `
    <div class="ctx-topo">
      <button class="btn icone fantasma voltar" data-acao="voltar-chat" style="align-self:flex-start" aria-label="Voltar para a conversa">${ico('<path d="m15 18-6-6 6-6"/>')}</button>
      ${avatar2(c, 'xl')}
      <strong>${esc(c.cliente)}</strong>
      <span class="muted" style="font-size:12.5px">${c.dono ? `Com ${esc(c.dono === 'ia' ? 'a IA do SAC' : c.dono === EU ? 'você' : pessoa(c.dono).nome)}` : 'Sem dono'}</span>
    </div>
    ${c.prioridade || c.sentimento || c.produtos ? `<div class="ctx-bloco"><h3>Leitura da IA</h3><div class="leitura">
      ${c.prioridade ? `<span class="chip prio-${esc(c.prioridade)}">Prioridade ${esc((NOME_PRIO[c.prioridade] || c.prioridade).toLowerCase())}</span>` : ''}
      ${c.sentimento ? `<span class="chip sent-${esc(c.sentimento)}">${esc(NOME_SENT[c.sentimento] || c.sentimento)}</span>` : ''}
      ${c.compra ? '<span class="chip compra">Quer comprar</span>' : ''}
      ${c.produtos ? `<span class="chip">${esc(c.produtos)}</span>` : ''}</div></div>` : ''}
    ${c.memoria ? `<div class="ctx-bloco"><h3>O que a IA lembra dela</h3><p class="resumo memoria">${esc(c.memoria)}</p></div>` : ''}
    ${c.resumo ? `<div class="ctx-bloco"><h3>Resumo da IA</h3><p class="resumo">${esc(c.resumo)}</p></div>` : ''}
    ${c.observacao && !c.resolvida ? `<div class="ctx-bloco"><h3>Atenção</h3><p class="resumo">${esc(c.observacao)}</p></div>` : ''}
    <div class="ctx-bloco"><h3>Último pedido</h3>${pedido}</div>
    ${dados.length ? `<div class="ctx-bloco"><h3>Contato</h3><dl class="dados">${dados.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
    <div class="ctx-bloco"><h3>Etiquetas</h3><div class="etiquetas">${c.etiquetas.map(t => `<span class="chip">${esc(nomeAssunto(t))}</span>`).join('')}<button class="chip add" data-acao="etiqueta">Adicionar</button></div></div>`;
}

// ---------- equipe ----------
function renderEquipe() {
  const abertas = estado.convs.filter(c => !c.resolvida);
  const num = (rot, n) => `<div class="num-card"><span>${rot}</span><strong>${n}</strong></div>`;
  const cards = Object.entries(EQUIPE).map(([id, p]) => {
    const st = id === EU ? estado.eu : p.status, n = carga(id), pct = Math.min(100, n / p.limite * 100);
    return `<div class="pessoa">
      <div class="pessoa-top">${avatar(id, 'lg', st)}<div><strong>${id === EU ? `${esc(p.nome)} (você)` : esc(p.nome)}</strong><span>${ROTULO_DISP[st]}</span></div></div>
      <div><div class="carga-txt"><span>${n} ${n === 1 ? 'conversa aberta' : 'conversas abertas'}</span><span>limite ${p.limite}</span></div>
      <div class="carga${pct >= 85 ? ' cheia' : ''}"><i style="width:${pct}%"></i></div></div>
    </div>`;
  });
  cards.push(`<div class="pessoa">
      <div class="pessoa-top">${avatar('ia', 'lg')}<div><strong>${IA.nome}</strong><span>Responde 24 horas</span></div></div>
      <div class="carga-txt"><span>${carga('ia')} ${carga('ia') === 1 ? 'conversa agora' : 'conversas agora'}</span><span>${estado.convs.filter(c => c.escalou && !c.resolvida).length} pedidos de ajuda</span></div>
    </div>`);
  $('#pag-equipe').innerHTML = `<div class="pag-in">
    <div class="pag-head" style="align-items:flex-start"><button class="btn icone fantasma abrir-menu" data-acao="menu-lateral" aria-label="Abrir menu"><svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><div><h1>Equipe</h1><p>Quem está atendendo agora e quantas conversas cada pessoa tem. Para passar uma conversa, abra a conversa e use o menu de três pontos.</p></div></div>
    <div class="resumo-num">${num('Abertas', abertas.length)}${num('Não atribuídas', abertas.filter(c => !c.dono).length)}${num('Com a IA', carga('ia'))}${num('Resolvidas hoje', estado.convs.filter(c => c.resolvida).length)}</div>
    <div class="secao">Pessoas</div>
    <div class="pessoas">${cards.join('')}</div>
  </div>`;
}

// ---------- páginas ----------
function mostrarPagina() {
  const p = estado.pagina;
  document.querySelectorAll('#app > .pagina').forEach(el => { el.hidden = true; });
  $('#app').classList.remove('menu-aberto');
  if (p === 'conversas') $('#conversas').hidden = false;
  else {
    const el = pagEl(p);
    el.hidden = false;
    try { MODULOS[p]?.render(el, estado.sub); }
    catch (err) { el.innerHTML = `<div class="pag-in">${cabecalho(MODULOS[p]?.nome || 'Página')}<div class="erro">Esta página deu erro: ${esc(err.message)}</div></div>`; console.error(err); }
  }
  renderMenuLateral();
}

function render() {
  renderMenuLateral();
  if (estado.pagina === 'conversas') { renderLista(); renderChat(); renderCtx(); }
  else if (estado.pagina === 'equipe') renderEquipe();
  else if (estado.pagina === 'visao' && MODULOS.visao) MODULOS.visao.render(pagEl('visao'));
}

// ---------- Chatwoot ----------
// Contrato com o Atendente SAC (campos personalizados da conversa no Chatwoot):
//   status "pending"            = a IA está respondendo (fila "Com a IA")
//   status "open" + motivo_ia   = a IA pediu ajuda; sugestao_ia, sugestao_fonte e resumo_ia são opcionais
//   contato.custom_attributes.ultimo_pedido = { num, status, rot, passo, itens, total, envio, rastreio, data }
const INBOX = {};
const CORES = ['#be185d', '#7c3aed', '#0f766e', '#1d4ed8', '#b45309', '#4338ca', '#0369a1', '#a21caf', '#15803d', '#c2410c'];
const corDe = s => CORES[[...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % CORES.length];
const iniciais = s => String(s || '?').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';

async function chamar(url, metodo = 'GET', corpo) {
  const r = await fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  // sessão venceu no meio do uso: volta para a tela de entrar
  if (r.status === 401 && j.erro === 'login' && REAL) { location.reload(); throw new Error('login'); }
  if (!r.ok) throw new Error(j.message || j.error || j.erro || `erro ${r.status}`);
  return j;
}
const cw = (caminho, metodo, corpo) => chamar(`/api/atendimento/cw/${caminho}`, metodo, corpo);

function canalDoInbox(ib) {
  const tipo = ib.channel_type || '', nome = (ib.name || '').toLowerCase().replace(/-/g, '');
  if (/Whatsapp/i.test(tipo) || (tipo === 'Channel::TwilioSms' && ib.medium === 'whatsapp')) return 'whatsapp';
  if (/Instagram/i.test(tipo) || (tipo === 'Channel::FacebookPage' && ib.instagram_id)) return 'instagram';
  if (tipo === 'Channel::FacebookPage') return 'messenger';
  if (tipo === 'Channel::Telegram') return 'telegram';
  if (tipo === 'Channel::Email') return 'email';
  if (tipo === 'Channel::WebWidget') return 'site';
  // caixa do tipo API: o canal vem do nome (ex.: "WhatsApp Rosa Selvagem")
  return ['whatsapp', 'instagram', 'messenger', 'telegram', 'email'].find(k => nome.includes(k)) || 'site';
}

function textoDe(m) {
  if (m.content) return m.content;
  const a = (m.attachments || [])[0];
  if (!a) return '';
  return { image: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', file: '📎 Arquivo' }[a.file_type] || '📎 Anexo';
}

function msgDe(m) {
  const t = (m.created_at || 0) * 1000, txt = textoDe(m);
  // anexos (foto, áudio, vídeo, arquivo, localização) e se a mensagem não foi entregue
  const extra = {
    anexos: (m.attachments || []).map(a => ({
      tipo: a.file_type, url: a.data_url, thumb: a.thumb_url, tamanho: a.file_size,
      nome: decodeURIComponent(String(a.data_url || '').split('/').pop().split('?')[0] || 'arquivo'),
      lat: a.coordinates_lat, lng: a.coordinates_long,
    })),
    soAnexo: !m.content && (m.attachments || []).length > 0,
    falha: m.status === 'failed' ? (m.content_attributes?.external_error || 'motivo não informado') : null,
  };
  if (m.message_type === 2) return { id: m.id, de: 'evento', txt, t };
  if (m.message_type === 0) return { id: m.id, de: 'cliente', txt, t, ...extra };
  const quem = m.sender && (m.sender_type === 'User' || m.sender.type === 'user') ? `u${m.sender.id}` : null;
  if (m.private) return { id: m.id, de: 'nota', quem, txt, t, ...extra };
  if (m.sender_type === 'AgentBot' || m.sender?.type === 'agent_bot') return { id: m.id, de: 'ia', txt, t, ...extra };
  return { id: m.id, de: 'equipe', quem, txt, t, ...extra };
}

// como cada anexo aparece na conversa
function anexosHtml(x) {
  return (x.anexos || []).map(a => {
    const url = esc(a.url || '');
    if (a.tipo === 'image') return `<a class="anexo-img" href="${url}" target="_blank" rel="noopener" title="Abrir a foto"><img src="${esc(a.thumb || a.url)}" alt="Foto enviada" loading="lazy"></a>`;
    if (a.tipo === 'audio') return `<audio class="anexo-audio" controls preload="none" src="${url}"></audio>`;
    if (a.tipo === 'video') return `<video class="anexo-video" controls preload="metadata" src="${url}"></video>`;
    if (a.tipo === 'location') return `<a class="anexo-arq" href="https://www.google.com/maps?q=${encodeURIComponent(a.lat + ',' + a.lng)}" target="_blank" rel="noopener">📍 Localização da cliente</a>`;
    const kb = a.tamanho ? ` (${a.tamanho > 1048576 ? (a.tamanho / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(a.tamanho / 1024)) + ' KB'})` : '';
    return `<a class="anexo-arq" href="${url}" target="_blank" rel="noopener">📎 ${esc(a.nome)}${kb}</a>`;
  }).join('');
}

function lerObjeto(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function convDe(x, antiga) {
  const s = x.meta?.sender || {}, ib = INBOX[x.inbox_id] || { canal: 'site', marca: 'rosa' };
  const ca = x.custom_attributes || {}, aa = s.additional_attributes || {};
  const ult = x.last_non_activity_message || (x.messages || []).at(-1);
  const c = {
    id: x.id, cliente: s.name || s.phone_number || s.email || 'Cliente', marca: ib.marca, canal: ib.canal,
    fone: s.phone_number, email: s.email, cidade: aa.city || null,
    insta: aa.social_profiles?.instagram ? `@${aa.social_profiles.instagram}` : null,
    time: x.meta?.team?.id || null,
    dono: x.status === 'pending' ? 'ia' : x.meta?.assignee ? `u${x.meta.assignee.id}` : null,
    escalou: x.status === 'open' ? ca.motivo_ia || null : null,
    naoLidas: x.unread_count || 0, etiquetas: x.labels || [], resolvida: x.status === 'resolved',
    resumo: ca.resumo_ia || '', observacao: ca.observacao_ia || '', pedido: lerObjeto(s.custom_attributes?.ultimo_pedido),
    rascunho: ca.sugestao_ia ? { txt: ca.sugestao_ia, fonte: ca.sugestao_fonte || 'Base de conhecimento do SAC' } : null,
    podeResponder: x.can_reply !== false, inbox: x.inbox_id,
    prioridade: ca.prioridade_ia || null, sentimento: ca.sentimento_ia || null,
    compra: ca.intencao_compra_ia === true || ca.intencao_compra_ia === 'true', produtos: ca.produtos_ia || '',
    memoria: s.custom_attributes?.memoria_ia || '',
    attrs: ca, esperaDesde: x.waiting_since ? x.waiting_since * 1000 : 0, criada: (x.created_at || 0) * 1000,
    msgs: ult ? [msgDe(ult)] : [], carregada: false,
  };
  c.ini = iniciais(c.cliente); c.cor = corDe(c.cliente);
  // mantém as mensagens já abertas até a próxima leitura completa
  if (antiga?.carregada) { c.msgs = antiga.msgs; c.carregada = true; }
  return c;
}

async function carregarBase() {
  const [perfil, agentes, inboxes] = await Promise.all([chamar('/api/atendimento/perfil'), cw('agents'), cw('inboxes')]);
  EQUIPE = {};
  for (const a of agentes) {
    const nome = a.available_name || a.name;
    EQUIPE[`u${a.id}`] = { nome, ini: iniciais(nome), cor: corDe(nome), status: { online: 'online', busy: 'pausa' }[a.availability_status] || 'offline', limite: 8, cwId: a.id };
  }
  EU = `u${perfil.id}`;
  // a sua disponibilidade vem do que você escolheu, não de estar conectada agora
  const minha = (perfil.accounts || []).find(a => a.id === perfil.account_id)?.availability;
  estado.eu = minha === 'busy' ? 'pausa' : 'online';
  if (EQUIPE[EU]) EQUIPE[EU].status = estado.eu;
  const times = await cw('teams').catch(() => []);
  TIMES = Object.fromEntries((times || []).map(t => [t.id, t.name.charAt(0).toUpperCase() + t.name.slice(1)]));
  LABELS = ((await cw('labels').catch(() => null))?.payload || []).map(l => l.title);
  for (const ib of inboxes.payload || []) INBOX[ib.id] = { canal: canalDoInbox(ib), marca: /beyoung/i.test(ib.name) ? 'beyoung' : 'rosa', nome: ib.name, tipo: ib.channel_type };
}

async function carregarConversas() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const todas = [];
  for (let p = 1; p <= 8; p++) {
    const r = await cw(`conversations?status=all&assignee_type=all&page=${p}`);
    const lote = r.data?.payload || [];
    todas.push(...lote);
    if (lote.length < 25) break;
  }
  // menções: o próprio Chatwoot sabe em quais conversas você foi marcada numa nota
  try {
    const r = await cw('conversations?conversation_type=mention&status=all&assignee_type=all&page=1');
    MENCOES = new Set((r.data?.payload || []).map(x => x.id));
    for (const x of r.data?.payload || []) if (!todas.some(y => y.id === x.id)) todas.push(x);
  } catch { /* sem menções: a fila fica vazia */ }
  const antes = new Map(estado.convs.map(c => [c.id, c]));
  estado.convs = todas
    .filter(x => x.status !== 'resolved' || (x.last_activity_at || 0) * 1000 >= hoje.getTime() || x.id === estado.aberta || MENCOES.has(x.id))
    .map(x => convDe(x, antes.get(x.id)));
  // conversa aberta que não veio na lista (resolvida há dias, aberta por um aviso ou contato) continua na tela
  const aberta = antes.get(estado.aberta);
  if (aberta && !estado.convs.some(c => c.id === aberta.id)) estado.convs.push(aberta);
}

async function carregarMensagens(c) {
  const r = await cw(`conversations/${c.id}/messages`);
  c.msgs = (r.payload || []).map(msgDe).filter(m => m.txt);
  c.carregada = true;
}

let atualizando = false;
async function atualizar(forcar) {
  if (!REAL || (atualizando && !forcar)) return;
  atualizando = true;
  try {
    await carregarConversas();
    const c = conv();
    if (c) await carregarMensagens(c);
    render();
  } catch (err) { toast(`Não consegui atualizar: ${err.message}`); }
  finally { atualizando = false; }
}

// ---------- ações ----------
function toast(txt) {
  const t = $('#toast');
  t.textContent = txt; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200);
}
const conv = () => estado.convs.find(x => x.id === estado.aberta);
const nomeDe = id => id === 'ia' ? 'a IA do SAC' : id === EU ? 'você' : pessoa(id).nome;
const avisoPassar = para => para === 'ia' ? 'A IA do SAC voltou a cuidar desta conversa.'
  : para === EU ? 'Conversa assumida. Ela está em Minhas.'
  : para ? `Conversa passada para ${nomeDe(para)}.` : 'A conversa foi para Não atribuídas.';
const telaPequena = () => window.innerWidth <= 980;
const vista = v => { $('#conversas').dataset.view = v; };

function evento(c, txt) { c.msgs.push({ de: 'evento', txt, t: Date.now() }); }

// Roda a ação no Chatwoot (modo real) ou só na memória (demonstração) e redesenha.
async function executar(real, demo, aviso) {
  try {
    if (REAL) { await real(); await atualizar(true); }
    else { demo(); render(); }
    if (aviso) toast(aviso);
    return true;
  } catch (err) { toast(`Não deu certo: ${err.message}`); return false; }
}

const semSugestao = attrs => { const a = { ...attrs }; delete a.sugestao_ia; delete a.sugestao_fonte; return a; };
const semIA = attrs => { const a = semSugestao(attrs); delete a.motivo_ia; return a; };
const mudarStatus = (c, s) => cw(`conversations/${c.id}/toggle_status`, 'POST', { status: s });
const atribuir = (c, id) => cw(`conversations/${c.id}/assignments`, 'POST', { assignee_id: id ? EQUIPE[id].cwId : 0 });
const gravarAttrs = (c, attrs) => cw(`conversations/${c.id}/custom_attributes`, 'POST', { custom_attributes: attrs });

function passar(c, para) {
  estado.menu = false;
  if (c.dono === EU && para !== EU && telaPequena()) { estado.aberta = null; vista('lista'); }
  return executar(async () => {
    if (para === 'ia') {
      await atribuir(c, null);
      await mudarStatus(c, 'pending');
      if (c.attrs?.motivo_ia || c.attrs?.sugestao_ia) await gravarAttrs(c, semIA(c.attrs));
      // voltou para a IA: sai da etiqueta de atendimento (ela põe de novo se escalar outra vez)
      if (c.etiquetas.includes(ETIQUETA_HUMANO)) await cw(`conversations/${c.id}/labels`, 'POST', { labels: c.etiquetas.filter(x => x !== ETIQUETA_HUMANO) });
    } else {
      if (c.dono === 'ia') await mudarStatus(c, 'open');
      await atribuir(c, para || null);
    }
  }, () => {
    c.dono = para || null;
    if (para === 'ia') { c.escalou = null; c.etiquetas = c.etiquetas.filter(x => x !== ETIQUETA_HUMANO); }
    const quem = pessoa(EU).nome;
    evento(c, para === 'ia' ? `${quem} devolveu para a IA` : para === EU ? `${quem} assumiu a conversa` : para ? `${quem} passou para ${pessoa(para).nome}` : `${quem} deixou sem dono`);
  }, avisoPassar(para));
}

function resolver(c) {
  const nome = primeiroNome(c);
  estado.menu = false; estado.aberta = null; vista('lista');
  return executar(async () => { await mudarStatus(c, 'resolved'); if (c.attrs?.motivo_ia || c.attrs?.sugestao_ia) await gravarAttrs(c, semIA(c.attrs)); },
    () => { c.resolvida = true; c.escalou = null; c.naoLidas = 0; evento(c, `${pessoa(EU).nome} resolveu a conversa`); },
    `Conversa com ${nome} resolvida.`);
}

async function enviar(txt, aviso) {
  if (estado.anexo && txt === undefined) return enviarAnexo();
  const c = conv();
  const caixa = $('#texto');
  const doCampo = txt === undefined;
  txt = (txt ?? caixa?.value ?? '').trim();
  if (!c || !txt) return;
  const nota = estado.modo === 'nota';
  if (doCampo && caixa) caixa.value = '';
  const ok = await executar(async () => {
    if (!nota && c.dono !== EU) {
      if (c.dono === 'ia') await mudarStatus(c, 'open');
      await atribuir(c, EU);
    }
    await cw(`conversations/${c.id}/messages`, 'POST', { content: txt, message_type: 'outgoing', private: nota });
    if (!nota && c.rascunho) await gravarAttrs(c, semSugestao(c.attrs));
  }, () => {
    if (nota) c.msgs.push({ de: 'nota', quem: EU, txt, t: Date.now(), novo: true });
    else {
      if (c.dono !== EU) { c.dono = EU; c.escalou = null; evento(c, `${pessoa(EU).nome} assumiu a conversa`); }
      c.msgs.push({ de: 'equipe', quem: EU, txt, t: Date.now(), novo: true });
      c.rascunho = null; c.naoLidas = 0;
    }
  }, aviso);
  // se falhou, devolve o texto para a pessoa não perder o que escreveu
  if (!ok && doCampo && $('#texto')) $('#texto').value = txt;
  $('#texto')?.focus();
}

function mostrarRespostas(filtro) {
  const c = conv(); const alvo = $('#respostas');
  if (!alvo) return;
  if (filtro === null) { alvo.innerHTML = ''; return; }
  const lista = RESPOSTAS.filter(r => !filtro || r.atalho.startsWith(filtro) || r.titulo.toLowerCase().includes(filtro));
  alvo.innerHTML = lista.length ? `<div class="respostas"><div class="titulo">Respostas prontas</div>${lista.map((r, i) => `<button data-resp="${r.atalho}" class="${i === 0 ? 'sel' : ''}"><b>${esc(r.titulo)}</b><span>${esc(r.txt.replace('{nome}', primeiroNome(c)))}</span></button>`).join('')}</div>` : '';
}

function usarResposta(atalho) {
  const r = RESPOSTAS.find(x => x.atalho === atalho), c = conv();
  const t = $('#texto');
  t.value = r.txt.replace('{nome}', primeiroNome(c));
  mostrarRespostas(null); t.focus();
}

// endereço: #/pagina ou #/pagina/sub (ex.: #/comentarios/reels)
function lerHash() {
  const [p, sub] = location.hash.replace(/^#\/?/, '').split('/');
  estado.pagina = p && podeVer(p) ? p : 'conversas';
  estado.sub = estado.pagina === p ? sub || null : null;
}
function irPara(pagina) {
  if (location.hash !== `#/${pagina}`) location.hash = `#/${pagina}`;
  else { lerHash(); mostrarPagina(); }
}
window.addEventListener('hashchange', () => {
  lerHash();
  mostrarPagina();
  if (estado.pagina === 'conversas') render();
});

document.addEventListener('click', e => {
  const ex = e.target.closest('[data-expandir]');
  if (ex) { e.stopPropagation(); estado.expandido[ex.dataset.expandir] = !estado.expandido[ex.dataset.expandir]; renderMenuLateral(); return; }
  const el = e.target.closest('[data-fila],[data-pagina],[data-id],[data-acao],[data-passar],[data-modo],[data-resp],[data-disp],[data-canal],[data-assunto],[data-time],[data-sinal],[data-limpar]');
  if (!el) {
    if (estado.menu) { estado.menu = false; renderChat(); }
    if (estado.menuEu) { estado.menuEu = false; renderMenuLateral(); }
    if ($('#app').classList.contains('menu-aberto') && !e.target.closest('.menu-lateral')) $('#app').classList.remove('menu-aberto');
    return;
  }
  const d = el.dataset;
  if (d.fila) { estado.fila = d.fila; estado.sinal = null; estado.aberta = null; vista('lista'); irPara('conversas'); render(); return; }
  if (d.pagina) { irPara(d.pagina); return; }
  // canal e assunto da lateral: mostram todas as abertas daquele tipo; clicar de novo tira o filtro
  if (d.canal || d.assunto || d.time || d.sinal) {
    const campo = d.canal ? 'canal' : d.assunto ? 'assunto' : d.sinal ? 'sinal' : 'time', valor = d.canal || d.assunto || d.sinal || Number(d.time);
    estado[campo] = estado[campo] === valor ? null : valor;
    if (estado[campo] && estado.fila !== 'resolvidas') estado.fila = 'todas';
    estado.aberta = null; vista('lista'); irPara('conversas'); render(); return;
  }
  if (d.limpar) { estado[d.limpar] = null; render(); return; }
  if (d.id) { abrir(+d.id); return; }
  if (d.passar !== undefined) { passar(conv(), d.passar); return; }
  if (d.modo) { estado.modo = d.modo; const v = $('#texto')?.value; renderChat(); $('#texto').value = v || ''; $('#texto').focus(); return; }
  if (d.resp) { usarResposta(d.resp); return; }
  if (d.disp) {
    const novo = d.disp;
    if (novo === estado.eu) return;
    executar(() => chamar('/api/atendimento/perfil/disponibilidade', 'POST', { availability: novo === 'pausa' ? 'busy' : 'online' }),
      () => {},
      novo === 'pausa' ? 'Você está em pausa. Conversas novas vão para quem está disponível.' : 'Você voltou a receber conversas.')
      .then(ok => { if (!ok) return; estado.eu = novo; if (EQUIPE[EU]) EQUIPE[EU].status = novo; render(); });
    return;
  }

  const c = conv();
  switch (d.acao) {
    case 'menu-lateral': $('#app').classList.toggle('menu-aberto'); e.stopPropagation(); break;
    case 'menu-eu': estado.menuEu = !estado.menuEu; renderMenuLateral(); e.stopPropagation(); break;
    case 'sair': chamar('/api/atendimento/sair', 'POST', {}).finally(() => location.reload()); break;
    case 'trocar-senha': estado.menuEu = false; renderMenuLateral(); if (typeof abrirTrocarSenha === 'function') abrirTrocarSenha(); break;
    case 'assumir': passar(c, EU); break;
    case 'menu': estado.menu = !estado.menu; renderChat(); e.stopPropagation(); break;
    case 'resolver': resolver(c); break;
    case 'time': {
      const tid = Number(el.dataset.timeId);
      estado.menu = false;
      executar(() => cw(`conversations/${c.id}/assignments`, 'POST', { team_id: tid }), () => { c.time = tid; }, `Conversa mandada para o time ${nomeTime(tid)}.`);
      break;
    }
    case 'rosa': estado.menu = false; window.perguntarRosaSobre?.(c); break;
    case 'chamado': estado.menu = false; renderChat(); window.abrirChamadoDaConversa?.(c); break;
    case 'reabrir':
      executar(async () => { await mudarStatus(c, 'open'); await atribuir(c, EU); },
        () => { c.resolvida = false; c.dono = EU; evento(c, `${pessoa(EU).nome} reabriu a conversa`); },
        'Conversa reaberta. Ela está em Minhas.');
      break;
    case 'enviar': enviar(); break;
    case 'anexar': escolherAnexo(); break;
    case 'tirar-anexo': estado.anexo = null; renderChat(); break;
    case 'modelo-enviar': enviarModelo(el); break;
    case 'usar': estado.modo = 'resposta'; enviar(c.rascunho.txt, 'Sugestão da IA enviada.'); break;
    case 'editar': { const t = c.rascunho.txt; c.rascunho = null; estado.modo = 'resposta'; renderChat(); $('#texto').value = t; $('#texto').focus(); break; }
    case 'descartar': executar(() => gravarAttrs(c, semSugestao(c.attrs)), () => { c.rascunho = null; }); break;
    case 'sugerir':
      if (REAL) { toast('A IA do SAC ainda não está ligada. Quando estiver, a sugestão aparece aqui.'); break; }
      c.rascunho = c.rascunho || { txt: `Oi, ${primeiroNome(c)}! Vi aqui a sua mensagem e já estou cuidando disso. Te respondo em instantes com tudo certinho. 🌹`, fonte: 'Base de conhecimento do SAC' };
      renderChat(); break;
    case 'respostas': mostrarRespostas($('#respostas').innerHTML ? null : ''); break;
    case 'ctx':
      if (telaPequena()) vista('ctx');
      else if (window.innerWidth <= 1360) $('#conversas').classList.toggle('ctx-aberto');
      else $('#conversas').classList.toggle('sem-ctx');
      break;
    case 'voltar': estado.aberta = null; vista('lista'); renderLista(); break;
    case 'voltar-chat': vista('chat'); break;
    case 'etiqueta': {
      const t = (prompt('Nome da etiqueta') || '').trim().toLowerCase().replace(/\s+/g, '-');
      if (!t) break;
      const lista = [...new Set([...c.etiquetas, t])];
      executar(() => cw(`conversations/${c.id}/labels`, 'POST', { labels: lista }), () => { c.etiquetas = lista; });
      break;
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'filtro-marca') { estado.marca = e.target.value; render(); }
  if (e.target.id === 'filtro-canal') { estado.canal = e.target.value || null; render(); }
});

async function abrir(id) {
  const c = estado.convs.find(x => x.id === id);
  estado.aberta = id; estado.menu = false; estado.modo = 'resposta';
  vista('chat');
  if (c) c.naoLidas = 0;
  render();
  if (REAL && c) {
    try {
      await carregarMensagens(c);
      cw(`conversations/${c.id}/update_last_seen`, 'POST', {}).catch(() => {});
      if (estado.aberta === id) { renderChat(); renderCtx(); }
    } catch (err) { toast(`Não consegui abrir a conversa: ${err.message}`); }
  }
}

document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === '/' && t.tagName !== 'TEXTAREA' && t.tagName !== 'INPUT' && estado.pagina === 'conversas') { e.preventDefault(); $('#busca').focus(); return; }
  if (e.key === 'Escape') {
    if (typeof fecharGaveta === 'function' && $('#gaveta').innerHTML) { fecharGaveta(); return; }
    estado.menu = false; mostrarRespostas(null); if (t === $('#busca')) t.blur(); renderChat(); return;
  }
  if (t.classList?.contains('conv') && e.key === 'Enter') { abrir(+t.dataset.id); return; }
  if (t.id === 'texto') {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); enviar(); return; }
    const sel = document.querySelector('.respostas button.sel');
    if (sel && e.key === 'Enter') { e.preventDefault(); usarResposta(sel.dataset.resp); }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'busca') { estado.busca = e.target.value; renderLista(); renderMenuLateral(); }
  if (e.target.id === 'texto') {
    const v = e.target.value;
    mostrarRespostas(v.startsWith('/') && !v.includes(' ') ? v.slice(1).toLowerCase() : null);
    e.target.style.height = 'auto'; e.target.style.height = Math.min(200, e.target.scrollHeight) + 'px';
  }
});

function modoDemo() {
  // Simula uma conversa nova chegando para a IA, para mostrar a fila andando.
  setTimeout(() => {
    estado.convs.push({
      id: 12, cliente: 'Larissa Teixeira', ini: 'LT', marca: 'rosa', canal: 'instagram', cidade: 'João Pessoa, PB', insta: '@larit',
      dono: 'ia', escalou: null, naoLidas: 1, etiquetas: [], resumo: 'Perguntou se o Óleo Clareador serve para pele sensível. A IA está respondendo.', pedido: null,
      msgs: [{ de: 'cliente', txt: 'Oi! Tenho pele sensível, posso usar o óleo?', t: Date.now() }],
    });
    render();
  }, 20000);
  setInterval(() => { if (estado.pagina === 'conversas') renderLista(); }, 30000);
  if (estado.pagina === 'conversas' && !telaPequena()) abrir(1); else mostrarPagina(), render();
}

// ---------- entrar ----------
function mostrarLogin(msg) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  if (msg) $('#login-erro').innerHTML = `<div class="erro">${esc(msg)}</div>`;
  $('#login-email').focus();
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  const botao = e.target.querySelector('button');
  botao.disabled = true; botao.textContent = 'Entrando…';
  try {
    await chamar('/api/atendimento/login', 'POST', { email: $('#login-email').value, senha: $('#login-senha').value });
    location.reload();
  } catch (err) {
    $('#login-erro').innerHTML = `<div class="erro">${esc(err.message)}</div>`;
    botao.disabled = false; botao.textContent = 'Entrar';
  }
});

let IA_LIGADA = false;
// times de atendimento (Chatwoot teams): id -> nome
let TIMES = {};
const nomeTime = id => TIMES[id] || '';
let LOGIN_LIVRE = false;

async function iniciar() {
  // o logo volta para a Central dos Agentes só no PC; na VPS ela não existe
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) { const m = $('.marca'); m.removeAttribute('href'); m.removeAttribute('title'); }
  let cfg = null;
  try { cfg = await chamar('/api/atendimento/config'); } catch { /* painel sem o serviço de atendimento */ }
  if (cfg?.configurado) {
    let eu = null;
    try { eu = await chamar('/api/atendimento/eu'); }
    catch (err) { if (err.message === 'login') { mostrarLogin(); return; } }
    if (eu) {
      MEU_NIVEL = eu.nivel;
      if (Array.isArray(eu.permissoes)) MINHAS_PERMS = new Set(eu.permissoes);
      if (eu.assuntos?.length) ASSUNTOS = eu.assuntos;
      IA_LIGADA = !!eu.ia_ligada;
      LOGIN_LIVRE = !!eu.login_livre;
    }
  }
  lerHash();
  MENU_PRONTO = true;
  if (cfg?.configurado) {
    const demo = estado.convs;
    try {
      REAL = true;
      estado.convs = [];
      await carregarBase();
      await carregarConversas();
      // respostas prontas e limite por pessoa vêm de Configurações > Geral
      if (typeof carregarRespostasProntas === 'function') carregarRespostasProntas().then(r => { if (r?.length) RESPOSTAS = r; }).catch(() => {});
      chamar('/api/atendimento/configuracoes/geral').then(g => { const l = g?.distribuicao?.limite; if (l) Object.values(EQUIPE).forEach(p => { p.limite = l; }); }).catch(() => {});
      if (!visiveis().length) estado.fila = ['precisam', 'ia', 'todas'].find(f => visiveis(f).length) || 'mim';
      mostrarPagina();
      const primeira = visiveis()[0];
      if (estado.pagina === 'conversas' && primeira && !telaPequena()) abrir(primeira.id); else render();
      setInterval(() => atualizar(), 6000);
      return;
    } catch (err) {
      REAL = false; estado.convs = demo;
      return foraDoAr(err.message);
    }
  }
  // sem dados de mentira: se o atendimento não responde, a tela diz isso e tenta de novo
  foraDoAr();
}

function foraDoAr(detalhe) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login').innerHTML = `<div class="login-caixa">
    <h1>O atendimento está fora do ar</h1>
    <p class="muted">A tela não conseguiu falar com o sistema de mensagens. As mensagens das clientes continuam chegando e ficam guardadas.</p>
    ${detalhe ? `<p class="muted" style="font-size:12.5px">Detalhe: ${esc(detalhe)}</p>` : ''}
    <button class="btn prim" style="height:42px" onclick="location.reload()">Tentar de novo</button>
    <p class="muted" style="font-size:12.5px">A tela tenta sozinha a cada 15 segundos.</p>
  </div>`;
  setTimeout(() => location.reload(), 15000);
}

// espera os arquivos das seções (modulos/*.js) se registrarem antes de abrir a página do endereço
document.addEventListener('DOMContentLoaded', iniciar);

// ---------- anexos que a equipe manda ----------
const LIMITE_ANEXO = 15 * 1024 * 1024;
function escolherAnexo() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt';
  inp.onchange = () => {
    const arq = inp.files[0];
    if (!arq) return;
    if (arq.size > LIMITE_ANEXO) { toast('Esse arquivo passa de 15 MB. Mande um menor.'); return; }
    estado.anexo = arq; estado.modo = estado.modo === 'nota' ? 'nota' : 'resposta';
    renderChat(); $('#texto')?.focus();
  };
  inp.click();
}

async function enviarAnexo() {
  const c = conv(), arq = estado.anexo, caixa = $('#texto');
  if (!c || !arq) return;
  const texto = (caixa?.value || '').trim(), nota = estado.modo === 'nota';
  const base64 = await new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => falha(new Error('não consegui ler o arquivo'));
    r.readAsDataURL(arq);
  });
  toast('Enviando o arquivo…');
  const ok = await executar(async () => {
    if (!nota && c.dono !== EU) {
      if (c.dono === 'ia') await mudarStatus(c, 'open');
      await atribuir(c, EU);
    }
    await chamar('/api/atendimento/anexo', 'POST', { conversa: c.id, nome: arq.name, tipo: arq.type || 'application/octet-stream', base64, texto, privado: nota });
  }, () => { toast('Na demonstração o arquivo não é enviado.'); }, 'Arquivo enviado.');
  if (ok) { estado.anexo = null; if (caixa) caixa.value = ''; renderChat(); }
}

// ---------- WhatsApp depois de 24 h: só modelo aprovado ----------
const MODELOS = {}; // inbox -> [{ name, language, category, corpo, params }]
async function carregarModelos(inbox) {
  if (MODELOS[inbox]) return MODELOS[inbox];
  const ib = await cw(`inboxes/${inbox}`).catch(() => ({}));
  MODELOS[inbox] = (ib.message_templates || []).filter(t => String(t.status).toLowerCase() === 'approved').map(t => {
    const corpo = (t.components || []).find(x => x.type === 'BODY')?.text || '';
    return { name: t.name, language: t.language, category: t.category, corpo, params: [...new Set(corpo.match(/\{\{\d+\}\}/g) || [])].map(x => x.replace(/\D/g, '')) };
  });
  return MODELOS[inbox];
}

function janelaFechadaHtml(c) {
  const whats = c.canal === 'whatsapp';
  const lista = MODELOS[c.inbox];
  if (whats && !lista) carregarModelos(c.inbox).then(() => { if (conv()?.id === c.id) renderChat(); });
  const modelos = lista || [];
  const escolhido = modelos.find(m => m.name === estado.modelo) || modelos[0];
  const campos = escolhido ? escolhido.params.map((n, i) => `<div class="campo"><label for="mp-${n}">Campo ${n}</label><input id="mp-${n}" data-param="${n}" value="${i === 0 ? esc(primeiroNome(c)) : ''}"></div>`).join('') : '';
  return `<div class="composer"><div class="janela">
      <p><b>Faz mais de 24 horas que ${esc(primeiroNome(c))} escreveu.</b> ${whats
        ? 'No WhatsApp, agora a Meta só deixa mandar um modelo de mensagem aprovado. Quando ela responder, a conversa volta ao normal.'
        : 'Neste canal só dá para responder quando a cliente escrever de novo.'}</p>
      ${whats ? (modelos.length ? `
        <div class="campo"><label for="mp-modelo">Modelo</label><select id="mp-modelo">${modelos.map(m => `<option value="${esc(m.name)}" ${m === escolhido ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        <div class="janela-previa">${esc(escolhido.corpo)}</div>${campos}
        <div class="janela-pe"><button class="btn fantasma peq" data-modo="nota">Escrever nota para a equipe</button><button class="btn prim peq" data-acao="modelo-enviar">Enviar modelo</button></div>`
        : `<p class="muted">Ainda não tem nenhum modelo aprovado. Quem cuida do WhatsApp cria no Gerenciador do WhatsApp da Meta (Modelos de mensagem), por exemplo: "Oi, {{1}}! Vimos sua mensagem e queremos continuar seu atendimento. Pode responder aqui?". Depois da aprovação, ele aparece aqui.</p>
        <div class="janela-pe"><button class="btn peq" data-modo="nota">Escrever nota para a equipe</button></div>`)
      : '<div class="janela-pe"><button class="btn peq" data-modo="nota">Escrever nota para a equipe</button></div>'}
    </div></div>`;
}

async function enviarModelo(botao) {
  const c = conv();
  const m = (MODELOS[c.inbox] || []).find(x => x.name === ($('#mp-modelo')?.value)) ;
  if (!m) return;
  const valores = {};
  for (const n of m.params) {
    const v = (document.querySelector(`[data-param="${n}"]`)?.value || '').trim();
    if (!v) { toast(`Preencha o campo ${n}.`); return; }
    valores[n] = v;
  }
  const texto = m.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[n] || '');
  botao.disabled = true;
  await executar(async () => {
    if (c.dono !== EU) { if (c.dono === 'ia') await mudarStatus(c, 'open'); await atribuir(c, EU); }
    await cw(`conversations/${c.id}/messages`, 'POST', { content: texto, message_type: 'outgoing', template_params: { name: m.name, category: m.category, language: m.language, processed_params: { body: valores } } });
  }, () => {}, 'Modelo enviado.');
  botao.disabled = false;
}

document.addEventListener('change', e => {
  if (e.target.id === 'mp-modelo') { estado.modelo = e.target.value; renderChat(); }
});
