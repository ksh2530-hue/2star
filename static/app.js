const STORAGE_KEY = "tooStar.watchlists.v1";

const state = {
  stocks: [],
  tabs: [],
  activeTabId: null,
  quotes: {},
  tabModalMode: "create",
  editingTabId: null,
};

const els = {
  tabs: document.getElementById("tabs"),
  addTabBtn: document.getElementById("addTabBtn"),
  tabModal: document.getElementById("tabModal"),
  tabForm: document.getElementById("tabForm"),
  modalTitle: document.getElementById("modalTitle"),
  tabNameInput: document.getElementById("tabNameInput"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  stockSearch: document.getElementById("stockSearch"),
  suggestions: document.getElementById("suggestions"),
  stockList: document.getElementById("stockList"),
  emptyState: document.getElementById("emptyState"),
  refreshBtn: document.getElementById("refreshBtn"),
  statusText: document.getElementById("statusText"),
  tabContextMenu: document.getElementById("tabContextMenu"),
  renameTabMenuItem: document.getElementById("renameTabMenuItem"),
};

init();

async function init() {
  loadState();
  bindEvents();
  render();

  const response = await fetch("/api/stocks");
  state.stocks = await response.json();
  renderSuggestions();
  await refreshQuotes();
}

function bindEvents() {
  els.addTabBtn.addEventListener("click", () => openTabModal());
  els.cancelModalBtn.addEventListener("click", closeTabModal);
  els.tabModal.addEventListener("click", (event) => {
    if (event.target === els.tabModal) closeTabModal();
  });
  els.tabForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTabModal(els.tabNameInput.value.trim());
  });
  els.stockSearch.addEventListener("input", renderSuggestions);
  els.stockSearch.addEventListener("focus", renderSuggestions);
  els.refreshBtn.addEventListener("click", refreshQuotes);
  els.stockList.addEventListener("dragover", onDragOver);
  els.tabs.addEventListener("contextmenu", handleTabContextMenu, true);
  els.renameTabMenuItem.addEventListener("click", () => {
    const tabId = els.tabContextMenu.dataset.tabId;
    closeTabContextMenu();
    if (tabId) openRenameTabModal(tabId);
  });
  document.addEventListener("click", closeTabContextMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTabContextMenu();
  });
  window.addEventListener("resize", closeTabContextMenu);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    Object.assign(state, JSON.parse(saved));
  }

  if (!state.tabs.length) {
    const firstId = crypto.randomUUID();
    state.tabs = [{ id: firstId, name: "기본", symbols: ["005930.KS", "AAPL", "NVDA"] }];
    state.activeTabId = firstId;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId, quotes: state.quotes }),
  );
}

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0];
}

function render() {
  renderTabs();
  renderRows();
  saveState();
}

function renderTabs() {
  els.tabs.innerHTML = "";
  state.tabs.forEach((tab) => {
    const node = document.createElement("button");
    node.className = `tab${tab.id === state.activeTabId ? " active" : ""}`;
    node.type = "button";
    node.dataset.tabId = tab.id;
    node.innerHTML = `
      <span class="tab-name" title="${escapeHtml(tab.name)}">${escapeHtml(tab.name)}</span>
      <span class="tab-actions">
        <span class="mini-btn delete" title="삭제">×</span>
      </span>
    `;
    node.addEventListener("click", () => {
      closeTabContextMenu();
      state.activeTabId = tab.id;
      render();
      refreshQuotes();
    });
    node.querySelector(".delete").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteTab(tab.id);
    });
    els.tabs.appendChild(node);
  });
}

function handleTabContextMenu(event) {
  const tabNode = event.target.closest(".tab");
  if (!tabNode) return;

  event.preventDefault();
  event.stopPropagation();

  state.activeTabId = tabNode.dataset.tabId;
  render();
  openTabContextMenu(event, tabNode.dataset.tabId);
}

function openTabContextMenu(event, tabId) {
  els.tabContextMenu.dataset.tabId = tabId;
  els.tabContextMenu.classList.remove("hidden");

  const menuRect = els.tabContextMenu.getBoundingClientRect();
  const x = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
  const y = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
  els.tabContextMenu.style.left = `${Math.max(8, x)}px`;
  els.tabContextMenu.style.top = `${Math.max(8, y)}px`;
}

function closeTabContextMenu() {
  els.tabContextMenu.classList.add("hidden");
  delete els.tabContextMenu.dataset.tabId;
}

function renderRows() {
  const tab = activeTab();
  els.stockList.innerHTML = "";
  els.emptyState.style.display = tab.symbols.length ? "none" : "block";

  tab.symbols.forEach((symbol) => {
    const stock = state.stocks.find((item) => item.symbol === symbol) || { name: symbol, symbol, market: "" };
    const quote = state.quotes[symbol] || {};
    const row = document.createElement("div");
    row.className = "stock-row";
    row.draggable = true;
    row.dataset.symbol = symbol;
    row.innerHTML = `
      <span class="drag-handle" title="순서 변경">☰</span>
      <span class="stock-name"><strong>${escapeHtml(stock.name)}</strong><small>${symbol}</small></span>
      <span>${formatPrice(quote)}</span>
      <span class="${changeClass(quote.changePercent)}">${formatChange(quote.changePercent)}</span>
      <span>${formatVolume(quote.volume)}</span>
      <button class="mini-btn remove" type="button" title="삭제">×</button>
    `;
    row.querySelector(".remove").addEventListener("click", () => removeStock(symbol));
    row.addEventListener("dragstart", () => row.classList.add("dragging"));
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      persistOrder();
    });
    els.stockList.appendChild(row);
  });
}

