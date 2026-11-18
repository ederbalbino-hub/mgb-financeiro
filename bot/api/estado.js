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

export default async function handler(req, res, { env = process.env, fetchFn = fetch } = {}) {
  if (cors(req, res, { metodos: "GET,POST,OPTIONS", env })) return;
  const usuario = exigirLogin(req, res, null, env);
  if (!usuario) return;

  try {
    if (req.method === "GET") {
      const { texto } = await lerEstado(env, fetchFn);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).send(texto);
    }

    if (req.method === "POST") {
      const bruto = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      let obj;
      try {
        obj = JSON.parse(bruto);
      } catch {
        return res.status(400).json({ error: "Corpo não é JSON." });
      }
      // Quem salvou vem do login, não do navegador (e fica também no histórico do banco).
      obj._salvoPor = usuario.nome;
      obj._salvoLogin = usuario.login;
      obj._salvoEm = new Date().toISOString();
      const v = req.query?.v;
      const r = await gravarEstado(obj, v === undefined || v === "" ? undefined : Number(v), usuario, env, fetchFn);
      console.log(`estado: salvo por ${usuario.login} (v${r.versao})`);
      return res.status(200).json({ ok: true, v: r.versao });
    }

    return res.status(405).json({ error: "Use GET ou POST." });
  } catch (e) {
    const status = e instanceof ErroEstado ? e.status : 500;
    if (status >= 500) console.error("estado:", e.message || e);
    return res.status(status).json({ error: String(e.message || e), ...(e.conflito ? { conflito: true, v: e.versao } : {}) });
  }
}
