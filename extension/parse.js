export function parseTicketmasterEvent(html) {
  const statusMatch = String(html).match(/"salesStatus":"([A-Z0-9_]+)"/);
  const showMatch = String(html).match(
    /"shows":\[\s*\{[\s\S]{0,2000}?"available":(true|false)/,
  );
  if (!statusMatch || !showMatch) return { ok: false };

  const salesStatus = statusMatch[1];
  const available = showMatch[1] === "true";
  return {
    ok: true,
    salesStatus,
    available,
    onSale: salesStatus !== "SOLD_OUT" || available,
  };
}

export function statusLabel(state) {
  if (!state) return "Aguardando";
  if (state.error) return "Sem leitura";
  if (!state.salesStatus) return "Aguardando";
  if (state.onSale) {
    return state.salesStatus === "IN_SALE" ? "À venda" : state.salesStatus;
  }
  if (state.salesStatus === "SOLD_OUT") return "Esgotado";
  return state.salesStatus;
}
