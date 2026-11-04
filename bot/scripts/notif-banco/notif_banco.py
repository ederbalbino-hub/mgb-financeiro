#!/usr/bin/env python3
"""Le avisos de compra do Wallet (banco de notificacoes do macOS, SOMENTE LEITURA),
roteia pra Pessoal/Empresa/Revisao pelas regras.json e grava na fila local.
Nao toca no Sheets. Uso:  notif_banco.py [--dias N] [--gravar]   (padrao = dry-run)
Requer Acesso Total ao Disco pro terminal/launchd."""
import sqlite3, plistlib, re, sys, json, hashlib, datetime, os, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.expanduser("~/Library/Group Containers/group.com.apple.usernoted/db2/db")
FILA = os.path.expanduser("~/Documents/MGB Mídia/Avisos Banco/fila.json")
EPOCH = 978307200

def norm(s): return (s or "").strip().lower()

def valor(txt):
    m = re.search(r'R\$\s*([\d.]+,\d{2})', txt or "")
    return float(m.group(1).replace('.', '').replace(',', '.')) if m else None

def rotear(emissor, estab, v, R):
    ex = R.get("excecoes_estabelecimento", {})
    for destino in ("pessoal", "empresa"):
        for kw in ex.get(destino, []):
            if kw and kw in norm(estab): return destino, "excecao:" + kw
    if v is not None and R.get("limite_revisao") and v > R["limite_revisao"]: return "revisao", "acima do limite"
    d = R["emissor"].get(norm(emissor))
    return (d, "emissor:" + norm(emissor)) if d else ("revisao", "emissor desconhecido")

def ler(dias):
    c = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    corte = (datetime.datetime.now() - datetime.timedelta(days=dias)).timestamp() - EPOCH
    q = ("select r.delivered_date, r.data from record r join app a on a.app_id=r.app_id "
         "where a.identifier='com.apple.passbook' and r.delivered_date>=? order by 1")
    for d, data in c.execute(q, (corte,)):
        req = plistlib.loads(data).get("req", {})
        yield datetime.datetime.fromtimestamp(d + EPOCH), req.get("titl"), req.get("subt"), req.get("body")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dias", type=int, default=7); ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    R = json.load(open(os.path.join(HERE, "regras.json")))
    fila = json.load(open(FILA)) if os.path.exists(FILA) else []
    ids = {x["id"] for x in fila}; novos = []
    for dt, emissor, estab, body in ler(a.dias):
        if R.get("desde") and dt < datetime.datetime.fromisoformat(R["desde"]): continue   # ponto de corte (recomecar do zero)
        v = valor(body)
        if v is None: continue   # nao e compra (ex.: estorno sem valor)
        lid = hashlib.sha1(f"{dt.isoformat()}|{emissor}|{estab}|{body}".encode()).hexdigest()[:16]
        dest, motivo = rotear(emissor, estab, v, R)
        it = {"id": lid, "data": dt.strftime("%d/%m/%Y"), "hora": dt.strftime("%H:%M"), "historico": estab or "",
              "valor": v, "lado": "desp", "src": "wallet-" + norm(emissor), "docto": lid,
              "destino": dest, "motivo": motivo, "status": "pendente"}
        novos.append((it, lid in ids))
    for it, ja in novos:
        print(f"{it['data']} {it['hora']}  {it['destino'].upper():8} R$ {it['valor']:>9.2f}  {it['historico'][:32]:32} [{it['motivo']}]{'  (ja na fila)' if ja else ''}")
    if a.gravar:
        add = [it for it, ja in novos if not ja]
        os.makedirs(os.path.dirname(FILA), exist_ok=True); json.dump(fila + add, open(FILA, "w"), ensure_ascii=False, indent=1)
        print(f"\ngravados {len(add)} na fila {FILA}")
    else:
        print("\n(dry-run: nada gravado)")
main()
