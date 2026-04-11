import {
  cellToLatLng, latLngToCell, cellToParent, cellToBoundary,
  cellArea, getHexagonEdgeLengthAvg, gridDisk, UNITS,
  getResolution, polygonToCells
} from "../vendor/h3.browser.mjs";

// ============================================
// 工具函数
// ============================================

const PRECISION = 1e-6;
const DEBOUNCE_MS = 150;

function debounce(fn, ms = DEBOUNCE_MS) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function coordKey(lat, lng) {
  return `${Math.round(lat / PRECISION) * PRECISION}:${Math.round(lng / PRECISION) * PRECISION}`;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================
// CopyManager — 统一复制按钮管理 (#1 #3)
// ============================================

class CopyManager {
  constructor() {
    this._controllers = new Map();
  }

  bind(btnId, getText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // AbortController 清理旧监听器，避免 replaceWith(cloneNode) hack
    if (this._controllers.has(btnId)) {
      this._controllers.get(btnId).abort();
    }

    const ac = new AbortController();
    this._controllers.set(btnId, ac);

    btn.addEventListener('click', async () => {
      try {
        const text = typeof getText === 'function' ? getText() : getText;
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✓';
        btn.style.background = 'var(--status-success, #16a34a)';
        setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1000);
      } catch (e) {
        console.error('复制失败:', e);
      }
    }, { signal: ac.signal });
  }

  dispose() {
    for (const ac of this._controllers.values()) ac.abort();
    this._controllers.clear();
  }
}

// ============================================
// InputHistory — 输入历史记录 (#9)
// ============================================

class InputHistory {
  save(key, value) {
    if (!value && value !== 0) return;
    try { localStorage.setItem(`lt_input_${key}`, String(value)); } catch (e) { /* ignore */ }
  }

  load(key) {
    try { return localStorage.getItem(`lt_input_${key}`); } catch (e) { return null; }
  }
}

// ============================================
// PageRouter
// ============================================

class PageRouter {
  constructor() {
    this.currentPage = 'homepage';
    this.pages = {
      homepage: document.getElementById('homepage'),
      'h3-tool': document.getElementById('h3-tool'),
      'reverse-tool': document.getElementById('reverse-tool')
    };
  }

  showPage(pageId) {
    Object.values(this.pages).forEach(p => p.classList.remove('active'));
    if (this.pages[pageId]) {
      this.pages[pageId].classList.add('active');
      this.currentPage = pageId;
    }
  }

  goBack() {
    this.showPage('homepage');
  }
}

// ============================================
// ToolManager — 工具管理 (#11 #10)
// ============================================

class ToolManager {
  constructor() {
    this.tools = [
      {
        id: 'h3', name: 'H3 Index',
        description: '经纬度转H3网格索引，支持扩圈和可视化',
        icon: '⬢',
        keywords: ['list', 'h3', 'index', '经纬度', '网格', '地理']
      },
      {
        id: 'reverse', name: '字符串反转',
        description: '输入字符串，输出反转结果',
        icon: '🔄',
        keywords: ['reverse', '反转', '字符串', 'string']
      }
    ];
    this.customTools = [];
  }

  async loadCustomTools() {
    try {
      const result = await chrome.storage.sync.get('custom_tools');
      this.customTools = result.custom_tools || [];
    } catch (e) {
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem('h3index_custom_tools');
        this.customTools = stored ? JSON.parse(stored) : [];
      } catch (e2) { this.customTools = []; }
    }
  }

  async saveCustomTools() {
    try {
      await chrome.storage.sync.set({ custom_tools: this.customTools });
    } catch (e) {
      localStorage.setItem('h3index_custom_tools', JSON.stringify(this.customTools));
    }
  }

  async addCustomTool(name, url) {
    const tool = {
      id: 'custom_' + Date.now(), name, url,
      description: '自定义工具链接', icon: '🔗',
      keywords: ['custom', 'link', '自定义', name.toLowerCase()]
    };
    this.customTools.push(tool);
    await this.saveCustomTools();
    return tool;
  }

  async deleteCustomTool(id) {
    const idx = this.customTools.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.customTools.splice(idx, 1);
      await this.saveCustomTools();
      return true;
    }
    return false;
  }

  getAllTools() { return [...this.tools, ...this.customTools]; }

  searchTools(query) {
    if (!query.trim()) return this.getAllTools();
    const q = query.toLowerCase();
    return this.getAllTools().filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some(k => k.includes(q))
    );
  }

  getToolById(id) { return this.getAllTools().find(t => t.id === id); }

  exportJSON() { return JSON.stringify({ version: 1, tools: this.customTools }, null, 2); }

  async importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (data.tools && Array.isArray(data.tools)) {
      this.customTools = [...this.customTools, ...data.tools];
      await this.saveCustomTools();
      return data.tools.length;
    }
    throw new Error('无效的导入数据');
  }
}

// ============================================
// SearchManager
// ============================================

class SearchManager {
  constructor(toolManager) {
    this.toolManager = toolManager;
    this.currentSuggestions = [];
    this.selectedIndex = -1;
    this.isActive = false;
  }

