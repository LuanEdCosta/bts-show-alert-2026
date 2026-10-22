import assert from "node:assert/strict";
import { combineReadings, parseTicketmasterEvent } from "../extension/parse.js";

function page({
  salesStatus = "SOLD_OUT",
  available = false,
  sectors = [],
  notStarted = false,
  salesStart = null,
  queue = null,
  offers = [],
  name = "BTS - São Paulo - Venda Geral",
  description = 'texto com ) parentese, "aspas" e \\ barra',
}) {
  const event = {
    model: {
      data: {
        name,
        salesStatus,
        notStarted,
        salesStart,
        queueConfiguration: queue,
        shows: [{ id: 194723, description, available, salesStart: null, sectors }],
      },
    },
    decoy: {
      name: "Outro evento",
      salesStatus: "IN_SALE",
      shows: [{ id: 1, available: true, sectors: [{ available: true }] }],
    },
  };
  return `
    <script>var decoy = {"available":true,"salesStatus":"IN_SALE","shows":[{"available":true}]};</script>
    App.bootstrapData(${JSON.stringify(event)});
    <script type="application/ld+json">${JSON.stringify({ offers })}</script>
  `;
}

const sold = parseTicketmasterEvent(page({}));
assert.equal(sold.ok, true);
assert.equal(sold.salesStatus, "SOLD_OUT");
assert.equal(sold.available, false);
assert.equal(sold.sectorCount, 0);
assert.equal(sold.offerCount, 0);
assert.equal(sold.onSale, false);

const sale = parseTicketmasterEvent(page({
  salesStatus: "IN_SALE",
  available: true,
  sectors: [{ id: 1, available: true }],
  offers: [{ availability: "https://schema.org/InStock" }],
}));
assert.equal(sale.onSale, true);
assert.equal(sale.available, true);
assert.equal(sale.sectorCount, 1);
assert.ok(sale.reasons.includes("status IN_SALE"));
assert.ok(sale.reasons.includes("show disponível"));
assert.ok(sale.reasons.includes("setor disponível"));
assert.ok(sale.reasons.includes("oferta publicada"));

const statusOnly = parseTicketmasterEvent(page({ salesStatus: "IN_SALE" }));
assert.equal(statusOnly.onSale, true);

const showOnly = parseTicketmasterEvent(page({ available: true }));
assert.equal(showOnly.onSale, true);
assert.equal(showOnly.salesStatus, "SOLD_OUT");

const unknownSector = parseTicketmasterEvent(page({ sectors: [{ id: 9, name: "Pista" }] }));
assert.equal(unknownSector.onSale, true);
assert.ok(unknownSector.reasons.includes("setor sem status claro"));

const closedSectors = parseTicketmasterEvent(page({
  sectors: [{ available: false }, { soldOut: true }],
}));
assert.equal(closedSectors.onSale, false);
assert.equal(closedSectors.sectorCount, 2);

const queue = parseTicketmasterEvent(page({ queue: { enabled: true } }));
assert.equal(queue.onSale, true);
assert.equal(queue.queue, true);

const soldOutOffers = parseTicketmasterEvent(page({
  offers: [{ availability: "https://schema.org/OutOfStock" }],
}));
assert.equal(soldOutOffers.onSale, false);
assert.equal(soldOutOffers.offerCount, 1);

assert.equal(parseTicketmasterEvent("<html>sem status</html>").ok, false);

const open = parseTicketmasterEvent(page({ salesStatus: "IN_SALE", available: true }));
const combined = combineReadings([sold, open]);
assert.equal(combined.onSale, true);
assert.equal(combined.diverged, true);
assert.equal(combineReadings([sold, sold]).diverged, false);
assert.equal(combineReadings([{ ok: false }]).ok, false);

const pages = [
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-28-10",
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-30-10",
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-31-10",
];

for (const pageUrl of pages) {
  const response = await fetch(pageUrl, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "pt-BR",
      "User-Agent": "Mozilla/5.0",
    },
  });
  assert.equal(response.ok, true, pageUrl);
  const parsed = parseTicketmasterEvent(await response.text());
  assert.equal(parsed.ok, true, pageUrl);
  assert.equal(parsed.salesStatus, "SOLD_OUT", pageUrl);
  assert.equal(parsed.available, false, pageUrl);
  assert.equal(parsed.onSale, false, pageUrl);
  assert.equal(parsed.sectorCount, 0, pageUrl);
  assert.equal(parsed.queue, false, pageUrl);
  console.log(pageUrl, parsed.signature);
}

console.log("parse ok");
