import { cellToLatLng, latLngToCell, cellToParent, cellToBoundary, cellArea, getHexagonEdgeLengthAvg, gridDisk, UNITS, getResolution, polygonToCells } from "../vendor/h3.browser.mjs";

// 页面路由管理
class PageRouter {
  constructor() {
    this.currentPage = 'homepage';
    this.pages = {
      homepage: document.getElementById('homepage'),
      'h3-tool': document.getElementById('h3-tool'),
      'fence-tool': document.getElementById('fence-tool'),
      'reverse-tool': document.getElementById('reverse-tool')
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
      },
      {
        id: 'reverse',
        name: '字符串反转',
        description: '输入字符串，输出反转结果',
        icon: '🔄',
        keywords: ['reverse', '反转', '字符串', 'string']
      }
    ];
    this.customTools = this.loadCustomTools();
  }

  loadCustomTools() {
    try {
      const stored = localStorage.getItem('h3index_custom_tools');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load custom tools:', e);
      return [];
    }
  }

  saveCustomTools() {
    try {
      localStorage.setItem('h3index_custom_tools', JSON.stringify(this.customTools));
    } catch (e) {
      console.error('Failed to save custom tools:', e);
    }
  }

  addCustomTool(name, url) {
    const id = 'custom_' + Date.now();
    const customTool = {
      id,
      name,
      url,
      description: '自定义工具链接',
      icon: '🔗',
      keywords: ['custom', 'link', '自定义', name.toLowerCase()]
    };
    this.customTools.push(customTool);
    this.saveCustomTools();
    return customTool;
  }

  deleteCustomTool(id) {
    const index = this.customTools.findIndex(tool => tool.id === id);
    if (index !== -1) {
      this.customTools.splice(index, 1);
      this.saveCustomTools();
      return true;
    }
    return false;
  }

  getAllTools() {
    return [...this.tools, ...this.customTools];
  }

  searchTools(query) {
    const allTools = this.getAllTools();
    if (!query.trim()) {
      return allTools;
    }

    const lowerQuery = query.toLowerCase();
    return allTools.filter(tool =>
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery))
    );
  }

  getToolById(id) {
    const allTools = this.getAllTools();
    return allTools.find(tool => tool.id === id);
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
    this.currentTab = 'coord'; // 默认坐标计算tab
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

    // 工具卡片点击事件 - 使用事件委托，支持动态添加的工具卡片
    document.getElementById('homepage').addEventListener('click', (e) => {
      const card = e.target.closest('.tool-card');
      if (!card) return;

      const toolId = card.dataset.tool;
      if (toolId === 'add') {
        this.handleAddTool();
      } else if (toolId) {
        this.showTool(toolId);
      }
    });

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
      this.router.goBack();
    });

    // 字符串反转返回按钮
    const reverseBackBtn = document.getElementById('reverseBackBtn');
    if (reverseBackBtn) {
      reverseBackBtn.addEventListener('click', () => {
        this.router.goBack();
      });
    }

    // 围栏计算现在在同一个页面内，不需要单独的返回按钮逻辑
    // 保留代码以防将来需要独立页面
    const fenceBackBtn = document.getElementById('fenceBackBtn');
    if (fenceBackBtn) {
      fenceBackBtn.addEventListener('click', () => {
        // 如果围栏计算是独立页面，返回到 h3-tool 页面
        this.router.showPage('h3-tool');
        this.switchTab('coord');
      });
    }

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (this.router.currentPage === 'homepage') {
        this.keyboardNav.handleKeyDown(e);
      }
    });

    // H3 工具事件
    this.setupH3ToolEvents();

    // Tab 切换事件
    this.setupTabEvents();
  }

  showHomepage() {
    this.router.showPage('homepage');
    // 更新工具卡片列表
    setTimeout(() => {
      this.keyboardNav.updateToolCards();
    }, 100);
    // 更新自定义工具显示
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
      // 处理自定义工具
      const tool = this.toolManager.getToolById(toolId);
      if (tool && tool.url) {
        this.handleCustomToolClick(tool);
      }
    }
  }

  handleAddTool() {
    this.showAddToolModal();
  }

  showAddToolModal() {
    const modal = document.getElementById('addToolModal');
    const toolNameInput = document.getElementById('toolName');
    const toolUrlInput = document.getElementById('toolUrl');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const closeBtn = document.getElementById('closeModal');

    // 清空输入框
    toolNameInput.value = '';
    toolUrlInput.value = '';

    // 显示模态框
    modal.style.display = 'flex';
    // 添加 show 类来触发动画（opacity: 0 -> 1）
    modal.classList.add('show');

    // 聚焦到名称输入框
    setTimeout(() => toolNameInput.focus(), 100);

    // 保存按钮事件
    const handleSave = () => {
      const name = toolNameInput.value.trim();
      const url = toolUrlInput.value.trim();

      if (!name) {
        alert('请输入工具名称');
        toolNameInput.focus();
        return;
      }

      if (!url) {
        alert('请输入跳转链接');
        toolUrlInput.focus();
        return;
      }

      // 验证URL格式
      try {
        new URL(url);
      } catch (e) {
        alert('请输入有效的URL格式');
        toolUrlInput.focus();
        return;
      }

      // 添加自定义工具
      const customTool = this.toolManager.addCustomTool(name, url);

      // 更新UI
      this.updateCustomToolsDisplay();

      // 关闭模态框
      this.hideAddToolModal();
    };

    // 绑定事件
    saveBtn.onclick = handleSave;
    cancelBtn.onclick = () => this.hideAddToolModal();
    closeBtn.onclick = () => this.hideAddToolModal();

    // 回车键保存
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        this.hideAddToolModal();
      } else if (e.key === 'Tab') {
        // Tab键导航：在输入框之间切换
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Tab: 反向导航
          if (e.target === toolUrlInput) {
            toolNameInput.focus();
          } else if (e.target === toolNameInput) {
            cancelBtn.focus();
          }
        } else {
          // Tab: 正向导航
          if (e.target === toolNameInput) {
            toolUrlInput.focus();
          } else if (e.target === toolUrlInput) {
            saveBtn.focus();
          }
        }
      }
    };

    toolNameInput.onkeydown = handleKeyDown;
    toolUrlInput.onkeydown = handleKeyDown;

    // 为按钮添加键盘导航支持
    saveBtn.onkeydown = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          toolUrlInput.focus();
        } else {
          cancelBtn.focus();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    cancelBtn.onkeydown = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          saveBtn.focus();
        } else {
          toolNameInput.focus();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.hideAddToolModal();
      }
    };

    // 点击模态框背景关闭
    modal.onclick = (e) => {
      if (e.target === modal) {
        this.hideAddToolModal();
      }
    };
  }

  hideAddToolModal() {
    const modal = document.getElementById('addToolModal');
    // 移除 show 类来触发动画（opacity: 1 -> 0）
    modal.classList.remove('show');
    // 等待动画完成后再隐藏
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300); // 与CSS transition时间一致
  }

  updateCustomToolsDisplay() {
    const customToolsSection = document.getElementById('custom-tools-section');
    const customToolsGrid = document.getElementById('custom-tools');

    if (this.toolManager.customTools.length === 0) {
      customToolsSection.style.display = 'none';
      return;
    }

    customToolsSection.style.display = 'block';
    customToolsGrid.innerHTML = '';

    this.toolManager.customTools.forEach(tool => {
      const toolCard = document.createElement('div');
      toolCard.className = 'tool-card custom-tool';
      toolCard.dataset.tool = tool.id;

      toolCard.innerHTML = `
        <div class="tool-icon">${tool.icon}</div>
        <div class="tool-content">
          <h3>${tool.name}</h3>
          <p>${tool.description}</p>
        </div>
        <button class="delete-btn" data-tool-id="${tool.id}" title="删除工具">×</button>
      `;

      // 删除按钮事件（卡片点击通过事件委托处理）
      const deleteBtn = toolCard.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡到卡片
        this.handleDeleteCustomTool(tool);
      });

      customToolsGrid.appendChild(toolCard);
    });

    // 更新键盘导航
    setTimeout(() => {
      this.keyboardNav.updateToolCards();
    }, 100);
  }

  handleCustomToolClick(tool) {
    // 在新标签页中打开链接
    chrome.tabs.create({ url: tool.url });
  }

  handleDeleteCustomTool(tool) {
    // 确认删除
    if (confirm(`确定要删除工具 "${tool.name}" 吗？`)) {
      const success = this.toolManager.deleteCustomTool(tool.id);
      if (success) {
        // 更新UI显示
        this.updateCustomToolsDisplay();
        // 更新键盘导航
        setTimeout(() => {
          this.keyboardNav.updateToolCards();
        }, 100);
      } else {
        alert('删除失败，请重试');
      }
    }
  }

  setupH3ToolEvents() {
    const latlngInput = document.getElementById('latlng');
    const resInput = document.getElementById('res');
    const ringInput = document.getElementById('ring');

    const onInput = () => this.compute();

    // 经纬度输入验证
    if (latlngInput) {
      // 允许的字符：数字、中文逗号、英文逗号、空格、小数点、负号
      const VALID_PATTERN = /^[0-9\s,，.-]*$/;
      const INVALID_CHARS_PATTERN = /[^0-9\s,，.-]/g;

      // 清理非法字符的函数
      const sanitizeInput = (value) => {
        if (!VALID_PATTERN.test(value)) {
          return value.replace(INVALID_CHARS_PATTERN, '');
        }
        return value;
      };

      latlngInput.addEventListener("input", (e) => {
        e.target.value = sanitizeInput(e.target.value);
        onInput();
      });

      // 防止粘贴非法字符
      latlngInput.addEventListener("paste", (e) => {
        setTimeout(() => {
          e.target.value = sanitizeInput(e.target.value);
        }, 0);
      });
    }

    if (resInput) resInput.addEventListener("input", onInput);
    if (ringInput) ringInput.addEventListener("input", onInput);

    // H3索引输入事件
    const h3IndexInput = document.getElementById('h3Index');
    if (h3IndexInput) {
      h3IndexInput.addEventListener("input", () => {
        if (this.currentTab === 'grid') {
          this.computeGrid();
        }
      });
    }

  }

  setupTabEvents() {
    const coordTab = document.getElementById('coordTab');
    const gridTab = document.getElementById('gridTab');
    const fenceTab = document.getElementById('fenceTab');
    const coordSection = document.getElementById('coordSection');
    const gridSection = document.getElementById('gridSection');
    const fenceSection = document.getElementById('fenceSection');

    if (!coordTab || !gridTab || !fenceTab || !coordSection || !gridSection || !fenceSection) return;

    // 坐标计算tab点击事件
    coordTab.addEventListener('click', () => {
      this.switchTab('coord');
    });

    // 网格计算tab点击事件
    gridTab.addEventListener('click', () => {
      this.switchTab('grid');
    });

    // 围栏计算tab点击事件
    fenceTab.addEventListener('click', () => {
      this.switchTab('fence');
    });
  }

  switchTab(tabName) {
    const coordTab = document.getElementById('coordTab');
    const gridTab = document.getElementById('gridTab');
    const fenceTab = document.getElementById('fenceTab');
    const coordSection = document.getElementById('coordSection');
    const gridSection = document.getElementById('gridSection');
    const fenceSection = document.getElementById('fenceSection');

    // 更新tab按钮状态
    coordTab.classList.toggle('active', tabName === 'coord');
    gridTab.classList.toggle('active', tabName === 'grid');
    fenceTab.classList.toggle('active', tabName === 'fence');

    // 更新输入区域显示
    coordSection.classList.toggle('active-tab', tabName === 'coord');
    gridSection.classList.toggle('active-tab', tabName === 'grid');
    fenceSection.classList.toggle('active-tab', tabName === 'fence');

    // 更新结果区域显示
    const gridInfoSection = document.querySelector('.result-section:first-of-type');
    const fenceResultSection = document.getElementById('fence-result-section');
    const ringSection = document.getElementById('ring-section');

    if (tabName === 'fence') {
      // 围栏计算tab：显示围栏结果，隐藏网格信息
      if (fenceResultSection) {
        fenceResultSection.style.display = 'block';
      }
      if (gridInfoSection && gridInfoSection.id !== 'fence-result-section') {
        gridInfoSection.style.display = 'none';
      }
      if (ringSection) {
        ringSection.style.display = 'none';
      }
    } else {
      // 坐标计算或网格计算tab：显示网格信息，隐藏围栏结果
      if (gridInfoSection && gridInfoSection.id !== 'fence-result-section') {
        gridInfoSection.style.display = 'block';
      }
      if (fenceResultSection) {
        fenceResultSection.style.display = 'none';
      }
      // ringSection 的显示由 compute() 方法控制
    }

    // 更新当前tab状态
    this.currentTab = tabName;

    // 清空错误信息
    const errorEl = document.getElementById('error');
    const gridErrorEl = document.getElementById('gridError');
    const fenceErrorEl = document.getElementById('fenceError');
    if (errorEl) errorEl.hidden = true;
    if (gridErrorEl) gridErrorEl.hidden = true;
    if (fenceErrorEl) fenceErrorEl.hidden = true;

    // 根据tab切换计算结果
    if (tabName === 'coord') {
      this.compute();
    } else if (tabName === 'grid') {
      this.computeGrid();
    } else if (tabName === 'fence') {
      this.computeFence();
    }
  }

  initH3Tool() {
    const latlngInput = document.getElementById('latlng');
    if (latlngInput && !latlngInput.value) {
      latlngInput.value = "-122.418,37.775";
    }

    // 初始化网格计算
    const h3IndexInput = document.getElementById('h3Index');
    if (h3IndexInput && !h3IndexInput.value) {
      h3IndexInput.value = "8a1fb46622dffff";
    }

    // 初始化围栏计算输入事件
    const fenceInput = document.getElementById('fenceInput');
    const fenceResInput = document.getElementById('fenceRes');
    if (fenceInput) {
      fenceInput.addEventListener('input', () => {
        if (this.currentTab === 'fence') {
          this.computeFence();
        }
      });
    }
    if (fenceResInput) {
      fenceResInput.addEventListener('input', () => {
        if (this.currentTab === 'fence') {
          this.computeFence();
        }
      });
    }

    // 根据当前tab计算
    if (this.currentTab === 'coord') {
      this.compute();
    } else if (this.currentTab === 'grid') {
      this.computeGrid();
    } else if (this.currentTab === 'fence') {
      this.computeFence();
    }
  }

  parseInputs() {
    const latlngStr = document.getElementById('latlng').value.trim();
    const res = parseInt(document.getElementById('res').value, 10);
    const ring = parseInt(document.getElementById('ring').value, 10);

    if (!latlngStr) {
      throw new Error("请输入经纬度");
    }

    // 支持多种分隔符：中文逗号、英文逗号、空格
    // 先统一替换中文逗号为英文逗号，然后按逗号或空格分割
    let normalizedStr = latlngStr.replace(/，/g, ','); // 中文逗号替换为英文逗号

    // 尝试按逗号分割
    let parts = normalizedStr.split(',').map(part => part.trim()).filter(part => part.length > 0);

    // 如果没有逗号，尝试按空格分割（处理连续空格）
    if (parts.length === 1) {
      parts = normalizedStr.split(/\s+/).filter(part => part.length > 0);
    }

    if (parts.length !== 2) {
      throw new Error("请输入格式：经度,纬度 或 经度 纬度（支持中文逗号、英文逗号或空格分隔）");
    }

    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(res) || !Number.isFinite(ring)) {
      throw new Error("请输入有效的经度、纬度、网格级别和扩圈数");
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
      const [cLat, cLng] = cellToLatLng(cell); // 注意返回顺序为 [lat, lng]
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

      // 使用默认格式，返回 [lat, lng]（注意：GeoJSON 格式会返回 [lng, lat]）
      const boundary = cellToBoundary(cell); // [[lat, lng], ...]
      const vertsPairs = boundary.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
      document.getElementById('vertsText').textContent = vertsPairs.join(';');

      // 计算边长和面积
      const edgeLen = getHexagonEdgeLengthAvg(res, UNITS.m);
      const area = cellArea(cell, UNITS.m2);
      const radius = this.calculateCircleRadius(area);
      // 计算该单元的最长/最短边长
      const edgeStats = this.calculateEdgeStats(boundary);
      document.getElementById('edge-length').textContent = `${edgeLen.toFixed(2)} m (最长: ${edgeStats.max.toFixed(2)} m, 最短: ${edgeStats.min.toFixed(2)} m)`;
      document.getElementById('hex-area').textContent = `${area.toFixed(2)} m² (半径: ${radius.toFixed(1)} m)`;

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

        // 收集所有扩圈网格的顶点坐标
        const allVertexCoords = [];
        ringCells.forEach(cell => {
          const boundary = cellToBoundary(cell);
          const vertsPairs = boundary.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
          allVertexCoords.push(...vertsPairs);
        });

        // 限制显示的坐标长度，与其他数据项保持一致
        const fullCoordsText = allVertexCoords.join(';');
        const maxDisplayLength = 35; // 限制显示长度为35个字符
        const displayCoordsText = fullCoordsText.length > maxDisplayLength
          ? fullCoordsText.substring(0, maxDisplayLength) + '...'
          : fullCoordsText;

        // 显示所有顶点坐标（限制长度）
        const allVertexCoordsContainer = document.getElementById('all-vertex-coords');
        allVertexCoordsContainer.textContent = displayCoordsText;

        // 设置复制按钮功能（复制完整数据）
        this.setupVertexCoordsCopyButton(fullCoordsText);

        // 边界提取（复用围栏的 extractBoundaryFromCells）
        try {
          const ringBoundaryCoords = this.extractBoundaryFromCells(ringCells);
          const ringBoundaryPairs = ringBoundaryCoords.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
          const ringBoundaryText = ringBoundaryPairs.join(';');
          const ringBoundaryEl = document.getElementById('ring-boundary-coords');
          if (ringBoundaryEl) {
            const maxDisplayLength = 200;
            const displayText = ringBoundaryText.length > maxDisplayLength
              ? ringBoundaryText.substring(0, maxDisplayLength) + '...'
              : ringBoundaryText;
            ringBoundaryEl.textContent = displayText;
          }
          this.setupRingBoundaryCoordsCopyButton(ringBoundaryText);
        } catch (e) {
          console.warn('ring boundary extract failed', e);
        }

        // 蜂窝围栏（复用 buildHoneycombFenceFromCells）
        try {
          const ringHoneycomb = this.buildHoneycombFenceFromCells(ringCells);
          const ringHoneyText = (ringHoneycomb && ringHoneycomb.length)
            ? ringHoneycomb.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
            : '';
          const ringHoneyEl = document.getElementById('ring-honeycomb-coords');
          if (ringHoneyEl) {
            const maxDisplayLength = 200;
            const displayText = ringHoneyText.length > maxDisplayLength
              ? ringHoneyText.substring(0, maxDisplayLength) + '...'
              : ringHoneyText;
            ringHoneyEl.textContent = displayText;
          }
          const copyRingHoneyBtn = document.getElementById('copyRingHoneycombBtn');
          if (copyRingHoneyBtn) {
            copyRingHoneyBtn.style.display = '';
            copyRingHoneyBtn.replaceWith(copyRingHoneyBtn.cloneNode(true));
            const newBtn = document.getElementById('copyRingHoneycombBtn');
            newBtn.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(ringHoneyText);
                const original = newBtn.textContent;
                newBtn.textContent = '✓';
                newBtn.style.background = 'var(--ok)';
                setTimeout(() => {
                  newBtn.textContent = original;
                  newBtn.style.background = 'var(--accent)';
                }, 1000);
              } catch (err) {
                console.error('复制ring蜂窝围栏失败', err);
                alert('复制失败，请手动复制');
              }
            });
          }
        } catch (e) {
          console.warn('ring honeycomb failed', e);
        }
      } else {
        ringSection.style.display = 'none';
      }

      return { cell, ringCells };
    } catch (err) {
      this.showError(String(err.message || err));
    }
  }

  computeGrid() {
    try {
      const h3IndexInput = document.getElementById('h3Index');
      const raw = h3IndexInput.value.trim();

      if (!raw) {
        this.clearResults();
        return;
      }

      // 支持多个索引输入，使用中英文逗号或空白分隔
      const tokens = raw.split(/[\s,，]+/).map(s => s.trim()).filter(s => s.length > 0);

      // 验证H3索引格式
      const h3Pattern = /^[0-9a-fA-F]{8,15}$/;
      for (const t of tokens) {
        if (!h3Pattern.test(t)) {
          this.showGridError('请输入有效的H3网格索引格式（多个索引请用逗号或空格分隔）');
          return;
        }
      }

      // 保持现有逻辑：以第一个索引作为主索引来计算中心/父级/面积等信息
      const h3Index = tokens[0];

      // 获取主网格信息
      const [lat, lng] = cellToLatLng(h3Index); // [lat, lng]
      const res = getResolution(h3Index);
      const parent = res > 0 ? cellToParent(h3Index, res - 1) : null;
      const boundary = cellToBoundary(h3Index); // [[lat, lng], ...]
      const vertsPairs = boundary.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
      const edgeLen = getHexagonEdgeLengthAvg(res, UNITS.m);
      const area = cellArea(h3Index, UNITS.m2);
      const radius = this.calculateCircleRadius(area);
      const edgeStats = this.calculateEdgeStats(boundary);

      // 如果输入了多个网格，聚合所有网格的顶点信息用于显示
      let allVertsPairs = vertsPairs.slice();
      if (tokens.length > 1) {
        for (let i = 1; i < tokens.length; i++) {
          try {
            const b = cellToBoundary(tokens[i]);
            const pairs = b.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
            allVertsPairs.push(...pairs);
          } catch (e) {
            // 忽略个别 cellToBoundary 失败，继续处理其它网格
            console.warn('Failed to get boundary for cell', tokens[i], e);
          }
        }
      }

      // 更新显示（保持其它字段按第一个索引的计算结果，vertsText 显示全部顶点）
      document.getElementById('cell').textContent = h3Index;
      document.getElementById('center-point').textContent = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      document.getElementById('parent').textContent = parent ? String(parent) : '无';
      document.getElementById('edge-length').textContent = `${edgeLen.toFixed(2)} m (最长: ${edgeStats.max.toFixed(2)} m, 最短: ${edgeStats.min.toFixed(2)} m)`;
      document.getElementById('hex-area').textContent = `${area.toFixed(2)} m² (半径: ${radius.toFixed(1)} m)`;
      document.getElementById('vertsText').textContent = allVertsPairs.join(';');

      // 隐藏扩圈信息（网格计算模式下不显示）
      document.getElementById('ring-section').style.display = 'none';

      // 清空错误
      this.hideGridError();

    } catch (err) {
      this.showGridError(String(err.message || err));
    }
  }

  showGridError(msg) {
    const errorEl = document.getElementById('gridError');
    errorEl.textContent = msg;
    errorEl.hidden = false;
    this.clearResults();
  }

  hideGridError() {
    document.getElementById('gridError').hidden = true;
  }

  initReverseTool() {
    const input = document.getElementById('reverseInput');
    const output = document.getElementById('reverseOutput');
    const charCount = document.getElementById('reverseCharCount');
    const copyBtn = document.getElementById('copyReverseBtn');

    if (!input) return;

    const doReverse = () => {
      const val = input.value;
      if (!val) {
        output.textContent = '';
        charCount.textContent = '';
        return;
      }
      // 使用 spread operator 正确处理 Unicode 字符（如 emoji）
      const reversed = [...val].reverse().join('');
      output.textContent = reversed;
      charCount.textContent = `${[...val].length} 个字符`;
    };

    input.addEventListener('input', doReverse);

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = output.textContent;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const original = copyBtn.textContent;
          copyBtn.textContent = '✓';
          setTimeout(() => { copyBtn.textContent = original; }, 1000);
        } catch (err) {
          console.error('复制失败:', err);
          alert('复制失败，请手动复制');
        }
      });
    }
  }

  // 根据面积计算圆形半径
  calculateCircleRadius(area) {
    // 面积 = π * r²，所以 r = √(面积 / π)
    const radius = Math.sqrt(area / Math.PI);
    return radius;
  }

  // 计算两点间测地线距离（米）
  haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371008.8; // 平均地球半径（米）
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // 计算边界的最长/最短边长（米）
  calculateEdgeStats(boundaryLatLngPairs) {
    // boundary: [[lat, lng], ...] 逆时针，闭合六边形
    if (!boundaryLatLngPairs || boundaryLatLngPairs.length < 3) {
      return { min: 0, max: 0 };
    }
    let minLen = Infinity;
    let maxLen = 0;
    const n = boundaryLatLngPairs.length;
    for (let i = 0; i < n; i++) {
      const [lat1, lng1] = boundaryLatLngPairs[i];
      const [lat2, lng2] = boundaryLatLngPairs[(i + 1) % n];
      const d = this.haversineDistanceMeters(lat1, lng1, lat2, lng2);
      if (d < minLen) minLen = d;
      if (d > maxLen) maxLen = d;
    }
    return { min: minLen, max: maxLen };
  }

  // 计算中心点到各顶点的最长/最短半径（米）
  calculateRadiusStats(centerLatLng, boundaryLatLngPairs) {
    if (!boundaryLatLngPairs || boundaryLatLngPairs.length === 0) {
      return { min: 0, max: 0 };
    }
    const [cLat, cLng] = centerLatLng;
    let minR = Infinity;
    let maxR = 0;
    for (const [lat, lng] of boundaryLatLngPairs) {
      const r = this.haversineDistanceMeters(cLat, cLng, lat, lng);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    return { min: minR, max: maxR };
  }

  // 计算中心点到各边中点的最长/最短半径（米）
  calculateInradiusStats(centerLatLng, boundaryLatLngPairs) {
    if (!boundaryLatLngPairs || boundaryLatLngPairs.length < 3) {
      return { min: 0, max: 0 };
    }
    const [cLat, cLng] = centerLatLng;
    let minR = Infinity;
    let maxR = 0;
    const n = boundaryLatLngPairs.length;
    for (let i = 0; i < n; i++) {
      const [lat1, lng1] = boundaryLatLngPairs[i];
      const [lat2, lng2] = boundaryLatLngPairs[(i + 1) % n];
      // 边中点（在经纬度空间线性插值作为近似）
      const midLat = (lat1 + lat2) / 2;
      const midLng = (lng1 + lng2) / 2;
      const r = this.haversineDistanceMeters(cLat, cLng, midLat, midLng);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    return { min: minR, max: maxR };
  }

  clearResults() {
    document.getElementById('cell').textContent = '';
    document.getElementById('center-point').textContent = '';
    document.getElementById('parent').textContent = '';
    document.getElementById('edge-length').textContent = '';
    document.getElementById('hex-area').textContent = '';
    document.getElementById('vertsText').textContent = '';
    document.getElementById('ring-section').style.display = 'none';
  }

  setupVertexCoordsCopyButton(coordsText) {
    const copyBtn = document.getElementById('copyVertexCoordsBtn');
    if (!copyBtn) return;

    // 移除之前的事件监听器
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    const newCopyBtn = document.getElementById('copyVertexCoordsBtn');

    newCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coordsText);
        // 临时改变按钮文本显示复制成功
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = '✓';
        newCopyBtn.style.background = 'var(--ok)';

        setTimeout(() => {
          newCopyBtn.textContent = originalText;
          newCopyBtn.style.background = 'var(--accent)';
        }, 1000);
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
      }
    });
  }

  // 去重坐标点（基于经纬度精度）
  deduplicateCoordinates(coordinates) {
    // coordinates: [[lat, lng], ...]
    const precision = 1e-6; // 精度阈值：约0.1米
    const seen = new Set();
    const unique = [];

    for (const [lat, lng] of coordinates) {
      // 将坐标四舍五入到精度阈值，用于比较
      const roundedLat = Math.round(lat / precision) * precision;
      const roundedLng = Math.round(lng / precision) * precision;
      const key = `${roundedLat},${roundedLng}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push([lat, lng]);
      }
    }

    return unique;
  }

  // 从网格集合中提取边界顶点（方案三：基于网格边界）
  extractBoundaryFromCells(cellArray) {
    // New approach: build directed edges for every cell, remove shared edges (those appear in both directions),
    // then chain remaining directed edges into closed loops. Return the largest closed loop (as [lat,lng] pairs).
    if (!cellArray || cellArray.length === 0) return [];

    const precision = 1e-6; // rounding precision for keys
    const coordKey = (lat, lng) => `${Math.round(lat / precision) * precision}:${Math.round(lng / precision) * precision}`;

    // Maps
    const directedEdges = new Map(); // key: "startKey->endKey" -> { start:[lat,lng], end:[lat,lng] }
    const undirectedCount = new Map(); // key: "minKey|maxKey" -> count

    // Build edges for all cells
    for (const cell of cellArray) {
      let boundary;
      try {
        boundary = cellToBoundary(cell); // [[lat, lng], ...]
      } catch (err) {
        console.warn('Failed to get boundary for cell:', cell, err);
        continue;
      }

      if (!boundary || boundary.length < 2) continue;

      // Iterate edges (closed)
      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i];
        const b = boundary[(i + 1) % boundary.length];
        const startLat = a[0], startLng = a[1];
        const endLat = b[0], endLng = b[1];

        const startKey = coordKey(startLat, startLng);
        const endKey = coordKey(endLat, endLng);
        const dirKey = `${startKey}->${endKey}`;
        const undirKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;

        // store directed edge (if duplicates occur, keep one)
        if (!directedEdges.has(dirKey)) {
          directedEdges.set(dirKey, { start: [startLat, startLng], end: [endLat, endLng] });
        }

        undirectedCount.set(undirKey, (undirectedCount.get(undirKey) || 0) + 1);
      }
    }

    // Keep only directed edges whose undirected count == 1 (i.e., not shared)
    const boundaryDirected = new Map(); // startKey -> array of endKey
    const directedEdgeCoords = new Map(); // dirKey -> {start,end}
    for (const [dirKey, edge] of directedEdges.entries()) {
      const [startKey, endKey] = dirKey.split('->');
      const undirKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      const count = undirectedCount.get(undirKey) || 0;
      if (count === 1) {
        // boundary edge
        directedEdgeCoords.set(dirKey, edge);
        if (!boundaryDirected.has(startKey)) boundaryDirected.set(startKey, []);
        boundaryDirected.get(startKey).push(endKey);
      }
    }

    if (directedEdgeCoords.size === 0) return [];

    // Chain edges into closed loops. We'll extract all loops and choose the largest by vertex count.
    const loops = [];
    const usedDirKeys = new Set();

    // Helper to find dirKey from startKey and endKey
    const makeDirKey = (s, e) => `${s}->${e}`;

    for (const dirKey of directedEdgeCoords.keys()) {
      if (usedDirKeys.has(dirKey)) continue;

      // start a new loop
      const edge = directedEdgeCoords.get(dirKey);
      const startKey = coordKey(edge.start[0], edge.start[1]);
      const loopCoords = [];

      let currentStartKey = startKey;
      let safety = 0;
      let closed = false;

      while (safety++ < 100000) {
        const ends = boundaryDirected.get(currentStartKey);
        if (!ends || ends.length === 0) break; // dead end -> abort this chain

        // pick the first unused end
        let nextEndKey = null;
        for (const candidate of ends) {
          const candidateDir = makeDirKey(currentStartKey, candidate);
          if (!usedDirKeys.has(candidateDir) && directedEdgeCoords.has(candidateDir)) {
            nextEndKey = candidate;
            break;
          }
        }

        if (!nextEndKey) break; // no unused outgoing edge

        // push current start coordinate
        const currentEdgeKey = makeDirKey(currentStartKey, nextEndKey);
        const currentEdge = directedEdgeCoords.get(currentEdgeKey);
        if (!currentEdge) break;

        loopCoords.push(currentEdge.start);
        usedDirKeys.add(currentEdgeKey);

        // if we reached back to loop start, close
        if (nextEndKey === startKey) {
          // add the end point to close
          loopCoords.push(currentEdge.end);
          closed = true;
          break;
        }

        // advance
        currentStartKey = nextEndKey;
      }

      if (closed && loopCoords.length >= 4) {
        // ensure first equals last
        const first = loopCoords[0];
        const last = loopCoords[loopCoords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          loopCoords.push([first[0], first[1]]);
        }
        loops.push(loopCoords);
      }
    }

    if (loops.length === 0) return [];

    // choose the largest loop (by number of vertices)
    loops.sort((a, b) => b.length - a.length);
    const mainLoop = loops[0];

    // Optionally deduplicate closely similar consecutive vertices
    const deduped = this.deduplicateCoordinates(mainLoop);
    // ensure closed
    if (deduped.length > 0) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        deduped.push([first[0], first[1]]);
      }
    }

    return deduped;
  }

  // 分层提取并拼接蜂窝围栏（不修改现有业务流程；可被调用以获取拼接链）
  // 输入: cellArray - Array of H3 cell ids
  // 输出: 一个坐标数组 (array of [lat,lng]) 表示拼接后的围栏链（outer -> connectors -> inner -> ...）
  buildHoneycombFenceFromCells(cellArray) {
    if (!cellArray || cellArray.length === 0) return [];

    const precision = 1e-6;
    const coordKey = (lat, lng) => `${Math.round(lat / precision) * precision}:${Math.round(lng / precision) * precision}`;

    // build edge index for a set of cells
    const buildEdgeIndex = (cells) => {
      const cellEdges = new Map(); // cell -> [{undirKey, start, end}]
      const undirToCells = new Map(); // undirKey -> Set of cells

      for (const cell of cells) {
        let boundary;
        try {
          boundary = cellToBoundary(cell);
        } catch (e) {
          continue;
        }
        if (!boundary || boundary.length < 2) continue;

        const edges = [];
        for (let i = 0; i < boundary.length; i++) {
          const a = boundary[i];
          const b = boundary[(i + 1) % boundary.length];
          const aCoord = [a[0], a[1]]; // [lat,lng]
          const bCoord = [b[0], b[1]];
          const aKey = coordKey(aCoord[0], aCoord[1]);
          const bKey = coordKey(bCoord[0], bCoord[1]);
          const undirKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
          edges.push({ undirKey, start: aCoord, end: bCoord });

          if (!undirToCells.has(undirKey)) undirToCells.set(undirKey, new Set());
          undirToCells.get(undirKey).add(cell);
        }
        cellEdges.set(cell, edges);
      }

      return { cellEdges, undirToCells };
    };

    // full index for lookup during stitching
    const fullIndex = buildEdgeIndex(cellArray);

    // iterative layered extraction
    const layers = [];
    let remaining = new Set(cellArray);
    const proximityThresholdMeters = 5; // fallback match threshold

    while (remaining.size > 0) {
      const remList = Array.from(remaining);
      // extract outer boundary using existing robust extractor
      const boundaryCoords = this.extractBoundaryFromCells(remList);
      if (!boundaryCoords || boundaryCoords.length === 0) break;

      // build index for current remaining cells
      const idx = buildEdgeIndex(remList);

      // derive undirected keys for consecutive coordinate pairs from boundaryCoords
      const outerUndirKeys = new Set();
      for (let i = 0; i < boundaryCoords.length - 1; i++) {
        const a = boundaryCoords[i];
        const b = boundaryCoords[i + 1];
        const aKey = coordKey(a[0], a[1]);
        const bKey = coordKey(b[0], b[1]);
        const undirKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
        outerUndirKeys.add(undirKey);
      }

      // collect contributing cells by direct key lookup
      const contributing = new Set();
      for (const uk of outerUndirKeys) {
        const set = idx.undirToCells.get(uk);
        if (set) for (const c of set) contributing.add(c);
      }

      // fallback: proximity-based matching when direct lookup fails
      if (contributing.size === 0) {
        try {
          // iterate each boundary edge and try to find matching undirKey by endpoint proximity
          const allUndirKeys = Array.from(idx.undirToCells.keys());
          for (let i = 0; i < boundaryCoords.length - 1; i++) {
            const a = boundaryCoords[i];
            const b = boundaryCoords[i + 1];
            for (const uk of allUndirKeys) {
              const parts = uk.split('|');
              if (parts.length !== 2) continue;
              const parseKey = (k) => {
                const [latS, lngS] = k.split(':');
                return [parseFloat(latS), parseFloat(lngS)];
              };
              const p = parseKey(parts[0]);
              const q = parseKey(parts[1]);
              // check both orientations
              const d1 = this.haversineDistanceMeters(a[0], a[1], p[0], p[1]);
              const d2 = this.haversineDistanceMeters(b[0], b[1], q[0], q[1]);
              const d3 = this.haversineDistanceMeters(a[0], a[1], q[0], q[1]);
              const d4 = this.haversineDistanceMeters(b[0], b[1], p[0], p[1]);
              if ((d1 <= proximityThresholdMeters && d2 <= proximityThresholdMeters) || (d3 <= proximityThresholdMeters && d4 <= proximityThresholdMeters)) {
                const set = idx.undirToCells.get(uk);
                if (set) for (const c of set) contributing.add(c);
              }
            }
          }
        } catch (e) {
          // ignore proximity errors
        }
      }

      if (contributing.size === 0) {
        // cannot map this outer boundary to cells reliably -> stop layering
        break;
      }

      layers.push({ coords: boundaryCoords, edgeKeys: outerUndirKeys, cells: contributing });

      // remove contributing cells from remaining
      for (const c of contributing) remaining.delete(c);
    }

    if (layers.length === 0) return [];

    // Stitch layers in a simple way: append outermost then each inner layer in order.
    // This keeps the behavior minimal and non-invasive (no connector matching).
    const finalChain = [];
    const appendNoDup = (coords) => {
      for (const p of coords) {
        if (finalChain.length === 0) finalChain.push(p);
        else {
          const last = finalChain[finalChain.length - 1];
          if (Math.abs(last[0] - p[0]) > precision || Math.abs(last[1] - p[1]) > precision) finalChain.push(p);
        }
      }
    };

    // append layers sequentially: outer -> inner -> inner2 -> ...
    for (let i = 0; i < layers.length; i++) {
      appendNoDup(layers[i].coords);
    }

    return finalChain;
  }

  // 将顶点排序形成闭合多边形（按极角排序）
  sortVerticesToPolygon(vertices) {
    if (vertices.length === 0) {
      return [];
    }
    if (vertices.length <= 3) {
      // 如果顶点数少于等于3个，直接返回并确保闭合
      const result = [...vertices];
      if (result.length > 0) {
        const first = result[0];
        const last = result[result.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          result.push([first[0], first[1]]);
        }
      }
      return result;
    }

    // 计算所有顶点的中心点
    let centerLat = 0;
    let centerLng = 0;
    for (const [lat, lng] of vertices) {
      centerLat += lat;
      centerLng += lng;
    }
    centerLat /= vertices.length;
    centerLng /= vertices.length;

    // 按极角排序（相对于中心点）
    const sorted = [...vertices].sort((a, b) => {
      const angleA = Math.atan2(a[0] - centerLat, a[1] - centerLng);
      const angleB = Math.atan2(b[0] - centerLat, b[1] - centerLng);
      return angleA - angleB;
    });

    // 确保多边形闭合（首尾点相同）
    if (sorted.length > 0) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        sorted.push([first[0], first[1]]);
      }
    }

    return sorted;
  }

  showError(msg) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  }

  initFenceTool() {
    // 围栏计算现在在同一个页面内，初始化逻辑已在 initH3Tool 中处理
    // 这个方法保留用于兼容性，但主要逻辑已移到 initH3Tool
    this.computeFence();
  }

  computeFence() {
    try {
      const fenceInput = document.getElementById('fenceInput');
      const fenceResInput = document.getElementById('fenceRes');
      const fenceError = document.getElementById('fenceError');

      if (!fenceInput || !fenceResInput) return;

      const fenceText = fenceInput.value.trim();
      const res = parseInt(fenceResInput.value, 10);

      // 清空错误
      if (fenceError) {
        fenceError.hidden = true;
      }

      if (!fenceText) {
        this.clearFenceResults();
        return;
      }

      if (!Number.isFinite(res) || res < 0 || res > 15) {
        this.showFenceError('网格级别应在 0 到 15');
        return;
      }

      // 解析坐标点：按分号分隔
      const points = fenceText.split(';').map(point => point.trim()).filter(point => point.length > 0);
      if (points.length < 3) {
        this.showFenceError('至少需要3个坐标点才能构成围栏');
        return;
      }

      const coordinates = [];
      for (const point of points) {
        // 支持中文逗号，统一替换为英文逗号
        let normalizedStr = point.replace(/，/g, ',');
        let parts = normalizedStr.split(',').map(part => part.trim()).filter(part => part.length > 0);

        // 如果没有逗号，尝试按空格分割
        if (parts.length === 1) {
          parts = normalizedStr.split(/\s+/).filter(part => part.length > 0);
        }

        if (parts.length !== 2) {
          this.showFenceError(`坐标格式错误：${point}，应为"经度,纬度"`);
          return;
        }

        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          this.showFenceError(`无效的坐标：${point}`);
          return;
        }

        if (lat < -90 || lat > 90) {
          this.showFenceError(`纬度范围应在 -90 到 90：${point}`);
          return;
        }

        if (lng < -180 || lng > 180) {
          this.showFenceError(`经度范围应在 -180 到 180：${point}`);
          return;
        }

        // 使用 GeoJSON 格式 [lng, lat]
        coordinates.push([lng, lat]);
      }

      // 确保多边形闭合（第一个点和最后一个点相同）
      if (coordinates.length > 0) {
        const firstPoint = coordinates[0];
        const lastPoint = coordinates[coordinates.length - 1];
        if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
          coordinates.push([firstPoint[0], firstPoint[1]]);
        }
      }

      // 使用 polygonToCells 计算覆盖围栏的所有网格
      // polygonToCells 接受 GeoJSON 格式的坐标数组 [lng, lat]
      // isGeoJson = true 表示使用 GeoJSON 格式（经度在前，纬度在后）
      // 返回所有中心点在多边形内的H3网格索引
      const cellArray = polygonToCells(coordinates, res, true);

      // 计算所有网格的顶点坐标并去重
      const allVertexCoords = [];
      for (const cell of cellArray) {
        // cellToBoundary 返回 [[lat, lng], ...]
        const boundary = cellToBoundary(cell);
        for (const [lat, lng] of boundary) {
          allVertexCoords.push([lat, lng]);
        }
      }

      // 去重处理
      const uniqueVerts = this.deduplicateCoordinates(allVertexCoords);
      const uniqueVertsPairs = uniqueVerts
        .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
      const uniqueVertsText = uniqueVertsPairs.join(';');

      // 更新显示
      const cellCountEl = document.getElementById('fence-cell-count');
      const cellsEl = document.getElementById('fence-cells');
      const fenceAllVertexCoordsEl = document.getElementById('fence-all-vertex-coords');

      if (cellCountEl) {
        cellCountEl.textContent = `${cellArray.length} 个网格`;
      }

      if (cellsEl) {
        // 限制显示长度
        const cellsText = cellArray.join(',');
        const maxDisplayLength = 200;
        const displayText = cellsText.length > maxDisplayLength
          ? cellsText.substring(0, maxDisplayLength) + '...'
          : cellsText;
        cellsEl.textContent = displayText;
      }

      // 设置覆盖网格复制按钮（复制完整的 cells 列表）
      this.setupFenceCellsCopyButton(cellArray.join(','));

      // 显示所有顶点坐标
      if (fenceAllVertexCoordsEl) {
        const maxDisplayLength = 200;
        const displayText = uniqueVertsText.length > maxDisplayLength
          ? uniqueVertsText.substring(0, maxDisplayLength) + '...'
          : uniqueVertsText;
        fenceAllVertexCoordsEl.textContent = displayText;
      }

      // 设置复制按钮功能
      this.setupFenceVertexCoordsCopyButton(uniqueVertsText);

      // 边界提取：找出边界网格并提取边界顶点
      const boundaryCoords = this.extractBoundaryFromCells(cellArray);
      const boundaryCoordsPairs = boundaryCoords
        .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
      const boundaryCoordsText = boundaryCoordsPairs.join(';');

      // 显示边界提取结果
      const fenceBoundaryCoordsEl = document.getElementById('fence-boundary-coords');
      if (fenceBoundaryCoordsEl) {
        const maxDisplayLength = 200;
        const displayText = boundaryCoordsText.length > maxDisplayLength
          ? boundaryCoordsText.substring(0, maxDisplayLength) + '...'
          : boundaryCoordsText;
        fenceBoundaryCoordsEl.textContent = displayText;
      }

      // 设置边界坐标复制按钮功能
      this.setupFenceBoundaryCoordsCopyButton(boundaryCoordsText);

      // 构建并显示蜂窝围栏（每条线段属于单个网格，不跨网格）
      try {
        const honeycombChain = this.buildHoneycombFenceFromCells(cellArray);
        const honeycombText = (honeycombChain && honeycombChain.length > 0)
          ? honeycombChain.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
          : '';
        const honeycombEl = document.getElementById('fence-honeycomb-coords');
        if (honeycombEl) {
          const maxDisplayLength = 200;
          const displayText = honeycombText.length > maxDisplayLength
            ? honeycombText.substring(0, maxDisplayLength) + '...'
            : honeycombText;
          honeycombEl.textContent = displayText;
        }

        const copyHoneyBtn = document.getElementById('copyFenceHoneycombBtn');
        if (copyHoneyBtn) {
          copyHoneyBtn.style.display = '';
          copyHoneyBtn.replaceWith(copyHoneyBtn.cloneNode(true));
          const newBtn = document.getElementById('copyFenceHoneycombBtn');
          newBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(honeycombText);
              const original = newBtn.textContent;
              newBtn.textContent = '✓';
              newBtn.style.background = 'var(--ok)';
              setTimeout(() => {
                newBtn.textContent = original;
                newBtn.style.background = 'var(--accent)';
              }, 1000);
            } catch (e) {
              console.error('复制蜂窝围栏失败', e);
              alert('复制失败，请手动复制');
            }
          });
        }
      } catch (e) {
        console.warn('蜂窝围栏构建失败', e);
      }

    } catch (err) {
      this.showFenceError(String(err.message || err));
    }
  }

  showFenceError(msg) {
    const errorEl = document.getElementById('fenceError');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
    this.clearFenceResults();
  }

  setupFenceVertexCoordsCopyButton(coordsText) {
    const copyBtn = document.getElementById('copyFenceVertexCoordsBtn');
    if (!copyBtn) return;

    // 移除之前的事件监听器
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    const newCopyBtn = document.getElementById('copyFenceVertexCoordsBtn');

    newCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coordsText);
        // 临时改变按钮文本显示复制成功
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = '✓';
        newCopyBtn.style.background = 'var(--ok)';

        setTimeout(() => {
          newCopyBtn.textContent = originalText;
          newCopyBtn.style.background = 'var(--accent)';
        }, 1000);
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
      }
    });
  }

  setupFenceBoundaryCoordsCopyButton(coordsText) {
    const copyBtn = document.getElementById('copyFenceBoundaryCoordsBtn');
    if (!copyBtn) return;

    // 移除之前的事件监听器
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    const newCopyBtn = document.getElementById('copyFenceBoundaryCoordsBtn');

    newCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coordsText);
        // 临时改变按钮文本显示复制成功
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = '✓';
        newCopyBtn.style.background = 'var(--ok)';

        setTimeout(() => {
          newCopyBtn.textContent = originalText;
          newCopyBtn.style.background = 'var(--accent)';
        }, 1000);
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
      }
    });
  }

  setupRingBoundaryCoordsCopyButton(coordsText) {
    const copyBtn = document.getElementById('copyRingBoundaryCoordsBtn');
    if (!copyBtn) return;

    // 移除之前的事件监听器
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    const newCopyBtn = document.getElementById('copyRingBoundaryCoordsBtn');

    newCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coordsText);
        // 临时改变按钮文本显示复制成功
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = '✓';
        newCopyBtn.style.background = 'var(--ok)';

        setTimeout(() => {
          newCopyBtn.textContent = originalText;
          newCopyBtn.style.background = 'var(--accent)';
        }, 1000);
      } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动选择文本复制');
      }
    });
  }

  setupFenceCellsCopyButton(cellsText) {
    const copyBtn = document.getElementById('copyFenceCellsBtn');
    if (!copyBtn) return;

    // 移除之前的事件监听器
    copyBtn.replaceWith(copyBtn.cloneNode(true));
    const newCopyBtn = document.getElementById('copyFenceCellsBtn');

    newCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cellsText);
        const originalText = newCopyBtn.textContent;
        newCopyBtn.textContent = '✓';
        newCopyBtn.style.background = 'var(--ok)';

        setTimeout(() => {
          newCopyBtn.textContent = originalText;
          newCopyBtn.style.background = 'var(--accent)';
        }, 1000);
      } catch (err) {
        console.error('复制覆盖网格列表失败:', err);
        alert('复制失败，请手动选择文本复制');
      }
    });
  }

  clearFenceResults() {
    const cellCountEl = document.getElementById('fence-cell-count');
    const cellsEl = document.getElementById('fence-cells');
    const fenceAllVertexCoordsEl = document.getElementById('fence-all-vertex-coords');
    const fenceBoundaryCoordsEl = document.getElementById('fence-boundary-coords');

    if (cellCountEl) cellCountEl.textContent = '';
    if (cellsEl) cellsEl.textContent = '';
    if (fenceAllVertexCoordsEl) fenceAllVertexCoordsEl.textContent = '';
    if (fenceBoundaryCoordsEl) fenceBoundaryCoordsEl.textContent = '';
  }

}

// 初始化应用
const app = new H3Tool();