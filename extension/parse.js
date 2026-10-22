const CLOSED_STATUS = "SOLD_OUT";

export function parseTicketmasterEvent(html) {
  const source = String(html);
  const event = findEvent(readBootstrap(source));
  if (!event) return { ok: false };

  const shows = Array.isArray(event.shows) ? event.shows : [];
  const showSummaries = shows.map(summarizeShow);
  const offers = readOffers(source);
  const salesStatus = event.salesStatus;
  const available = showSummaries.some((show) => show.available);
  const sectorCount = showSummaries.reduce((total, show) => total + show.sectorCount, 0);
  const openSectors = showSummaries.some((show) => show.openSectors);
  const unknownSectors = showSummaries.some((show) => show.unknownSectors);
  const offerCount = offers.length;
  const offersOpen = offers.some(offerLooksOpen);
  const notStarted = event.notStarted === true;
  const salesStart = firstSalesStart(event, shows);
  const queue = event.queueConfiguration != null && event.queueConfiguration !== false;
  const statusOpen = salesStatus !== CLOSED_STATUS;
  const reasons = [];
  if (statusOpen) reasons.push(`status ${salesStatus}`);
  if (available) reasons.push("show disponível");
  if (openSectors) reasons.push("setor disponível");
  if (unknownSectors) reasons.push("setor sem status claro");
  if (offersOpen) reasons.push("oferta publicada");
  if (queue) reasons.push("fila ativa");

  const signature = [
    `status=${salesStatus}`,
    `notStarted=${notStarted}`,
    `salesStart=${salesStart}`,
    `queue=${queue ? 1 : 0}`,
    `shows=${showSummaries.map((show) => show.signature).join(",")}`,
    `offers=${offerSignature(offers)}`,
  ].join("|");

  return {
    ok: true,
    salesStatus,
    available,
    sectorCount,
    offerCount,
    notStarted,
    salesStart,
    queue,
    reasons,
    signature,
    onSale: reasons.length > 0,
  };
}

export function combineReadings(readings) {
  const usable = readings.filter((reading) => reading?.ok && reading.signature);
  if (!usable.length) return { ok: false };
  const signatures = [...new Set(usable.map((reading) => reading.signature))];
  const open = usable.find((reading) => reading.onSale) || usable[0];
  const reasons = [...new Set(usable.flatMap((reading) => reading.reasons || []))];
  return {
    ...open,
    reasons,
    onSale: usable.some((reading) => reading.onSale),
    signature: signatures.join(" <> "),
    diverged: signatures.length > 1,
  };
}

export function evidenceLabel(state) {
  if (!state?.salesStatus) return "";
  const show = state.available ? "show aberto" : "show fechado";
  const sectors = `${state.sectorCount ?? 0} setores`;
  const offers = `${state.offerCount ?? 0} ofertas`;
  const queue = state.queue ? "fila ativa" : "sem fila";
  let start = "sem data de início";
  if (state.notStarted) start = "venda não iniciada";
  else if (state.salesStart) start = `início ${state.salesStart}`;
  return `${state.salesStatus} · ${show} · ${sectors} · ${offers} · ${queue} · ${start}`;
}

export function statusLabel(state) {
  if (!state) return "Aguardando";
  if (state.error) return "Sem leitura";
  if (!state.salesStatus) return "Aguardando";
  if (state.onSale) {
    return state.salesStatus === "IN_SALE" ? "À venda" : state.salesStatus;
  }
  if (state.salesStatus === CLOSED_STATUS) return "Esgotado";
  return state.salesStatus;
}

function readBootstrap(html) {
  const json = extractBalanced(html, "App.bootstrapData(");
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractBalanced(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  let depth = 1;
  let inString = false;
  let escaped = false;
  for (let i = start + marker.length; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") depth++;
    else if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) return source.slice(start + marker.length, i);
    }
  }
  return null;
}

function findEvent(root) {
  const direct = root?.model?.data;
  if (isEvent(direct)) return direct;
  const found = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (isEvent(current)) found.push(current);
    const values = Array.isArray(current) ? current : Object.values(current);
    for (const value of values) stack.push(value);
  }
  return (
    found.find((event) => /bts|venda geral/i.test(String(event.name || ""))) ||
    found[0] ||
    null
  );
}

function isEvent(value) {
  return Boolean(value && typeof value.salesStatus === "string" && Array.isArray(value.shows));
}

function summarizeShow(show) {
  const sectors = Array.isArray(show?.sectors) ? show.sectors : [];
  const classes = sectors.map(classifySector);
  const available = show?.available === true;
  return {
    available,
    sectorCount: sectors.length,
    openSectors: classes.includes("open"),
    unknownSectors: classes.includes("unknown"),
    signature: [
      show?.id ?? "?",
      available ? 1 : 0,
      sectors.length,
      classes.filter((item) => item === "open").length,
      classes.filter((item) => item === "unknown").length,
      show?.salesStart ?? "",
    ].join(":"),
  };
}

function classifySector(sector) {
  if (!sector || typeof sector !== "object") return "unknown";
  const status = typeof sector.salesStatus === "string" ? sector.salesStatus : "";
  if (sector.available === true || sector.soldOut === false) return "open";
  if (status && status !== CLOSED_STATUS) return "open";
  if (sector.available === false || sector.soldOut === true || status === CLOSED_STATUS) return "closed";
  return "unknown";
}

function firstSalesStart(event, shows) {
  const value = event.salesStart ?? shows.find((show) => show?.salesStart)?.salesStart;
  return value == null ? "" : String(value);
}

function readOffers(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    if (Array.isArray(data?.offers)) return data.offers;
    if (data?.offers && typeof data.offers === "object") return [data.offers];
    return [];
  } catch {
    return [];
  }
}

function offerLooksOpen(offer) {
  const availability = String(offer?.availability || "");
  if (/OutOfStock|SoldOut/i.test(availability)) return false;
  return true;
}

function offerSignature(offers) {
  if (!offers.length) return "0";
  const flags = offers.map((offer) => (offerLooksOpen(offer) ? "open" : "closed")).sort();
  return `${offers.length}:${flags.join(",")}`;
}
