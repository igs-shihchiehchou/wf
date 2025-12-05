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

        // 多檔案管理（統一結構）
        this.files = {
            items: [],           // { buffer: AudioBuffer, filename: string, wavesurfer: WaveSurfer }
            wavesurfers: [],     // wavesurfer 實例陣列（索引對應 items）
            currentPage: 0,
            filesPerPage: 5,
            expanded: false
        };

        // 預覽相關（向下相容）
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

    // ========== 統一多檔案管理系統（所有節點共用）==========

    /**
     * 取得多檔案資料（子類別可覆寫）
     * 預設使用 files.items，AudioInputNode 會覆寫為 audioFiles
     */
    getMultiFileItems() {
        return this.files.items;
    }

    /**
     * 取得檔案的 AudioBuffer
     */
    getFileBuffer(index) {
        const items = this.getMultiFileItems();
        return items[index]?.buffer || items[index]?.audioBuffer || null;
    }

    /**
     * 取得檔案名稱
     */
    getFileName(index) {
        const items = this.getMultiFileItems();
        return items[index]?.filename || `檔案 ${index + 1}`;
    }

    /**
     * 取得多檔案總數
     */
    getMultiFileCount() {
        return this.getMultiFileItems().length;
    }

    /**
     * 取得/設定當前頁碼
     */
    getMultiFileCurrentPage() {
        return this.files.currentPage;
    }

    setMultiFileCurrentPage(page) {
        this.files.currentPage = page;
    }

    /**
     * 取得每頁檔案數
     */
    getMultiFilePerPage() {
        return this.files.filesPerPage;
    }

    /**
     * 取得/設定展開狀態
     */
    isMultiFileExpanded() {
        return this.files.expanded;
    }

    setMultiFileExpanded(expanded) {
        this.files.expanded = expanded;
    }

    /**
     * 取得/設定 WaveSurfer 實例
     */
    getMultiFileWaveSurfer(index) {
        return this.files.wavesurfers[index];
    }

    setMultiFileWaveSurfer(index, wavesurfer) {
        this.files.wavesurfers[index] = wavesurfer;
    }

    /**
     * 取得多檔案下載用的檔名前綴
     */
    getMultiFileDownloadPrefix() {
        return this.title;
    }

    /**
     * 渲染多檔案摘要區塊（頁簽標題）
     * @param {Object} options - 配置選項
     * @param {string} options.summaryIcon - 摘要圖示
     * @param {string} options.summaryLabel - 摘要標籤（例如「個音訊檔案」或「個處理結果」）
     * @param {string} options.actionPrefix - 動作前綴（例如 'files' 或 'preview'）
     */
    renderMultiFileSummary(options = {}) {
        const {
            summaryIcon = '🎵',
            summaryLabel = '個檔案',
            actionPrefix = 'multi'
        } = options;

        const fileCount = this.getMultiFileCount();
        const isExpanded = this.isMultiFileExpanded();

        return `
            <div class="node-preview-summary">
                <button class="node-preview-toggle" data-action="${actionPrefix}-toggle" title="${isExpanded ? '收合預覽' : '展開預覽'}">
                    ${isExpanded ? '▼' : '▶'}
                </button>
                <span class="node-preview-icon">${summaryIcon}</span>
                <span class="node-preview-count">${fileCount} ${summaryLabel}</span>
                <button class="node-download-all-btn" data-action="${actionPrefix}-download-all" title="下載全部 (ZIP)">📦</button>
            </div>
        `;
    }

    /**
     * 渲染多檔案列表
     * @param {Object} options - 配置選項
     * @param {string} options.waveformIdPrefix - 波形容器 ID 前綴
     * @param {string} options.actionPrefix - 動作前綴
     */
    renderMultiFileList(options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'multi'
        } = options;

        const items = this.getMultiFileItems();
        if (!items || items.length === 0) return '';

        const currentPage = this.getMultiFileCurrentPage();
        const perPage = this.getMultiFilePerPage();
        const start = currentPage * perPage;
        const end = Math.min(start + perPage, items.length);

        let html = '';
        for (let i = start; i < end; i++) {
            const buffer = this.getFileBuffer(i);
            const filename = this.getFileName(i);
            const duration = buffer ? formatTime(buffer.duration) : '00:00';

            html += `
                <div class="node-preview-file-item" data-file-index="${i}">
                    <div class="node-preview-file-info">
                        <span class="node-preview-file-icon">📄</span>
                        <span class="node-preview-file-name" title="${filename}">${filename}</span>
                    </div>
                    <div class="node-waveform" id="${waveformIdPrefix}-${i}"></div>
                    <div class="node-playback">
                        <button class="node-play-btn" data-action="${actionPrefix}-play" data-index="${i}">▶</button>
                        <span class="node-time">
                            <span class="${actionPrefix}-current-time" data-index="${i}">00:00</span> / <span class="${actionPrefix}-total-time">${duration}</span>
                        </span>
                        <button class="node-download-btn" data-action="${actionPrefix}-download-single" data-index="${i}" title="下載">⬇</button>
                    </div>
                </div>
            `;
        }
        return html;
    }

    /**
     * 渲染多檔案分頁控制
     * @param {Object} options - 配置選項
     * @param {string} options.actionPrefix - 動作前綴
     */
    renderMultiFilePagination(options = {}) {
        const { actionPrefix = 'multi' } = options;

        const totalItems = this.getMultiFileCount();
        const perPage = this.getMultiFilePerPage();
        const totalPages = Math.ceil(totalItems / perPage);
        const currentPage = this.getMultiFileCurrentPage();

        if (totalPages <= 1) return '';

        return `
            <div class="node-pagination">
                <button class="node-page-btn" data-action="${actionPrefix}-prev-page" ${currentPage === 0 ? 'disabled' : ''}>
                    ◀ 上一頁
                </button>
                <span class="node-page-info">第 ${currentPage + 1} 頁，共 ${totalPages} 頁</span>
                <button class="node-page-btn" data-action="${actionPrefix}-next-page" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>
                    下一頁 ▶
                </button>
            </div>
        `;
    }

    /**
     * 渲染完整的多檔案區塊
     */
    renderMultiFileSection(options = {}) {
        const {
            summaryIcon = '🎵',
            summaryLabel = '個檔案',
            actionPrefix = 'multi',
            waveformIdPrefix = `waveform-${this.id}`,
            containerClass = 'node-preview-multi'
        } = options;

        const isExpanded = this.isMultiFileExpanded();

        return `
            <div class="node-preview ${containerClass}">
                ${this.renderMultiFileSummary({ summaryIcon, summaryLabel, actionPrefix })}
                <div class="node-preview-files ${isExpanded ? 'expanded' : 'collapsed'}">
                    ${this.renderMultiFileList({ waveformIdPrefix, actionPrefix })}
                    ${this.renderMultiFilePagination({ actionPrefix })}
                </div>
            </div>
        `;
    }

    /**
     * 綁定多檔案控制事件
     * @param {HTMLElement} element - 要綁定事件的元素
     * @param {Object} options - 配置選項
     */
    bindMultiFileEvents(element, options = {}) {
        const { actionPrefix = 'multi' } = options;
        if (!element) return;

        // 頁簽切換
        const toggleBtn = element.querySelector(`[data-action="${actionPrefix}-toggle"]`);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.handleMultiFileToggle());
        }

        // 下載全部
        const downloadAllBtn = element.querySelector(`[data-action="${actionPrefix}-download-all"]`);
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.handleMultiFileDownloadAll());
        }

        // 個別播放
        const playBtns = element.querySelectorAll(`[data-action="${actionPrefix}-play"]`);
        playBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.handleMultiFilePlay(index);
            });
        });

        // 個別下載
        const downloadBtns = element.querySelectorAll(`[data-action="${actionPrefix}-download-single"]`);
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.handleMultiFileDownloadSingle(index);
            });
        });

        // 上一頁
        const prevBtn = element.querySelector(`[data-action="${actionPrefix}-prev-page"]`);
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const currentPage = this.getMultiFileCurrentPage();
                this.handleMultiFilePageChange(currentPage - 1);
            });
        }

        // 下一頁
        const nextBtn = element.querySelector(`[data-action="${actionPrefix}-next-page"]`);
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const currentPage = this.getMultiFileCurrentPage();
                this.handleMultiFilePageChange(currentPage + 1);
            });
        }
    }

    /**
     * 處理頁簽切換
     */
    handleMultiFileToggle() {
        this.setMultiFileExpanded(!this.isMultiFileExpanded());
        // 同步到舊的預覽狀態（向下相容）
        this.previewExpanded = this.isMultiFileExpanded();
        this.refreshMultiFileUI();
    }

    /**
     * 處理分頁切換
     */
    handleMultiFilePageChange(newPage) {
        const totalItems = this.getMultiFileCount();
        const perPage = this.getMultiFilePerPage();
        const totalPages = Math.ceil(totalItems / perPage);

        if (newPage < 0 || newPage >= totalPages) return;

        // 銷毀當前頁面的 wavesurfers
        this.destroyCurrentPageWaveSurfers();

        this.setMultiFileCurrentPage(newPage);
        // 同步到舊的預覽狀態（向下相容）
        this.previewCurrentPage = newPage;
        this.refreshMultiFileUI();
    }

    /**
     * 處理播放/暫停
     */
    handleMultiFilePlay(index) {
        const wavesurfer = this.getMultiFileWaveSurfer(index);
        if (wavesurfer) {
            wavesurfer.playPause();
        }
    }

    /**
     * 處理單檔下載
     */
    handleMultiFileDownloadSingle(index) {
        const buffer = this.getFileBuffer(index);
        if (!buffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const filename = this.getFileName(index);
            const baseName = filename.replace(/\.[^.]+$/, '');

            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}.wav`;
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
     * 處理全部下載（ZIP）
     */
    async handleMultiFileDownloadAll() {
        const items = this.getMultiFileItems();
        if (!items || items.length === 0) {
            showToast('沒有檔案可下載', 'warning');
            return;
        }

        try {
            showToast('正在打包檔案...', 'info');

            const zip = new JSZip();
            const prefix = this.getMultiFileDownloadPrefix();

            for (let i = 0; i < items.length; i++) {
                const buffer = this.getFileBuffer(i);
                if (buffer) {
                    const wavData = audioBufferToWav(buffer);
                    const filename = this.getFileName(i);
                    const baseName = filename.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName}.wav`, wavData);
                }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${prefix}_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`已下載 ${items.length} 個檔案`, 'success');
        } catch (error) {
            showToast(`打包下載失敗: ${error.message}`, 'error');
            console.error('ZIP 下載失敗:', error);
        }
    }

    /**
     * 銷毀當前頁面的 wavesurfers
     */
    destroyCurrentPageWaveSurfers() {
        const currentPage = this.getMultiFileCurrentPage();
        const perPage = this.getMultiFilePerPage();
        const start = currentPage * perPage;
        const end = Math.min(start + perPage, this.files.wavesurfers.length);

        for (let i = start; i < end; i++) {
            const ws = this.getMultiFileWaveSurfer(i);
            if (ws) {
                try {
                    ws.destroy();
                } catch (e) { }
                this.setMultiFileWaveSurfer(i, null);
            }
        }
    }

    /**
     * 初始化當前頁面的 wavesurfers
     * @param {Object} options - 配置選項
     */
    async initCurrentPageWaveSurfers(options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'multi'
        } = options;

        const currentPage = this.getMultiFileCurrentPage();
        const perPage = this.getMultiFilePerPage();
        const totalItems = this.getMultiFileCount();
        const start = currentPage * perPage;
        const end = Math.min(start + perPage, totalItems);

        for (let i = start; i < end; i++) {
            await this.initSingleWaveSurfer(i, { waveformIdPrefix, actionPrefix });
        }
    }

    /**
     * 初始化單個 wavesurfer
     */
    async initSingleWaveSurfer(index, options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'multi'
        } = options;

        const buffer = this.getFileBuffer(index);
        if (!buffer) return;

        const container = this.element.querySelector(`#${waveformIdPrefix}-${index}`);
        if (!container) return;

        // 銷毀舊的
        const oldWs = this.getMultiFileWaveSurfer(index);
        if (oldWs) {
            try {
                oldWs.destroy();
            } catch (e) { }
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

            // 綁定事件
            wavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector(`.${actionPrefix}-current-time[data-index="${index}"]`);
                if (timeEl) timeEl.textContent = formatTime(currentTime);
            });

            wavesurfer.on('play', () => {
                const btn = this.element.querySelector(`[data-action="${actionPrefix}-play"][data-index="${index}"]`);
                if (btn) btn.textContent = '⏸';
            });

            wavesurfer.on('pause', () => {
                const btn = this.element.querySelector(`[data-action="${actionPrefix}-play"][data-index="${index}"]`);
                if (btn) btn.textContent = '▶';
            });

            wavesurfer.on('finish', () => {
                const btn = this.element.querySelector(`[data-action="${actionPrefix}-play"][data-index="${index}"]`);
                if (btn) btn.textContent = '▶';
            });

            this.setMultiFileWaveSurfer(index, wavesurfer);
        } catch (error) {
            console.error('WaveSurfer 載入失敗:', error);
        }
    }

    /**
     * 重新渲染多檔案 UI（子類別可覆寫以自訂）
     */
    refreshMultiFileUI() {
        // 預設實作：更新預覽區塊
        this.refreshPreviewUI();
    }

    // ========== 預覽功能（處理節點專用，使用統一多檔案系統）==========

    renderPreview() {
        // 只有處理節點才顯示預覽區域
        if (this.getNodeCategory() === 'input') return '';

        // 同步 previewBuffers 到 files.items（確保資料一致）
        this.syncPreviewToFiles();

        // 檢查是否有多個檔案
        const fileCount = this.getMultiFileCount();

        if (fileCount > 1) {
            // 使用統一的多檔案系統
            return this.renderMultiFileSection({
                summaryIcon: '🎵',
                summaryLabel: '個處理結果',
                actionPrefix: 'preview',
                waveformIdPrefix: `preview-waveform-${this.id}`,
                containerClass: 'node-preview-multi'
            });
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
     * 同步 previewBuffers 到統一的 files 結構
     */
    syncPreviewToFiles() {
        if (!this.previewBuffers) return;

        this.files.items = this.previewBuffers.map((buffer, index) => ({
            buffer: buffer,
            filename: this.previewFilenames ? this.previewFilenames[index] : `處理結果 ${index + 1}`
        }));
    }

    /**
     * 覆寫多檔案資料來源（預覽使用 previewBuffers）
     */
    getMultiFileItemsForPreview() {
        this.syncPreviewToFiles();
        return this.files.items;
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

        // 多檔案：使用統一的事件綁定系統
        this.bindMultiFileEvents(element, { actionPrefix: 'preview' });
    }

    /**
     * 重新渲染預覽 UI
     */
    refreshPreviewUI() {
        const previewContainer = this.element.querySelector('.node-preview, .node-preview-multi');
        if (previewContainer) {
            const parent = previewContainer.parentNode;
            const newPreviewHtml = this.renderPreview();

            // 如果 renderPreview 返回空字串，不進行替換
            if (!newPreviewHtml || newPreviewHtml.trim() === '') {
                return;
            }

            const newPreview = document.createElement('div');
            newPreview.innerHTML = newPreviewHtml;

            // 確保有新元素才進行替換
            if (newPreview.firstElementChild) {
                parent.replaceChild(newPreview.firstElementChild, previewContainer);
                this.bindPreviewEvents(this.element);

                // 初始化 wavesurfers（使用統一系統）
                if (this.isMultiFileExpanded() && this.getMultiFileCount() > 1) {
                    requestAnimationFrame(() => {
                        this.initCurrentPageWaveSurfers({
                            waveformIdPrefix: `preview-waveform-${this.id}`,
                            actionPrefix: 'preview'
                        });
                    });
                }
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

                // 同步到 files 結構
                this.syncPreviewToFiles();

                // 重新渲染 UI
                this.refreshPreviewUI();
                return;
            }

            // 單檔案處理（向下相容）
            this.previewBuffer = outputs.audio;
            this.previewBuffers = outputs.audio ? [outputs.audio] : [];
            this.previewFilenames = outputs.filenames || ['處理結果'];

            // 同步到 files 結構
            this.syncPreviewToFiles();

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
