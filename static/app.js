const STORAGE_KEY = "tooStar.watchlists.v2";
const LEGACY_STORAGE_KEY = "tooStar.watchlists.v1";
const LULU_POSITION_KEY = "tooStar.lulu.position.v1";
const AUTH_KEY = "tooStar.auth.v1";
const SERVER_ORDER_KEY = "tooStar.server.order.v1";
const STOCK_COLUMNS_KEY = "tooStar.stock.columns.v1";
const STOCK_COLUMN_VIEW_KEY = "tooStar.stock.column.view.v1";
const STOCK_COLUMN_ORDER_KEY = "tooStar.stock.column.order.v1";
const STOCK_COLUMN_WIDTH_KEY = "tooStar.stock.column.width.v1";
const STOCKS_REFRESH_INTERVAL_MS = 5000;
const STOCK_SEARCH_ALIASES = {
  "005930.KS": ["samsung electronics", "samsung elec", "samsung", "sec"],
  "028260.KS": ["samsung c&t", "samsung cnt", "samsung corp", "samsung corporation"],
};
const REMOTE_QUOTE_FIELDS = new Set([
  "price",
  "change",
  "todayChangePercent",
  "volume",
  "close",
  "open",
  "high",
  "low",
  "per",
  "roic",
  "operatingIncomeGrowth",
  "marketCap",
  "performance1D",
  "performance1W",
  "performance1M",
  "performance1Y",
  "performanceYTD",
  "performance3Y",
  "performance5Y",
]);
const STOCK_COLUMNS = [
  { id: "name", label: "종목명", track: "minmax(160px, 1.3fr)" },
  { id: "ticker", label: "티커", track: "minmax(110px, 0.9fr)" },
  { id: "price", label: "현재가", track: "minmax(110px, 1fr)" },
  { id: "change", label: "변동", track: "minmax(100px, 0.9fr)" },
  { id: "todayChangePercent", label: "오늘변동률", track: "minmax(110px, 0.9fr)" },
  { id: "volume", label: "거래량", track: "minmax(120px, 1fr)" },
  { id: "close", label: "종가", track: "minmax(110px, 0.9fr)" },
  { id: "open", label: "시가", track: "minmax(110px, 0.9fr)" },
  { id: "high", label: "고가", track: "minmax(110px, 0.9fr)" },
  { id: "low", label: "저가", track: "minmax(110px, 0.9fr)" },
  { id: "per", label: "PER", track: "minmax(80px, 0.7fr)" },
  { id: "roic", label: "ROIC", track: "minmax(80px, 0.7fr)" },
  { id: "operatingIncomeGrowth", label: "영업이익증가율", track: "minmax(130px, 1fr)" },
  { id: "marketCap", label: "시가총액", track: "minmax(120px, 1fr)" },
  { id: "performance1D", label: "1D", track: "minmax(80px, 0.7fr)" },
  { id: "performance1W", label: "1W", track: "minmax(80px, 0.7fr)" },
  { id: "performance1M", label: "1M", track: "minmax(80px, 0.7fr)" },
  { id: "performance1Y", label: "1Y", track: "minmax(80px, 0.7fr)" },
  { id: "performanceYTD", label: "YTD", track: "minmax(80px, 0.7fr)" },
  { id: "performance3Y", label: "3Y", track: "minmax(80px, 0.7fr)" },
  { id: "performance5Y", label: "5Y", track: "minmax(80px, 0.7fr)" },
];
const STOCK_COLUMN_VIEWS = {
  price: {
    label: "가격",
    columns: ["name", "ticker", "price", "todayChangePercent", "volume", "close", "open", "high", "low"],
  },
  fundamental: {
    label: "펀더멘털",
    columns: ["name", "per", "roic", "operatingIncomeGrowth", "marketCap"],
  },
  performance: {
    label: "성과 상승률",
    columns: ["name", "performance1D", "performance1W", "performance1M", "performance1Y", "performanceYTD", "performance3Y", "performance5Y"],
  },
};

const state = {
  user: null,
  appEventsBound: false,
  stocks: [],
  tabs: [],
  activeTabId: null,
  activeColumnView: "price",
  quotes: {},
  tabModalMode: "create",
  editingTabId: null,
  pendingDeleteTabId: null,
  serverStatuses: [],
  activePage: "watch",
  stocksLoadedAt: 0,
  stocksMtime: null,
  activeSuggestionIndex: -1,
  dismissedSuggestionQuery: "",
  suggestionNavigationVersion: 0,
  draggingColumnId: "",
  resizingColumn: null,
};

