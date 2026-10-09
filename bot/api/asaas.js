// Emissão de nota fiscal (NFS-e) + cobrança (boleto/PIX) via Asaas (https://www.asaas.com).
// Substitui a Notaas: a Asaas emite nota E boleto na mesma conta/API.
// A CHAVE SECRETA fica SÓ aqui no backend (env vars), nunca no index.html.
//
// Ações (via query ?action=...):
//   POST /api/asaas?action=emitir&ambiente=sandbox|producao
//        body: { tomador:{nome,cnpj,email,telefone?}, servico:{codigo?,descricao},
//                valores:{total,aliquotaIss?,retemIss?}, vencimento?:'YYYY-MM-DD' (padrão: próximo dia 15),
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

// Antes de criar QUALQUER cobrança, confere se a conta tem as informações fiscais cadastradas — senão a nota falha
// depois que o boleto já foi criado (e um 2º clique geraria outro boleto). Só bloqueia quando o Asaas diz claramente
// que não há cadastro (404 / mensagem fiscal); qualquer outra falha na consulta não impede a emissão.
async function verificarInfoFiscal(ambiente) {
  try {
    await asaas(ambiente, "GET", "/fiscalInfo");
  } catch (e) {
    if (e.status === 404 || /fiscal/i.test(e.message || "")) {
      const err = new Error(`A conta do Asaas (${ambiente}) ainda não tem as informações fiscais cadastradas. Cadastre em Minha conta → Informações fiscais e tente de novo. Nenhuma cobrança foi criada.`);
      err.status = 400;
      throw err;
    }
  }
}

// Idempotência: com `referencia` (ex.: "arel-radio-2026-10") o mesmo cliente/mês nunca gera 2 boletos nem 2 notas,
// nem se a tela for recarregada ou o botão apertado de novo. Só reaproveita se a referência BATER exatamente.
async function acharPagamentoPorReferencia(ambiente, ref) {
  if (!ref) return null;
  try {
    const j = await asaas(ambiente, "GET", `/payments?externalReference=${encodeURIComponent(ref)}&limit=10`);
    return (j.data || []).find((p) => p.externalReference === ref && !p.deleted) || null;
  } catch (e) {
    return null;
  }
}
async function acharNotaExistente(ambiente, { paymentId, ref }) {
  try {
    const q = paymentId ? `payment=${encodeURIComponent(paymentId)}` : ref ? `externalReference=${encodeURIComponent(ref)}` : null;
    if (!q) return null;
    const j = await asaas(ambiente, "GET", `/invoices?${q}&limit=10`);
    const ok = (i) => !["CANCELED", "ERROR", "DENIED"].includes(i.status) && (paymentId ? i.payment === paymentId : i.externalReference === ref);
    return (j.data || []).find(ok) || null;
  } catch (e) {
    return null;
  }
}

// Esta conta usa o PORTAL NACIONAL: o Asaas responde "O código de serviços municipais não está habilitado para esta conta".
// Mandar municipalServiceCode (171001) fazia o Asaas criar um serviço novo e incompleto a cada nota (sem código de tributação
// nacional) e a nota falhava com "dados obrigatórios da empresa". A nota que o contador emitiu com sucesso (nº 448, 09/10/2026)
// usou o serviço PADRÃO "Prestação de serviços" — então mandamos só o NOME desse serviço (env ASAAS_SERVICO_NOME) e nunca o código.
const SERVICO_NOME = () => String(process.env.ASAAS_SERVICO_NOME || "Prestação de serviços").trim();

// Vencimento padrão dos boletos: dia 15. Se hoje (no fuso de São Paulo) ainda não passou do 15, é o 15 deste mês;
// passou, é o 15 do mês seguinte (o Asaas não aceita vencimento no passado). Léo não passa por aqui (semCobranca).
function proximoDia15() {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() > 15 ? 1 : 0), 15);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-15";
}

