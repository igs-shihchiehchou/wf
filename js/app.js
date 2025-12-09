/**
 * 主應用程式 - Graph UI 版本
 */

// 全域變數
let graphCanvas = null;
let graphEngine = null;
let nodePanel = null;
let clipboard = null; // 剪貼簿，存儲複製的節點資料

/**
 * 應用程式初始化
 */
function initApp() {
  console.log('♬ 音效處理工具 (Graph UI) 啟動中...');

  // 檢查瀏覽器支援
  if (!window.AudioContext && !window.webkitAudioContext) {
    showToast('您的瀏覽器不支援 Web Audio API', 'error');
    return;
  }

  // 檢查 WaveSurfer
  if (typeof WaveSurfer === 'undefined') {
    showToast('WaveSurfer.js 載入失敗', 'error');
    return;
  }

  // 初始化畫布
  const canvasArea = document.getElementById('canvasArea');
  graphCanvas = new GraphCanvas(canvasArea);

  // 初始化執行引擎
  graphEngine = new GraphEngine(graphCanvas);

  // 初始化節點面板
  const nodePanelContainer = document.getElementById('nodePanel');
  nodePanel = new NodePanel(nodePanelContainer);

  // 綁定工具列事件
  bindToolbarEvents();

  // 綁定鍵盤快捷鍵
  bindKeyboardShortcuts();

  // 嘗試載入上次的狀態
  // graphEngine.loadFromLocalStorage();

  console.log('✅ 應用程式準備就緒');
  showToast('歡迎使用音效處理工具！從左側拖拉節點開始', 'info');
}

/**
 * 綁定工具列事件
 */
function bindToolbarEvents() {
  // 執行所有
  const executeAllBtn = document.getElementById('executeAllBtn');
  if (executeAllBtn) {
    executeAllBtn.addEventListener('click', () => {
      graphEngine.executeAll();
    });
  }

  // 下拉選單功能
  setupDropdowns();

  // 快速儲存
  const quickSaveBtn = document.getElementById('quickSaveBtn');
  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      graphEngine.saveToLocalStorage();
      closeAllDropdowns();
    });
  }

  // 另存新檔
  const saveAsBtn = document.getElementById('saveAsBtn');
  if (saveAsBtn) {
    saveAsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      // 彈出輸入框讓用戶輸入檔名
      const filename = prompt('請輸入工作流名稱:', 'workflow');
      if (filename) {
        graphEngine.saveToFile(filename);
      }
    });
  }

  // 儲存選擇的工作流
  const saveSelectedBtn = document.getElementById('saveSelectedBtn');
  if (saveSelectedBtn) {
    saveSelectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (saveSelectedBtn.disabled) return;
      closeAllDropdowns();
      const filename = prompt('請輸入工作流名稱:', 'workflow-selected');
      if (filename) {
        graphEngine.saveSelectedToFile(filename);
      }
    });
  }

  // 快速載入
  const quickLoadBtn = document.getElementById('quickLoadBtn');
  if (quickLoadBtn) {
    quickLoadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      graphEngine.loadFromLocalStorage();
      closeAllDropdowns();
    });
  }

  // 從檔案載入
  const loadFileBtn = document.getElementById('loadFileBtn');
  if (loadFileBtn) {
    loadFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      graphEngine.loadFromFile();
    });
  }

  // 從檔案加入工作流
  const appendFileBtn = document.getElementById('appendFileBtn');
  if (appendFileBtn) {
    appendFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      graphEngine.appendFromFile();
    });
  }

  // 清除
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('確定要清除所有節點？')) {
        // 清除所有節點
        graphCanvas.nodes.forEach((node, id) => {
          graphCanvas.removeNode(id);
        });
        showToast('已清除所有節點', 'info');
      }
    });
  }

  // 縮放控制
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fitViewBtn = document.getElementById('fitViewBtn');
  const resetViewBtn = document.getElementById('resetViewBtn');

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => graphCanvas.zoomIn());
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => graphCanvas.zoomOut());
  }

  if (fitViewBtn) {
    fitViewBtn.addEventListener('click', () => graphCanvas.fitToContent());
  }

  if (resetViewBtn) {
    resetViewBtn.addEventListener('click', () => graphCanvas.resetView());
  }

  // 手機版選單
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      nodePanel.toggle();
    });
  }

  // 手機版：點擊畫布區域關閉節點面板
  const canvasArea = document.getElementById('canvasArea');
  if (canvasArea) {
    canvasArea.addEventListener('click', (e) => {
      // 只在手機版且面板開啟時處理
      if (window.innerWidth <= 768 && nodePanel.isVisible()) {
        // 確保點擊的是畫布區域本身，而不是節點或其他元素
        if (e.target === canvasArea || e.target.classList.contains('graph-canvas')) {
          nodePanel.hide();
        }
      }
    });
  }
}

