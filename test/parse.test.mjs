import assert from "node:assert/strict";
import { parseTicketmasterEvent } from "../extension/parse.js";

const soldOut = `
  <script>
    var decoy = {"available":true};
    var event = {"shows":[{"id":194723,"startDate":"2026-10-28T23:00:00Z","available":false,"sectors":[]}],"salesStatus":"SOLD_OUT"};
  </script>
`;

const onSale = `
  {"shows":[{"id":1,"name":"BTS","available":true,"sectors":[{"id":1}]}],"salesStatus":"IN_SALE"}
`;

const sold = parseTicketmasterEvent(soldOut);
assert.equal(sold.ok, true);
assert.equal(sold.salesStatus, "SOLD_OUT");
assert.equal(sold.available, false);
assert.equal(sold.onSale, false);

const sale = parseTicketmasterEvent(onSale);
assert.equal(sale.onSale, true);
assert.equal(sale.available, true);

assert.equal(parseTicketmasterEvent("<html>sem status</html>").ok, false);

const pages = [
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-28-10",
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-30-10",
  "https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-31-10",
];

for (const page of pages) {
  const response = await fetch(page, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "pt-BR",
      "User-Agent": "Mozilla/5.0",
    },
  });
  assert.equal(response.ok, true);
  const parsed = parseTicketmasterEvent(await response.text());
  assert.equal(parsed.ok, true, page);
  assert.equal(typeof parsed.salesStatus, "string");
  assert.equal(typeof parsed.available, "boolean");
  console.log(page, parsed.salesStatus, parsed.available);
}

console.log("parse ok");
