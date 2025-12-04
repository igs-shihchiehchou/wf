/**
 * 節點基類 - 所有節點類型的基礎
 */

class BaseNode {
    constructor(id, type, title, icon, options = {}, defaultData = {}) {
        this.id = id;
        this.type = type;
        this.title = title;
        this.icon = icon;

        // 位置
        this.x = options.x || 0;
        this.y = options.y || 0;

        // 端口
        this.ports = [];
        this.inputPorts = [];
        this.outputPorts = [];

        // 狀態
        this.collapsed = false;
        this.processing = false;

        // 資料 - 先設定預設值，子類別可透過 defaultData 傳入
        this.data = { ...defaultData };

        // 事件回調
        this.onDelete = null;
        this.onPortConnect = null;
        this.onPortDisconnect = null;
        this.onDataChange = null;
        this.onPortDragStart = null;
        this.onGetInputData = null;

        // 預覽相關（支援多檔案）
        this.previewBuffer = null;
        this.previewBuffers = []; // 多檔案預覽
        this.previewWavesurfer = null;
        this.previewWavesurfers = []; // 多檔案 wavesurfer
        this.previewVisible = false;
        this.previewUpdateTimer = null;
        this.previewExpanded = false; // 預覽頁簽狀態
        this.previewCurrentPage = 0; // 當前預覽頁面
        this.previewFilesPerPage = 5; // 每頁檔案數

        // 設定端口（子類別實作）
        this.setupPorts();

        // 建立 DOM（在 data 和 ports 設定後）
        this.element = this.createElement();
        this.setPosition(this.x, this.y);

        // 綁定內容事件
        this.bindContentEvents();
    }

    // 由子類別實作 - 設定端口
    setupPorts() {
        // 子類別覆寫
    }

    createElement() {
        const node = document.createElement('div');
        node.className = `graph-node node-${this.type}`;
        node.id = this.id;
        node.dataset.type = this.getNodeCategory();

        // 取得第一個 input 和 output port（用於顯示在 header）
        const inputPort = this.inputPorts[0];
        const outputPort = this.outputPorts[0];

        node.innerHTML = `
      <div class="node-header">
        <div class="node-header-left">
          ${inputPort ? `<div class="node-port input" data-port="${inputPort.name}" data-type="input" data-datatype="${inputPort.dataType}" title="${inputPort.label}"></div>` : ''}
          <span class="node-icon">${this.icon}</span>
          <span class="node-title">${this.title}</span>
        </div>
        <div class="node-header-actions">
          <button class="node-action-btn collapse" title="折疊">▼</button>
          <button class="node-action-btn delete" title="刪除">×</button>
          ${outputPort ? `<div class="node-port output" data-port="${outputPort.name}" data-type="output" data-datatype="${outputPort.dataType}" title="${outputPort.label}"></div>` : ''}
        </div>
      </div>
      <div class="node-content">
        ${this.renderContent()}
        ${this.renderPreview()}
      </div>
      <div class="node-resize-handle" title="拖拉調整大小"></div>
    `;

        // 綁定事件
        this.bindEvents(node);

        // 綁定預覽事件（傳入 node 而非使用 this.element）
        this.bindPreviewEvents(node);

        return node;
    }

    getNodeCategory() {
        // 由子類別覆寫
        return 'process';
    }

    renderContent() {
        // 由子類別覆寫
        return '';
    }

    // ========== 預覽功能（所有節點共用，支援多檔案）==========

