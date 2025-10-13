import { cellToLatLng, latLngToCell, cellToParent, cellToBoundary, cellArea, getHexagonEdgeLengthAvg, gridDisk, UNITS } from "../vendor/h3.browser.mjs";

// 页面路由管理
class PageRouter {
  constructor() {
    this.currentPage = 'homepage';
    this.pages = {
      homepage: document.getElementById('homepage'),
      'h3-tool': document.getElementById('h3-tool')
    };
  }

  showPage(pageId) {
    // 隐藏所有页面
    Object.values(this.pages).forEach(page => {
      page.classList.remove('active');
    });

    // 显示目标页面
    if (this.pages[pageId]) {
      this.pages[pageId].classList.add('active');
      this.currentPage = pageId;
    }
  }

  goBack() {
    this.showPage('homepage');
  }
}

// 工具管理器
class ToolManager {
  constructor() {
    this.tools = [
      {
        id: 'h3',
        name: 'H3 Index',
        description: '经纬度转H3网格索引，支持扩圈和可视化',
        icon: '⬢',
        keywords: ['list', 'h3', 'index', '经纬度', '网格', '地理']
      }
    ];
  }

  searchTools(query) {
    if (!query.trim()) {
      return this.tools;
    }

    const lowerQuery = query.toLowerCase();
    return this.tools.filter(tool =>
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery))
    );
  }

  getToolById(id) {
    return this.tools.find(tool => tool.id === id);
  }
}

// 搜索管理器
class SearchManager {
  constructor(toolManager) {
    this.toolManager = toolManager;
    this.currentSuggestions = [];
    this.selectedIndex = -1;
    this.isActive = false;
  }

  showSuggestions(input, suggestionsContainer) {
    const query = input.value.trim();
    if (query.length === 0) {
      this.hideSuggestions(suggestionsContainer);
      return;
    }

    const results = this.toolManager.searchTools(query);
    this.currentSuggestions = results;
    this.selectedIndex = -1;
    this.isActive = true;

    if (results.length === 0) {
      this.hideSuggestions(suggestionsContainer);
      return;
    }

    this.renderSuggestions(results, suggestionsContainer);
    suggestionsContainer.style.display = 'block';
  }

  hideSuggestions(suggestionsContainer) {
    suggestionsContainer.style.display = 'none';
    this.isActive = false;
    this.selectedIndex = -1;
  }

  renderSuggestions(suggestions, container) {
    container.innerHTML = '';

    suggestions.forEach((tool, index) => {
      const suggestion = document.createElement('div');
      suggestion.className = 'search-suggestion';
      suggestion.dataset.index = index;

      suggestion.innerHTML = `
        <div class="search-suggestion-icon">${tool.icon}</div>
        <div class="search-suggestion-text">
          <h4>${tool.name}</h4>
          <p>${tool.description}</p>
        </div>
      `;

      suggestion.addEventListener('click', () => {
        this.selectSuggestion(tool);
      });

      container.appendChild(suggestion);
    });
  }

  selectSuggestion(tool) {
    this.hideSuggestions(document.getElementById('searchSuggestions'));
    // 触发工具选择
    if (window.h3App) {
      window.h3App.showTool(tool.id);
    }
  }

  handleKeyDown(event, input, suggestionsContainer) {
    if (!this.isActive || this.currentSuggestions.length === 0) {
      return;
    }

    const suggestions = suggestionsContainer.querySelectorAll('.search-suggestion');

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, suggestions.length - 1);
        this.updateHighlight(suggestions);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateHighlight(suggestions);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0) {
          const tool = this.currentSuggestions[this.selectedIndex];
          this.selectSuggestion(tool);
        }
        break;
      case 'Escape':
        this.hideSuggestions(suggestionsContainer);
        input.blur();
        break;
    }
  }

  updateHighlight(suggestions) {
    suggestions.forEach((suggestion, index) => {
      suggestion.classList.toggle('highlighted', index === this.selectedIndex);
    });
  }
}

// 键盘导航管理器
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
    if (this.toolCards.length === 0) {
      this.updateToolCards();
    }

    switch (event.key) {
      case 'Tab':
        if (event.shiftKey) {
          // Shift+Tab: 反向导航
          event.preventDefault();
          this.navigatePrevious();
        } else {
          // Tab: 正向导航
          event.preventDefault();
          this.navigateNext();
        }
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.navigateNext();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.navigatePrevious();
        break;
      case 'Enter':
        if (this.currentIndex >= 0) {
          event.preventDefault();
          this.toolCards[this.currentIndex].click();
        }
        break;
      case 'Escape':
        this.clearHighlight();
        break;
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
    this.toolCards.forEach(card => {
      card.classList.remove('highlighted');
    });
    this.isActive = false;
  }
}

