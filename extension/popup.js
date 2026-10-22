import { EVENTS } from "./events.js";
import { statusLabel } from "./parse.js";

const list = document.querySelector("#events");
const updated = document.querySelector("#updated");
const checkButton = document.querySelector("#check");

document.querySelector("#options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

checkButton.addEventListener("click", async () => {
  checkButton.disabled = true;
  checkButton.textContent = "Consultando";
  await chrome.runtime.sendMessage({ type: "check" });
  await render();
  checkButton.disabled = false;
  checkButton.textContent = "Verificar agora";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.states || changes.lastCheck)) render();
});

render();

async function render() {
  const { states = {}, lastCheck } = await chrome.storage.local.get(["states", "lastCheck"]);
  updated.textContent = lastCheck
    ? `Última consulta ${new Date(lastCheck).toLocaleString("pt-BR")}`
    : "Ainda não consultou.";
  list.replaceChildren();
  for (const event of EVENTS) {
    const state = states[event.id];
    const article = document.createElement("article");
    const link = document.createElement("a");
    link.href = event.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = event.label;
    link.addEventListener("click", (eventClick) => {
      eventClick.preventDefault();
      chrome.tabs.create({ url: event.url });
    });
    const status = document.createElement("div");
    status.className = "status";
    if (state?.onSale) status.classList.add("on-sale");
    if (state?.error) status.classList.add("error");
    const label = document.createElement("strong");
    label.textContent = statusLabel(state);
    status.append(label);
    if (state?.error) {
      const detail = document.createElement("small");
      detail.textContent = state.error;
      status.append(detail);
    }
    article.append(link, status);
    list.append(article);
  }
}