const els = {
  authView: document.getElementById("authView"),
  authTabs: [...document.querySelectorAll("[data-auth-tab]")],
  loginForm: document.getElementById("loginForm"),
  signupForm: document.getElementById("signupForm"),
  authMessage: document.getElementById("authMessage"),
  appShell: document.getElementById("appShell"),
  userLabel: document.getElementById("userLabel"),
  logoutBtn: document.getElementById("logoutBtn"),
  watchPage: document.getElementById("watchPage"),
  serverPage: document.getElementById("serverPage"),
  luluSwitcher: document.getElementById("luluSwitcher"),
  luluToggleBtn: document.getElementById("luluToggleBtn"),
  luluMenu: document.getElementById("luluMenu"),
  luluMenuBtns: [...document.querySelectorAll(".lulu-menu-btn")],
  serverMenuBtn: document.getElementById("serverMenuBtn"),
  tabs: document.getElementById("tabs"),
  addTabBtn: document.getElementById("addTabBtn"),
  tabModal: document.getElementById("tabModal"),
  tabForm: document.getElementById("tabForm"),
  modalTitle: document.getElementById("modalTitle"),
  tabNameInput: document.getElementById("tabNameInput"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  stockSearch: document.getElementById("stockSearch"),
  suggestions: document.getElementById("suggestions"),
  stockHeader: document.getElementById("stockHeader"),
  stockList: document.getElementById("stockList"),
  emptyState: document.getElementById("emptyState"),
  columnSettingsBtn: document.getElementById("columnSettingsBtn"),
  columnSettingsMenu: document.getElementById("columnSettingsMenu"),
  columnViewTabs: [...document.querySelectorAll("[data-column-view]")],
  refreshBtn: document.getElementById("refreshBtn"),
  statusText: document.getElementById("statusText"),
  tabContextMenu: document.getElementById("tabContextMenu"),
  renameTabMenuItem: document.getElementById("renameTabMenuItem"),
  deleteTabModal: document.getElementById("deleteTabModal"),
  deleteTabMessage: document.getElementById("deleteTabMessage"),
  cancelDeleteTabBtn: document.getElementById("cancelDeleteTabBtn"),
  confirmDeleteTabBtn: document.getElementById("confirmDeleteTabBtn"),
  serverRefreshBtn: document.getElementById("serverRefreshBtn"),
  serverStatusList: document.getElementById("serverStatusList"),
};

init();

async function init() {
  setBrowserTitle();
  bindAuthEvents();
  await restoreAuth();
  if (!state.user) {
    renderAuth();
    return;
  }
  await bootApp();
}

function setBrowserTitle() {
  const host = window.location.hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "192.168.0.8"].includes(host);
  document.title = `${isLocal ? "local" : "web"} - tooStar`;
}

async function bootApp() {
  renderAuth();
  loadColumnView();
  loadState();
  if (!state.appEventsBound) {
    bindEvents();
    state.appEventsBound = true;
  }
  syncPageFromHash();
  render();

  await refreshStocks();
  renderSuggestions();
  await Promise.all([refreshQuotes(), refreshServerStatus()]);
}

async function refreshStocks(force = false) {
  if (!force && Date.now() - state.stocksLoadedAt < STOCKS_REFRESH_INTERVAL_MS) return;
  const response = await fetch(`/api/stocks?t=${Date.now()}`);
  const data = await response.json();
  const nextMtime = data.mtime ?? null;
  const nextStocks = Array.isArray(data) ? data : data.stocks;
  if (Array.isArray(nextStocks) && (force || nextMtime !== state.stocksMtime)) {
    state.stocks = nextStocks;
    state.stocksMtime = nextMtime;
  }
  state.stocksLoadedAt = Date.now();
}

function loadColumnView() {
  const saved = localStorage.getItem(STOCK_COLUMN_VIEW_KEY);
  state.activeColumnView = STOCK_COLUMN_VIEWS[saved] ? saved : "price";
}

function bindAuthEvents() {
  els.authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab || "login"));
  });
  els.loginForm.addEventListener("submit", handleLogin);
  els.signupForm.addEventListener("submit", handleSignup);
  els.logoutBtn.addEventListener("click", handleLogout);
}

async function restoreAuth() {
  const session = loadAuthSession();
  if (!session?.userId) return;
  try {
    const response = await fetch(`/api/me?user_id=${encodeURIComponent(session.userId)}`);
    if (!response.ok) throw new Error("session_expired");
    const result = await response.json();
    state.user = result.user;
  } catch {
    localStorage.removeItem(AUTH_KEY);
  }
}

function renderAuth() {
  const loggedIn = Boolean(state.user);
  els.authView.classList.toggle("hidden", loggedIn);
  els.appShell.classList.toggle("hidden", !loggedIn);
  els.luluSwitcher.classList.toggle("hidden", !loggedIn);
  document.body.classList.toggle("is-authenticated", loggedIn);
  els.userLabel.textContent = loggedIn ? `${state.user.name || state.user.email} (${roleLabel(state.user.role)})` : "";
  els.serverMenuBtn.classList.toggle("hidden", !isAdmin());
  if (!loggedIn && !els.authMessage.textContent) {
    els.authMessage.textContent = "샘플 계정 bruce@choice.com / 1234";
  }
}

function setAuthTab(tab) {
  const nextTab = tab === "signup" ? "signup" : "login";
  els.authTabs.forEach((button) => button.classList.toggle("active", button.dataset.authTab === nextTab));
  els.loginForm.classList.toggle("hidden", nextTab !== "login");
  els.signupForm.classList.toggle("hidden", nextTab !== "signup");
  els.authMessage.textContent = "";
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  await authenticate("/api/login", { email, password }, "이메일 또는 비밀번호가 올바르지 않습니다.");
}

async function handleSignup(event) {
  event.preventDefault();
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;
  await authenticate("/api/signup", { name, email, password }, "회원가입에 실패했습니다.");
}

async function authenticate(url, body, fallbackMessage) {
  els.authMessage.textContent = "처리 중...";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || fallbackMessage);
    state.user = result.user;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ userId: state.user.id }));
    renderAuth();
    await bootApp();
  } catch (error) {
    els.authMessage.textContent = error.message === "email_exists" ? "이미 가입된 이메일입니다." : fallbackMessage;
  }
}

function handleLogout() {
  saveState();
  localStorage.removeItem(AUTH_KEY);
  state.user = null;
  state.tabs = [];
  state.activeTabId = null;
  state.quotes = {};
  renderAuth();
}

function isAdmin() {
  return state.user?.role === "admin";
}

function roleLabel(role) {
  return role === "admin" ? "관리자" : "사용자";
}

function loadAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function bindEvents() {
  els.luluToggleBtn.addEventListener("click", toggleLuluMenu);
  els.luluMenuBtns.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.page === "server" && !isAdmin()) return;
      setActivePage(button.dataset.page);
      closeLuluMenu();
    });
  });
  els.addTabBtn.addEventListener("click", () => openTabModal());
  els.cancelModalBtn.addEventListener("click", closeTabModal);
  els.tabModal.addEventListener("click", (event) => {
    if (event.target === els.tabModal) closeTabModal();
  });
  els.tabForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTabModal(els.tabNameInput.value.trim());
  });
  els.cancelDeleteTabBtn.addEventListener("click", closeDeleteTabModal);
  els.confirmDeleteTabBtn.addEventListener("click", confirmDeleteTab);
  els.deleteTabModal.addEventListener("click", (event) => {
    if (event.target === els.deleteTabModal) closeDeleteTabModal();
  });
  els.stockSearch.addEventListener("input", handleStockSearch);
  els.stockSearch.addEventListener("focus", handleStockSearch);
  els.stockSearch.addEventListener("keydown", handleSuggestionKeydown);
  els.columnViewTabs.forEach((button) => {
    button.addEventListener("click", () => setColumnView(button.dataset.columnView || "price"));
  });
  els.columnSettingsBtn.addEventListener("click", toggleColumnSettings);
  els.columnSettingsMenu.addEventListener("change", handleColumnSettingChange);
  els.refreshBtn.addEventListener("click", () => Promise.all([refreshQuotes(), refreshServerStatus()]));
  els.serverRefreshBtn.addEventListener("click", refreshServerStatus);
  els.serverStatusList.addEventListener("dragover", onServerDragOver);
  els.stockList.addEventListener("dragover", onDragOver);
  els.tabs.addEventListener("contextmenu", handleTabContextMenu, true);
  els.renameTabMenuItem.addEventListener("click", () => {
    const tabId = els.tabContextMenu.dataset.tabId;
    closeTabContextMenu();
    if (tabId) openRenameTabModal(tabId);
  });
  document.addEventListener("click", closeTabContextMenu);
  document.addEventListener("click", (event) => {
    if (!els.luluSwitcher.contains(event.target)) closeLuluMenu();
    if (!event.target.closest(".column-settings")) closeColumnSettings();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "F2") {
      event.preventDefault();
      focusStockSearch();
    }
    if (event.key === "Escape") closeTabContextMenu();
    if (event.key === "Escape") closeLuluMenu();
    if (event.key === "Escape") closeDeleteTabModal();
  });
  window.addEventListener("resize", closeTabContextMenu);
  window.addEventListener("hashchange", syncPageFromHash);
  bindLuluDrag();
}

function loadState() {
  const saved = localStorage.getItem(userStorageKey()) || localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (saved) {
    Object.assign(state, JSON.parse(saved));
  }

  if (!state.tabs.length) {
    const firstId = createId();
    state.tabs = [{ id: firstId, name: "기본", symbols: ["005930.KS", "AAPL", "NVDA"] }];
    state.activeTabId = firstId;
  }
}

function saveState() {
  localStorage.setItem(
    userStorageKey(),
    JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId, quotes: state.quotes }),
  );
}

function userStorageKey() {
  return state.user?.id ? `${STORAGE_KEY}.${state.user.id}` : STORAGE_KEY;
}

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0];
}

function render() {
  renderActivePage();
  renderTabs();
  renderColumnSettings();
  renderStockHeader();
  renderRows();
  renderServerStatuses();
  saveState();
}

function syncPageFromHash() {
  const page = location.hash.replace("#", "");
  setActivePage(page === "server" && isAdmin() ? "server" : "watch", { updateHash: false });
}

function setActivePage(page, options = {}) {
  const nextPage = page === "server" && isAdmin() ? "server" : "watch";
  state.activePage = nextPage;
  renderActivePage();
  if (options.updateHash !== false) {
    history.replaceState(null, "", nextPage === "server" ? "#server" : "#watch");
  }
  if (nextPage === "server") refreshServerStatus();
}

function renderActivePage() {
  els.watchPage.classList.toggle("active", state.activePage === "watch");
  els.serverPage.classList.toggle("active", state.activePage === "server");
  els.luluMenuBtns.forEach((button) => {
    button.classList.toggle("active", button.dataset.page === state.activePage);
  });
}

function focusStockSearch() {
  setActivePage("watch");
  els.stockSearch.focus();
  els.stockSearch.select();
}

function toggleLuluMenu(event) {
  event.stopPropagation();
  if (els.luluSwitcher.dataset.dragged === "true") return;
  const isOpen = els.luluSwitcher.classList.toggle("open");
  els.luluToggleBtn.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) placeLuluMenu();
}

function closeLuluMenu() {
  els.luluSwitcher.classList.remove("open");
  els.luluSwitcher.classList.remove("menu-above");
  els.luluToggleBtn.setAttribute("aria-expanded", "false");
}

function placeLuluMenu() {
  els.luluSwitcher.classList.remove("menu-above");
  const switcherRect = els.luluSwitcher.getBoundingClientRect();
  const menuRect = els.luluMenu.getBoundingClientRect();
  const belowBottom = switcherRect.bottom + 10 + menuRect.height;
  els.luluSwitcher.classList.toggle("menu-above", belowBottom > window.innerHeight - 8);
}