    renderPreview() {
        // 只有處理節點才顯示預覽區域
        if (this.getNodeCategory() === 'input') return '';

        // 檢查是否有多個檔案
        const fileCount = this.previewBuffers ? this.previewBuffers.length : 0;
        const isSingleFile = fileCount <= 1;

        if (fileCount > 1) {
            // 多檔案預覽模式
            const shouldExpand = this.previewExpanded;
            return `
                <div class="node-preview node-preview-multi">
                    <div class="node-preview-summary">
                        <span class="node-preview-icon">🎵</span>
                        <span class="node-preview-count">${fileCount} 個處理結果</span>
                        <button class="node-download-all-btn" data-action="preview-download-all" title="下載全部 (ZIP)">📦</button>
                        <button class="node-preview-toggle" data-action="toggle-multi-preview" title="${shouldExpand ? '收合預覽' : '展開預覽'}">
                            ${shouldExpand ? '▼' : '▶'}
                        </button>
                    </div>
                    <div class="node-preview-files ${shouldExpand ? 'expanded' : 'collapsed'}">
                        ${this.renderMultiPreviewFiles()}
                        ${this.renderPreviewPagination()}
                    </div>
                </div>
            `;
        }

        // 單檔案預覽（原有邏輯）
        return `
            <div class="node-preview">
                <div class="node-waveform" id="preview-waveform-${this.id}"></div>
                <div class="node-playback">
                    <button class="node-play-btn" data-action="preview-play">▶</button>
                    <span class="node-time">
                        <span class="preview-current-time">00:00</span> / <span class="preview-total-time">00:00</span>
                    </span>
                    <button class="node-download-btn" data-action="preview-download" title="下載">⬇</button>
                </div>
            </div>
        `;
    }

