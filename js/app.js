/**
 * 主應用程式
 */

// 卡片管理器
class CardsManager {
  constructor() {
    this.cards = [];
    this.container = document.getElementById('cardsContainer');
  }

  addCard(card) {
    this.cards.push(card);
    this.container.appendChild(card.getElement());
  }

  removeCard(cardId) {
    const index = this.cards.findIndex(card => card.id === cardId);
    if (index !== -1) {
      this.cards.splice(index, 1);
    }
  }

  clearAll() {
    if (confirm('確定要清除所有卡片？')) {
      this.cards.forEach(card => {
        if (card.wavesurfer) {
          card.wavesurfer.destroy();
        }
      });
      this.cards = [];
      this.container.innerHTML = '';
      showToast('已清除所有卡片', 'info');
    }
  }
}

// 建立全域卡片管理器
const cardsManager = new CardsManager();

// 檔案上傳處理
class FileUploadHandler {
  constructor() {
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.selectFileBtn = document.getElementById('selectFileBtn');

    this.attachEventListeners();
  }

  attachEventListeners() {
    // 點擊上傳區域或按鈕觸發檔案選擇
    this.selectFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    this.uploadArea.addEventListener('click', () => {
      this.fileInput.click();
    });

    // 檔案選擇
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFile(file);
      }
      // 清空 input，允許重複選擇同一檔案
      e.target.value = '';
    });

    // 拖拉上傳
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragging');
    });

    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragging');
    });

    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragging');

      const file = e.dataTransfer.files[0];
      if (file) {
        this.handleFile(file);
      }
    });
  }

  async handleFile(file) {
    // 檢查檔案格式
    if (!isSupportedAudioFormat(file)) {
      showToast('不支援的檔案格式', 'error');
      return;
    }

    try {
      // 顯示載入狀態
      this.uploadArea.classList.add('loading');

      // 載入音訊
      const audioBuffer = await audioProcessor.loadAudioFromFile(file);

      // 建立音訊卡片
      const card = new AudioCard(audioBuffer, file.name);
      cardsManager.addCard(card);

      showToast('檔案載入成功', 'success');

      // 滾動到新卡片
      setTimeout(() => {
        scrollToElement(card.getElement());
      }, 100);

    } catch (error) {
      console.error('載入檔案失敗:', error);
      showToast(error.message || '載入失敗', 'error');
    } finally {
      this.uploadArea.classList.remove('loading');
    }
  }
}

// 應用程式初始化
function initApp() {
  console.log('🎵 音效處理工具啟動中...');

  // 初始化檔案上傳處理器
  new FileUploadHandler();

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

  console.log('✅ 應用程式準備就緒');
}

// 當 DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// 鍵盤快捷鍵（可選）
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + O: 開啟檔案
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    document.getElementById('fileInput').click();
  }

  // Ctrl/Cmd + Shift + C: 清除所有卡片
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    cardsManager.clearAll();
  }
});
