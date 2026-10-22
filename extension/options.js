const emailInput = document.querySelector("#email");
const publicKey = document.querySelector("#public-key");
const pageUrl = document.querySelector("#page-url");
const iphoneLink = document.querySelector("#iphone-link");
const subscriptionInput = document.querySelector("#subscription");
const relayUrlInput = document.querySelector("#relay-url");
const relayKeyInput = document.querySelector("#relay-key");
const interval = document.querySelector("#interval");
const result = document.querySelector("#result");

const stored = await chrome.storage.local.get([
  "vapid",
  "subject",
  "pageUrl",
  "subscription",
  "intervalMinutes",
  "relayUrl",
  "relayKey",
]);

const vapid = stored.vapid?.publicKey ? stored.vapid : await generateFromPage();
publicKey.value = vapid.publicKey;
emailInput.value = (stored.subject || "").replace(/^mailto:/, "");
pageUrl.value = stored.pageUrl || "";
interval.value = String(stored.intervalMinutes || 1);
relayUrlInput.value = stored.relayUrl || "";
relayKeyInput.value = stored.relayKey || "";
if (stored.subscription) subscriptionInput.value = JSON.stringify(stored.subscription, null, 2);
refreshLink();

emailInput.addEventListener("change", saveContact);
pageUrl.addEventListener("input", refreshLink);
pageUrl.addEventListener("change", async () => {
  refreshLink();
  await chrome.storage.local.set({ pageUrl: pageUrl.value.trim() });
});
interval.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ type: "set-interval", minutes: Number(interval.value) });
});

document.querySelector("#regenerate").addEventListener("click", async () => {
  const agreed = confirm("Gerar outra chave desconecta o iPhone já pareado. Continuar?");
  if (!agreed) return;
  await chrome.storage.local.remove(["vapid", "subscription", "jwtCache"]);
  const keys = await generateFromPage();
  publicKey.value = keys.publicKey;
  subscriptionInput.value = "";
  refreshLink();
  setResult("Nova chave pronta. Ative os avisos de novo no iPhone.", true);
});

document.querySelector("#save").addEventListener("click", saveSubscription);
document.querySelector("#test").addEventListener("click", sendTest);
relayUrlInput.addEventListener("change", () => {
  saveRelay().catch((error) => setResult(error instanceof Error ? error.message : String(error), false));
});
relayKeyInput.addEventListener("change", () => {
  saveRelay().catch((error) => setResult(error instanceof Error ? error.message : String(error), false));
});

function refreshLink() {
  const key = publicKey.value.trim();
  const base = pageUrl.value.trim();
  if (!key || !base) {
    iphoneLink.value = "";
    return;
  }
  try {
    const url = new URL(base);
    url.searchParams.set("k", key);
    url.hash = `k=${key}`;
    iphoneLink.value = url.toString();
  } catch {
    iphoneLink.value = "";
  }
}

async function saveContact() {
  const email = emailInput.value.trim();
  if (!email) return;
  await chrome.storage.local.set({ subject: `mailto:${email}` });
}

async function saveRelay() {
  const relayUrl = relayUrlInput.value.trim();
  const relayKey = relayKeyInput.value;
  if (relayUrl) {
    const url = new URL(relayUrl);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !local) {
      throw new Error("No servidor, o encaminhador precisa de https");
    }
    if (!local) {
      const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
      if (!granted) throw new Error("O Chrome precisa de permissão para usar esse encaminhador");
    }
  }
  await chrome.storage.local.set({ relayUrl, relayKey });
}

async function saveSubscription() {
  setResult("Salvando…", true);
  try {
    await saveRelay();
    const email = emailInput.value.trim();
    if (!email) throw new Error("Informe o e-mail de contato");
    const subscription = JSON.parse(subscriptionInput.value);
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      throw new Error("A inscrição precisa ter endpoint, p256dh e auth");
    }
    const origin = `${new URL(subscription.endpoint).origin}/*`;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("O Chrome precisa de permissão para enviar o aviso");
    await chrome.storage.local.set({
      subject: `mailto:${email}`,
      subscription,
      pageUrl: pageUrl.value.trim(),
    });
    setResult("iPhone salvo. Envie um teste.", true);
  } catch (error) {
    setResult(error instanceof Error ? error.message : String(error), false);
  }
}

async function sendTest() {
  setResult("Enviando teste…", true);
  try {
    await saveRelay();
  } catch (error) {
    setResult(error instanceof Error ? error.message : String(error), false);
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: "test-push" });
  if (response?.ok) {
    setResult("A Apple aceitou o teste. Olhe o iPhone.", true);
    return;
  }
  setResult(response?.error || response?.body || "O teste não saiu", false);
}

function setResult(message, ok) {
  result.textContent = message;
  result.className = ok ? "ok" : "bad";
}

async function generateFromPage() {
  const { generateVapidKeys } = await import("./webpush.js");
  const vapid = await generateVapidKeys();
  await chrome.storage.local.set({ vapid });
  return vapid;
}
