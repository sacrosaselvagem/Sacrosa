// Configurações > Geral: horário de atendimento, distribuição de conversas, nome das caixas e login.
// Guarda em 00_CORE/Configuration/atendimento-geral.json (a IA e a página Equipe leem daqui) e aplica no Chatwoot.
//   GET  /configuracoes/geral            -> configuração + caixas (sem nenhum segredo); qualquer nível logado
//   POST /configuracoes/geral            -> { horario?, distribuicao?, roteamento? } (só a dona)
//   POST /configuracoes/caixas/:id       -> { nome } renomeia a caixa no Chatwoot (só a dona)
//   POST /configuracoes/login            -> { ligado } liga/desliga o login obrigatório (só a dona)
import path from 'node:path';
import fs from 'node:fs';

const FUSO = 'America/Recife';
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const PADRAO = {
  horario: {
    dias: DIAS.map((_, dia) => ({ dia, fechado: dia === 0 || dia === 6, abre: '09:00', fecha: '18:00' })),
    mensagem_fora: '',
    fuso: FUSO,
  },
  distribuicao: { limite: 8, automatica: true },
};

const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const minutos = v => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
const horaTxt = v => { const [h, m] = v.split(':').map(Number); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };

// "segunda a sexta, das 9h às 18h; sábado, das 9h às 13h; domingo, fechado"
export function textoHorario(dias) {
  const ordem = [1, 2, 3, 4, 5, 6, 0].map(i => dias.find(d => d.dia === i));
  const chave = d => d.fechado ? 'fechado' : `das ${horaTxt(d.abre)} às ${horaTxt(d.fecha)}`;
  const grupos = [];
  for (const d of ordem) {
    const g = grupos.at(-1);
    if (g && g.chave === chave(d)) g.dias.push(d.dia); else grupos.push({ chave: chave(d), dias: [d.dia] });
  }
  return grupos.map(g => {
    const nomes = g.dias.length === 1 ? DIAS[g.dias[0]] : g.dias.length === 2 ? `${DIAS[g.dias[0]]} e ${DIAS[g.dias[1]]}` : `${DIAS[g.dias[0]]} a ${DIAS[g.dias.at(-1)]}`;
    return `${nomes}, ${g.chave}`;
  }).join('; ');
}

export function textoParaIA(horario) {
  const abertos = horario.dias.filter(d => !d.fechado);
  if (!abertos.length) return 'A equipe de atendimento não tem horário definido no momento. Diga que uma pessoa da equipe responde assim que possível.';
  return `Horário de atendimento da equipe (horário de Brasília/Recife): ${textoHorario(horario.dias)}. ` +
    'A IA responde a qualquer hora. Quando a cliente precisar de uma pessoa fora desse horário, diga que a equipe continua a conversa ' +
    'no próximo horário de atendimento e informe qual é (por exemplo: "a equipe volta amanhã às 9h").';
}

function validarHorario(h) {
  if (!h || !Array.isArray(h.dias) || h.dias.length !== 7) return 'Mande os 7 dias da semana.';
  for (const d of h.dias) {
    if (!(d.dia >= 0 && d.dia <= 6)) return 'Dia da semana inválido.';
    if (d.fechado) continue;
    if (!hhmm(d.abre) || !hhmm(d.fecha)) return `Confira os horários de ${DIAS[d.dia]}.`;
    if (minutos(d.fecha) <= minutos(d.abre)) return `Em ${DIAS[d.dia]}, o horário de fechar precisa ser depois do de abrir.`;
  }
  if (new Set(h.dias.map(d => d.dia)).size !== 7) return 'Mande cada dia da semana uma vez só.';
  return null;
}

const MARCAS = { rosa: 'Rosa Selvagem', beyoung: 'Beyoung' };
const marcaDe = nome => /beyoung/i.test(nome || '') ? 'beyoung' : 'rosa';
const caixaLimpa = ib => ({
  id: ib.id, nome: ib.name, tipo: ib.channel_type, marca: marcaDe(ib.name), auto: !!ib.enable_auto_assignment,
  horario_ligado: !!ib.working_hours_enabled, fuso: ib.timezone || null,
});