// encontra o cliente pelo CNPJ/CPF; cria se não existir
async function acharOuCriarCliente(ambiente, tomador) {
  const doc = (tomador.cnpj || "").replace(/\D/g, "");
  // Endereço do tomador — a nota fiscal exige CEP e endereço completos no cadastro do cliente.
  const e = tomador.endereco || {};
  const end = {};
  if (e.cep) end.postalCode = String(e.cep).replace(/\D/g, "");
  if (e.logradouro) end.address = e.logradouro;
  if (e.numero) end.addressNumber = String(e.numero);
  if (e.complemento) end.complement = e.complemento;
  if (e.bairro) end.province = e.bairro;
  // A planilha pode trazer vários e-mails no mesmo campo ("a@x.com, b@y.com"). A Asaas só aceita UM em `email`;
  // o resto vai em `additionalEmails` (separados por vírgula) — o boleto/nota chega pra todos.
  const emails = String(tomador.email || "").split(/[\s,;]+/).filter((x) => x.includes("@"));
  const mail = {};
  if (emails[0]) mail.email = emails[0];
  if (emails.length > 1) mail.additionalEmails = emails.slice(1).join(",");
  if (doc) {
    const j = await asaas(ambiente, "GET", `/customers?cpfCnpj=${doc}`);
    if (j.data && j.data.length) {
      // cliente já existe (possivelmente criado antes sem endereço) — completa o cadastro
      const atual = { ...end, ...mail };
      if (Object.keys(atual).length) await asaas(ambiente, "PUT", `/customers/${j.data[0].id}`, atual);
      return j.data[0].id;
    }
  }
  const novo = await asaas(ambiente, "POST", "/customers", {
    name: tomador.nome,
    cpfCnpj: doc || undefined,
    ...mail,
    phone: tomador.telefone || undefined,
    externalReference: doc || tomador.nome,
    ...end,
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
      const { tomador, servico, valores, vencimento, semCobranca, semNota, referencia } = req.body || {};
      // valores.cobranca = valor do BOLETO (líquido do ISS retido pelo cliente); valores.total = valor cheio da NOTA.
      const valorCobranca = valores?.cobranca != null ? Number(valores.cobranca) : valores?.total;
      if (!(valorCobranca > 0) || valorCobranca > Number(valores?.total) + 0.001) {
        return res.status(400).json({ error: "Valor do boleto inválido (deve ser maior que zero e não passar do valor da nota)." });
      }
      const ref = referencia ? "mgb-" + String(referencia).slice(0, 80) : null;
      if (!tomador?.nome || !servico?.descricao || !(valores?.total > 0)) {
        return res.status(400).json({ error: "Faltam dados: tomador.nome, servico.descricao ou valores.total." });
      }
      if (semCobranca && semNota) {
        return res.status(400).json({ error: "semCobranca e semNota não podem ser true ao mesmo tempo — não sobraria nada pra emitir." });
      }

      if (!semNota) await verificarInfoFiscal(ambiente); // falha cedo, antes de criar cliente/cobrança
      const customerId = await acharOuCriarCliente(ambiente, tomador);

      let payment = null;
      if (!semCobranca) {
        const dueDate = vencimento || proximoDia15(); // padrão: todo boleto vence dia 15 (decisão do Eder 06/10)
        payment = await acharPagamentoPorReferencia(ambiente, ref); // já existe (reenvio)? reaproveita, não duplica
        if (!payment) {
          payment = await asaas(ambiente, "POST", "/payments", {
            customer: customerId,
            billingType: "BOLETO",
            value: valorCobranca,
            dueDate,
            description: servico.descricao,
            externalReference: ref || "mgb-" + Date.now(),
          });
        }
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
          if (ref) invoiceBody.externalReference = ref;
          delete invoiceBody.municipalServiceCode; // conta do portal nacional: não usa código municipal
          invoiceBody.municipalServiceName = servico.nome || SERVICO_NOME();
          invoice = await acharNotaExistente(ambiente, { paymentId: payment && payment.id, ref }); // já emitida? reaproveita
          if (!invoice) invoice = await asaas(ambiente, "POST", "/invoices", invoiceBody);
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
