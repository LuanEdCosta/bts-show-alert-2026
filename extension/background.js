import { ALARM, EVENTS } from "./events.js";
import { parseTicketmasterEvent } from "./parse.js";
import { generateVapidKeys, sendNotification } from "./webpush.js";

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkAll();
});

chrome.notifications.onClicked.addListener(async (id) => {
  const { notificationUrls = {} } = await chrome.storage.local.get("notificationUrls");
  const url = notificationUrls[id];
  if (url) await chrome.tabs.create({ url });
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureKeys();
  await ensureAlarm();
  await checkAll();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "check") {
    checkAll().then(sendResponse);
    return true;
  }
  if (message?.type === "test-push") {
    sendTestPush().then(sendResponse);
    return true;
  }
  if (message?.type === "set-interval") {
    resetAlarm(message.minutes).then(sendResponse);
    return true;
  }
  return false;
});

ensureAlarm();

let running = false;

async function ensureKeys() {
  const { vapid } = await chrome.storage.local.get("vapid");
  if (vapid?.publicKey && vapid?.privateKey) return vapid;
  const keys = await generateVapidKeys();
  await chrome.storage.local.set({ vapid: keys });
  return keys;
}

async function ensureAlarm() {
  const { intervalMinutes = 1 } = await chrome.storage.local.get("intervalMinutes");
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) {
    await chrome.alarms.create(ALARM, { periodInMinutes: intervalMinutes });
  }
}

async function resetAlarm(minutes) {
  const safe = Math.max(0.5, Number(minutes) || 1);
  await chrome.storage.local.set({ intervalMinutes: safe });
  await chrome.alarms.create(ALARM, { periodInMinutes: safe });
  return { intervalMinutes: safe };
}

async function checkAll() {
  if (running) return { skipped: true };
  running = true;
  try {
    const { states = {} } = await chrome.storage.local.get("states");
    const next = { ...states };
    for (const event of EVENTS) {
      try {
        const parsed = await fetchEvent(event);
        const previous = next[event.id];
        const signature = `${parsed.salesStatus}:${parsed.available}`;
        const changed = previous?.signature && previous.signature !== signature;
        next[event.id] = {
          signature,
          salesStatus: parsed.salesStatus,
          available: parsed.available,
          onSale: parsed.onSale,
          checkedAt: Date.now(),
          error: null,
        };
        if (parsed.onSale && (changed || !previous?.signature)) {
          await notifyAvailable(event, parsed);
        } else if (changed && !parsed.onSale) {
          await notifyDesktop(`${event.short} esgotou de novo`, "A página voltou a mostrar esgotado.", event.url);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const previous = next[event.id];
        next[event.id] = {
          ...(previous || {}),
          error: message,
          checkedAt: Date.now(),
        };
        if (previous && !previous.error) {
          await notifyDesktop(`Falha ao ler ${event.short}`, message, event.url);
        }
      }
    }
    await chrome.storage.local.set({ states: next, lastCheck: Date.now() });
    await updateBadge(next);
    return { ok: true, states: next };
  } finally {
    running = false;
  }
}

async function fetchEvent(event) {
  const url = new URL(event.url);
  url.searchParams.set("monitor", String(Math.floor(Date.now() / 60000)));
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "text/html",
      "Accept-Language": "pt-BR",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const parsed = parseTicketmasterEvent(await response.text());
  if (!parsed.ok) throw new Error("A página não trouxe o status da venda");
  return parsed;
}

async function notifyAvailable(event, parsed) {
  const title = `BTS ${event.short}: ingresso à venda`;
  const body = `A Ticketmaster mudou para ${parsed.salesStatus}. Abra o site e compre você mesmo.`;
  await notifyDesktop(title, body, event.url);
  const push = await sendPush({ title, body, url: event.url });
  if (push && !push.skipped && !push.ok) {
    await notifyDesktop(
      "O iPhone não recebeu o aviso",
      push.error || `Resposta ${push.status}`,
      event.url,
    );
  }
}

async function notifyDesktop(title, message, url) {
  const id = `bts-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { notificationUrls = {} } = await chrome.storage.local.get("notificationUrls");
  notificationUrls[id] = url;
  const ids = Object.keys(notificationUrls);
  for (const oldId of ids.slice(0, Math.max(0, ids.length - 20))) delete notificationUrls[oldId];
  await chrome.storage.local.set({ notificationUrls });
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
  });
}

async function sendPush(payload) {
  const stored = await chrome.storage.local.get(["subscription", "vapid", "subject", "jwtCache"]);
  if (!stored.subscription) return { skipped: true };
  try {
    const result = await sendNotification({
      subscription: stored.subscription,
      payload: JSON.stringify(payload),
      vapid: { ...stored.vapid, subject: stored.subject },
      jwtCache: stored.jwtCache,
    });
    await chrome.storage.local.set({
      jwtCache: result.jwtCache,
      lastPush: { ok: result.ok, status: result.status, at: Date.now(), body: result.body.slice(0, 300) },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await chrome.storage.local.set({
      lastPush: { ok: false, at: Date.now(), error: message },
    });
    return { ok: false, error: message };
  }
}

async function sendTestPush() {
  const result = await sendPush({
    title: "Teste do BTS Alerta",
    body: "Se este aviso chegou, o iPhone está pareado com esta extensão.",
    url: EVENTS[0].url,
  });
  if (result?.skipped) return { ok: false, error: "Salve a inscrição do iPhone antes do teste" };
  return result;
}

async function updateBadge(states) {
  const values = Object.values(states);
  const onSale = values.filter((state) => state.onSale && !state.error).length;
  const errors = values.filter((state) => state.error).length;
  if (onSale > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#1f8f4e" });
    await chrome.action.setBadgeText({ text: String(onSale) });
    return;
  }
  if (errors === EVENTS.length) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
}
