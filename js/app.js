/**
 * 主應用程式 - Graph UI 版本
 */

// 全域變數
let graphCanvas = null;
let graphEngine = null;
let nodePanel = null;

/**
 * 應用程式初始化
 */
function initApp() {
  console.log('🎵 音效處理工具 (Graph UI) 啟動中...');

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

  // 儲存
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      graphEngine.saveToLocalStorage();
    });
  }

  // 載入
  const loadBtn = document.getElementById('loadBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      graphEngine.loadFromLocalStorage();
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

    // Ctrl/Cmd + S: 儲存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      graphEngine.saveToLocalStorage();
    }

    // Ctrl/Cmd + O: 載入
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      graphEngine.loadFromLocalStorage();
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