function bindLuluDrag() {
  const savedPosition = loadLuluPosition();
  if (savedPosition) applyLuluPosition(savedPosition);

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let dragged = false;

  els.luluToggleBtn.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    const rect = els.luluSwitcher.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    dragged = false;
    els.luluSwitcher.dataset.dragged = "false";
    els.luluToggleBtn.setPointerCapture(pointerId);
  });

  els.luluToggleBtn.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragged && Math.hypot(dx, dy) < 8) return;
    dragged = true;
    els.luluSwitcher.dataset.dragged = "true";
    closeLuluMenu();
    applyLuluPosition(clampLuluPosition({ x: originX + dx, y: originY + dy }));
  });

  els.luluToggleBtn.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId) return;
    try {
      els.luluToggleBtn.releasePointerCapture(pointerId);
    } catch {}
    pointerId = null;
    if (dragged) saveLuluPosition(getLuluPosition());
    window.setTimeout(() => {
      els.luluSwitcher.dataset.dragged = "false";
    }, 80);
  });
}

function loadLuluPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LULU_POSITION_KEY) || "{}");
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return clampLuluPosition(parsed);
  } catch {}
  return null;
}

function saveLuluPosition(position) {
  localStorage.setItem(LULU_POSITION_KEY, JSON.stringify(position));
}

function getLuluPosition() {
  const rect = els.luluSwitcher.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

function applyLuluPosition(position) {
  const next = clampLuluPosition(position);
  els.luluSwitcher.style.left = `${next.x}px`;
  els.luluSwitcher.style.top = `${next.y}px`;
  els.luluSwitcher.style.right = "auto";
  els.luluSwitcher.style.bottom = "auto";
}

function clampLuluPosition(position) {
  const width = els.luluSwitcher.offsetWidth || 54;
  const height = els.luluSwitcher.offsetHeight || 54;
  return {
    x: Math.min(Math.max(12, position.x), window.innerWidth - width - 12),
    y: Math.min(Math.max(12, position.y), window.innerHeight - height - 12),
  };
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
        <span class="mini-btn delete" title="삭제">x</span>
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
      openDeleteTabModal(tab.id);
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

function renderColumnSettings() {
  const visible = getVisibleStockColumns();
  const columns = getActiveViewColumns().filter((column) => column.id !== "name");
  els.columnSettingsMenu.innerHTML = `
    <div class="column-settings-title">${STOCK_COLUMN_VIEWS[state.activeColumnView].label} 컬럼</div>
    ${columns.map((column) => `
    <label class="column-setting-option">
      <input type="checkbox" value="${column.id}" ${visible.includes(column.id) ? "checked" : ""} />
      <span>${column.label}</span>
    </label>
    `).join("")}
  `;
}

function renderStockHeader() {
  renderColumnViewTabs();
  applyStockGridTemplate(els.stockHeader);
  els.stockHeader.innerHTML = [
    "<span></span>",
    ...getVisibleStockColumns().map((columnId) => `
      <button class="stock-header-cell${columnId === "name" ? " fixed" : ""}" type="button" draggable="${columnId === "name" ? "false" : "true"}" data-column-id="${columnId}" title="${columnId === "name" ? "고정 열" : "열 위치 변경"}">
        <span>${getStockColumn(columnId).label}</span>
        <span class="column-resize-handle" data-column-id="${columnId}" title="열 너비 조절"></span>
      </button>
    `),
    "<span></span>",
  ].join("");
  bindHeaderColumnDrag();
  bindHeaderColumnResize();
}

function renderColumnViewTabs() {
  els.columnViewTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.columnView === state.activeColumnView);
  });
}

function setColumnView(view) {
  if (!STOCK_COLUMN_VIEWS[view]) return;
  state.activeColumnView = view;
  localStorage.setItem(STOCK_COLUMN_VIEW_KEY, view);
  closeColumnSettings();
  renderColumnSettings();
  renderStockHeader();
  renderRows();
}

function toggleColumnSettings(event) {
  event.stopPropagation();
  const isOpen = els.columnSettingsMenu.classList.toggle("hidden");
  els.columnSettingsBtn.setAttribute("aria-expanded", String(!isOpen));
}

function closeColumnSettings() {
  els.columnSettingsMenu.classList.add("hidden");
  els.columnSettingsBtn.setAttribute("aria-expanded", "false");
}

function handleColumnSettingChange() {
  const selected = [...els.columnSettingsMenu.querySelectorAll("input:checked")].map((input) => input.value);
  if (!selected.includes("name")) selected.unshift("name");
  if (!selected.length) {
    const firstInput = els.columnSettingsMenu.querySelector("input");
    if (firstInput) {
      firstInput.checked = true;
      selected.push(firstInput.value);
    }
  }
  localStorage.setItem(getStockColumnsStorageKey(), JSON.stringify(selected));
  renderStockHeader();
  renderRows();
}

function bindHeaderColumnDrag() {
  els.stockHeader.querySelectorAll(".stock-header-cell").forEach((cell) => {
    cell.addEventListener("dragstart", (event) => {
      if (cell.dataset.columnId === "name") {
        event.preventDefault();
        return;
      }
      state.draggingColumnId = cell.dataset.columnId || "";
      cell.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    cell.addEventListener("dragend", () => {
      cell.classList.remove("dragging");
      els.stockHeader.querySelectorAll(".stock-header-cell.drop-target").forEach((item) => item.classList.remove("drop-target"));
      state.draggingColumnId = "";
    });
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!state.draggingColumnId || state.draggingColumnId === cell.dataset.columnId) return;
      els.stockHeader.querySelectorAll(".stock-header-cell.drop-target").forEach((item) => item.classList.remove("drop-target"));
      cell.classList.add("drop-target");
    });
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetColumnId = cell.dataset.columnId || "";
      moveVisibleColumn(state.draggingColumnId, targetColumnId);
    });
  });
}

