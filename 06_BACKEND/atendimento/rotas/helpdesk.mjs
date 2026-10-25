// Helpdesk: chamados para casos que levam dias (troca, devolução, reembolso, defeito, extravio).
// Guarda tudo em 07_LOGS/atendimento/chamados.json (uma lista). Gravação atômica: arquivo temporário + rename.
//   GET   /helpdesk/chamados        lista
//   POST  /helpdesk/chamados        abre um chamado (protocolo RS-0001…)
//   PATCH /helpdesk/chamados/:id    muda campos e/ou acrescenta uma nota; o histórico é escrito aqui
import fs from 'node:fs';
import path from 'node:path';
import { ASSUNTOS } from '../ia.mjs';

const STATUS = { novo: 'Novo', andamento: 'Em andamento', esperando: 'Esperando cliente', resolvido: 'Resolvido' };
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
// dias úteis de prazo por assunto (o resto: 5)
const PRAZO_DIAS = { reembolso: 3, devolucao: 3, troca: 3, defeito: 2, 'problema-no-pedido': 2 };

const nomeAssunto = id => ASSUNTOS.find(a => a.id === id)?.nome || String(id || 'Sem assunto');
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const dataOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const fmtData = v => (dataOk(v) ? v.split('-').reverse().join('/') : 'sem prazo');

function somarDiasUteis(dias, de = new Date()) {
  const d = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  let n = 0;
  while (n < dias) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ler(arq) {
  try { const v = JSON.parse(fs.readFileSync(arq, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}
function gravar(arq, lista) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, arq);
}

// limpa e confere os campos que vêm da tela
function campos(corpo) {
  const v = {};
  if ('titulo' in corpo) v.titulo = texto(corpo.titulo, 140);
  if ('cliente' in corpo) v.cliente = texto(corpo.cliente, 120);
  if ('conversa' in corpo) v.conversa = Number(corpo.conversa) > 0 ? Number(corpo.conversa) : null;
  if ('assunto' in corpo) v.assunto = texto(corpo.assunto, 40) || 'outro';
  if ('prioridade' in corpo) v.prioridade = PRIORIDADES[corpo.prioridade] ? corpo.prioridade : 'normal';
  if ('responsavel' in corpo) {
    v.responsavel = texto(corpo.responsavel, 40) || null;
    v.responsavel_nome = v.responsavel ? texto(corpo.responsavel_nome, 80) || 'Alguém da equipe' : '';
  }
  if ('prazo' in corpo) v.prazo = dataOk(corpo.prazo) ? corpo.prazo : null;
  if ('status' in corpo) v.status = STATUS[corpo.status] ? corpo.status : 'novo';
  return v;
}

// frase do histórico para cada campo que mudou
function mudanca(k, antes, depois, ch) {
  switch (k) {
    case 'status': return `Moveu de "${STATUS[antes] || antes}" para "${STATUS[depois]}"`;
    case 'prioridade': return `Mudou a prioridade para ${PRIORIDADES[depois]}`;
    case 'assunto': return `Mudou o assunto para ${nomeAssunto(depois)}`;
    case 'responsavel': return depois ? `Passou para ${ch.responsavel_nome}` : 'Deixou sem responsável';
    case 'prazo': return `Mudou o prazo para ${fmtData(depois)}`;
    case 'titulo': return 'Mudou o título';
    case 'cliente': return `Mudou a cliente para ${depois || '(sem nome)'}`;
    case 'conversa': return depois ? `Ligou à conversa ${depois}` : 'Tirou a conversa ligada';
    default: return null;
  }
}

export default async function ({ p, m, req, res, s, lerCorpo, responder, RAIZ }) {
  if (!p.startsWith('/helpdesk')) return false;
  const ARQ = path.join(RAIZ, '07_LOGS/atendimento/chamados.json');
  const quem = s.nome || 'Alguém da equipe';
  const agora = Date.now();

  if (p === '/helpdesk/chamados' && m === 'GET') {
    responder(res, 200, ler(ARQ));
    return true;
  }

  if (p === '/helpdesk/chamados' && m === 'POST') {
    const corpo = await lerCorpo(req);
    const v = campos({ prioridade: 'normal', status: 'novo', responsavel: null, conversa: null, assunto: 'outro', ...corpo });
    if (!v.titulo) { responder(res, 400, { erro: 'Escreva um título curto para o chamado.' }); return true; }
    const lista = ler(ARQ);
    const maior = lista.reduce((a, c) => Math.max(a, Number(String(c.protocolo || '').replace(/\D/g, '')) || 0), 0);
    const ch = {
      id: `c${agora.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      protocolo: `RS-${String(maior + 1).padStart(4, '0')}`,
      titulo: v.titulo, cliente: v.cliente || '', conversa: v.conversa, assunto: v.assunto,
      prioridade: v.prioridade, responsavel: v.responsavel, responsavel_nome: v.responsavel_nome || '',
      prazo: v.prazo || somarDiasUteis(PRAZO_DIAS[v.assunto] || 5), status: v.status,
      criado: agora, atualizado: agora, criado_por: quem, resolvido_em: v.status === 'resolvido' ? agora : null,
      historico: [{ t: agora, quem, txt: 'Abriu o chamado' }],
      notas: [],
    };
    const nota = texto(corpo.nota, 2000);
    if (nota) ch.notas.push({ t: agora, quem, txt: nota });
    lista.push(ch);
    gravar(ARQ, lista);
    responder(res, 200, ch);
    return true;
  }

  const mm = p.match(/^\/helpdesk\/chamados\/([\w-]{1,40})$/);
  if (mm && m === 'PATCH') {
    const corpo = await lerCorpo(req);
    const lista = ler(ARQ);
    const ch = lista.find(c => c.id === mm[1]);
    if (!ch) { responder(res, 404, { erro: 'Este chamado não existe mais. Atualize a página.' }); return true; }
    const v = campos(corpo);
    if ('titulo' in v && !v.titulo) { responder(res, 400, { erro: 'O título não pode ficar vazio.' }); return true; }
    for (const [k, novo] of Object.entries(v)) {
      if (k === 'responsavel_nome') continue;
      if ((ch[k] ?? null) === (novo ?? null)) continue;
      const antes = ch[k];
      ch[k] = novo;
      if (k === 'responsavel') ch.responsavel_nome = v.responsavel_nome;
      const txt = mudanca(k, antes, novo, ch);
      if (txt) ch.historico.push({ t: agora, quem, txt });
      if (k === 'status') ch.resolvido_em = novo === 'resolvido' ? agora : null;
    }
    const nota = texto(corpo.nota, 2000);
    if (nota) { ch.notas.push({ t: agora, quem, txt: nota }); ch.historico.push({ t: agora, quem, txt: 'Escreveu uma nota' }); }
    ch.atualizado = agora;
    gravar(ARQ, lista);
    responder(res, 200, ch);
    return true;
  }

  responder(res, 404, { erro: 'rota desconhecida' });
  return true;
}