/**
 * 設定下拉選單
 */
function setupDropdowns() {
  const dropdowns = document.querySelectorAll('.dropdown');
  const saveSelectedBtn = document.getElementById('saveSelectedBtn');

  // 更新儲存選擇按鈕的狀態
  function updateSaveSelectedState() {
    if (saveSelectedBtn && graphCanvas) {
      const hasSelection = graphCanvas.selectedNodes.size > 0;
      saveSelectedBtn.disabled = !hasSelection;
    }
  }

  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('.dropdown-toggle');

    // 點擊按鈕切換選單
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();

      // 更新儲存選擇按鈕狀態
      updateSaveSelectedState();

      // 關閉其他下拉選單
      dropdowns.forEach(d => {
        if (d !== dropdown) {
          d.classList.remove('open');
        }
      });

      // 切換當前下拉選單
      dropdown.classList.toggle('open');
    });
  });

  // 點擊其他地方關閉選單
  document.addEventListener('click', () => {
    closeAllDropdowns();
  });
}

/**
 * 關閉所有下拉選單
 */
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => {
    d.classList.remove('open');
  });
}

/**
 * 綁定鍵盤快捷鍵
 */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // 如果正在輸入，則忽略快捷鍵
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Ctrl/Cmd + Shift + S: 另存新檔
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      const filename = prompt('請輸入工作流名稱:', 'workflow');
      if (filename) {
        graphEngine.saveToFile(filename);
      }
      return;
    }

    // Ctrl/Cmd + S: 快速儲存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      graphEngine.saveToLocalStorage();
      return;
    }

    // Ctrl/Cmd + Shift + O: 從檔案載入
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
      e.preventDefault();
      graphEngine.loadFromFile();
      return;
    }

    // Ctrl/Cmd + O: 快速載入
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      graphEngine.loadFromLocalStorage();
      return;
    }

    // Ctrl/Cmd + C: 複製
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      clipboard = graphEngine.copySelectedNodes();
      return;
    }

    // Ctrl/Cmd + V: 貼上
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      if (clipboard) {
        graphEngine.pasteNodes(clipboard);
      }
      return;
    }

    // Ctrl/Cmd + E: 執行
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      graphEngine.executeAll();
    }

    // 空格鍵: 執行（當沒有選取節點時）
    if (e.code === 'Space' && graphCanvas.selectedNodes.size === 0) {
      e.preventDefault();
      graphEngine.executeAll();
    }

    // F: 適應內容
    if (e.key === 'f' || e.key === 'F') {
      graphCanvas.fitToContent();
    }

    // Home: 重置視圖
    if (e.key === 'Home') {
      graphCanvas.resetView();
    }

    // +/-: 縮放
    if (e.key === '+' || e.key === '=') {
      graphCanvas.zoomIn();
    }

    if (e.key === '-') {
      graphCanvas.zoomOut();
    }

    // 1-6: 快速新增節點
    const nodeShortcuts = {
      '1': 'audio-input',
      '2': 'volume',
      '3': 'crop',
      '4': 'fade-in',
      '5': 'fade-out',
      '6': 'speed'
    };

    if (nodeShortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
      // 在畫布中心建立節點
      const rect = document.getElementById('canvasArea').getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const canvasPos = graphCanvas.screenToCanvas(centerX, centerY);

      graphEngine.createNode(nodeShortcuts[e.key], canvasPos.x - 100, canvasPos.y - 50);
    }
  });
}

// 處理視窗大小變化
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    handleResize();
  }, 250);
});

function handleResize() {
  const isMobile = window.innerWidth <= 768;
  const nodePanelElement = document.getElementById('nodePanel');

  if (!nodePanelElement) return;

  // 從手機版切換到桌面版
  if (!isMobile) {
    // 清除手機版的 open 類別，恢復桌面版的顯示狀態
    nodePanelElement.classList.remove('open');
  } else {
    // 從桌面版切換到手機版
    // 手機版預設關閉（移除 open）
    nodePanelElement.classList.remove('open');
  }
}

// 當 DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// 顯示快捷鍵提示（首次載入）
let hasShownShortcutHint = localStorage.getItem('graphShortcutHintShown');
if (!hasShownShortcutHint) {
  setTimeout(() => {
    showToast('💡 提示：按 1-6 快速新增節點，空格鍵執行', 'info');
    localStorage.setItem('graphShortcutHintShown', 'true');
  }, 3000);
}