  showSuggestions(input, container) {
    const query = input.value.trim();
    if (!query) { this.hideSuggestions(container); return; }
    const results = this.toolManager.searchTools(query);
    this.currentSuggestions = results;
    this.selectedIndex = -1;
    this.isActive = true;
    if (!results.length) { this.hideSuggestions(container); return; }
    this.renderSuggestions(results, container);
    container.style.display = 'block';
  }

  hideSuggestions(container) {
    container.style.display = 'none';
    this.isActive = false;
    this.selectedIndex = -1;
  }

  renderSuggestions(suggestions, container) {
    container.innerHTML = '';
    for (const tool of suggestions) {
      const el = document.createElement('div');
      el.className = 'search-suggestion';
      el.innerHTML = `
        <div class="search-suggestion-icon">${tool.icon}</div>
        <div class="search-suggestion-text"><h4>${tool.name}</h4><p>${tool.description}</p></div>`;
      el.addEventListener('click', () => this.selectSuggestion(tool));
      container.appendChild(el);
    }
  }

  selectSuggestion(tool) {
    this.hideSuggestions(document.getElementById('searchSuggestions'));
    if (window.h3App) window.h3App.showTool(tool.id);
  }

  handleKeyDown(event, input, container) {
    if (!this.isActive || !this.currentSuggestions.length) return;
    const items = container.querySelectorAll('.search-suggestion');
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateHighlight(items);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateHighlight(items);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0) this.selectSuggestion(this.currentSuggestions[this.selectedIndex]);
        break;
      case 'Escape':
        this.hideSuggestions(container);
        input.blur();
        break;
    }
  }

  updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('highlighted', i === this.selectedIndex));
  }
}

// ============================================
// KeyboardNavigation
// ============================================

class KeyboardNavigation {
  constructor() {
    this.currentIndex = -1;
    this.toolCards = [];
    this.isActive = false;
  }

  updateToolCards() {
    this.toolCards = Array.from(document.querySelectorAll('.tool-card'));
    this.currentIndex = -1;
  }

  handleKeyDown(event) {
    if (!this.toolCards.length) this.updateToolCards();
    switch (event.key) {
      case 'ArrowDown': case 'ArrowRight':
        event.preventDefault(); this.navigateNext(); break;
      case 'ArrowUp': case 'ArrowLeft':
        event.preventDefault(); this.navigatePrevious(); break;
      case 'Enter':
        if (this.currentIndex >= 0) { event.preventDefault(); this.toolCards[this.currentIndex].click(); }
        break;
      case 'Escape':
        this.clearHighlight(); break;
    }
  }

  navigateNext() {
    this.clearHighlight();
    this.currentIndex = (this.currentIndex + 1) % this.toolCards.length;
    this.highlightCurrent();
  }

  navigatePrevious() {
    this.clearHighlight();
    this.currentIndex = this.currentIndex <= 0 ? this.toolCards.length - 1 : this.currentIndex - 1;
    this.highlightCurrent();
  }

  highlightCurrent() {
    if (this.currentIndex >= 0 && this.toolCards[this.currentIndex]) {
      this.toolCards[this.currentIndex].classList.add('highlighted');
      this.toolCards[this.currentIndex].focus();
      this.isActive = true;
    }
  }

  clearHighlight() {
    this.toolCards.forEach(c => c.classList.remove('highlighted'));
    this.isActive = false;
  }
}

// ============================================
// H3Tool — 主应用类
// ============================================

class H3Tool {
  constructor() {
    this.copyManager = new CopyManager();
    this.history = new InputHistory();
    this.router = new PageRouter();
    this.toolManager = new ToolManager();
    this.searchManager = new SearchManager(this.toolManager);
    this.keyboardNav = new KeyboardNavigation();
    this.currentTab = 'coord';
    window.h3App = this;
  }

  async init() {
    this.initTheme();
    await this.toolManager.loadCustomTools();
    this.setupEventListeners();
    this.showHomepage();
  }

  // ------ #12 主题管理 ------

  initTheme() {
    const saved = localStorage.getItem('lt_theme');
    if (saved && saved !== 'auto') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    this.updateThemeIcon();
  }

  toggleTheme() {
    const THEMES = ['auto', 'light', 'dark'];
    const current = localStorage.getItem('lt_theme') || 'auto';
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    if (next === 'auto') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('lt_theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('lt_theme', next);
    }
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const current = localStorage.getItem('lt_theme') || 'auto';
    const icons = { auto: '💻', light: '☀️', dark: '🌙' };
    const labels = { auto: '跟随系统', light: '亮色模式', dark: '暗色模式' };
    btn.textContent = icons[current];
    btn.title = `主题: ${labels[current]}（点击切换）`;
  }

  // ------ 事件绑定 ------