function renderSuggestions() {
  const query = els.stockSearch.value.trim().toLowerCase();
  els.suggestions.innerHTML = "";
  if (!query || !state.stocks.length) return;

  const currentSymbols = new Set(activeTab().symbols);
  state.stocks
    .filter((stock) => {
      const haystack = `${stock.name} ${stock.symbol} ${stock.market}`.toLowerCase();
      return haystack.includes(query) && !currentSymbols.has(stock.symbol);
    })
    .slice(0, 8)
    .forEach((stock) => {
      const option = document.createElement("div");
      option.className = "suggestion";
      option.role = "option";
      option.innerHTML = `<span>${escapeHtml(stock.name)}</span><small>${stock.symbol}</small>`;
      option.addEventListener("mousedown", () => addStock(stock.symbol));
      els.suggestions.appendChild(option);
    });
}

function openTabModal() {
  state.tabModalMode = "create";
  state.editingTabId = null;
  els.modalTitle.textContent = "새 탭 만들기";
  els.tabModal.classList.remove("hidden");
  els.tabNameInput.value = "";
  els.tabNameInput.placeholder = "탭 이름";
  els.tabNameInput.focus();
}

function openRenameTabModal(tabId) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;

  state.tabModalMode = "rename";
  state.editingTabId = tabId;
  els.modalTitle.textContent = "탭 이름 변경";
  els.tabModal.classList.remove("hidden");
  els.tabNameInput.value = tab.name;
  els.tabNameInput.placeholder = "새 탭 이름";
  els.tabNameInput.focus();
  els.tabNameInput.select();
}

function closeTabModal() {
  els.tabModal.classList.add("hidden");
  state.tabModalMode = "create";
  state.editingTabId = null;
}

function submitTabModal(name) {
  if (state.tabModalMode === "rename") {
    renameTab(state.editingTabId, name);
    return;
  }
  createTab(name);
}

function createTab(name) {
  if (!name) return;
  const id = crypto.randomUUID();
  state.tabs.push({ id, name, symbols: [] });
  state.activeTabId = id;
  closeTabModal();
  render();
}

function renameTab(id, name) {
  const tab = state.tabs.find((item) => item.id === id);
  if (!tab || !name) return;
  tab.name = name.trim().slice(0, 24);
  closeTabModal();
  render();
}

function deleteTab(id) {
  if (state.tabs.length === 1) return;
  state.tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeTabId === id) state.activeTabId = state.tabs[0].id;
  render();
  refreshQuotes();
}

function addStock(symbol) {
  const tab = activeTab();
  if (!tab.symbols.includes(symbol)) tab.symbols.push(symbol);
  els.stockSearch.value = "";
  els.suggestions.innerHTML = "";
  render();
  refreshQuotes();
}

function removeStock(symbol) {
  const tab = activeTab();
  tab.symbols = tab.symbols.filter((item) => item !== symbol);
  render();
}

async function refreshQuotes() {
  const tab = activeTab();
  if (!tab || !tab.symbols.length) {
    els.statusText.textContent = "종목 없음";
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: tab.symbols }),
    });
    const data = await response.json();
    data.quotes.forEach((quote) => {
      state.quotes[quote.symbol] = quote;
    });
    els.statusText.textContent = `업데이트 완료 ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (error) {
    els.statusText.textContent = "업데이트 실패";
  } finally {
    setLoading(false);
    render();
  }
}

function setLoading(isLoading) {
  els.refreshBtn.disabled = isLoading;
  els.refreshBtn.classList.toggle("refreshing", isLoading);
  if (isLoading) els.statusText.textContent = "업데이트 중";
}

function onDragOver(event) {
  event.preventDefault();
  const dragging = els.stockList.querySelector(".dragging");
  const afterElement = getDragAfterElement(event.clientY);
  if (!dragging) return;
  if (afterElement == null) {
    els.stockList.appendChild(dragging);
  } else {
    els.stockList.insertBefore(dragging, afterElement);
  }
}

function getDragAfterElement(y) {
  const rows = [...els.stockList.querySelectorAll(".stock-row:not(.dragging)")];
  return rows.reduce(
    (closest, row) => {
      const box = row.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: row };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function persistOrder() {
  activeTab().symbols = [...els.stockList.querySelectorAll(".stock-row")].map((row) => row.dataset.symbol);
  render();
}

function formatPrice(quote) {
  if (quote.price == null) return "-";
  const maximumFractionDigits = quote.currency === "KRW" ? 0 : 2;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: quote.currency || "USD",
    maximumFractionDigits,
  }).format(quote.price);
}

function formatChange(value) {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatVolume(value) {
  if (value == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function changeClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
