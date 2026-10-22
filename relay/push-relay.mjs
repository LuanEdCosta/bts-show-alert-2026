import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import https from "node:https";

const PORT = Number(process.env.PORT) || 47321;
const HOST = process.env.HOST || "127.0.0.1";
const RELAY_KEY = process.env.RELAY_KEY || "";
const MAX_BODY = 8192;
const FORWARDED = ["ttl", "urgency", "topic", "authorization", "content-encoding", "content-type"];
const loopback = HOST === "127.0.0.1" || HOST === "::1" || HOST === "localhost";

if (!loopback && !RELAY_KEY) {
  console.error("Defina RELAY_KEY para escutar fora desta máquina");
  process.exit(1);
}

function authorized(header) {
  if (!RELAY_KEY) return true;
  if (typeof header !== "string") return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(RELAY_KEY);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || new URL(req.url, "http://127.0.0.1").pathname !== "/push") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (!authorized(req.headers["x-relay-key"])) {
    res.writeHead(401);
    res.end("Senha incorreta");
    return;
  }

  let target;
  try {
    target = new URL(req.headers["x-target-url"] || "");
  } catch {
    res.writeHead(400);
    res.end("Endereço do push inválido");
    return;
  }
  if (target.protocol !== "https:" || !target.hostname.endsWith(".push.apple.com")) {
    res.writeHead(400);
    res.end("Só encaminho para o push da Apple");
    return;
  }

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (size > MAX_BODY) return;
    const headers = {};
    for (const name of FORWARDED) {
      const value = req.headers[name];
      if (value) headers[name] = value;
    }
    const upstream = https.request(target, { method: "POST", headers }, (up) => {
      const body = [];
      up.on("data", (chunk) => body.push(chunk));
      up.on("end", () => {
        res.writeHead(up.statusCode || 502);
        res.end(Buffer.concat(body));
      });
    });
    upstream.on("error", (error) => {
      if (res.headersSent) return;
      res.writeHead(502);
      res.end(error.message);
    });
    upstream.end(Buffer.concat(chunks));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Encaminhador do push em http://${HOST}:${PORT}/push`);
});
