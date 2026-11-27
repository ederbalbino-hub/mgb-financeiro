// Estado do hub (carregar e salvar), atrás do login.
//
//   GET  /api/estado            -> o estado inteiro (JSON), como o Apps Script guarda
//   POST /api/estado?v=<_v lido> body: estado inteiro (texto JSON)
//        -> {ok:true, v}  ·  409 {conflito:true, v} se alguém salvou depois da sua leitura
//
// Antes o navegador falava direto com o Apps Script, cuja URL estava no index.html público:
// qualquer pessoa lia e sobrescrevia todos os dados da MGB. Agora só usuário logado chega aqui,
// e os dados ficam no Supabase (lib/estado.js), acessível só com a chave secreta do servidor.

import { cors, exigirLogin } from "../lib/http.js";
import { lerEstado, gravarEstado, ErroEstado } from "../lib/estado.js";
import { filtrarLeitura, mesclarGravacao, veTudo } from "../lib/visibilidade.js";
import { avisarFechamentos } from "../lib/notificacao.js";
import { registrarLog, limparAcoes, compararEstados } from "../lib/log.js";

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,POST,OPTIONS", env })) return;
  const usuario = await exigirLogin(req, res, null, env, fetchFn);
  if (!usuario) return;

  try {
    if (req.method === "GET") {
      const { texto, estado } = await lerEstado(env, fetchFn);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      // Cada papel recebe só as seções das telas dele (lib/visibilidade.js).
      return res.status(200).send(veTudo(usuario.papel) ? texto : JSON.stringify(filtrarLeitura(estado, usuario.papel)));
    }

    if (req.method === "POST") {
      const bruto = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      let obj;
      try {
        obj = JSON.parse(bruto);
      } catch {
        return res.status(400).json({ error: "Corpo não é JSON." });
      }
      // Resumo das ações que o navegador mandou (log.js do front): vai só para o registro, nunca para o estado.
      const acoes = limparAcoes(obj._acoes);
      delete obj._acoes;
      // Quem salvou vem do login, não do navegador (e fica também no histórico do banco).
      obj._salvoPor = usuario.nome;
      obj._salvoLogin = usuario.login;
      obj._salvoEm = new Date().toISOString();
      const v = req.query?.v;
      const versaoLida = v === undefined || v === "" ? undefined : Number(v);
      // Parte sempre do que está no banco e troca só as seções que o papel pode gravar
      // (lib/visibilidade.js). Seção que não veio no envio fica como está.
      const atual = await lerEstado(env, fetchFn);
      if (versaoLida !== undefined && versaoLida !== atual.versao) {
        return res.status(409).json({ error: "Outra pessoa salvou antes. Recarregando para mesclar.", conflito: true, v: atual.versao });
      }
      const { doc, mudou } = mesclarGravacao(atual.estado, obj, usuario.papel);
      if (!mudou) {
        if (acoes.length) await registrarLog(env, fetchFn, { usuario, origem: "estado", versao: atual.versao, acao: acoes.join(" · "), detalhe: { acoes, semMudanca: true } });
        return res.status(200).json({ ok: true, v: atual.versao, semMudanca: true });
      }
      const r = await gravarEstado(doc, atual.versao, usuario, env, fetchFn);
      console.log(`estado: salvo por ${usuario.login} (v${r.versao})`);
      // Registro de ações (hub_log): 1 linha por salvamento, com as seções que mudaram. Nunca derruba o salvar.
      const { secoes, detalhe } = compararEstados(atual.estado, doc);
      await registrarLog(env, fetchFn, {
        usuario, origem: "estado", versao: r.versao, secoes,
        acao: acoes.length ? acoes.join(" · ") : "Salvou: " + (secoes.join(", ") || "sem mudança visível"),
        detalhe: { ...detalhe, ...(acoes.length ? { acoes } : {}) },
      });
      await avisarFechamentos(atual.estado.leads, doc.leads, usuario.nome, env, fetchFn);
      return res.status(200).json({ ok: true, v: r.versao });
    }

    return res.status(405).json({ error: "Use GET ou POST." });
  } catch (e) {
    const status = e instanceof ErroEstado ? e.status : 500;
    if (status >= 500) console.error("estado:", e.message || e);
    return res.status(status).json({ error: String(e.message || e), ...(e.conflito ? { conflito: true, v: e.versao } : {}) });
  }
}
