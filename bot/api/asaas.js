// Emissão de nota fiscal (NFS-e) + cobrança (boleto/PIX) via Asaas (https://www.asaas.com).
// Substitui a Notaas: a Asaas emite nota E boleto na mesma conta/API.
// A CHAVE SECRETA fica SÓ aqui no backend (env vars), nunca no index.html.
//
// Ações (via query ?action=...):
//   POST /api/asaas?action=emitir&ambiente=sandbox|producao
//        body: { tomador:{nome,cnpj,email,telefone?}, servico:{codigo?,descricao},
//                valores:{total,aliquotaIss?,retemIss?}, vencimento?:'YYYY-MM-DD',
//                semCobranca?:true, semNota?:true }
//        -> cria (ou reaproveita) o cliente, cria a cobrança (boleto+PIX) e a nota fiscal
//           vinculada a ela. Devolve {customerId,paymentId,invoiceId,boletoUrl,invoiceUrl,status}
//        Com semCobranca:true, NÃO cria boleto/cobrança nenhuma — só a nota fiscal, vinculada
//        direto ao cliente (caso do Léo Cosméticos: cliente paga por PIX fora do sistema).
//        Com semNota:true, NÃO cria nota fiscal nenhuma — só o boleto+PIX (caso de cliente que
//        não quer nota, ex.: Mercadão — recibo à parte cobre isso, se precisar). Os dois nunca
//        juntos (não sobraria nada pra emitir).
//   GET  /api/asaas?action=status&paymentId=...&invoiceId=...&ambiente=sandbox|producao
//        -> status atual do pagamento e da nota (pdf/xml quando prontos). paymentId é opcional
//           (não existe quando a nota foi emitida com semCobranca:true).
//
// "ambiente" escolhe qual chave/URL usar — sandbox pra testar sem gerar nota/boleto real,
// produção pra emitir de verdade. Nunca misturar chave de um ambiente com URL do outro.

const BASE = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

function getConfig(ambiente) {
  const isSandbox = ambiente === "sandbox";
  const key = isSandbox ? process.env.ASAAS_API_KEY_SANDBOX : process.env.ASAAS_API_KEY;
  if (!key) {
    throw new Error(
      isSandbox ? "Falta ASAAS_API_KEY_SANDBOX nas variáveis de ambiente." : "Falta ASAAS_API_KEY nas variáveis de ambiente."
    );
  }
  return { base: BASE[isSandbox ? "sandbox" : "producao"], key };
}

async function asaas(ambiente, method, path, body) {
  const { base, key } = getConfig(ambiente);
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", access_token: key, "User-Agent": "mgb-financeiro" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.errors && j.errors[0] && j.errors[0].description) || j.message || `Asaas respondeu ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    err.raw = j;
    throw err;
  }
  return j;
}

// encontra o cliente pelo CNPJ/CPF; cria se não existir
async function acharOuCriarCliente(ambiente, tomador) {
  const doc = (tomador.cnpj || "").replace(/\D/g, "");
  if (doc) {
    const j = await asaas(ambiente, "GET", `/customers?cpfCnpj=${doc}`);
    if (j.data && j.data.length) return j.data[0].id;
  }
  const novo = await asaas(ambiente, "POST", "/customers", {
    name: tomador.nome,
    cpfCnpj: doc || undefined,
    email: tomador.email || undefined,
    phone: tomador.telefone || undefined,
    externalReference: doc || tomador.nome,
  });
  return novo.id;
}

export default async function handler(req, res) {
  // CORS: o index.html (outra origem) precisa chamar este endpoint.
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action || "";
  const ambiente = (req.query.ambiente || req.body?.ambiente || "producao") === "sandbox" ? "sandbox" : "producao";

  try {
    // ── cria cliente + cobrança (boleto/PIX) + nota fiscal vinculada, numa tacada ──
    if (action === "emitir") {
      if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
      const { tomador, servico, valores, vencimento, semCobranca, semNota } = req.body || {};
      if (!tomador?.nome || !servico?.descricao || !(valores?.total > 0)) {
        return res.status(400).json({ error: "Faltam dados: tomador.nome, servico.descricao ou valores.total." });
      }
      if (semCobranca && semNota) {
        return res.status(400).json({ error: "semCobranca e semNota não podem ser true ao mesmo tempo — não sobraria nada pra emitir." });
      }

      const customerId = await acharOuCriarCliente(ambiente, tomador);

      let payment = null;
      if (!semCobranca) {
        const dueDate = vencimento || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10); // padrão: 3 dias
        payment = await asaas(ambiente, "POST", "/payments", {
          customer: customerId,
          billingType: "BOLETO",
          value: valores.total,
          dueDate,
          description: servico.descricao,
          externalReference: "mgb-" + Date.now(),
        });
      }

      let invoice = null,
        invoiceErro = null;
      if (!semNota) {
        try {
          const invoiceBody = {
            serviceDescription: servico.descricao,
            value: valores.total,
            deductions: 0,
            effectiveDate: new Date().toISOString().slice(0, 10),
            municipalServiceCode: servico.codigo || undefined,
            taxes: valores.aliquotaIss ? { iss: valores.aliquotaIss, retainIss: !!valores.retemIss } : undefined,
          };
          if (payment) invoiceBody.payment = payment.id;
          else invoiceBody.customer = customerId; // sem cobrança: nota vinculada direto ao cliente
          invoice = await asaas(ambiente, "POST", "/invoices", invoiceBody);
        } catch (e) {
          // a cobrança já foi criada mesmo se a nota falhar (ex: cadastro fiscal da conta incompleto) —
          // devolve o que deu certo e o erro específico da nota, em vez de jogar tudo fora.
          invoiceErro = e.message;
        }
      }

      let status;
      if (invoice) status = invoice.status;
      else if (semNota) status = "boleto_sem_nota"; // só boleto, de propósito — não é "pendente"
      else status = payment ? "boleto_ok_nota_pendente" : "nota_pendente";

      return res.status(202).json({
        ambiente,
        customerId,
        paymentId: payment?.id || null,
        boletoUrl: payment?.bankSlipUrl || null,
        invoiceUrl: payment?.invoiceUrl || null,
        invoiceId: invoice?.id || null,
        status,
        invoiceErro,
      });
    }

    // ── consulta status do pagamento + da nota ──
    if (action === "status") {
      const { paymentId, invoiceId } = req.query;
      if (!paymentId && !invoiceId) return res.status(400).json({ error: "Informe paymentId e/ou invoiceId." });
      const out = { ambiente };
      if (paymentId) {
        const p = await asaas(ambiente, "GET", `/payments/${encodeURIComponent(paymentId)}`);
        out.paymentStatus = p.status;
        out.boletoUrl = p.bankSlipUrl || null;
        out.invoiceUrl = p.invoiceUrl || null;
      }
      if (invoiceId) {
        const n = await asaas(ambiente, "GET", `/invoices/${encodeURIComponent(invoiceId)}`);
        out.status = n.status;
        out.pdfUrl = n.pdfUrl || null;
        out.xmlUrl = n.xmlUrl || null;
        out.numero = n.number || null;
        out.erro = n.status === "ERROR" ? n.observations || "Erro na emissão" : null;
      }
      return res.status(200).json(out);
    }

    return res.status(400).json({ error: `Ação desconhecida: '${action}'. Use emitir | status.` });
  } catch (e) {
    console.error("asaas.js:", e);
    return res.status(e.status || 500).json({ error: String(e.message || e) });
  }
}