function moveVisibleColumn(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId || sourceId === "name" || targetId === "name") return;
  const columns = getVisibleStockColumns().filter((id) => id !== "name");
  const sourceIndex = columns.indexOf(sourceId);
  const targetIndex = columns.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  columns.splice(sourceIndex, 1);
  columns.splice(targetIndex, 0, sourceId);

  const hiddenColumns = getOrderedViewColumnIds().filter((id) => id !== "name" && !columns.includes(id));
  saveColumnOrder(["name", ...columns, ...hiddenColumns]);
  localStorage.setItem(getStockColumnsStorageKey(), JSON.stringify(["name", ...columns]));
  renderColumnSettings();
  renderStockHeader();
  renderRows();
}

function getVisibleStockColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(getStockColumnsStorageKey()) || "null");
    if (Array.isArray(saved)) {
      const allowed = new Set(getActiveViewColumns().map((column) => column.id));
      const valid = saved.filter((id) => allowed.has(id));
      if (valid.length) return withFixedNameColumn(valid);
    }
  } catch {}
  return withFixedNameColumn(getOrderedViewColumnIds());
}

function getActiveViewColumns() {
  return STOCK_COLUMN_VIEWS[state.activeColumnView].columns.map(getStockColumn);
}

function getOrderedViewColumnIds() {
  const defaults = STOCK_COLUMN_VIEWS[state.activeColumnView].columns;
  const saved = loadColumnOrder();
  if (!saved.length) return defaults;
  const allowed = new Set(defaults);
  const ordered = saved.filter((id) => allowed.has(id) && id !== "name");
  const missing = defaults.filter((id) => !ordered.includes(id));
  return withFixedNameColumn([...ordered, ...missing]);
}

function withFixedNameColumn(columns) {
  return ["name", ...columns.filter((id) => id !== "name")];
}

function loadColumnOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(getColumnOrderStorageKey()) || "[]");
    return Array.isArray(order) ? order : [];
  } catch {
    return [];
  }
}

function saveColumnOrder(order) {
  localStorage.setItem(getColumnOrderStorageKey(), JSON.stringify(order));
}

function getColumnOrderStorageKey() {
  return `${STOCK_COLUMN_ORDER_KEY}.${state.activeColumnView}`;
}

function getStockColumnsStorageKey() {
  return `${STOCK_COLUMNS_KEY}.${state.activeColumnView}`;
}

function getStockColumn(columnId) {
  return STOCK_COLUMNS.find((column) => column.id === columnId) || STOCK_COLUMNS[0];
}

function applyStockGridTemplate(element) {
  const widths = loadColumnWidths();
  const tracks = getVisibleStockColumns().map((columnId) => widths[columnId] ? `${widths[columnId]}px` : getStockColumn(columnId).track);
  element.style.gridTemplateColumns = ["44px", ...tracks, "44px"].join(" ");
}

function applyLiveStockGridTemplate(widths) {
  const tracks = getVisibleStockColumns().map((columnId) => widths[columnId] ? `${widths[columnId]}px` : getStockColumn(columnId).track);
  const template = ["44px", ...tracks, "44px"].join(" ");
  els.stockHeader.style.gridTemplateColumns = template;
  els.stockList.querySelectorAll(".stock-row").forEach((row) => {
    row.style.gridTemplateColumns = template;
  });
}

function bindHeaderColumnResize() {
  els.stockHeader.querySelectorAll(".column-resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const columnId = handle.dataset.columnId;
      const cell = handle.closest(".stock-header-cell");
      if (!columnId || !cell) return;
      state.resizingColumn = {
        columnId,
        startX: event.clientX,
        startWidth: cell.getBoundingClientRect().width,
        widths: loadColumnWidths(),
        pointerId: event.pointerId,
        handle,
      };
      document.body.classList.add("is-resizing-column");
      cell.classList.add("resizing");
      if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
    });
  });
}

document.addEventListener("pointermove", (event) => {
  if (!state.resizingColumn) return;
  if (state.resizingColumn.pointerId !== event.pointerId) return;
  const nextWidth = Math.max(72, Math.round(state.resizingColumn.startWidth + event.clientX - state.resizingColumn.startX));
  const widths = state.resizingColumn.widths;
  widths[state.resizingColumn.columnId] = nextWidth;
  applyLiveStockGridTemplate(widths);
});

function finishColumnResize(event) {
  if (!state.resizingColumn) return;
  if (event?.pointerId != null && state.resizingColumn.pointerId !== event.pointerId) return;
  saveColumnWidths(state.resizingColumn.widths);
  try {
    state.resizingColumn.handle?.releasePointerCapture?.(state.resizingColumn.pointerId);
  } catch {}
  els.stockHeader.querySelectorAll(".stock-header-cell.resizing").forEach((cell) => cell.classList.remove("resizing"));
  state.resizingColumn = null;
  document.body.classList.remove("is-resizing-column");
}

document.addEventListener("pointerup", finishColumnResize);
document.addEventListener("pointercancel", finishColumnResize);

function loadColumnWidths() {
  try {
    const widths = JSON.parse(localStorage.getItem(getColumnWidthStorageKey()) || "{}");
    return widths && typeof widths === "object" && !Array.isArray(widths) ? widths : {};
  } catch {
    return {};
  }
}

function saveColumnWidths(widths) {
  localStorage.setItem(getColumnWidthStorageKey(), JSON.stringify(widths));
}

function getColumnWidthStorageKey() {
  return `${STOCK_COLUMN_WIDTH_KEY}.${state.activeColumnView}`;
}