    /**
     * 渲染多檔案預覽列表
     */
    renderMultiPreviewFiles() {
        if (!this.previewBuffers || this.previewBuffers.length === 0) return '';

        const start = this.previewCurrentPage * this.previewFilesPerPage;
        const end = start + this.previewFilesPerPage;
        const files = this.previewBuffers.slice(start, end);

        return files.map((buffer, idx) => {
            const globalIndex = start + idx;
            const duration = buffer ? formatTime(buffer.duration) : '00:00';
            const filename = this.previewFilenames ? this.previewFilenames[globalIndex] : `檔案 ${globalIndex + 1}`;

            return `
                <div class="node-preview-file-item" data-preview-index="${globalIndex}">
                    <div class="node-preview-file-info">
                        <span class="node-preview-file-icon">📄</span>
                        <span class="node-preview-file-name" title="${filename}">${filename}</span>
                    </div>
                    <div class="node-waveform" id="preview-waveform-${this.id}-${globalIndex}"></div>
                    <div class="node-playback">
                        <button class="node-play-btn" data-action="preview-play-multi" data-index="${globalIndex}">▶</button>
                        <span class="node-time">
                            <span class="preview-current-time" data-index="${globalIndex}">00:00</span> / <span class="preview-total-time">${duration}</span>
                        </span>
                        <button class="node-download-btn" data-action="preview-download-single" data-index="${globalIndex}" title="下載">⬇</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 渲染預覽分頁控制
     */
    renderPreviewPagination() {
        if (!this.previewBuffers) return '';
        const totalPages = Math.ceil(this.previewBuffers.length / this.previewFilesPerPage);
        if (totalPages <= 1) return '';

        return `
            <div class="node-pagination">
                <button class="node-page-btn" data-action="preview-prev-page" ${this.previewCurrentPage === 0 ? 'disabled' : ''}>
                    ◀ 上一頁
                </button>
                <span class="node-page-info">第 ${this.previewCurrentPage + 1} 頁，共 ${totalPages} 頁</span>
                <button class="node-page-btn" data-action="preview-next-page" ${this.previewCurrentPage >= totalPages - 1 ? 'disabled' : ''}>
                    下一頁 ▶
                </button>
            </div>
        `;
    }

    bindPreviewEvents(node) {
        // 使用傳入的 node 或 this.element
        const element = node || this.element;
        if (!element) return;

        // 單檔案播放按鈕
        const playBtn = element.querySelector('[data-action="preview-play"]');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePreviewPlay());
        }

        // 單檔案下載按鈕
        const downloadBtn = element.querySelector('[data-action="preview-download"]');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadPreview());
        }

        // 多檔案：頁簽切換
        const toggleBtn = element.querySelector('[data-action="toggle-multi-preview"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleMultiPreviewExpanded());
        }

        // 多檔案：下載全部
        const downloadAllBtn = element.querySelector('[data-action="preview-download-all"]');
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAllPreviewAsZip());
        }

        // 多檔案：個別播放
        const multiPlayBtns = element.querySelectorAll('[data-action="preview-play-multi"]');
        multiPlayBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.toggleMultiPreviewPlay(index);
            });
        });

        // 多檔案：個別下載
        const singleDownloadBtns = element.querySelectorAll('[data-action="preview-download-single"]');
        singleDownloadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.downloadSinglePreview(index);
            });
        });

        // 多檔案：分頁
        const prevPageBtn = element.querySelector('[data-action="preview-prev-page"]');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => this.goToPreviewPage(this.previewCurrentPage - 1));
        }

        const nextPageBtn = element.querySelector('[data-action="preview-next-page"]');
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => this.goToPreviewPage(this.previewCurrentPage + 1));
        }
    }

    /**
     * 切換多檔案預覽展開狀態
     */
    toggleMultiPreviewExpanded() {
        this.previewExpanded = !this.previewExpanded;
        this.refreshPreviewUI();
    }

    /**
     * 切換預覽頁面
     */
    goToPreviewPage(page) {
        const totalPages = Math.ceil((this.previewBuffers?.length || 0) / this.previewFilesPerPage);
        if (page < 0 || page >= totalPages) return;

        // 銷毀當前頁面的 wavesurfers
        this.destroyCurrentPagePreviewWaveSurfers();

        this.previewCurrentPage = page;
        this.refreshPreviewUI();
    }

    /**
     * 銷毀當前頁面的預覽 wavesurfers
     */
    destroyCurrentPagePreviewWaveSurfers() {
        const start = this.previewCurrentPage * this.previewFilesPerPage;
        const end = Math.min(start + this.previewFilesPerPage, this.previewWavesurfers.length);

        for (let i = start; i < end; i++) {
            if (this.previewWavesurfers[i]) {
                try {
                    this.previewWavesurfers[i].destroy();
                } catch (e) { }
                this.previewWavesurfers[i] = null;
            }
        }
    }

    /**
     * 重新渲染預覽 UI
     */
    refreshPreviewUI() {
        const previewContainer = this.element.querySelector('.node-preview, .node-preview-multi');
        if (previewContainer) {
            const parent = previewContainer.parentNode;
            const newPreview = document.createElement('div');
            newPreview.innerHTML = this.renderPreview();
            parent.replaceChild(newPreview.firstElementChild, previewContainer);
            this.bindPreviewEvents(this.element);

            // 初始化 wavesurfers
            if (this.previewExpanded && this.previewBuffers && this.previewBuffers.length > 1) {
                requestAnimationFrame(() => {
                    this.initMultiPreviewWaveSurfers();
                });
            }
        }
    }

    async updatePreview() {
        const previewEl = this.element.querySelector('.node-preview, .node-preview-multi');
        if (!previewEl) return;

        // 標記預覽已開啟
        this.previewVisible = true;

        // 執行此節點取得處理後的音訊
        try {
            // 取得輸入資料
            const inputs = await this.getInputData();
            const outputs = await this.process(inputs);

            // 處理多檔案輸出
            if (outputs.audioFiles && outputs.audioFiles.length > 0) {
                this.previewBuffers = outputs.audioFiles.filter(b => b != null);
                this.previewFilenames = outputs.filenames || this.previewBuffers.map((_, i) => `檔案 ${i + 1}`);
                this.previewBuffer = this.previewBuffers[0] || null;

                // 重新渲染 UI
                this.refreshPreviewUI();
                return;
            }

            // 單檔案處理（向下相容）
            this.previewBuffer = outputs.audio;
            this.previewBuffers = outputs.audio ? [outputs.audio] : [];
            this.previewFilenames = ['處理結果'];

            if (!this.previewBuffer) {
                // 沒有音訊時清空波形
                this.clearPreview();
                return;
            }

            // 更新時間顯示
            const totalTimeEl = this.element.querySelector('.preview-total-time');
            if (totalTimeEl) {
                totalTimeEl.textContent = formatTime(this.previewBuffer.duration);
            }

            // 初始化波形
            await this.initPreviewWaveSurfer();

        } catch (error) {
            console.error('預覽更新失敗:', error);
            this.clearPreview();
        }
    }

    clearPreview() {
        // 重置時間顯示
        const currentTimeEl = this.element.querySelector('.preview-current-time');
        const totalTimeEl = this.element.querySelector('.preview-total-time');
        if (currentTimeEl) currentTimeEl.textContent = '00:00';
        if (totalTimeEl) totalTimeEl.textContent = '00:00';

        // 銷毀 wavesurfer
        if (this.previewWavesurfer) {
            try {
                this.previewWavesurfer.destroy();
            } catch (e) { }
            this.previewWavesurfer = null;
        }

        this.previewBuffer = null;
    }

    async initPreviewWaveSurfer() {
        const container = this.element.querySelector(`#preview-waveform-${this.id}`);
        if (!container || !this.previewBuffer) return;

        // 銷毀舊的
        if (this.previewWavesurfer) {
            try {
                this.previewWavesurfer.destroy();
            } catch (e) { }
            this.previewWavesurfer = null;
        }

        try {
            this.previewWavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(242 68% 80% / 0.6)',
                progressColor: 'hsl(242 68% 80%)',
                cursorColor: 'hsl(58 40% 92%)',
                height: 40,
                barWidth: 2,
                barGap: 1,
                responsive: true,
                normalize: true
            });

            const wavData = audioBufferToWav(this.previewBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            await this.previewWavesurfer.loadBlob(blob);

            this.previewWavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector('.preview-current-time');
                if (timeEl) timeEl.textContent = formatTime(currentTime);
            });

            this.previewWavesurfer.on('play', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '⏸';
            });

