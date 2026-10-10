// Gera as variáveis HUB_USERS e HUB_AUTH_SECRET para colar no Vercel.
//
// Uso (dentro da pasta bot/):   node scripts/gerar-usuarios.js
// Pede a senha de cada pessoa e imprime as duas variáveis prontas.
// Rode no seu computador; as senhas não saem dele, só os hashes.

import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashSenha } from "../lib/auth.js";

const EQUIPE = [
  { login: "eder", nome: "Eder", papel: "admin" },
  { login: "karen", nome: "Karen", papel: "financeiro" },
  { login: "guina", nome: "Guina", papel: "bureau" },
  { login: "cleiton", nome: "Cleiton", papel: "programacao" },
];

const rl = readline.createInterface({ input: stdin, output: stdout });
const usuarios = {};
for (const p of EQUIPE) {
  let senha = "";
  while (senha.length < 8) {
    senha = (await rl.question(`Senha de ${p.nome} (mínimo 8 caracteres): `)).trim();
  }
  usuarios[p.login] = { nome: p.nome, papel: p.papel, senha: hashSenha(senha) };
}
rl.close();

console.log("\nCole no Vercel (Settings > Environment Variables):\n");
console.log("HUB_USERS =");
console.log(JSON.stringify(usuarios));
console.log("\nHUB_AUTH_SECRET =");
console.log(crypto.randomBytes(32).toString("hex"));
console.log("\nDepois faça um novo deploy para as variáveis valerem.");