  setupEventListeners() {
    // 主题切换
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // 搜索
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    searchInput.addEventListener('input', () =>
      this.searchManager.showSuggestions(searchInput, searchSuggestions));
    searchInput.addEventListener('keydown', e =>
      this.searchManager.handleKeyDown(e, searchInput, searchSuggestions));
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrapper'))
        this.searchManager.hideSuggestions(searchSuggestions);
    });

    // 工具卡片（事件委托）
    document.getElementById('homepage').addEventListener('click', e => {
      const card = e.target.closest('.tool-card');
      if (!card) return;
      const id = card.dataset.tool;
      if (id === 'add') this.handleAddTool();
      else if (id) this.showTool(id);
    });

    // #10 导出
    const exportBtn = document.getElementById('exportToolsBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this.toolManager.exportJSON());
          exportBtn.textContent = '✓';
          setTimeout(() => { exportBtn.textContent = '📤'; }, 1500);
        } catch (e) { alert('导出失败'); }
      });
    }

    // #10 导入
    const importBtn = document.getElementById('importToolsBtn');
    if (importBtn) importBtn.addEventListener('click', () => this.showImportModal());

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => this.router.goBack());
    const reverseBackBtn = document.getElementById('reverseBackBtn');
    if (reverseBackBtn) reverseBackBtn.addEventListener('click', () => this.router.goBack());

    // 键盘导航
    document.addEventListener('keydown', e => {
      if (this.router.currentPage === 'homepage') this.keyboardNav.handleKeyDown(e);
    });

    this.setupH3ToolEvents();
    this.setupTabEvents();
  }

  // ------ 页面管理 ------

  showHomepage() {
    this.router.showPage('homepage');
    setTimeout(() => this.keyboardNav.updateToolCards(), 100);
    this.updateCustomToolsDisplay();
  }

  showTool(toolId) {
    if (toolId === 'h3') {
      this.router.showPage('h3-tool');
      this.initH3Tool();
    } else if (toolId === 'reverse') {
      this.router.showPage('reverse-tool');
      this.initReverseTool();
    } else if (toolId.startsWith('custom_')) {
      const tool = this.toolManager.getToolById(toolId);
      if (tool?.url) chrome.tabs.create({ url: tool.url });
    }
  }

  // ------ 自定义工具 UI ------

  updateCustomToolsDisplay() {
    const section = document.getElementById('custom-tools-section');
    const grid = document.getElementById('custom-tools');
    if (!this.toolManager.customTools.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    grid.innerHTML = '';
    for (const tool of this.toolManager.customTools) {
      const card = document.createElement('div');
      card.className = 'tool-card custom-tool';
      card.dataset.tool = tool.id;
      card.innerHTML = `
        <div class="tool-icon">${tool.icon}</div>
        <div class="tool-content"><h3>${tool.name}</h3><p>${tool.description}</p></div>
        <button class="delete-btn" data-tool-id="${tool.id}" title="删除工具">×</button>`;
      card.querySelector('.delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`确定要删除工具 "${tool.name}" 吗？`)) {
          this.toolManager.deleteCustomTool(tool.id).then(() => this.updateCustomToolsDisplay());
        }
      });
      grid.appendChild(card);
    }
    setTimeout(() => this.keyboardNav.updateToolCards(), 100);
  }

  showAddToolModal() {
    const modal = document.getElementById('addToolModal');
    const nameInput = document.getElementById('toolName');
    const urlInput = document.getElementById('toolUrl');
    nameInput.value = '';
    urlInput.value = '';
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));
    setTimeout(() => nameInput.focus(), 100);

    const handleSave = () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name) { alert('请输入工具名称'); nameInput.focus(); return; }
      if (!url) { alert('请输入跳转链接'); urlInput.focus(); return; }
      try { new URL(url); } catch (e) { alert('请输入有效的URL格式'); urlInput.focus(); return; }
      this.toolManager.addCustomTool(name, url).then(() => {
        this.updateCustomToolsDisplay();
        this.hideAddToolModal();
      });
    };

    document.getElementById('saveBtn').onclick = handleSave;
    document.getElementById('cancelBtn').onclick = () => this.hideAddToolModal();
    document.getElementById('closeModal').onclick = () => this.hideAddToolModal();
    modal.onclick = e => { if (e.target === modal) this.hideAddToolModal(); };

    const handleKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
      else if (e.key === 'Escape') this.hideAddToolModal();
    };
    nameInput.onkeydown = handleKey;
    urlInput.onkeydown = handleKey;
  }

  hideAddToolModal() {
    const modal = document.getElementById('addToolModal');
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }

  showImportModal() {
    const modal = document.getElementById('importModal');
    const textarea = document.getElementById('importText');
    textarea.value = '';
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));
    setTimeout(() => textarea.focus(), 100);

    document.getElementById('importSaveBtn').onclick = () => {
      const json = textarea.value.trim();
      if (!json) { alert('请粘贴导入数据'); return; }
      try {
        this.toolManager.importJSON(json).then(count => {
          this.updateCustomToolsDisplay();
          this.hideImportModal();
          alert(`成功导入 ${count} 个工具`);
        });
      } catch (e) { alert('导入失败: ' + e.message); }
    };
    document.getElementById('importCancelBtn').onclick = () => this.hideImportModal();
    document.getElementById('importCloseBtn').onclick = () => this.hideImportModal();
    modal.onclick = e => { if (e.target === modal) this.hideImportModal(); };
  }

  hideImportModal() {
    const modal = document.getElementById('importModal');
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }

  // ------ H3 工具事件 ------

  setupH3ToolEvents() {
    const latlngInput = document.getElementById('latlng');
    const resInput = document.getElementById('res');
    const ringInput = document.getElementById('ring');

    // #4 防抖计算
    const debouncedCompute = debounce(() => this.compute());

    if (latlngInput) {
      const INVALID = /[^0-9\s,，.-]/g;
      const sanitize = v => v.replace(INVALID, '');
      latlngInput.addEventListener('input', e => {
        e.target.value = sanitize(e.target.value);
        debouncedCompute();
      });
      latlngInput.addEventListener('paste', () => {
        setTimeout(() => { latlngInput.value = sanitize(latlngInput.value); }, 0);
      });
    }
    if (resInput) resInput.addEventListener('input', debouncedCompute);
    if (ringInput) ringInput.addEventListener('input', debouncedCompute);

    // H3 索引输入（网格计算 tab）
    const h3IndexInput = document.getElementById('h3Index');
    if (h3IndexInput) {
      const debouncedGrid = debounce(() => { if (this.currentTab === 'grid') this.computeGrid(); });
      h3IndexInput.addEventListener('input', debouncedGrid);
    }
  }

  setupTabEvents() {
    const tabs = { coord: 'coordTab', grid: 'gridTab', fence: 'fenceTab' };
    for (const [name, id] of Object.entries(tabs)) {
      document.getElementById(id)?.addEventListener('click', () => this.switchTab(name));
    }
  }

  switchTab(tabName) {
    const allTabs = ['coord', 'grid', 'fence'];
    allTabs.forEach(t => {
      document.getElementById(`${t}Tab`)?.classList.toggle('active', t === tabName);
      document.getElementById(`${t}Section`)?.classList.toggle('active-tab', t === tabName);
    });

    const gridInfo = document.querySelector('.result-section:first-of-type');
    const fenceResult = document.getElementById('fence-result-section');
    const ringSection = document.getElementById('ring-section');

    if (tabName === 'fence') {
      if (fenceResult) fenceResult.style.display = 'block';
      if (gridInfo && gridInfo.id !== 'fence-result-section') gridInfo.style.display = 'none';
      if (ringSection) ringSection.style.display = 'none';
    } else {
      if (gridInfo && gridInfo.id !== 'fence-result-section') gridInfo.style.display = 'block';
      if (fenceResult) fenceResult.style.display = 'none';
    }

    this.currentTab = tabName;

    // #8 统一清空错误
    for (const id of ['error', 'gridError', 'fenceError']) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }

    if (tabName === 'coord') this.compute();
    else if (tabName === 'grid') this.computeGrid();
    else if (tabName === 'fence') this.computeFence();
  }

  // ------ H3 工具初始化 ------

  initH3Tool() {
    const latlngInput = document.getElementById('latlng');
    const h3IndexInput = document.getElementById('h3Index');
    const fenceInput = document.getElementById('fenceInput');
    const fenceResInput = document.getElementById('fenceRes');

    // #9 恢复输入历史
    if (latlngInput && !latlngInput.value)
      latlngInput.value = this.history.load('latlng') || '-122.418,37.775';
    if (h3IndexInput && !h3IndexInput.value)
      h3IndexInput.value = this.history.load('h3Index') || '8a1fb46622dffff';

    const savedRes = this.history.load('res');
    const savedRing = this.history.load('ring');
    if (savedRes) document.getElementById('res').value = savedRes;
    if (savedRing) document.getElementById('ring').value = savedRing;

    // 围栏输入事件（防抖）
    const debouncedFence = debounce(() => {
      if (this.currentTab === 'fence') this.computeFence();
    });
    if (fenceInput) fenceInput.addEventListener('input', debouncedFence);
    if (fenceResInput) fenceResInput.addEventListener('input', debouncedFence);

    // 恢复围栏历史
    const savedFenceInput = this.history.load('fenceInput');
    if (fenceInput && !fenceInput.value) fenceInput.value = savedFenceInput || '';
    const savedFenceRes = this.history.load('fenceRes');
    if (fenceResInput && savedFenceRes) fenceResInput.value = savedFenceRes;

    if (this.currentTab === 'coord') this.compute();
    else if (this.currentTab === 'grid') this.computeGrid();
    else if (this.currentTab === 'fence') this.computeFence();
  }

  // ------ 字符串反转工具 ------

  initReverseTool() {
    const input = document.getElementById('reverseInput');
    const output = document.getElementById('reverseOutput');
    const charCount = document.getElementById('reverseCharCount');
    if (!input) return;

    const doReverse = () => {
      const val = input.value;
      if (!val) { output.textContent = ''; charCount.textContent = ''; return; }
      output.textContent = [...val].reverse().join('');
      charCount.textContent = `${[...val].length} 个字符`;
    };

    input.addEventListener('input', doReverse);
    this.copyManager.bind('copyReverseBtn', () => output.textContent);
  }

  // ------ #8 统一错误处理 ------

  showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  hideError(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  clearResults() {
    for (const id of ['cell', 'center-point', 'parent', 'edge-length', 'hex-area', 'vertsText']) {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    }
    document.getElementById('ring-section').style.display = 'none';
  }

  clearFenceResults() {
    for (const id of ['fence-cell-count', 'fence-cells', 'fence-all-vertex-coords',
                       'fence-boundary-coords', 'fence-honeycomb-coords']) {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    }
  }

  // ------ H3 坐标计算 ------

  parseInputs() {
    const latlngStr = document.getElementById('latlng').value.trim();
    const res = parseInt(document.getElementById('res').value, 10);
    const ring = parseInt(document.getElementById('ring').value, 10);

    if (!latlngStr) throw new Error('请输入经纬度');

    let normalized = latlngStr.replace(/，/g, ',');
    let parts = normalized.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 1) parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length !== 2) throw new Error('请输入格式：经度,纬度 或 经度 纬度');

    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(res) || !Number.isFinite(ring))
      throw new Error('请输入有效的经度、纬度、网格级别和扩圈数');
    if (lat < -90 || lat > 90) throw new Error('纬度范围应在 -90 到 90');
    if (lng < -180 || lng > 180) throw new Error('经度范围应在 -180 到 180');
    if (res < 0 || res > 15) throw new Error('网格级别应在 0 到 15');
    if (ring < 0 || ring > 10) throw new Error('扩圈数应在 0 到 10');

    return { lat, lng, res, ring };
  }

  compute() {
    try {
      this.showError('error', '');
      const { lat, lng, res, ring } = this.parseInputs();

      // #9 保存历史
      this.history.save('latlng', document.getElementById('latlng').value);
      this.history.save('res', res);
      this.history.save('ring', ring);

      const cell = latLngToCell(lat, lng, res);
      const [cLat, cLng] = cellToLatLng(cell);
      const parent = res > 0 ? cellToParent(cell, res - 1) : '无';

      let cells = [cell];
      let ringCells = [];
      if (ring > 0) {
        ringCells = gridDisk(cell, ring);
        cells = ringCells;
      }

      document.getElementById('cell').textContent = cell;
      document.getElementById('center-point').textContent = `${cLng.toFixed(6)},${cLat.toFixed(6)}`;
      document.getElementById('parent').textContent = String(parent);

      const boundary = cellToBoundary(cell);
      const vertsPairs = boundary.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`);
      document.getElementById('vertsText').textContent = vertsPairs.join(';');

      const edgeLen = getHexagonEdgeLengthAvg(res, UNITS.m);
      const area = cellArea(cell, UNITS.m2);
      const radius = Math.sqrt(area / Math.PI);
      const edgeStats = this.calculateEdgeStats(boundary);

      document.getElementById('edge-length').textContent =
        `${edgeLen.toFixed(2)} m (最长: ${edgeStats.max.toFixed(2)} m, 最短: ${edgeStats.min.toFixed(2)} m)`;
      document.getElementById('hex-area').textContent =
        `${area.toFixed(2)} m² (半径: ${radius.toFixed(1)} m)`;

      const ringSection = document.getElementById('ring-section');
      if (ring > 0) {
        ringSection.style.display = 'block';
        document.getElementById('ring-count').textContent = `${ringCells.length} 个网格`;
        document.getElementById('ring-cells').textContent = ringCells.join(',');

        // #2 完整显示所有顶点（CSS 可滚动）
        const allVertexParts = [];
        ringCells.forEach(c => {
          const b = cellToBoundary(c);
          b.forEach(([la, ln]) => allVertexParts.push(`${ln.toFixed(6)},${la.toFixed(6)}`));
        });
        const allVertexText = allVertexParts.join(';');
        document.getElementById('all-vertex-coords').textContent = allVertexText;
        this.copyManager.bind('copyVertexCoordsBtn', allVertexText);

        // 边界提取
        try {
          const ringBoundary = this.extractBoundaryFromCells(ringCells);
          const ringBoundaryText = ringBoundary.map(([la, ln]) =>
            `${ln.toFixed(6)},${la.toFixed(6)}`).join(';');
          const el = document.getElementById('ring-boundary-coords');
          if (el) el.textContent = ringBoundaryText;
          this.copyManager.bind('copyRingBoundaryCoordsBtn', ringBoundaryText);
        } catch (e) { console.warn('ring boundary extract failed', e); }

        // 蜂窝围栏
        try {
          const ringHoneycomb = this.buildHoneycombFenceFromCells(ringCells);
          const ringHoneyText = ringHoneycomb?.length
            ? ringHoneycomb.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`).join(';') : '';
          const el = document.getElementById('ring-honeycomb-coords');
          if (el) el.textContent = ringHoneyText;
          const btn = document.getElementById('copyRingHoneycombBtn');
          if (btn) btn.style.display = '';
          this.copyManager.bind('copyRingHoneycombBtn', ringHoneyText);
        } catch (e) { console.warn('ring honeycomb failed', e); }
      } else {
        ringSection.style.display = 'none';
      }

      return { cell, ringCells };
    } catch (err) {
      this.showError('error', err.message || String(err));
    }
  }

  // ------ H3 网格计算 ------

  computeGrid() {
    try {
      const raw = document.getElementById('h3Index').value.trim();
      if (!raw) { this.clearResults(); return; }

      const tokens = raw.split(/[\s,，]+/).map(s => s.trim()).filter(Boolean);
      const h3Pattern = /^[0-9a-fA-F]{8,15}$/;
      for (const t of tokens) {
        if (!h3Pattern.test(t)) {
          this.showError('gridError', '请输入有效的H3网格索引格式');
          return;
        }
      }

      const h3Index = tokens[0];
      this.history.save('h3Index', h3Index);

      const [lat, lng] = cellToLatLng(h3Index);
      const res = getResolution(h3Index);
      const parent = res > 0 ? cellToParent(h3Index, res - 1) : null;
      const boundary = cellToBoundary(h3Index);
      const edgeLen = getHexagonEdgeLengthAvg(res, UNITS.m);
      const area = cellArea(h3Index, UNITS.m2);
      const radius = Math.sqrt(area / Math.PI);
      const edgeStats = this.calculateEdgeStats(boundary);

      let allVertsPairs = boundary.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`);
      for (let i = 1; i < tokens.length; i++) {
        try {
          const b = cellToBoundary(tokens[i]);
          allVertsPairs.push(...b.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`));
        } catch (e) { console.warn('Failed for cell', tokens[i], e); }
      }

      document.getElementById('cell').textContent = h3Index;
      document.getElementById('center-point').textContent = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      document.getElementById('parent').textContent = parent ? String(parent) : '无';
      document.getElementById('edge-length').textContent =
        `${edgeLen.toFixed(2)} m (最长: ${edgeStats.max.toFixed(2)} m, 最短: ${edgeStats.min.toFixed(2)} m)`;
      document.getElementById('hex-area').textContent =
        `${area.toFixed(2)} m² (半径: ${radius.toFixed(1)} m)`;
      document.getElementById('vertsText').textContent = allVertsPairs.join(';');
      document.getElementById('ring-section').style.display = 'none';
      this.hideError('gridError');
    } catch (err) {
      this.showError('gridError', err.message || String(err));
    }
  }

  // ------ H3 围栏计算 ------

  computeFence() {
    try {
      const fenceInput = document.getElementById('fenceInput');
      const fenceResInput = document.getElementById('fenceRes');
      const fenceText = fenceInput.value.trim();
      const res = parseInt(fenceResInput.value, 10);

      this.hideError('fenceError');
      if (!fenceText) { this.clearFenceResults(); return; }
      if (!Number.isFinite(res) || res < 0 || res > 15) {
        this.showError('fenceError', '网格级别应在 0 到 15');
        return;
      }

      // #9 保存历史
      this.history.save('fenceInput', fenceText);
      this.history.save('fenceRes', res);

      const points = fenceText.split(';').map(p => p.trim()).filter(Boolean);
      if (points.length < 3) {
        this.showError('fenceError', '至少需要3个坐标点才能构成围栏');
        return;
      }

      const coordinates = [];
      for (const point of points) {
        let norm = point.replace(/，/g, ',');
        let parts = norm.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 1) parts = norm.split(/\s+/).filter(Boolean);
        if (parts.length !== 2) {
          this.showError('fenceError', `坐标格式错误：${point}，应为"经度,纬度"`);
          return;
        }
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          this.showError('fenceError', `无效的坐标：${point}`);
          return;
        }
        if (lat < -90 || lat > 90) {
          this.showError('fenceError', `纬度范围应在 -90 到 90：${point}`);
          return;
        }
        if (lng < -180 || lng > 180) {
          this.showError('fenceError', `经度范围应在 -180 到 180：${point}`);
          return;
        }
        coordinates.push([lng, lat]);
      }

      // 闭合多边形
      if (coordinates.length > 0) {
        const [f, l] = [coordinates[0], coordinates[coordinates.length - 1]];
        if (f[0] !== l[0] || f[1] !== l[1]) coordinates.push([...f]);
      }

      const cellArray = polygonToCells(coordinates, res, true);

      // 所有顶点坐标（去重）
      const allVerts = [];
      for (const cell of cellArray) {
        const b = cellToBoundary(cell);
        for (const [la, ln] of b) allVerts.push([la, ln]);
      }
      const uniqueVerts = this.deduplicateCoordinates(allVerts);
      const uniqueVertsText = uniqueVerts.map(([la, ln]) =>
        `${ln.toFixed(6)},${la.toFixed(6)}`).join(';');

      document.getElementById('fence-cell-count').textContent = `${cellArray.length} 个网格`;
      document.getElementById('fence-cells').textContent = cellArray.join(',');
      this.copyManager.bind('copyFenceCellsBtn', cellArray.join(','));

      document.getElementById('fence-all-vertex-coords').textContent = uniqueVertsText;
      this.copyManager.bind('copyFenceVertexCoordsBtn', uniqueVertsText);

      // 边界提取
      const boundaryCoords = this.extractBoundaryFromCells(cellArray);
      const boundaryText = boundaryCoords.map(([la, ln]) =>
        `${ln.toFixed(6)},${la.toFixed(6)}`).join(';');
      document.getElementById('fence-boundary-coords').textContent = boundaryText;
      this.copyManager.bind('copyFenceBoundaryCoordsBtn', boundaryText);

      // 蜂窝围栏
      try {
        const honeycomb = this.buildHoneycombFenceFromCells(cellArray);
        const honeycombText = honeycomb?.length
          ? honeycomb.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`).join(';') : '';
        document.getElementById('fence-honeycomb-coords').textContent = honeycombText;
        const btn = document.getElementById('copyFenceHoneycombBtn');
        if (btn) btn.style.display = '';
        this.copyManager.bind('copyFenceHoneycombBtn', honeycombText);
      } catch (e) { console.warn('蜂窝围栏构建失败', e); }
    } catch (err) {
      this.showError('fenceError', err.message || String(err));
    }
  }

  // ------ 几何计算辅助 ------

  calculateEdgeStats(boundary) {
    if (!boundary || boundary.length < 3) return { min: 0, max: 0 };
    let min = Infinity, max = 0;
    for (let i = 0; i < boundary.length; i++) {
      const [a1, b1] = boundary[i];
      const [a2, b2] = boundary[(i + 1) % boundary.length];
      const d = haversineDistance(a1, b1, a2, b2);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  }

  calculateRadiusStats(center, boundary) {
    if (!boundary?.length) return { min: 0, max: 0 };
    const [cLat, cLng] = center;
    let min = Infinity, max = 0;
    for (const [lat, lng] of boundary) {
      const r = haversineDistance(cLat, cLng, lat, lng);
      if (r < min) min = r;
      if (r > max) max = r;
    }
    return { min, max };
  }

  calculateInradiusStats(center, boundary) {
    if (!boundary || boundary.length < 3) return { min: 0, max: 0 };
    const [cLat, cLng] = center;
    let min = Infinity, max = 0;
    for (let i = 0; i < boundary.length; i++) {
      const [a1, b1] = boundary[i];
      const [a2, b2] = boundary[(i + 1) % boundary.length];
      const r = haversineDistance(cLat, cLng, (a1 + a2) / 2, (b1 + b2) / 2);
      if (r < min) min = r;
      if (r > max) max = r;
    }
    return { min, max };
  }

  deduplicateCoordinates(coordinates) {
    const seen = new Set();
    const unique = [];
    for (const [lat, lng] of coordinates) {
      const key = coordKey(lat, lng);
      if (!seen.has(key)) { seen.add(key); unique.push([lat, lng]); }
    }
    return unique;
  }

  // ------ #7 边界提取（含性能守卫） ------

  extractBoundaryFromCells(cellArray) {
    if (!cellArray?.length) return [];

    const directedEdges = new Map();
    const undirectedCount = new Map();

    for (const cell of cellArray) {
      let boundary;
      try { boundary = cellToBoundary(cell); } catch (e) { continue; }
      if (!boundary || boundary.length < 2) continue;

      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i], b = boundary[(i + 1) % boundary.length];
        const sKey = coordKey(a[0], a[1]), eKey = coordKey(b[0], b[1]);
        const dirKey = `${sKey}->${eKey}`;
        const undirKey = sKey < eKey ? `${sKey}|${eKey}` : `${eKey}|${sKey}`;
        if (!directedEdges.has(dirKey))
          directedEdges.set(dirKey, { start: [a[0], a[1]], end: [b[0], b[1]] });
        undirectedCount.set(undirKey, (undirectedCount.get(undirKey) || 0) + 1);
      }
    }

    // 只保留边界边（共享计数 == 1）
    const boundaryDirected = new Map();
    const boundaryEdgeCoords = new Map();
    for (const [dirKey, edge] of directedEdges) {
      const [sKey, eKey] = dirKey.split('->');
      const undirKey = sKey < eKey ? `${sKey}|${eKey}` : `${eKey}|${sKey}`;
      if ((undirectedCount.get(undirKey) || 0) === 1) {
        boundaryEdgeCoords.set(dirKey, edge);
        if (!boundaryDirected.has(sKey)) boundaryDirected.set(sKey, []);
        boundaryDirected.get(sKey).push(eKey);
      }
    }

    if (!boundaryEdgeCoords.size) return [];

    // 链式追踪闭合环路
    const loops = [];
    const used = new Set();
    for (const dirKey of boundaryEdgeCoords.keys()) {
      if (used.has(dirKey)) continue;
      const edge = boundaryEdgeCoords.get(dirKey);
      const startKey = coordKey(edge.start[0], edge.start[1]);
      const loopCoords = [];
      let current = startKey;
      let safety = 0;
      let closed = false;

      while (safety++ < 100000) {
        const ends = boundaryDirected.get(current);
        if (!ends?.length) break;
        let next = null;
        for (const c of ends) {
          if (!used.has(`${current}->${c}`) && boundaryEdgeCoords.has(`${current}->${c}`)) {
            next = c; break;
          }
        }
        if (!next) break;
        const dk = `${current}->${next}`;
        const ce = boundaryEdgeCoords.get(dk);
        if (!ce) break;
        loopCoords.push(ce.start);
        used.add(dk);
        if (next === startKey) { loopCoords.push(ce.end); closed = true; break; }
        current = next;
      }
      if (closed && loopCoords.length >= 4) loops.push(loopCoords);
    }

    if (!loops.length) return [];
    loops.sort((a, b) => b.length - a.length);

    const mainLoop = loops[0];
    const deduped = this.deduplicateCoordinates(mainLoop);
    if (deduped.length > 0) {
      const [f, l] = [deduped[0], deduped[deduped.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) deduped.push([...f]);
    }
    return deduped;
  }

  // ------ #7 蜂窝围栏构建（含大数组性能守卫） ------

  buildHoneycombFenceFromCells(cellArray) {
    if (!cellArray?.length) return [];

    const PROXIMITY_THRESHOLD = 500; // 超过此数量跳过 proximity fallback

    const buildEdgeIndex = (cells) => {
      const cellEdges = new Map();
      const undirToCells = new Map();
      for (const cell of cells) {
        let boundary;
        try { boundary = cellToBoundary(cell); } catch (e) { continue; }
        if (!boundary || boundary.length < 2) continue;
        const edges = [];
        for (let i = 0; i < boundary.length; i++) {
          const a = boundary[i], b = boundary[(i + 1) % boundary.length];
          const aKey = coordKey(a[0], a[1]), bKey = coordKey(b[0], b[1]);
          const uk = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
          edges.push({ undirKey: uk, start: [a[0], a[1]], end: [b[0], b[1]] });
          if (!undirToCells.has(uk)) undirToCells.set(uk, new Set());
          undirToCells.get(uk).add(cell);
        }
        cellEdges.set(cell, edges);
      }
      return { cellEdges, undirToCells };
    };

    buildEdgeIndex(cellArray); // full index kept for reference
    const layers = [];
    let remaining = new Set(cellArray);

    while (remaining.size > 0) {
      const remList = Array.from(remaining);
      const boundaryCoords = this.extractBoundaryFromCells(remList);
      if (!boundaryCoords?.length) break;

      const idx = buildEdgeIndex(remList);
      const outerUndirKeys = new Set();
      for (let i = 0; i < boundaryCoords.length - 1; i++) {
        const a = boundaryCoords[i], b = boundaryCoords[i + 1];
        const aKey = coordKey(a[0], a[1]), bKey = coordKey(b[0], b[1]);
        outerUndirKeys.add(aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`);
      }

      const contributing = new Set();
      for (const uk of outerUndirKeys) {
        const set = idx.undirToCells.get(uk);
        if (set) for (const c of set) contributing.add(c);
      }

      // Proximity fallback — 仅在小数组时启用
      if (contributing.size === 0 && remaining.size < PROXIMITY_THRESHOLD) {
        try {
          const allUndirKeys = Array.from(idx.undirToCells.keys());
          for (let i = 0; i < boundaryCoords.length - 1; i++) {
            const a = boundaryCoords[i], b = boundaryCoords[i + 1];
            for (const uk of allUndirKeys) {
              const parts = uk.split('|');
              if (parts.length !== 2) continue;
              const [p, q] = parts.map(k => {
                const [ls, lns] = k.split(':');
                return [parseFloat(ls), parseFloat(lns)];
              });
              const d1 = haversineDistance(a[0], a[1], p[0], p[1]);
              const d2 = haversineDistance(b[0], b[1], q[0], q[1]);
              const d3 = haversineDistance(a[0], a[1], q[0], q[1]);
              const d4 = haversineDistance(b[0], b[1], p[0], p[1]);
              if ((d1 <= 5 && d2 <= 5) || (d3 <= 5 && d4 <= 5)) {
                const set = idx.undirToCells.get(uk);
                if (set) for (const c of set) contributing.add(c);
              }
            }
          }
        } catch (e) { /* ignore proximity errors */ }
      }

      if (!contributing.size) break;
      layers.push({ coords: boundaryCoords, cells: contributing });
      for (const c of contributing) remaining.delete(c);
    }

    if (!layers.length) return [];

    const finalChain = [];
    const append = (coords) => {
      for (const p of coords) {
        if (!finalChain.length ||
          Math.abs(finalChain[finalChain.length - 1][0] - p[0]) > PRECISION ||
          Math.abs(finalChain[finalChain.length - 1][1] - p[1]) > PRECISION) {
          finalChain.push(p);
        }
      }
    };
    for (const layer of layers) append(layer.coords);
    return finalChain;
  }

  sortVerticesToPolygon(vertices) {
    if (!vertices.length) return [];
    if (vertices.length <= 3) {
      const r = [...vertices];
      if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([...r[0]]);
      return r;
    }
    let cLat = 0, cLng = 0;
    for (const [lat, lng] of vertices) { cLat += lat; cLng += lng; }
    cLat /= vertices.length;
    cLng /= vertices.length;
    const sorted = [...vertices].sort((a, b) =>
      Math.atan2(a[0] - cLat, a[1] - cLng) - Math.atan2(b[0] - cLat, b[1] - cLng));
    if (sorted.length) {
      const [f, l] = [sorted[0], sorted[sorted.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) sorted.push([...f]);
    }
    return sorted;
  }
}

// ============================================
// 启动
// ============================================

const app = new H3Tool();
app.init().catch(e => {
  console.error('List Tools init failed:', e);
  // 即使初始化失败也要保证基本 UI 可用
  try {
    app.setupEventListeners();
    app.showHomepage();
  } catch (e2) { console.error('List Tools recovery failed:', e2); }
});
