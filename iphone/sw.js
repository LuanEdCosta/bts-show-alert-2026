self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith("/manifest.webmanifest")) return;
  const key = url.searchParams.get("k");
  if (!/^[A-Za-z0-9_-]{40,}$/.test(key || "")) return;
  event.respondWith(new Response(JSON.stringify({
    name: "BTS Alerta",
    short_name: "BTS Alerta",
    id: "./",
    start_url: `./?k=${key}`,
    scope: "./",
    display: "standalone",
    background_color: "#0e1116",
    theme_color: "#024ddf",
    icons: [{
      src: "icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    }],
  }), {
    headers: { "Content-Type": "application/manifest+json" },
  }));
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "BTS Show Alert",
    body: "A Ticketmaster mudou. Abra o site e compre você mesmo.",
    url: "https://www.ticketmaster.com.br/",
  };
  let data = fallback;
  try {
    if (event.data) data = { ...fallback, ...event.data.json() };
  } catch {
    data = fallback;
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "icon-192.png",
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;
  event.waitUntil(self.clients.openWindow(url));
});