// H3 工具类
class H3Tool {
  constructor() {
    this.router = new PageRouter();
    this.toolManager = new ToolManager();
    this.searchManager = new SearchManager(this.toolManager);
    this.keyboardNav = new KeyboardNavigation();
    this.init();

    // 将实例挂载到全局，供搜索管理器使用
    window.h3App = this;
  }

  init() {
    this.setupEventListeners();
    this.showHomepage();
  }

  setupEventListeners() {
    // 首页搜索事件
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');

    searchInput.addEventListener('input', () => {
      this.searchManager.showSuggestions(searchInput, searchSuggestions);
    });

    searchInput.addEventListener('keydown', (e) => {
      this.searchManager.handleKeyDown(e, searchInput, searchSuggestions);
    });

    // H3页面搜索事件已移除

    // 点击外部隐藏建议
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) {
        this.searchManager.hideSuggestions(searchSuggestions);
      }
    });

    // 工具卡片点击事件
    document.querySelectorAll('.tool-card').forEach(card => {
      card.addEventListener('click', () => {
        const toolId = card.dataset.tool;
        if (toolId === 'add') {
          this.handleAddTool();
        } else {
          this.showTool(toolId);
        }
      });
    });

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
      this.router.goBack();
    });

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (this.router.currentPage === 'homepage') {
        this.keyboardNav.handleKeyDown(e);
      }
    });

    // H3 工具事件
    this.setupH3ToolEvents();

    // H3页面搜索事件
    this.setupH3SearchEvents();
  }

  showHomepage() {
    this.router.showPage('homepage');
    // 更新工具卡片列表
    setTimeout(() => {
      this.keyboardNav.updateToolCards();
    }, 100);
  }

  showTool(toolId) {
    if (toolId === 'h3') {
      this.router.showPage('h3-tool');
      this.initH3Tool();
    }
  }

  handleAddTool() {
    // 预留功能：显示新增工具对话框
    alert('新增工具功能正在开发中...');
  }

  setupH3ToolEvents() {
    const latlngInput = document.getElementById('latlng');
    const resInput = document.getElementById('res');
    const ringInput = document.getElementById('ring');

    const onInput = () => this.compute();

    // 经纬度输入验证
    if (latlngInput) {
      latlngInput.addEventListener("input", (e) => {
        // 只允许数字、逗号、空格、小数点、负号
        const validPattern = /^[0-9\s,.-]*$/;
        if (!validPattern.test(e.target.value)) {
          // 移除非法字符
          e.target.value = e.target.value.replace(/[^0-9\s,.-]/g, '');
        }
        onInput();
      });

      // 防止粘贴非法字符
      latlngInput.addEventListener("paste", (e) => {
        setTimeout(() => {
          const validPattern = /^[0-9\s,.-]*$/;
          if (!validPattern.test(e.target.value)) {
            e.target.value = e.target.value.replace(/[^0-9\s,.-]/g, '');
          }
        }, 0);
      });
    }

    if (resInput) resInput.addEventListener("input", onInput);
    if (ringInput) ringInput.addEventListener("input", onInput);

  }

  setupH3SearchEvents() {
    // 只在H3页面时设置搜索事件
    const coordTab = document.getElementById('coordTab');
    const h3Tab = document.getElementById('h3Tab');
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');

    if (!coordTab || !h3Tab || !searchInput) return;

    // 搜索模式切换
    coordTab.addEventListener('click', () => {
      coordTab.classList.add('active');
      h3Tab.classList.remove('active');
      this.searchMode = 'coord';
      searchInput.placeholder = '输入经纬度...';
      searchInput.value = '';
      this.hideSuggestions(searchSuggestions);
    });

    h3Tab.addEventListener('click', () => {
      h3Tab.classList.add('active');
      coordTab.classList.remove('active');
      this.searchMode = 'h3';
      searchInput.placeholder = '输入H3索引...';
      searchInput.value = '';
      this.hideSuggestions(searchSuggestions);
    });

    // 搜索输入处理
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query) {
        this.handleH3Search(query);
      } else {
        this.hideSuggestions(searchSuggestions);
      }
    });

    // 点击外部隐藏建议
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) {
        this.hideSuggestions(searchSuggestions);
      }
    });
  }

  handleH3Search(query) {
    const searchSuggestions = document.getElementById('searchSuggestions');

    if (this.searchMode === 'h3') {
      // H3索引模式：检查是否为有效的H3索引
      const h3Pattern = /^[0-9a-fA-F]{8,15}$/;
      if (h3Pattern.test(query)) {
        // 如果输入的是有效的H3索引，直接设置到经纬度输入框
        this.setH3IndexToInput(query);
        this.hideSuggestions(searchSuggestions);
        return;
      }
    } else {
      // 经纬度模式：检查是否为有效的经纬度格式
      const coordPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
      if (coordPattern.test(query)) {
        // 如果输入的是有效的经纬度，直接设置到经纬度输入框
        this.setCoordToInput(query);
        this.hideSuggestions(searchSuggestions);
        return;
      }
    }

    // 显示搜索建议
    this.showSuggestions(query, searchSuggestions);
  }

  setH3IndexToInput(h3Index) {
    try {
      // 使用H3库将索引转换为经纬度
      const [lat, lng] = cellToLatLng(h3Index);
      const latlngInput = document.getElementById('latlng');
      if (latlngInput) {
        latlngInput.value = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        this.compute();
      }
    } catch (error) {
      console.error('H3索引转换失败:', error);
      const latlngInput = document.getElementById('latlng');
      if (latlngInput) {
        latlngInput.value = '';
        latlngInput.placeholder = `无效的H3索引: ${h3Index}`;
      }
    }
  }

  setCoordToInput(coord) {
    const latlngInput = document.getElementById('latlng');
    if (latlngInput) {
      latlngInput.value = coord;
      this.compute();
    }
  }

  showSuggestions(query, container) {
    const suggestions = this.getSuggestions(query);
    if (suggestions.length > 0) {
      container.innerHTML = suggestions.map(suggestion =>
        `<div class="search-suggestion">${suggestion}</div>`
      ).join('');
      container.style.display = 'block';
    } else {
      this.hideSuggestions(container);
    }
  }

  getSuggestions(query) {
    if (this.searchMode === 'h3') {
      return ['输入有效的H3索引格式 (8-15位16进制字符)'];
    } else {
      return ['输入经纬度格式: 纬度,经度 (如: 37.775,-122.418)'];
    }
  }

  hideSuggestions(container) {
    if (container) {
      container.style.display = 'none';
    }
  }

  initH3Tool() {
    const latlngInput = document.getElementById('latlng');
    if (latlngInput && !latlngInput.value) {
      latlngInput.value = "37.775,-122.418";
    }
    this.compute();
  }

  parseInputs() {
    const latlngStr = document.getElementById('latlng').value.trim();
    const res = parseInt(document.getElementById('res').value, 10);
    const ring = parseInt(document.getElementById('ring').value, 10);

    if (!latlngStr) {
      throw new Error("请输入经纬度");
    }

    // 按逗号分割并去除前后空格
    const parts = latlngStr.split(',').map(part => part.trim());

    if (parts.length !== 2) {
      throw new Error("请输入格式：纬度,经度");
    }

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(res) || !Number.isFinite(ring)) {
      throw new Error("请输入有效的纬度、经度、网格级别和扩圈数");
    }
    if (lat < -90 || lat > 90) throw new Error("纬度范围应在 -90 到 90");
    if (lng < -180 || lng > 180) throw new Error("经度范围应在 -180 到 180");
    if (res < 0 || res > 15) throw new Error("网格级别应在 0 到 15");
    if (ring < 0 || ring > 10) throw new Error("扩圈数应在 0 到 10");
    return { lat, lng, res, ring };
  }

  compute() {
    try {
      this.showError("");
      const { lat, lng, res, ring } = this.parseInputs();
      const cell = latLngToCell(lat, lng, res);
      const [cLat, cLng] = cellToLatLng(cell);
      const parent = res > 0 ? cellToParent(cell, res - 1) : "无";

      // 扩圈处理
      let cells = [cell];
      let ringCells = [];
      if (ring > 0) {
        ringCells = gridDisk(cell, ring);
        cells = ringCells;
      }

      document.getElementById('cell').textContent = cell;
      document.getElementById('center-point').textContent = `${cLng.toFixed(6)},${cLat.toFixed(6)}`;

      // 显示父单元信息
      document.getElementById('parent').textContent = String(parent);

      const vertsPairs = cellToBoundary(cell, true) // lat,lng pairs, ccw
        .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
      document.getElementById('vertsText').textContent = vertsPairs.join(';');

      // 计算边长和面积
      const edgeLen = getHexagonEdgeLengthAvg(res, UNITS.m);
      const area = cellArea(cell, UNITS.m2);
      document.getElementById('edge-length').textContent = `${edgeLen.toFixed(2)} m`;
      document.getElementById('hex-area').textContent = `${area.toFixed(2)} m²`;

      const result = {
        input: { lat, lng, res, ring },
        cell,
        center: { lat: cLat, lng: cLng },
        parent,
        vertices: vertsPairs
      };

      if (ring > 0) {
        result.ringCells = ringCells;
        result.ringCount = ringCells.length;
      }

      // 处理扩圈信息显示
      const ringSection = document.getElementById('ring-section');
      if (ring > 0) {
        ringSection.style.display = 'block';
        document.getElementById('ring-count').textContent = `${ringCells.length} 个网格`;

        // 显示扩圈网格列表，使用英文逗号拼接
        const ringCellsContainer = document.getElementById('ring-cells');
        ringCellsContainer.textContent = ringCells.join(',');
      } else {
        ringSection.style.display = 'none';
      }

      return { cell, ringCells };
    } catch (err) {
      this.showError(String(err.message || err));
    }
  }

  showError(msg) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

}

// 初始化应用
const app = new H3Tool();