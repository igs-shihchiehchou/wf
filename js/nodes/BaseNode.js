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

        // 預覽區域單一檔案輸出連結點管理
        this.previewOutputPorts = [];  // 每個檔案預覽項目的輸出端口
        this.previewOutputConnections = new Map();  // fileIndex -> 連線數量

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
        // 預覽區域：單檔案時預設展開
        const fileCount = this.getMultiFileCount();
        if (fileCount === 1) return true;
        // 有輸出連線時強制展開
        if (this.hasPreviewOutputConnections()) return true;
        return this.files.expanded;
    }

    setMultiFileExpanded(expanded) {
        this.files.expanded = expanded;
    }

    /**
     * 檢查是否有預覽輸出連線
     */
    hasPreviewOutputConnections() {
        if (!this.previewOutputConnections) return false;
        for (const [, count] of this.previewOutputConnections) {
            if (count > 0) return true;
        }
        return false;
    }

    /**
     * 設定預覽輸出連線狀態
     */
    setPreviewOutputConnection(fileIndex, connected) {
        if (!this.previewOutputConnections) {
            this.previewOutputConnections = new Map();
        }
        const currentCount = this.previewOutputConnections.get(fileIndex) || 0;
        if (connected) {
            this.previewOutputConnections.set(fileIndex, currentCount + 1);
        } else {
            this.previewOutputConnections.set(fileIndex, Math.max(0, currentCount - 1));
        }
    }

    /**
     * 檢查是否可以收縮預覽區域
     */
    canCollapsePreview() {
        return !this.hasPreviewOutputConnections();
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
            summaryIcon = '♬',
            summaryLabel = '個檔案',
            actionPrefix = 'multi'
        } = options;

        const fileCount = this.getMultiFileCount();
        const isExpanded = this.isMultiFileExpanded();
        const canCollapse = this.canCollapsePreview();
        const isLocked = !canCollapse && fileCount > 1;

        return `
            <div class="node-preview-summary">
                <button class="node-preview-toggle ${isLocked ? 'locked' : ''}" 
                        data-action="${actionPrefix}-toggle" 
                        title="${isLocked ? '有輸出連線時無法收縮' : (isExpanded ? '收合預覽' : '展開預覽')}"
                        ${isLocked ? 'disabled' : ''}>
                    ${isLocked ? '🔒' : (isExpanded ? '▼' : '▶')}
                </button>
                <span class="node-preview-icon">${summaryIcon}</span>
                <span class="node-preview-count">${fileCount} ${summaryLabel}</span>
                <button class="node-download-all-btn" data-action="${actionPrefix}-download-all" title="下載全部 (ZIP)">☐</button>
            </div>
        `;
    }

    /**
     * 渲染多檔案列表
     * @param {Object} options - 配置選項
     * @param {string} options.waveformIdPrefix - 波形容器 ID 前綴
     * @param {string} options.actionPrefix - 動作前綴
     * @param {boolean} options.showOutputPort - 是否顯示輸出連結點（預設 true）
     */
    renderMultiFileList(options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'multi',
            showOutputPort = true
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
            const hasConnection = this.previewOutputConnections?.get(i) > 0;

            html += `
                <div class="node-preview-file-item ${hasConnection ? 'has-output-connection' : ''}" data-file-index="${i}">
                    <div class="node-preview-file-info">
                        <span class="node-preview-file-icon">▭</span>
                        <span class="node-preview-file-name" title="${filename}">${filename}</span>
                        ${showOutputPort ? `
                        <div class="node-port output preview-output-port ${hasConnection ? 'connected' : ''}" 
                             data-port="preview-output-${i}" 
                             data-type="output" 
                             data-datatype="audio"
                             data-file-index="${i}"
                             title="輸出此檔案"></div>
                        ` : ''}
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
            summaryIcon = '♬',
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
            downloadAllBtn.addEventListener('click', (e) => this.handleMultiFileDownloadAll(e));
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
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                this.handleMultiFileDownloadSingle(index, e);
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

        // 預覽輸出端口事件
        this.bindPreviewOutputPortEvents(element);
    }

    /**
     * 綁定預覽輸出端口事件
     */
    bindPreviewOutputPortEvents(element) {
        const previewOutputPorts = element.querySelectorAll('.preview-output-port');
        previewOutputPorts.forEach(portEl => {
            const fileIndex = parseInt(portEl.dataset.fileIndex);
            const portName = `preview-output-${fileIndex}`;

            // 建立或取得端口物件
            let port = this.previewOutputPorts.find(p => p.name === portName);
            if (!port) {
                port = {
                    name: portName,
                    label: `檔案 ${fileIndex + 1} 輸出`,
                    dataType: 'audio',
                    type: 'output',
                    connected: this.previewOutputConnections?.get(fileIndex) > 0,
                    element: portEl,
                    nodeId: this.id,
                    fileIndex: fileIndex,
                    isPreviewOutput: true
                };
                this.previewOutputPorts.push(port);
                this.ports.push(port);
            } else {
                port.element = portEl;
            }

            // 桌面版：綁定拖拉事件
            portEl.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                if (this.onPortDragStart) {
                    this.onPortDragStart(port, this);
                }
            });

            // 手機版：綁定觸控拖拉事件
            portEl.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                if (this.onPortDragStart) {
                    this.onPortDragStart(port, this, e.touches[0]);
                }
            }, { passive: true });
        });
    }

    /**
     * 取得預覽輸出端口
     */
    getPreviewOutputPort(fileIndex) {
        return this.previewOutputPorts.find(p => p.fileIndex === fileIndex);
    }

    /**
     * 處理頁簽切換
     */
    handleMultiFileToggle() {
        // 檢查是否可以收縮
        if (!this.canCollapsePreview() && this.isMultiFileExpanded()) {
            showToast('有輸出連線時無法收縮', 'warning');
            return;
        }
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
     * 顯示格式選擇選單
     * @param {Event} event - 觸發事件（用於定位）
     * @returns {Promise<string>} - 返回選擇的格式 ('wav' 或 'mp3')，取消則返回 null
     */
    showFormatMenu(event) {
        return new Promise((resolve) => {
            // 建立遮罩層（點擊外部取消）
            const overlay = document.createElement('div');
            overlay.className = 'format-menu-overlay';

            // 建立選單
            const menu = document.createElement('div');
            menu.className = 'format-menu';

            // WAV 選項
            const wavOption = document.createElement('button');
            wavOption.className = 'format-option';
            wavOption.textContent = 'WAV';
            wavOption.addEventListener('click', () => {
                cleanup();
                resolve('wav');
            });

            // MP3 選項
            const mp3Option = document.createElement('button');
            mp3Option.className = 'format-option';
            mp3Option.textContent = 'MP3';
            mp3Option.addEventListener('click', () => {
                cleanup();
                resolve('mp3');
            });

            menu.appendChild(wavOption);
            menu.appendChild(mp3Option);

            // 定位選單（在按鈕附近）
            const rect = event.target.getBoundingClientRect();
            menu.style.left = `${rect.left}px`;
            menu.style.top = `${rect.bottom + 5}px`;

            // 點擊遮罩取消
            overlay.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            // 清理函數
            function cleanup() {
                if (overlay.parentNode) overlay.remove();
                if (menu.parentNode) menu.remove();
            }

            // 加入 DOM
            document.body.appendChild(overlay);
            document.body.appendChild(menu);
        });
    }

    /**
     * 下載單個檔案（指定格式）
     * @param {number} index - 檔案索引
     * @param {string} format - 格式 ('wav' 或 'mp3')
     */
    async downloadSingleFile(index, format) {
        const buffer = this.getFileBuffer(index);
        if (!buffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            let audioData, mimeType, extension;

            if (format === 'mp3') {
                showToast('正在編碼 MP3...', 'info');
                audioData = audioBufferToMp3(buffer);
                mimeType = 'audio/mpeg';
                extension = 'mp3';
            } else {
                audioData = audioBufferToWav(buffer);
                mimeType = 'audio/wav';
                extension = 'wav';
            }

            const blob = new Blob([audioData], { type: mimeType });
            const url = URL.createObjectURL(blob);

            const filename = this.getFileName(index);
            const baseName = filename.replace(/\.[^.]+$/, '');

            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}.${extension}`;
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
     * 處理單檔下載
     */
    async handleMultiFileDownloadSingle(index, event) {
        const buffer = this.getFileBuffer(index);
        if (!buffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        // 顯示格式選擇選單
        const format = await this.showFormatMenu(event);
        if (!format) {
            return; // 使用者取消
        }

        // 下載指定格式
        await this.downloadSingleFile(index, format);
    }

    /**
     * 下載所有檔案為 ZIP（指定格式）
     * @param {string} format - 格式 ('wav' 或 'mp3')
     */
    async downloadAllFiles(format) {
        const items = this.getMultiFileItems();
        if (!items || items.length === 0) {
            showToast('沒有檔案可下載', 'warning');
            return;
        }

        try {
            const formatName = format === 'mp3' ? 'MP3' : 'WAV';
            showToast(`正在打包 ${formatName} 檔案...`, 'info');

            const zip = new JSZip();
            const prefix = this.getMultiFileDownloadPrefix();

            for (let i = 0; i < items.length; i++) {
                const buffer = this.getFileBuffer(i);
                if (buffer) {
                    let audioData, extension;

                    if (format === 'mp3') {
                        audioData = audioBufferToMp3(buffer);
                        extension = 'mp3';
                    } else {
                        audioData = audioBufferToWav(buffer);
                        extension = 'wav';
                    }

                    const filename = this.getFileName(i);
                    const baseName = filename.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName}.${extension}`, audioData);
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
     * 處理全部下載（ZIP）
     */
    async handleMultiFileDownloadAll(event) {
        const items = this.getMultiFileItems();
        if (!items || items.length === 0) {
            showToast('沒有檔案可下載', 'warning');
            return;
        }

        // 顯示格式選擇選單
        const format = await this.showFormatMenu(event);
        if (!format) {
            return; // 使用者取消
        }

        // 下載指定格式的 ZIP
        await this.downloadAllFiles(format);
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
                normalize: false
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
        if (this.getNodeCategory() === 'input') {
            return '';
        }

        // 同步 previewBuffers 到 files.items（確保資料一致）
        this.syncPreviewToFiles();

        // 檢查是否有檔案
        const fileCount = this.getMultiFileCount();

        // 統一使用多檔案系統（包括單檔案）
        if (fileCount > 0) {
            return this.renderMultiFileSection({
                summaryIcon: '♬',
                summaryLabel: '個處理結果',
                actionPrefix: 'preview',
                waveformIdPrefix: `preview-waveform-${this.id}`,
                containerClass: fileCount === 1 ? 'node-preview-single' : 'node-preview-multi'
            });
        }

        // 無檔案時返回空預覽
        return `
            <div class="node-preview node-preview-empty">
                <div class="node-preview-placeholder">
                    <span style="color: var(--text-muted); font-size: var(--text-sm);">等待輸入...</span>
                </div>
            </div>
        `;
    }

    /**
     * 同步 previewBuffers 到統一的 files 結構
     */
    syncPreviewToFiles() {
        if (!this.previewBuffers) {
            return;
        }

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

        // 統一使用多檔案事件綁定系統（包括單檔案）
        this.bindMultiFileEvents(element, { actionPrefix: 'preview' });
    }

    /**
     * 重新渲染預覽 UI
     */
    refreshPreviewUI() {
        const previewContainer = this.element.querySelector('.node-preview, .node-preview-multi, .node-preview-single, .node-preview-empty');
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

                // 初始化 wavesurfers（使用統一系統，包括單檔案）
                if (this.isMultiFileExpanded() && this.getMultiFileCount() > 0) {
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
        const previewEl = this.element.querySelector('.node-preview, .node-preview-multi, .node-preview-single, .node-preview-empty');
        if (!previewEl) {
            return;
        }

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
            } else {
                // 單檔案處理（向下相容）
                this.previewBuffer = outputs.audio;
                this.previewBuffers = outputs.audio ? [outputs.audio] : [];
                this.previewFilenames = outputs.filenames || ['處理結果'];
            }

            // 同步到 files 結構
            this.syncPreviewToFiles();

            // 統一使用多檔案預覽系統（包括單檔案和無檔案）
            this.refreshPreviewUI();

        } catch (error) {
            console.error('預覽更新失敗:', error);
            // 清空預覽資料
            this.previewBuffer = null;
            this.previewBuffers = [];
            this.syncPreviewToFiles();
            this.refreshPreviewUI();
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
                normalize: false
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

    async downloadPreview(event) {
        if (!this.previewBuffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        // 如果沒有傳入 event，創建一個假的事件對象（用於定位選單）
        if (!event) {
            event = {
                target: {
                    getBoundingClientRect: () => ({
                        left: window.innerWidth / 2 - 60,
                        bottom: window.innerHeight / 2,
                    })
                }
            };
        }

        // 顯示格式選擇選單
        const format = await this.showFormatMenu(event);
        if (!format) {
            return; // 使用者取消
        }

        try {
            let audioData, mimeType, extension;

            if (format === 'mp3') {
                showToast('正在編碼 MP3...', 'info');
                audioData = audioBufferToMp3(this.previewBuffer);
                mimeType = 'audio/mpeg';
                extension = 'mp3';
            } else {
                audioData = audioBufferToWav(this.previewBuffer);
                mimeType = 'audio/wav';
                extension = 'wav';
            }

            const blob = new Blob([audioData], { type: mimeType });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.title}_processed.${extension}`;
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
        // 先搜尋主要輸出端口
        const mainPort = this.outputPorts.find(p => p.name === name);
        if (mainPort) return mainPort;
        // 再搜尋預覽輸出端口
        return this.previewOutputPorts?.find(p => p.name === name);
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