function renderStockCell(columnId, stock, quote) {
  if (columnId === "name") {
    return `<span class="stock-name"><strong>${escapeHtml(stock.name)}</strong><small>${escapeHtml(stock.market || "")}</small></span>`;
  }
  if (columnId === "ticker") {
    return `<span>${escapeHtml(stock.symbol)}</span>`;
  }
  if (columnId === "price") return `<span>${formatPrice(quote)}</span>`;
  if (columnId === "change") return `<span class="${changeClass(quote.change)}">${formatSignedNumber(quote.change)}</span>`;
  if (columnId === "todayChangePercent") {
    return `<span class="${changeClass(quote.todayChangePercent ?? quote.changePercent)}">${formatChange(quote.todayChangePercent ?? quote.changePercent)}</span>`;
  }
  if (columnId === "volume") return `<span>${formatVolume(quote.volume)}</span>`;
  if (["close", "open", "high", "low"].includes(columnId)) return `<span>${formatPriceValue(quote[columnId], quote.currency)}</span>`;
  if (["performance1D", "performance1W", "performance1M", "performance1Y", "performanceYTD", "performance3Y", "performance5Y"].includes(columnId)) {
    return `<span class="${changeClass(getFieldValue(columnId, stock, quote))}">${formatPercentLike(getFieldValue(columnId, stock, quote))}</span>`;
  }
  return `<span>${escapeHtml(formatPlainValue(getFieldValue(columnId, stock, quote)))}</span>`;
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
    applyStockGridTemplate(row);
    row.innerHTML = `
      <span class="drag-handle" title="순서 변경">☰</span>
      ${getVisibleStockColumns().map((columnId) => renderStockCell(columnId, stock, quote)).join("")}
      <button class="mini-btn remove" type="button" title="삭제">x</button>
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

function renderServerStatuses() {
  els.serverStatusList.innerHTML = "";
  if (!state.serverStatuses.length) {
    els.serverStatusList.innerHTML = '<div class="server-empty">아직 확인 전입니다.</div>';
    return;
  }

  state.serverStatuses.forEach((server) => {
    const row = document.createElement("article");
    row.className = `server-row ${server.online ? "online" : "offline"}`;
    row.draggable = true;
    row.dataset.serverId = server.id || server.name;
    const statusText = server.online ? "정상" : "오프라인";
    row.innerHTML = `
      <div class="server-main">
        <span class="server-drag-handle" title="순서 변경">☰</span>
        <div>
          <strong>${escapeHtml(server.name)} : <span>${statusText}</span></strong>
          <small>${escapeHtml(server.url)}</small>
        </div>
      </div>
      <div class="server-meta">
        ${renderBatteryGauge(server)}
        <small>${formatServerMeta(server)}</small>
      </div>
    `;
    row.addEventListener("dragstart", (event) => {
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      persistServerOrder();
    });
    els.serverStatusList.appendChild(row);
  });
}

async function handleStockSearch(event) {
  if (event?.type === "input") state.dismissedSuggestionQuery = "";
  const query = normalizeSearchText(els.stockSearch.value);
  const navigationVersion = state.suggestionNavigationVersion;
  renderSuggestions();
  await refreshStocks(true);
  if (query === normalizeSearchText(els.stockSearch.value) && navigationVersion === state.suggestionNavigationVersion) {
    renderSuggestions();
  }
}

function renderSuggestions() {
  const query = normalizeSearchText(els.stockSearch.value);
  els.suggestions.innerHTML = "";
  state.activeSuggestionIndex = -1;
  if (!query || query === state.dismissedSuggestionQuery || !state.stocks.length) return;

  const matchingStocks = state.stocks
    .filter((stock) => {
      return getStockSearchText(stock).includes(query);
    })
    .slice(0, 8);

  matchingStocks.forEach((stock) => {
    const option = document.createElement("div");
    option.className = "suggestion";
    option.role = "option";
    option.dataset.symbol = stock.symbol;
    option.dataset.disabled = "false";
    option.innerHTML = `
      <span>${escapeHtml(stock.name)}</span>
      <small>${escapeHtml(stock.symbol)}</small>
    `;
    option.addEventListener("mousedown", () => addStock(stock.symbol));
    els.suggestions.appendChild(option);
  });

  if (matchingStocks.length) setActiveSuggestion(0);
}

function handleSuggestionKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    els.stockSearch.value = "";
    closeSuggestions();
    els.stockSearch.blur();
    return;
  }

  const options = [...els.suggestions.querySelectorAll(".suggestion")];
  if (!options.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.suggestionNavigationVersion += 1;
    setActiveSuggestion(getNextSuggestionIndex(options, 1));
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.suggestionNavigationVersion += 1;
    setActiveSuggestion(getNextSuggestionIndex(options, -1));
    return;
  }
  if (event.key === "Enter" && state.activeSuggestionIndex >= 0) {
    event.preventDefault();
    const option = options[state.activeSuggestionIndex];
    if (option?.dataset.symbol) addStock(option.dataset.symbol);
  }
}

function getNextSuggestionIndex(options, direction) {
  let nextIndex = state.activeSuggestionIndex;
  for (let step = 0; step < options.length; step += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length;
    return nextIndex;
  }
  return -1;
}

function setActiveSuggestion(index) {
  const options = [...els.suggestions.querySelectorAll(".suggestion")];
  options.forEach((option, optionIndex) => {
    option.classList.toggle("active", optionIndex === index);
    option.setAttribute("aria-selected", optionIndex === index ? "true" : "false");
  });
  state.activeSuggestionIndex = index;
  options[index]?.scrollIntoView({ block: "nearest" });
}

function closeSuggestions() {
  state.dismissedSuggestionQuery = normalizeSearchText(els.stockSearch.value);
  state.activeSuggestionIndex = -1;
  els.suggestions.innerHTML = "";
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function getStockSearchText(stock) {
  const values = Object.values(stock || {}).flatMap((value) => Array.isArray(value) ? value : [value]);
  const aliases = STOCK_SEARCH_ALIASES[stock?.symbol] || STOCK_SEARCH_ALIASES[stock?.ticker] || [];
  return normalizeSearchText([...values, ...aliases].filter((value) => value != null).join(" "));
}

function openTabModal() {
  state.tabModalMode = "create";
  state.editingTabId = null;
  els.modalTitle.textContent = "탭 만들기";
  els.tabModal.classList.remove("hidden");
  els.tabNameInput.value = getNextTabName();
  els.tabNameInput.placeholder = "탭 이름";
  els.tabNameInput.focus();
  els.tabNameInput.select();
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
  const id = createId();
  state.tabs.push({ id, name, symbols: [] });
  state.activeTabId = id;
  closeTabModal();
  render();
}

function getNextTabName() {
  const usedNumbers = new Set(
    state.tabs
      .map((tab) => /^new_(\d{2,})$/.exec(String(tab.name || "").trim()))
      .filter(Boolean)
      .map((match) => Number(match[1])),
  );
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `new_${String(nextNumber).padStart(2, "0")}`;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    return Array.from(window.crypto.getRandomValues(new Uint32Array(4)), (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("-");
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function renameTab(id, name) {
  const tab = state.tabs.find((item) => item.id === id);
  if (!tab || !name) return;
  tab.name = name.trim().slice(0, 24);
  closeTabModal();
  render();
}

function openDeleteTabModal(id) {
  if (state.tabs.length === 1) return;
  const tab = state.tabs.find((item) => item.id === id);
  if (!tab) return;

  state.pendingDeleteTabId = id;
  els.deleteTabMessage.textContent = `"${tab.name}" 탭을 지우겠습니까?`;
  els.deleteTabModal.classList.remove("hidden");
  els.confirmDeleteTabBtn.focus();
}

function closeDeleteTabModal() {
  els.deleteTabModal.classList.add("hidden");
  state.pendingDeleteTabId = null;
}

function confirmDeleteTab() {
  const tabId = state.pendingDeleteTabId;
  closeDeleteTabModal();
  if (tabId) deleteTab(tabId);
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
  tab.symbols.push(symbol);
  els.stockSearch.value = "";
  closeSuggestions();
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
  const fields = getVisibleStockColumns();
  if (!tab || !tab.symbols.length) {
    els.statusText.textContent = "종목 없음";
    return;
  }

  if (!fields.some((field) => REMOTE_QUOTE_FIELDS.has(field))) {
    tab.symbols.forEach((symbol) => {
      const stock = state.stocks.find((item) => item.symbol === symbol);
      if (!stock) return;
      state.quotes[symbol] = {
        ...(state.quotes[symbol] || {}),
        symbol,
        name: stock.name,
        market: stock.market,
        per: stock.per,
        roic: stock.roic,
        operatingIncomeGrowth: stock.operating_income_growth,
        marketCap: stock.market_cap || stock.marketCap,
        performance1D: stock.performance_1d || stock["1D"],
        performance1W: stock.performance_1w || stock["1W"],
        performance1M: stock.performance_1m || stock["1M"],
        performance1Y: stock.performance_1y || stock["1Y"],
        performanceYTD: stock.performance_ytd || stock.YTD,
        performance3Y: stock.performance_3y || stock["3Y"],
        performance5Y: stock.performance_5y || stock["5Y"],
      };
    });
    els.statusText.textContent = "표시 컬럼만 적용";
    render();
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: tab.symbols, fields }),
    });
    const data = await response.json();
    data.quotes.forEach((quote) => {
      state.quotes[quote.symbol] = mergeQuote(state.quotes[quote.symbol], quote);
    });
    els.statusText.textContent = `업데이트 완료 ${new Date().toLocaleTimeString("ko-KR")}`;
  } catch (error) {
    els.statusText.textContent = "업데이트 실패";
  } finally {
    setLoading(false);
    render();
  }
}

function mergeQuote(previous = {}, next = {}) {
  const merged = { ...previous };
  Object.entries(next).forEach(([key, value]) => {
    if (isEmptyQuoteValue(value) && !isEmptyQuoteValue(previous[key])) return;
    merged[key] = value;
  });
  return merged;
}

function isEmptyQuoteValue(value) {
  return value == null || value === "" || value === "-";
}

async function refreshServerStatus() {
  if (!isAdmin()) {
    state.serverStatuses = [];
    renderServerStatuses();
    return;
  }
  els.serverRefreshBtn.disabled = true;
  els.serverRefreshBtn.textContent = "확인 중";
  try {
    const [serverResponse, phoneResponse] = await Promise.all([
      fetch("/api/server-status", authFetchOptions()),
      fetch("/api/phone-statuses", authFetchOptions()),
    ]);
    const serverData = await serverResponse.json();
    const phoneData = await phoneResponse.json();
    const targets = serverData.targets || [];
    const phones = phoneData.phones || [];
    const hasPhoneTargets = targets.some((target) => String(target.id || "").startsWith("phone-"));
    state.serverStatuses = applyServerOrder(hasPhoneTargets ? targets : [...targets, ...phones.map(normalizePhoneStatus)]);
  } catch (error) {
    state.serverStatuses = [
      {
        name: "상태 확인 API",
        url: "/api/server-status",
        online: false,
        message: "상태 확인 실패",
      },
    ];
  } finally {
    els.serverRefreshBtn.disabled = false;
    els.serverRefreshBtn.textContent = "상태 확인";
    renderServerStatuses();
  }
}

function authFetchOptions(options = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-User-Id": state.user?.id || "",
    },
  };
}

function normalizePhoneStatus(phone) {
  const deviceId = phone.deviceId || "phone";
  const usesMessageGauge = usesMessageReceivedGauge(deviceId);
  return {
    id: `phone-${deviceId}`,
    name: deviceId,
    url: phone.clientIp ? `받은 IP ${phone.clientIp}` : `${deviceId} heartbeat 없음`,
    online: Boolean(phone.online),
    message: phone.message || "휴대폰 상태 확인 실패",
    lastSeenAt: phone.lastSeenAt,
    elapsedSeconds: phone.elapsedSeconds,
    timeoutMinutes: phone.timeoutMinutes,
    battery: usesMessageGauge ? 80 : phone.battery,
    batteryLabel: usesMessageGauge ? "메세지 정상 시간수신" : "",
    heartbeatMessage: phone.heartbeatMessage,
    clientIp: phone.clientIp,
  };
}

function onServerDragOver(event) {
  event.preventDefault();
  const dragging = els.serverStatusList.querySelector(".server-row.dragging");
  const afterElement = getServerDragAfterElement(event.clientY);
  if (!dragging) return;
  els.serverStatusList.querySelectorAll(".server-row.drop-before").forEach((row) => row.classList.remove("drop-before"));
  if (afterElement == null) {
    els.serverStatusList.appendChild(dragging);
  } else {
    afterElement.classList.add("drop-before");
    els.serverStatusList.insertBefore(dragging, afterElement);
  }
}

function getServerDragAfterElement(y) {
  const rows = [...els.serverStatusList.querySelectorAll(".server-row:not(.dragging)")];
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

function persistServerOrder() {
  els.serverStatusList.querySelectorAll(".server-row.drop-before").forEach((row) => row.classList.remove("drop-before"));
  const order = [...els.serverStatusList.querySelectorAll(".server-row")]
    .map((row) => row.dataset.serverId)
    .filter(Boolean);
  localStorage.setItem(SERVER_ORDER_KEY, JSON.stringify(order));
  state.serverStatuses = applyServerOrder(state.serverStatuses);
}

function applyServerOrder(servers) {
  const order = loadServerOrder();
  if (!order.length) return servers;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...servers].sort((a, b) => {
    const aId = a.id || a.name;
    const bId = b.id || b.name;
    const aRank = rank.has(aId) ? rank.get(aId) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(bId) ? rank.get(bId) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
}

function loadServerOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(SERVER_ORDER_KEY) || "[]");
    return Array.isArray(order) ? order : [];
  } catch {
    return [];
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
  return formatPriceValue(quote.price, quote.currency);
}

function formatPriceValue(value, currency) {
  if (value == null || value === "-") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const maximumFractionDigits = currency === "KRW" ? 0 : 2;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits,
  }).format(number);
}

function formatChange(value) {
  if (value == null) return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

function formatSignedNumber(value) {
  if (value == null || value === "-") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(number)}`;
}

