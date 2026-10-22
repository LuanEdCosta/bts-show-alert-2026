const encoder = new TextEncoder();

// Chrome 153+ rejects web.push.apple.com. The leaf SCT is 2026-10-06, after the
// COMODO ECC root cutoff of 2026-09-30, so fetch fails with ERR_CERT_AUTHORITY_INVALID.
// Node still trusts that chain until Mozilla drops it in 2027.
const PUSH_RELAY = "http://127.0.0.1:47321/push";

export function bytesToB64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pad32(bytes) {
  if (bytes.length > 32) throw new Error("Chave privada VAPID inválida");
  if (bytes.length === 32) return bytes;
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error("Não consegui gerar a chave pública");
  }
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: bytesToB64url(publicKey),
    privateKey: bytesToB64url(pad32(b64urlToBytes(jwk.d))),
  };
}

export async function createVapidJwt({ publicKey, privateKey, subject, audience, exp }) {
  const header = bytesToB64url(encoder.encode('{"typ":"JWT","alg":"ES256"}'));
  const payload = bytesToB64url(encoder.encode(JSON.stringify({
    aud: audience,
    exp,
    sub: subject,
  })));
  const unsigned = `${header}.${payload}`;
  const rawPublic = b64urlToBytes(publicKey);
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: bytesToB64url(pad32(b64urlToBytes(privateKey))),
      x: bytesToB64url(rawPublic.slice(1, 33)),
      y: bytesToB64url(rawPublic.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    encoder.encode(unsigned),
  ));
  return `${unsigned}.${bytesToB64url(signature)}`;
}

export async function encryptPayload(userPublicKey, userAuth, payload) {
  const payloadBytes = typeof payload === "string" ? encoder.encode(payload) : payload;
  if (payloadBytes.length > 3000) throw new Error("Aviso grande demais para o push");

  const receiverPub = b64urlToBytes(userPublicKey);
  const auth = b64urlToBytes(userAuth);
  if (receiverPub.length !== 65) throw new Error("Chave do iPhone inválida");
  if (auth.length < 16) throw new Error("Segredo do iPhone inválido");

  const local = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverKey },
    local.privateKey,
    256,
  ));

  const ikm = await hkdf(
    auth,
    shared,
    concat(encoder.encode("WebPush: info\0"), receiverPub, localPub),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const record = concat(payloadBytes, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    record,
  ));

  const header = new Uint8Array(16 + 4 + 1 + localPub.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = localPub.length;
  header.set(localPub, 21);
  return concat(header, ciphertext);
}

export async function sendNotification({
  subscription,
  payload,
  vapid,
  ttl = 3600,
  urgency = "high",
  topic = "bts-show-alert",
  jwtCache = null,
  relayUrl = "",
  relayKey = "",
}) {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("Inscrição do iPhone incompleta");
  }
  if (!vapid?.publicKey || !vapid?.privateKey) throw new Error("Chave VAPID ausente");
  if (!vapid.subject?.startsWith("mailto:") && !vapid.subject?.startsWith("https:")) {
    throw new Error("Informe um e-mail de contato para o identificador do aviso");
  }

  const audience = new URL(subscription.endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  let token = jwtCache?.token;
  let exp = jwtCache?.exp;
  const reusable = token
    && jwtCache.audience === audience
    && jwtCache.subject === vapid.subject
    && jwtCache.publicKey === vapid.publicKey
    && exp - now > 11 * 60 * 60;
  if (!reusable) {
    exp = now + 12 * 60 * 60;
    token = await createVapidJwt({
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      subject: vapid.subject,
      audience,
      exp,
    });
  }

  const body = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, payload);
  const headers = {
    TTL: String(ttl),
    Urgency: urgency,
    Topic: topic,
    Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
  };
  const response = await postToPushService(subscription.endpoint, headers, body, relayUrl, relayKey);
  const responseBody = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: responseBody,
    jwtCache: {
      token,
      exp,
      audience,
      subject: vapid.subject,
      publicKey: vapid.publicKey,
    },
  };
}

async function postToPushService(endpoint, headers, body, relayUrl, relayKey) {
  const relayHeaders = { ...headers, "X-Target-Url": endpoint };
  if (relayKey) relayHeaders["X-Relay-Key"] = relayKey;
  try {
    return await fetch(relayUrl || PUSH_RELAY, {
      method: "POST",
      headers: relayHeaders,
      body,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    try {
      return await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        "O Chrome recusou o certificado da Apple. Confira o endereço do encaminhador ou deixe rodando: node relay/push-relay.mjs",
      );
    }
  }
}
