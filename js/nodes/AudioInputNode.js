/**
 * 音訊輸入節點 - 載入音訊檔案（支援多檔案）
 * 使用 BaseNode 的統一多檔案管理系統
 */

class AudioInputNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            filename: options.filename || ''
        };

        // 在 super() 之前初始化（因為 renderContent 會在 super 中被呼叫）
        // 這些屬性會在 super() 後被正式設定

        super(id, 'audio-input', '音訊輸入', '📁', options, defaultData);

        // 多檔案音訊資料
        this.audioFiles = this.audioFiles || []; // [{filename, audioBuffer, wavesurfer}]
        this.filename = defaultData.filename; // 保持向下相容
    }

    // ========== 覆寫 BaseNode 的多檔案系統方法 ==========

    /**
     * 覆寫：取得多檔案資料來源
     */
    getMultiFileItems() {
        return this.audioFiles || [];
    }

    /**
     * 覆寫：取得檔案的 AudioBuffer
     */
    getFileBuffer(index) {
        const file = this.audioFiles[index];
        return file?.audioBuffer || null;
    }

    /**
     * 覆寫：取得檔案名稱
     */
    getFileName(index) {
        const file = this.audioFiles[index];
        return file?.filename || `檔案 ${index + 1}`;
    }

    /**
     * 覆寫：取得多檔案總數
     */
    getMultiFileCount() {
        return this.audioFiles?.length || 0;
    }

    /**
     * 覆寫：取得當前頁碼（使用 BaseNode 的統一結構）
     */
    getMultiFileCurrentPage() {
        return this.files.currentPage;
    }

    /**
     * 覆寫：設定當前頁碼
     */
    setMultiFileCurrentPage(page) {
        this.files.currentPage = page;
    }

    /**
     * 覆寫：取得/設定展開狀態
     */
    isMultiFileExpanded() {
        // 單一檔案時預設展開
        if (this.audioFiles?.length === 1) return true;
        return this.files.expanded;
    }

    /**
     * 覆寫：取得/設定 WaveSurfer 實例
     */
    getMultiFileWaveSurfer(index) {
        return this.audioFiles[index]?.wavesurfer || null;
    }

    setMultiFileWaveSurfer(index, wavesurfer) {
        if (this.audioFiles[index]) {
            this.audioFiles[index].wavesurfer = wavesurfer;
        }
    }

    /**
     * 覆寫：取得下載用的檔名前綴
     */
    getMultiFileDownloadPrefix() {
        return 'audio_files';
    }

    /**
     * 覆寫：初始化單個 wavesurfer（自訂顏色）
     */
    async initSingleWaveSurfer(index, options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'input'
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
            // 輸入節點使用綠色波形
            const wavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(146 17% 59% / 0.6)',
                progressColor: 'hsl(146 17% 59%)',
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

    // ========== 節點基本設定 ==========

    // 為了向下相容，保留 audioBuffer getter
    get audioBuffer() {
        return this.audioFiles.length > 0 ? this.audioFiles[0].audioBuffer : null;
    }

    set audioBuffer(buffer) {
        if (this.audioFiles.length > 0) {
            this.audioFiles[0].audioBuffer = buffer;
        }
    }

    setupPorts() {
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'input';
    }

    // ========== 渲染 ==========

    renderContent() {
        // 防禦性檢查（在 super() 呼叫時 audioFiles 可能尚未初始化）
        if (!this.audioFiles) {
            this.audioFiles = [];
        }

        if (this.audioFiles.length > 0) {
            const fileCount = this.audioFiles.length;
            const isSingleFile = fileCount === 1;

            // 使用 BaseNode 的統一多檔案渲染系統
            return `
                ${this.renderMultiFileSection({
                summaryIcon: '📄',
                summaryLabel: '個音訊檔案',
                actionPrefix: 'input',
                waveformIdPrefix: `waveform-${this.id}`,
                containerClass: isSingleFile ? 'node-preview-single' : 'node-preview-multi'
            })}
                <button class="node-btn" data-action="change">新增檔案</button>
            `;
        }

        return `
            <button class="node-btn node-btn-primary" data-action="select">選擇音訊檔案</button>
            <div class="node-drop-hint" style="text-align: center; color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--spacing-2);">
                或拖拉檔案至此（支援多檔案）
            </div>
        `;
    }

    /**
     * 覆寫：渲染多檔案列表（加入移除按鈕和輸出連結點）
     */
    renderMultiFileList(options = {}) {
        const {
            waveformIdPrefix = `waveform-${this.id}`,
            actionPrefix = 'input',
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
            const displayName = this.formatFilename(filename, 18);
            const hasConnection = this.previewOutputConnections?.get(i) > 0;

            html += `
                <div class="node-preview-file-item ${hasConnection ? 'has-output-connection' : ''}" data-file-index="${i}">
                    <div class="node-preview-file-info">
                        <span class="node-preview-file-icon">📄</span>
                        <span class="node-preview-file-name" title="${filename}">${displayName}</span>
                        <button class="node-file-remove" data-action="remove-file" data-index="${i}" title="移除">×</button>
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
     * 格式化檔案名稱，過長時截斷
     */
    formatFilename(filename, maxLength = 20) {
        if (!filename || filename.length <= maxLength) return filename;

        // 取得副檔名
        const lastDot = filename.lastIndexOf('.');
        const ext = lastDot > 0 ? filename.slice(lastDot) : '';
        const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;

        // 計算可用長度（保留副檔名和省略號）
        const availableLength = maxLength - ext.length - 3; // 3 for '...'
        if (availableLength < 4) return filename.slice(0, maxLength - 3) + '...';

        // 取前段和後段
        const frontLength = Math.ceil(availableLength / 2);
        const backLength = Math.floor(availableLength / 2);

        return name.slice(0, frontLength) + '...' + name.slice(-backLength) + ext;
    }

    // ========== 事件綁定 ==========

    bindContentEvents() {
        // 選擇檔案按鈕
        const selectBtn = this.element.querySelector('[data-action="select"]');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => this.openFileDialog());
        }

        // 更換檔案按鈕
        const changeBtn = this.element.querySelector('[data-action="change"]');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => this.openFileDialog());
        }

        // 使用 BaseNode 的統一事件綁定
        this.bindMultiFileEvents(this.element, { actionPrefix: 'input' });

        // 移除檔案按鈕（AudioInputNode 專屬）
        const removeBtns = this.element.querySelectorAll('[data-action="remove-file"]');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeFile(index);
            });
        });

        // 拖放事件
        this.element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.element.classList.add('drag-over');
        });

        this.element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.element.classList.remove('drag-over');
        });

        this.element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.element.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
            if (files.length > 0) {
                this.loadFiles(files);
            }
        });

        // 初始化波形（當預覽展開時）
        if (this.audioFiles.length > 0 && this.isMultiFileExpanded()) {
            requestAnimationFrame(() => {
                this.initCurrentPageWaveSurfers({
                    waveformIdPrefix: `waveform-${this.id}`,
                    actionPrefix: 'input'
                });
            });
        }
    }

    /**
     * 覆寫：重新渲染多檔案 UI
     */
    refreshMultiFileUI() {
        this.updateContent();
    }

    // ========== 檔案操作 ==========

    openFileDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = true; // 支援多選
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                this.loadFiles(files);
            }
        };
        input.click();
    }

    /**
     * 載入多個檔案
     */
    async loadFiles(files) {
        try {
            this.setProcessing(true);

            const loadPromises = files.map(async (file) => {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFromFile(file);
                    return {
                        filename: file.name,
                        audioBuffer: audioBuffer,
                        wavesurfer: null
                    };
                } catch (error) {
                    console.error(`載入 ${file.name} 失敗:`, error);
                    showToast(`載入失敗: ${file.name}`, 'error');
                    return null;
                }
            });

            const loadedFiles = (await Promise.all(loadPromises)).filter(f => f !== null);

            if (loadedFiles.length > 0) {
                // 將新檔案加入列表
                this.audioFiles.push(...loadedFiles);

                // 更新向下相容的 filename
                if (this.audioFiles.length === 1) {
                    this.filename = this.audioFiles[0].filename;
                } else {
                    this.filename = `${this.audioFiles.length} 個檔案`;
                }

                // 更新 UI
                this.updateContent();

                // 延遲初始化波形以確保 DOM 已更新
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.initCurrentPageWaveSurfers({
                    waveformIdPrefix: `waveform-${this.id}`,
                    actionPrefix: 'input'
                });

                showToast(`已載入 ${loadedFiles.length} 個檔案`, 'success');
            }

            this.setProcessing(false);

            // 觸發資料變更
            if (this.onDataChange) {
                this.onDataChange('audioFiles', this.audioFiles);
            }

        } catch (error) {
            this.setProcessing(false);
            showToast(`載入失敗: ${error.message}`, 'error');
            console.error('載入音訊失敗:', error);
        }
    }

    // 保持向下相容的 loadFile
    async loadFile(file) {
        return this.loadFiles([file]);
    }

    /**
     * 移除指定檔案
     */
    removeFile(index) {
        if (index < 0 || index >= this.audioFiles.length) return;

        // 銷毀 wavesurfer
        const file = this.audioFiles[index];
        if (file.wavesurfer) {
            try {
                file.wavesurfer.destroy();
            } catch (e) { }
        }

        // 移除檔案
        this.audioFiles.splice(index, 1);

        // 調整當前頁面
        const totalPages = Math.ceil(this.audioFiles.length / this.getMultiFilePerPage());
        const currentPage = this.getMultiFileCurrentPage();
        if (currentPage >= totalPages && totalPages > 0) {
            this.setMultiFileCurrentPage(totalPages - 1);
        }

        // 更新 UI
        this.updateContent();

        // 觸發資料變更
        if (this.onDataChange) {
            this.onDataChange('audioFiles', this.audioFiles);
        }

        showToast('已移除檔案', 'info');
    }

    // ========== 處理與序列化 ==========

    async process(inputs) {
        // 輸入節點直接輸出 audioBuffer（向下相容：輸出第一個檔案）
        // 如果有多個檔案，可以在此擴展輸出所有檔案
        return {
            audio: this.audioBuffer,
            audioFiles: this.audioFiles.map(f => f.audioBuffer),
            filenames: this.audioFiles.map(f => f.filename)
        };
    }

    toJSON() {
        const json = super.toJSON();
        json.filename = this.filename;
        json.fileCount = this.audioFiles.length;
        json.filenames = this.audioFiles.map(f => f.filename);
        // 注意：audioBuffer 不序列化，需要重新載入
        return json;
    }
}

// 匯出
window.AudioInputNode = AudioInputNode;