function formatPercentLike(value) {
  if (value == null || value === "-") return "-";
  const text = String(value).trim();
  if (text.endsWith("%")) return text;
  const number = Number(value);
  if (!Number.isFinite(number)) return text;
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

function formatPlainValue(value) {
  if (value == null || value === "") return "-";
  return String(value);
}

function getFieldValue(columnId, stock, quote) {
  if (quote[columnId] != null && quote[columnId] !== "") return quote[columnId];
  if (stock[columnId] != null && stock[columnId] !== "") return stock[columnId];
  const snakeKey = columnId.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  if (stock[snakeKey] != null && stock[snakeKey] !== "") return stock[snakeKey];
  return "-";
}

function formatVolume(value) {
  if (value == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatServerMeta(server) {
  const parts = [];
  if (server.lastSeenAt) parts.push(`마지막 ${formatLastSeen(server.lastSeenAt)}`);
  if (server.elapsedSeconds != null) parts.push(`${formatElapsed(server.elapsedSeconds)} 전`);
  if (server.statusCode) parts.push(`HTTP ${server.statusCode}`);
  if (server.responseMs != null) parts.push(`${server.responseMs}ms`);
  if (!parts.length && server.message) parts.push(server.message);
  return parts.join(" · ");
}

function renderBatteryGauge(server) {
  const usesMessageGauge = usesMessageReceivedGauge(`${server.id || ""} ${server.name || ""}`);
  const battery = Number(usesMessageGauge ? 80 : server.battery);
  if (!Number.isFinite(battery)) return "";
  const percent = Math.min(100, Math.max(0, Math.round(battery)));
  const level = percent < 30 ? "low" : percent < 80 ? "mid" : "high";
  const label = usesMessageGauge ? "메세지 정상 시간수신" : `배터리 ${percent}%`;
  return `
    <div class="battery-gauge ${level}" aria-label="${escapeHtml(label)}">
      <span class="battery-label">${escapeHtml(label)}</span>
      <span class="battery-track">
        <span class="battery-fill" style="width: ${percent}%"></span>
      </span>
    </div>
  `;
}

function usesMessageReceivedGauge(value) {
  const text = String(value || "").toLowerCase();
  return text.includes("note9") || text.includes("note10");
}

function formatLastSeen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
  return `${Math.floor(seconds / 86400)}일`;
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