export default async function ({ p, m, req, res, s, c, cw, lerCorpo, responder, souDona, pode, RAIZ, lerJson, gravarJson }) {
  if (!p.startsWith('/configuracoes')) return false;
  const ARQ = path.join(RAIZ, '00_CORE/Configuration/atendimento-geral.json');
  const CFG = path.join(RAIZ, '00_CORE/Configuration/chatwoot.json');
  const ler = () => {
    const g = lerJson(ARQ, null) || {};
    return {
      ...g,
      horario: { ...PADRAO.horario, ...(g.horario || {}) },
      distribuicao: { ...PADRAO.distribuicao, ...(g.distribuicao || {}) },
      salvo: fs.existsSync(ARQ),
    };
  };
  const token = s.token;

  if (p === '/configuracoes/geral' && m === 'GET') {
    const g = ler();
    const caixas = ((await cw('inboxes', { token })).payload || []).map(caixaLimpa).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return responder(res, 200, {
      ...g, texto_ia: textoParaIA(g.horario), texto_horario: textoHorario(g.horario.dias),
      login_obrigatorio: c.login_obrigatorio === true, login_livre: !!s.livre, marcas: MARCAS, caixas, pode_mudar: pode('configuracoes'),
    });
  }

  if (m !== 'GET' && !pode('configuracoes')) return responder(res, 403, { erro: 'Seu acesso não inclui mudar as configurações.' });
  // ligar ou desligar o login é sempre só da dona
  if (p === '/configuracoes/login' && !souDona) return responder(res, 403, { erro: 'Só a dona liga ou desliga o login.' });

  if (p === '/configuracoes/geral' && m === 'POST') {
    const corpo = await lerCorpo(req);
    const g = ler();
    const caixas = (await cw('inboxes', { token })).payload || [];
    const falhas = [];

    if (corpo.horario) {
      const h = {
        dias: (corpo.horario.dias || []).map(d => ({ dia: Number(d.dia), fechado: !!d.fechado, abre: String(d.abre || '09:00'), fecha: String(d.fecha || '18:00') })).sort((a, b) => a.dia - b.dia),
        mensagem_fora: String(corpo.horario.mensagem_fora || '').trim().slice(0, 600),
        fuso: FUSO,
      };
      const erro = validarHorario(h);
      if (erro) return responder(res, 400, { erro });
      const working_hours = h.dias.map(d => d.fechado
        ? { day_of_week: d.dia, closed_all_day: true, open_all_day: false, open_hour: null, open_minutes: null, close_hour: null, close_minutes: null }
        : { day_of_week: d.dia, closed_all_day: false, open_all_day: false, open_hour: +d.abre.slice(0, 2), open_minutes: +d.abre.slice(3), close_hour: +d.fecha.slice(0, 2), close_minutes: +d.fecha.slice(3) });
      for (const ib of caixas) {
        try {
          await cw(`inboxes/${ib.id}`, { method: 'PATCH', token, body: { working_hours_enabled: true, out_of_office_message: h.mensagem_fora || null, timezone: FUSO, working_hours } });
          // o Chatwoot ignora em silêncio um dia que não passa na validação dele: confere
          const novo = await cw(`inboxes/${ib.id}`, { token });
          const ok = working_hours.every(w => {
            const x = (novo.working_hours || []).find(y => y.day_of_week === w.day_of_week);
            return x && !!x.closed_all_day === w.closed_all_day && (w.closed_all_day || (x.open_hour === w.open_hour && x.open_minutes === w.open_minutes && x.close_hour === w.close_hour && x.close_minutes === w.close_minutes));
          });
          if (!ok) falhas.push(ib.name);
        } catch { falhas.push(ib.name); }
      }
      g.horario = h;
    }

    if (corpo.distribuicao) {
      const limite = Math.round(Number(corpo.distribuicao.limite ?? g.distribuicao.limite));
      if (!(limite >= 1 && limite <= 50)) return responder(res, 400, { erro: 'O limite precisa ser um número de 1 a 50.' });
      const automatica = corpo.distribuicao.automatica === undefined ? g.distribuicao.automatica : !!corpo.distribuicao.automatica;
      for (const ib of caixas) {
        if (!!ib.enable_auto_assignment === automatica) continue;
        try { await cw(`inboxes/${ib.id}`, { method: 'PATCH', token, body: { enable_auto_assignment: automatica } }); }
        catch { falhas.push(ib.name); }
      }
      g.distribuicao = { limite, automatica };
    }

    if (corpo.roteamento) {
      // assunto da IA -> id do time no Chatwoot (lido pelo ia.mjs quando passa a conversa para a equipe)
      const times = new Set(((await cw('teams', { token })) || []).map(t => t.id));
      const rota = {};
      for (const [assunto, time] of Object.entries(corpo.roteamento)) {
        if (!/^[a-z-]{2,40}$/.test(assunto)) continue;
        if (!times.has(Number(time))) return responder(res, 400, { erro: 'Esse time não existe mais. Atualize a página.' });
        rota[assunto] = Number(time);
      }
      g.roteamento = rota;
    }

    const { salvo, ...guardar } = g;
    guardar.texto_ia = textoParaIA(g.horario);
    guardar.atualizado_em = new Date().toISOString();
    guardar.atualizado_por = s.nome || null;
    gravarJson(ARQ, guardar);
    return responder(res, 200, { ok: true, falhas: [...new Set(falhas)], texto_ia: guardar.texto_ia, texto_horario: textoHorario(g.horario.dias) });
  }

  let mm;
  if ((mm = p.match(/^\/configuracoes\/caixas\/(\d+)$/)) && m === 'POST') {
    const nome = String((await lerCorpo(req)).nome || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 3 || nome.length > 60) return responder(res, 400, { erro: 'Escreva um nome de 3 a 60 letras.' });
    const ib = await cw(`inboxes/${mm[1]}`, { method: 'PATCH', token, body: { name: nome } });
    return responder(res, 200, caixaLimpa(ib));
  }

  if (p === '/configuracoes/login' && m === 'POST') {
    const { ligado } = await lerCorpo(req);
    const conf = lerJson(CFG, null);
    if (!conf) return responder(res, 500, { erro: 'Não achei a configuração do atendimento.' });
    conf.login_obrigatorio = ligado === true;
    gravarJson(CFG, conf);
    return responder(res, 200, { login_obrigatorio: conf.login_obrigatorio });
  }

  return responder(res, 404, { erro: 'rota desconhecida' });
}
