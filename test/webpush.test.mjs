import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createPublicKey, createECDH, randomBytes, verify } from "node:crypto";
import { existsSync } from "node:fs";
import {
  b64urlToBytes,
  createVapidJwt,
  encryptPayload,
  generateVapidKeys,
} from "../extension/webpush.js";

const ecePath = process.env.ECE_PATH || "/tmp/ece.js";
assert.equal(existsSync(ecePath), true, "Referência http_ece ausente");
const ece = createRequire(import.meta.url)(ecePath);

const receiver = createECDH("prime256v1");
receiver.generateKeys();
const auth = randomBytes(16);
const payload = JSON.stringify({
  title: "BTS 28/10",
  body: "Ingresso à venda em São Paulo",
  url: "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-28-10",
});

const encrypted = await encryptPayload(
  receiver.getPublicKey().toString("base64url"),
  auth.toString("base64url"),
  payload,
);
const plain = ece.decrypt(Buffer.from(encrypted), {
  version: "aes128gcm",
  privateKey: receiver,
  authSecret: auth.toString("base64url"),
});
assert.equal(plain.toString(), payload);

const keys = await generateVapidKeys();
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = await createVapidJwt({
  ...keys,
  subject: "mailto:alerta@example.com",
  audience: "https://web.push.apple.com",
  exp,
});
const [header, body, signature] = token.split(".");
const rawPublic = b64urlToBytes(keys.publicKey);
const key = createPublicKey({
  key: {
    kty: "EC",
    crv: "P-256",
    x: Buffer.from(rawPublic.slice(1, 33)).toString("base64url"),
    y: Buffer.from(rawPublic.slice(33, 65)).toString("base64url"),
  },
  format: "jwk",
});
const valid = verify(
  "sha256",
  Buffer.from(`${header}.${body}`),
  { key, dsaEncoding: "ieee-p1363" },
  Buffer.from(b64urlToBytes(signature)),
);
assert.equal(valid, true);
assert.equal(JSON.parse(Buffer.from(b64urlToBytes(body)).toString()).aud, "https://web.push.apple.com");

console.log("webpush ok");
