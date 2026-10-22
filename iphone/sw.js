self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
