/**
 * 音訊輸入節點 - 載入音訊檔案（支援多檔案）
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

        // 分頁設定
        this.currentPage = this.currentPage || 0;
        this.filesPerPage = 5;

        // 預覽頁簽狀態 - 根據檔案數量決定預設值
        this.previewExpanded = this.previewExpanded || false;
    }

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

    /**
     * 取得總頁數
     */
    getTotalPages() {
        return Math.ceil(this.audioFiles.length / this.filesPerPage);
    }

    /**
     * 取得當前頁面的檔案
     */
    getCurrentPageFiles() {
        const start = this.currentPage * this.filesPerPage;
        const end = start + this.filesPerPage;
        return this.audioFiles.slice(start, end);
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

    renderContent() {
        // 防禦性檢查（在 super() 呼叫時 audioFiles 可能尚未初始化）
        if (!this.audioFiles) {
            this.audioFiles = [];
        }

        if (this.audioFiles.length > 0) {
            const fileCount = this.audioFiles.length;
            const isSingleFile = fileCount === 1;
            // 單一檔案預設展開，多檔案預設收合
            const shouldExpand = isSingleFile ? true : this.previewExpanded;

            return `
                <div class="node-file-summary">
                    <span class="node-file-icon">📄</span>
                    <span class="node-file-count">${fileCount} 個檔案</span>
                    ${!isSingleFile ? `
                        <button class="node-download-all-btn" data-action="download-all" title="下載全部 (ZIP)">📦</button>
                        <button class="node-preview-toggle" data-action="toggle-preview" title="${shouldExpand ? '收合預覽' : '展開預覽'}">
                            ${shouldExpand ? '▼' : '▶'}
                        </button>
                    ` : ''}
                </div>
                <div class="node-files-preview ${shouldExpand ? 'expanded' : 'collapsed'}">
                    ${this.renderFilesList()}
                    ${this.renderPagination()}
                </div>
                <button class="node-btn" data-action="change">更換/新增檔案</button>
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
     * 渲染檔案列表
     */
    renderFilesList() {
        const files = this.getCurrentPageFiles();
        const startIndex = this.currentPage * this.filesPerPage;

        return files.map((file, idx) => {
            const globalIndex = startIndex + idx;
            const duration = file.audioBuffer ? formatTime(file.audioBuffer.duration) : '00:00';
            const displayName = this.formatFilename(file.filename, 18);

            return `
                <div class="node-file-item" data-file-index="${globalIndex}">
                    <div class="node-file-info">
                        <span class="node-file-icon">📄</span>
                        <span class="node-file-name" title="${file.filename}">${displayName}</span>
                        <button class="node-file-remove" data-action="remove-file" data-index="${globalIndex}" title="移除">×</button>
                    </div>
                    <div class="node-waveform" id="waveform-${this.id}-${globalIndex}"></div>
                    <div class="node-playback">
                        <button class="node-play-btn" data-action="play" data-index="${globalIndex}">▶</button>
                        <span class="node-time">
                            <span class="current-time" data-index="${globalIndex}">00:00</span> / <span class="total-time">${duration}</span>
                        </span>
                        <button class="node-download-btn" data-action="download" data-index="${globalIndex}" title="下載">⬇</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 渲染分頁控制
     */
    renderPagination() {
        const totalPages = this.getTotalPages();
        if (totalPages <= 1) return '';

        return `
            <div class="node-pagination">
                <button class="node-page-btn" data-action="prev-page" ${this.currentPage === 0 ? 'disabled' : ''}>
                    ◀ 上一頁
                </button>
                <span class="node-page-info">第 ${this.currentPage + 1} 頁，共 ${totalPages} 頁</span>
                <button class="node-page-btn" data-action="next-page" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}>
                    下一頁 ▶
                </button>
            </div>
        `;
    }

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

        // 預覽頁簽切換按鈕
        const toggleBtn = this.element.querySelector('[data-action="toggle-preview"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.togglePreviewExpanded());
        }

        // 下載全部按鈕 (ZIP)
        const downloadAllBtn = this.element.querySelector('[data-action="download-all"]');
        if (downloadAllBtn) {
            downloadAllBtn.addEventListener('click', () => this.downloadAllAsZip());
        }

        // 播放按鈕
        const playBtns = this.element.querySelectorAll('[data-action="play"]');
        playBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.togglePlay(index);
            });
        });

        // 下載按鈕
        const downloadBtns = this.element.querySelectorAll('[data-action="download"]');
        downloadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.downloadAudio(index);
            });
        });

        // 移除檔案按鈕
        const removeBtns = this.element.querySelectorAll('[data-action="remove-file"]');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeFile(index);
            });
        });

        // 分頁按鈕
        const prevBtn = this.element.querySelector('[data-action="prev-page"]');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        }

        const nextBtn = this.element.querySelector('[data-action="next-page"]');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        }

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
        if (this.audioFiles.length > 0 && (this.audioFiles.length === 1 || this.previewExpanded)) {
            requestAnimationFrame(() => {
                this.initAllWaveSurfers();
            });
        }
    }

    /**
     * 切換預覽展開狀態
     */
    togglePreviewExpanded() {
        this.previewExpanded = !this.previewExpanded;
        this.updateContent();
    }

    /**
     * 切換到指定頁面
     */
    goToPage(page) {
        const totalPages = this.getTotalPages();
        if (page < 0 || page >= totalPages) return;

        // 先銷毀當前頁面的 wavesurfer
        this.destroyCurrentPageWaveSurfers();

        this.currentPage = page;
        this.updateContent();
    }

    /**
     * 銷毀當前頁面的 wavesurfer
     */
    destroyCurrentPageWaveSurfers() {
        const files = this.getCurrentPageFiles();
        const startIndex = this.currentPage * this.filesPerPage;

        files.forEach((file, idx) => {
            if (file.wavesurfer) {
                try {
                    file.wavesurfer.destroy();
                } catch (e) {
                    console.warn('銷毀 WaveSurfer 時發生錯誤:', e);
                }
                file.wavesurfer = null;
            }
        });
    }

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

                // 如果是單一檔案，預設展開預覽
                if (this.audioFiles.length === 1) {
                    this.previewExpanded = true;
                }

                // 更新 UI
                this.updateContent();

                // 延遲初始化波形以確保 DOM 已更新
                await new Promise(resolve => setTimeout(resolve, 50));
                await this.initAllWaveSurfers();

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
        const totalPages = this.getTotalPages();
        if (this.currentPage >= totalPages && totalPages > 0) {
            this.currentPage = totalPages - 1;
        }

        // 更新 UI
        this.updateContent();

        // 觸發資料變更
        if (this.onDataChange) {
            this.onDataChange('audioFiles', this.audioFiles);
        }

        showToast('已移除檔案', 'info');
    }

    /**
     * 初始化當前頁面所有檔案的 WaveSurfer
     */
    async initAllWaveSurfers() {
        const files = this.getCurrentPageFiles();
        const startIndex = this.currentPage * this.filesPerPage;

        for (let idx = 0; idx < files.length; idx++) {
            const globalIndex = startIndex + idx;
            await this.initWaveSurfer(globalIndex);
        }
    }

    async initWaveSurfer(fileIndex) {
        const file = this.audioFiles[fileIndex];
        if (!file || !file.audioBuffer) return;

        const container = this.element.querySelector(`#waveform-${this.id}-${fileIndex}`);
        if (!container) return;

        // 銷毀舊的 wavesurfer
        if (file.wavesurfer) {
            try {
                file.wavesurfer.destroy();
            } catch (e) {
                console.warn('銷毀 WaveSurfer 時發生錯誤:', e);
            }
            file.wavesurfer = null;
        }

        try {
            // 建立新的 wavesurfer
            file.wavesurfer = WaveSurfer.create({
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

            // 將 AudioBuffer 轉換為 Blob 並載入
            const wavData = audioBufferToWav(file.audioBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            // 使用 loadBlob 而不是 load 避免 CORS 問題
            await file.wavesurfer.loadBlob(blob);
            URL.revokeObjectURL(url);

            // 更新時間顯示
            file.wavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector(`.current-time[data-index="${fileIndex}"]`);
                if (timeEl) {
                    timeEl.textContent = formatTime(currentTime);
                }
            });

            file.wavesurfer.on('play', () => {
                const btn = this.element.querySelector(`[data-action="play"][data-index="${fileIndex}"]`);
                if (btn) btn.textContent = '⏸';
            });

            file.wavesurfer.on('pause', () => {
                const btn = this.element.querySelector(`[data-action="play"][data-index="${fileIndex}"]`);
                if (btn) btn.textContent = '▶';
            });

            file.wavesurfer.on('finish', () => {
                const btn = this.element.querySelector(`[data-action="play"][data-index="${fileIndex}"]`);
                if (btn) btn.textContent = '▶';
            });

        } catch (error) {
            console.error('WaveSurfer 載入失敗:', error);
        }
    }

    togglePlay(fileIndex) {
        const file = this.audioFiles[fileIndex];
        if (file && file.wavesurfer) {
            file.wavesurfer.playPause();
        }
    }

    downloadAudio(fileIndex) {
        const file = this.audioFiles[fileIndex];
        if (!file || !file.audioBuffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(file.audioBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            const baseName = file.filename.replace(/\.[^.]+$/, '');
            a.href = url;
            a.download = `${baseName || 'audio'}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('下載已開始', 'success');
        } catch (error) {
            showToast(`下載失敗: ${error.message}`, 'error');
            console.error('下載失敗:', error);
        }
    }

    /**
     * 下載所有檔案為 ZIP
     */
    async downloadAllAsZip() {
        if (this.audioFiles.length === 0) {
            showToast('沒有檔案可下載', 'warning');
            return;
        }

        try {
            showToast('正在打包檔案...', 'info');

            const zip = new JSZip();

            // 將所有音訊檔案加入 ZIP
            for (const file of this.audioFiles) {
                if (file.audioBuffer) {
                    const wavData = audioBufferToWav(file.audioBuffer);
                    const baseName = file.filename.replace(/\.[^.]+$/, '');
                    zip.file(`${baseName || 'audio'}.wav`, wavData);
                }
            }

            // 生成 ZIP 並下載
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `audio_files_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`已下載 ${this.audioFiles.length} 個檔案`, 'success');
        } catch (error) {
            showToast(`打包下載失敗: ${error.message}`, 'error');
            console.error('ZIP 下載失敗:', error);
        }
    }

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