            this.previewWavesurfer.on('pause', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '▶';
            });

            this.previewWavesurfer.on('finish', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '▶';
            });
        } catch (error) {
            console.error('預覽 WaveSurfer 載入失敗:', error);
        }
    }

    togglePreviewPlay() {
        if (this.previewWavesurfer) {
            this.previewWavesurfer.playPause();
        }
    }

    downloadPreview() {
        if (!this.previewBuffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(this.previewBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.title}_processed.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('下載已開始', 'success');
        } catch (error) {
            showToast('下載失敗: ' + error.message, 'error');
        }
    }

    // ========== 多檔案預覽方法 ==========

    /**
     * 初始化多檔案預覽的 wavesurfers
     */
    async initMultiPreviewWaveSurfers() {
        const start = this.previewCurrentPage * this.previewFilesPerPage;
        const end = Math.min(start + this.previewFilesPerPage, this.previewBuffers.length);

        for (let i = start; i < end; i++) {
            await this.initMultiPreviewWaveSurfer(i);
        }
    }

    /**
     * 初始化單個多檔案預覽的 wavesurfer
     */
    async initMultiPreviewWaveSurfer(index) {
        const buffer = this.previewBuffers[index];
        if (!buffer) return;

        const container = this.element.querySelector(`#preview-waveform-${this.id}-${index}`);
        if (!container) return;

        // 銷毀舊的
        if (this.previewWavesurfers[index]) {
            try {
                this.previewWavesurfers[index].destroy();
            } catch (e) { }
            this.previewWavesurfers[index] = null;
        }

        try {
            const wavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(242 68% 80% / 0.6)',
                progressColor: 'hsl(242 68% 80%)',
                cursorColor: 'hsl(58 40% 92%)',
                height: 40,
                barWidth: 2,
                barGap: 1,
                responsive: true,
                normalize: true
            });

            const wavData = audioBufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            await wavesurfer.loadBlob(blob);

            wavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector(`.preview-current-time[data-index="${index}"]`);
                if (timeEl) timeEl.textContent = formatTime(currentTime);
            });

            wavesurfer.on('play', () => {
                const btn = this.element.querySelector(`[data-action="preview-play-multi"][data-index="${index}"]`);
                if (btn) btn.textContent = '⏸';
            });

            wavesurfer.on('pause', () => {
                const btn = this.element.querySelector(`[data-action="preview-play-multi"][data-index="${index}"]`);
                if (btn) btn.textContent = '▶';
            });

            wavesurfer.on('finish', () => {
                const btn = this.element.querySelector(`[data-action="preview-play-multi"][data-index="${index}"]`);
                if (btn) btn.textContent = '▶';
            });

            this.previewWavesurfers[index] = wavesurfer;
        } catch (error) {
            console.error('多檔案預覽 WaveSurfer 載入失敗:', error);
        }
    }

    /**
     * 多檔案播放切換
     */
    toggleMultiPreviewPlay(index) {
        if (this.previewWavesurfers[index]) {
            this.previewWavesurfers[index].playPause();
        }
    }

    /**
     * 下載單個預覽檔案
     */
    downloadSinglePreview(index) {
        const buffer = this.previewBuffers[index];
        if (!buffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const filename = this.previewFilenames ? this.previewFilenames[index] : `file_${index + 1}`;
            const baseName = filename.replace(/\.[^.]+$/, '');

            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}_processed.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('下載已開始', 'success');
        } catch (error) {
            showToast('下載失敗: ' + error.message, 'error');
        }
    }

    /**
     * 下載所有預覽檔案為 ZIP
     */
    async downloadAllPreviewAsZip() {
        if (!this.previewBuffers || this.previewBuffers.length === 0) {
            showToast('沒有檔案可下載', 'warning');
            return;
        }

        try {
            showToast('正在打包檔案...', 'info');

            const zip = new JSZip();

            for (let i = 0; i < this.previewBuffers.length; i++) {
                const buffer = this.previewBuffers[i];
                if (buffer) {
                    const wavData = audioBufferToWav(buffer);
                    const filename = this.previewFilenames ? this.previewFilenames[i] : `file_${i + 1}`;
                    const baseName = filename.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName}_processed.wav`, wavData);
                }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.title}_processed_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`已下載 ${this.previewBuffers.length} 個檔案`, 'success');
        } catch (error) {
            showToast(`打包下載失敗: ${error.message}`, 'error');
            console.error('ZIP 下載失敗:', error);
        }
    }

    // 取得輸入資料（需要 graphEngine 支援）
    async getInputData() {
        if (this.onGetInputData) {
            return await this.onGetInputData(this);
        }
        return {};
    }

    // 當節點資料變更時呼叫，自動更新預覽
    schedulePreviewUpdate() {
        // 防抖動：清除之前的計時器
        if (this.previewUpdateTimer) {
            clearTimeout(this.previewUpdateTimer);
        }

        // 延遲 300ms 後更新
        this.previewUpdateTimer = setTimeout(() => {
            this.updatePreview();
        }, 300);
    }

    bindEvents(node) {
        // 折疊按鈕
        const collapseBtn = node.querySelector('.node-action-btn.collapse');
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        });

        // 刪除按鈕
        const deleteBtn = node.querySelector('.node-action-btn.delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onDelete) {
                this.onDelete();
            }
        });

        // 端口事件
        const ports = node.querySelectorAll('.node-port');
        ports.forEach(portEl => {
            const portName = portEl.dataset.port;
            const portType = portEl.dataset.type;
            const port = this.findPort(portName, portType);

            if (port) {
                port.element = portEl;
                port.nodeId = this.id;

                portEl.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    if (this.onPortDragStart) {
                        this.onPortDragStart(port, this);
                    }
                });
            }
        });

        // 調整大小事件
        const resizeHandle = node.querySelector('.node-resize-handle');
        if (resizeHandle) {
            this.bindResizeEvents(resizeHandle);
        }
    }

    // ========== 調整大小 ==========

    bindResizeEvents(handle) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        const onMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = this.element.offsetWidth;
            startHeight = this.element.offsetHeight;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            this.element.classList.add('resizing');
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // 計算新尺寸（考慮縮放比例）
            const scale = this.element.closest('.canvas-viewport')?.style.transform.match(/scale\((\d+\.?\d*)\)/)?.[1] || 1;
            const newWidth = Math.max(180, startWidth + dx / parseFloat(scale));
            const newHeight = Math.max(100, startHeight + dy / parseFloat(scale));

            this.element.style.width = newWidth + 'px';
            this.element.style.minHeight = newHeight + 'px';

            // 儲存尺寸
            this.data.width = newWidth;
            this.data.height = newHeight;

            // 觸發連線更新（如果有回調）
            if (this.onResize) {
                this.onResize();
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.element.classList.remove('resizing');
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    // ========== 端口管理 ==========

    addInputPort(name, label, dataType = 'audio') {
        const port = {
            name,
            label,
            dataType,
            type: 'input',
            connected: false,
            element: null,
            nodeId: this.id
        };
        this.inputPorts.push(port);
        this.ports.push(port);
        return port;
    }

    addOutputPort(name, label, dataType = 'audio') {
        const port = {
            name,
            label,
            dataType,
            type: 'output',
            connected: false,
            element: null,
            nodeId: this.id
        };
        this.outputPorts.push(port);
        this.ports.push(port);
        return port;
    }

    findPort(name, type) {
        return this.ports.find(p => p.name === name && p.type === type);
    }

    findPortByElement(element) {
        return this.ports.find(p => p.element === element);
    }

    getInputPort(name) {
        return this.inputPorts.find(p => p.name === name);
    }

    getOutputPort(name) {
        return this.outputPorts.find(p => p.name === name);
    }

    // ========== 位置 ==========

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    }

    // ========== 狀態 ==========

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        const content = this.element.querySelector('.node-content');
        const collapseBtn = this.element.querySelector('.node-action-btn.collapse');

        if (this.collapsed) {
            content.classList.add('collapsed');
            collapseBtn.textContent = '▶';
        } else {
            content.classList.remove('collapsed');
            collapseBtn.textContent = '▼';
        }
    }

    setProcessing(processing) {
        this.processing = processing;
        if (processing) {
            this.element.classList.add('processing');
        } else {
            this.element.classList.remove('processing');
        }
    }

    // ========== 資料 ==========

    setData(key, value) {
        this.data[key] = value;
        if (this.onDataChange) {
            this.onDataChange(key, value);
        }
    }

    getData(key) {
        return this.data[key];
    }

    // ========== 處理（由子類別實作） ==========

    async process(inputs) {
        // 由子類別覆寫
        // inputs: { portName: data }
        // 返回: { portName: data }
        return {};
    }

    // ========== 更新 UI ==========

    updateContent() {
        const contentEl = this.element.querySelector('.node-content');
        contentEl.innerHTML = this.renderContent() + this.renderPreview();
        this.bindContentEvents();
        this.bindPreviewEvents();
    }

    bindContentEvents() {
        // 由子類別覆寫，綁定內容區域的事件
    }

    // ========== 序列化 ==========

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            collapsed: this.collapsed,
            data: { ...this.data }
        };
    }

    static fromJSON(json) {
        // 由子類別實作
        return null;
    }
}

// 匯出
window.BaseNode = BaseNode;
