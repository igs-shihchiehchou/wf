/**
 * 音量整合節點（Volume Sync Node）
 * 將多個音訊的音量統一調整到一致的響度
 */

class VolumeSyncNode extends BaseNode {
    // 預設真實峰值模式
    static PEAK_PRESETS = {
        'game': { label: '遊戲音效', peak: -1.0 },
        'video': { label: '影片配樂', peak: -2.0 },
        'broadcast': { label: '廣播標準', peak: -1.0 }, // EBU R128 建議值
        'custom': { label: '自訂', peak: -1.0 }
    };

    constructor(id, options = {}) {
        const defaultData = {
            targetPeak: -1.0,          // 目標真實峰值（dBTP）
            mode: 'game',              // 模式
            keepRelative: false,       // 保持相對音量
            autoLimiter: true,         // 自動限幅
            processed: false,          // 是否已處理
            fileAnalysis: []           // 檔案分析結果
        };
        super(id, 'volume-sync', '音量整合', '⇋', options, defaultData);

        this.inputAudioBuffers = [];
        this.inputFilenames = [];
        this.processedBuffers = [];
        this.isAnalyzing = false;
        this.isProcessing = false;
        this.currentDetailIndex = null;
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const hasFiles = this.data.fileAnalysis.length > 0;
        const isProcessed = this.data.processed;

        // 生成模式選項
        const modeOptions = Object.entries(VolumeSyncNode.PEAK_PRESETS).map(([key, preset]) => {
            const selected = this.data.mode === key ? 'selected' : '';
            return `<option value="${key}" ${selected}>${preset.label} (${preset.peak.toFixed(1)} dBTP)</option>`;
        }).join('');

        // 摘要標籤（顯示最高峰值）
        const summaryTag = this.renderSummaryTag();

        return `
            <!-- 區域一：標題與摘要 -->
            <div class="volume-sync-header">
                <div class="volume-sync-title">
                    <span class="volume-sync-icon">⇋</span>
                    <span class="volume-sync-label">音量整合</span>
                </div>
                ${summaryTag}
            </div>

            <!-- 區域二：目標設定 -->
            <div class="volume-sync-settings">
                <div class="volume-sync-mode">
                    <label class="volume-sync-mode-label">目標峰值:</label>
                    <select class="volume-sync-mode-select" ${!hasFiles ? 'disabled' : ''}>
                        ${modeOptions}
                    </select>
                </div>
                ${this.data.mode === 'custom' ? this.renderCustomSlider() : ''}
                <div class="volume-sync-options">
                    <label class="volume-sync-checkbox">
                        <input type="checkbox" class="volume-sync-keep-relative" 
                               ${this.data.keepRelative ? 'checked' : ''}>
                        <span>保持相對音量</span>
                    </label>
                    <label class="volume-sync-checkbox">
                        <input type="checkbox" class="volume-sync-auto-limiter" 
                               ${this.data.autoLimiter ? 'checked' : ''}>
                        <span>自動限幅</span>
                    </label>
                </div>
            </div>

            <!-- 區域三：執行按鈕 -->
            <div class="volume-sync-actions">
                <button class="volume-sync-execute-btn" ${!hasFiles ? 'disabled' : ''}>
                    ${isProcessed ? '✅ 重新執行' : '▶ 執行'}
                </button>
            </div>

            <!-- 區域四：檔案列表 -->
            <div class="volume-sync-files">
                ${this.renderFilesList()}
            </div>

            <!-- 進度條 -->
            <div class="volume-sync-progress" id="volume-sync-progress-${this.id}" style="display: none;">
                <div class="volume-sync-progress-bar"></div>
                <span class="volume-sync-progress-text">處理中...</span>
            </div>

            <!-- 細部分析面板 -->
            <div class="volume-sync-detail-panel" id="volume-sync-detail-${this.id}" style="display: none;"></div>
        `;
    }

    /**
     * 渲染響度摘要標籤
     */
    /**
     * 渲染摘要標籤 (顯示峰值)
     */
    renderSummaryTag() {
        const fileAnalysis = this.data.fileAnalysis || [];
        if (fileAnalysis.length === 0) {
            return '<div class="volume-sync-summary-tag empty">等待輸入...</div>';
        }

        const peakValues = fileAnalysis.filter(f => f.peak !== null).map(f => f.peak);
        if (peakValues.length === 0) {
            return '<div class="volume-sync-summary-tag analyzing">分析中...</div>';
        }

        const maxPeak = Math.max(...peakValues);
        const minPeak = Math.min(...peakValues);
        const delta = maxPeak - minPeak;

        // 警告：如果任何檔案超過 0 dBTP
        const isClipping = maxPeak > 0;

        return `
            <div class="volume-sync-summary-tag">
                <span class="summary-avg ${isClipping ? 'warning' : ''}">Max: ${maxPeak.toFixed(1)} dBTP</span>
                <span class="summary-delta">Δ ${delta.toFixed(1)} dB</span>
            </div>
        `;
    }

    /**
     * 渲染自訂峰值滑桿
     */
    renderCustomSlider() {
        return `
            <div class="volume-sync-custom-slider">
                <input type="range" class="volume-sync-lufs-slider" 
                       min="-60" max="0" step="0.1" value="${this.data.targetPeak}">
                <span class="volume-sync-lufs-value">${this.data.targetPeak} dBTP</span>
            </div>
        `;
    }

    /**
     * 渲染檔案列表
     */
    renderFilesList() {
        const fileAnalysis = this.data.fileAnalysis || [];

        if (fileAnalysis.length === 0) {
            return `
                <div class="volume-sync-empty">
                    <span class="volume-sync-empty-icon">📭</span>
                    <span class="volume-sync-empty-text">請連接音訊來源</span>
                </div>
            `;
        }

        const listHtml = fileAnalysis.map((item, index) => {
            // 峰值顯示
            let statusDisplay;
            if (item.peak !== null && item.peak !== undefined) {
                const peakClass = this.getPeakClass(item.peak);
                const peakTooltip = `真實峰值 (True Peak)\n目前: ${item.peak.toFixed(1)} dBTP\n目標: ${this.data.targetPeak} dBTP\n差距: ${(item.peak - this.data.targetPeak).toFixed(1)} dB`;
                statusDisplay = `<span class="volume-sync-lufs ${peakClass}" title="${peakTooltip}">${item.peak.toFixed(1)} dBTP</span>`;
            } else if (item.analyzing) {
                statusDisplay = `<span class="volume-sync-analyzing" title="分析中...">⏳</span>`;
            } else {
                statusDisplay = `<span class="volume-sync-pending" title="尚未分析">--</span>`;
            }

            // 調整量顯示
            let adjustDisplay = '';
            if (this.data.processed && item.adjustment !== undefined) {
                const adjustClass = item.adjustment > 0 ? 'up' : item.adjustment < 0 ? 'down' : 'same';
                const adjustText = item.adjustment > 0 ? `+${item.adjustment.toFixed(1)}` : item.adjustment.toFixed(1);
                // 顯示處理後預估峰值
                const currentPeak = item.peak || -Infinity;
                const estimatedPeak = currentPeak + item.adjustment;
                const adjustTooltip = `音量調整量\n調整: ${adjustText} dB\n處理後峰值: ${estimatedPeak.toFixed(1)} dBTP`;
                adjustDisplay = `<span class="volume-sync-adjustment ${adjustClass}" title="${adjustTooltip}">${adjustText} dB</span>`;
            }

            // 分析按鈕狀態
            const hasDetail = item.detailAnalysis !== undefined;
            const analyzeIcon = hasDetail ? '⇋' : '🔍';
            const analyzeTitle = hasDetail ? '查看分析結果' : '點擊進行細部分析';

            return `
                <div class="volume-sync-file-item" data-index="${index}">
                    <div class="volume-sync-file-info">
                        <span class="volume-sync-file-icon">📄</span>
                        <span class="volume-sync-file-name" title="${item.filename}">${item.filename}</span>
                    </div>
                    <div class="volume-sync-file-analysis">
                        ${statusDisplay}
                        ${adjustDisplay}
                        <button class="volume-sync-analyze-btn" data-index="${index}" title="${analyzeTitle}">${analyzeIcon}</button>
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="volume-sync-file-list">${listHtml}</div>`;
    }

    /**
     * 根據 Peak 值取得 CSS 類別
     */
    getPeakClass(peak) {
        const target = this.data.targetPeak;
        const diff = Math.abs(peak - target);
        if (diff > 6) return 'far';
        if (diff > 3) return 'medium';
        return 'close';
    }

    bindContentEvents() {
        // 模式選擇
        const modeSelect = this.element.querySelector('.volume-sync-mode-select');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                this.data.mode = e.target.value;
                if (this.data.mode !== 'custom') {
                    this.data.targetPeak = VolumeSyncNode.PEAK_PRESETS[this.data.mode].peak;
                }
                this.updateContent();
            });
        }

        // 自訂響度滑桿
        const lufsSlider = this.element.querySelector('.volume-sync-lufs-slider');
        if (lufsSlider) {
            lufsSlider.addEventListener('input', (e) => {
                this.data.targetPeak = parseFloat(e.target.value);
                const valueDisplay = this.element.querySelector('.volume-sync-lufs-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${this.data.targetPeak.toFixed(1)} dBTP`;
                }
            });
        }

        // 保持相對音量選項
        const keepRelativeCheckbox = this.element.querySelector('.volume-sync-keep-relative');
        if (keepRelativeCheckbox) {
            keepRelativeCheckbox.addEventListener('change', (e) => {
                this.data.keepRelative = e.target.checked;
            });
        }

        // 自動限幅選項
        const autoLimiterCheckbox = this.element.querySelector('.volume-sync-auto-limiter');
        if (autoLimiterCheckbox) {
            autoLimiterCheckbox.addEventListener('change', (e) => {
                this.data.autoLimiter = e.target.checked;
            });
        }

        // 執行按鈕
        const executeBtn = this.element.querySelector('.volume-sync-execute-btn');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                this.executeNormalization();
            });
        }

        // 檔案分析按鈕
        this.bindAnalyzeButtons();
    }

    /**
     * 綁定分析按鈕事件
     */
    bindAnalyzeButtons() {
        this.element.querySelectorAll('.volume-sync-analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                this.showFileDetailPanel(index);
            });
        });
    }

    /**
     * 更新輸入音訊（支援多檔案）
     */
    async updateInputAudio(audioBuffer, audioFiles = null, filenames = null) {
        // 標記為未處理
        this.data.processed = false;
        this.processedBuffers = [];

        if (audioFiles && audioFiles.length > 0) {
            this.inputAudioBuffers = audioFiles;
            this.inputFilenames = filenames || audioFiles.map((_, i) => `檔案 ${i + 1}`);
        } else if (audioBuffer) {
            this.inputAudioBuffers = [audioBuffer];
            this.inputFilenames = ['音訊'];
        } else {
            this.inputAudioBuffers = [];
            this.inputFilenames = [];
            this.data.fileAnalysis = [];
            this.files.items = [];
            this.previewBuffers = [];
            this.previewFilenames = [];
            this.updateContent();
            return;
        }

        // 設定預覽為原始音訊（執行前預覽）
        this.previewBuffers = [...this.inputAudioBuffers];
        this.previewFilenames = [...this.inputFilenames];
        this.files.items = this.inputAudioBuffers.map((buffer, index) => ({
            buffer: buffer,
            filename: this.inputFilenames[index] || `檔案 ${index + 1}`
        }));

        // 分析所有檔案
        await this.analyzeAllFiles();
    }

    /**
     * 分析所有檔案的音量資訊
     */
    async analyzeAllFiles() {
        if (this.isAnalyzing) return;
        this.isAnalyzing = true;

        const fileAnalysis = [];

        for (let i = 0; i < this.inputAudioBuffers.length; i++) {
            const buffer = this.inputAudioBuffers[i];
            const filename = this.inputFilenames[i] || `檔案 ${i + 1}`;

            // 先加入 analyzing 狀態
            fileAnalysis.push({
                filename,
                lufs: null,
                peak: null,
                analyzing: true
            });
        }

        this.data.fileAnalysis = fileAnalysis;
        this.updateContent();

        // 分析每個檔案
        for (let i = 0; i < this.inputAudioBuffers.length; i++) {
            const buffer = this.inputAudioBuffers[i];
            if (buffer) {
                const analysis = this.analyzeAudio(buffer);
                this.data.fileAnalysis[i] = {
                    ...this.data.fileAnalysis[i],
                    lufs: analysis.lufs,
                    peak: analysis.peak,
                    lra: analysis.lra,
                    analyzing: false
                };
            }
        }

        this.isAnalyzing = false;
        this.updateContent();

        // 延遲初始化波形（確保 DOM 已更新）
        setTimeout(() => {
            this.initCurrentPageWaveSurfers({
                waveformIdPrefix: `preview-waveform-${this.id}`,
                actionPrefix: 'preview'
            });
        }, 100);
    }

    /**
     * 分析音訊：計算峰值與響度
     */
    analyzeAudio(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // 計算峰值 (Sample Peak)
        let peak = 0;
        for (let i = 0; i < channelData.length; i++) {
            const abs = Math.abs(channelData[i]);
            if (abs > peak) peak = abs;
        }
        const peakDb = 20 * Math.log10(peak + 1e-10);

        // --- 以下保留作為參考數據 ---

        // 計算 RMS（均方根）
        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
            sumSquares += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        const rmsDb = 20 * Math.log10(rms + 1e-10);
        const lufs = rmsDb - 0.691; // 簡單校正近似 LUFS

        // 計算 LRA（響度範圍）- 簡化版
        const blockSize = Math.floor(sampleRate * 0.4); // 400ms blocks
        const blocks = [];
        for (let i = 0; i < channelData.length - blockSize; i += blockSize) {
            let blockSum = 0;
            for (let j = 0; j < blockSize; j++) {
                blockSum += channelData[i + j] * channelData[i + j];
            }
            const blockRms = Math.sqrt(blockSum / blockSize);
            blocks.push(20 * Math.log10(blockRms + 1e-10));
        }

        let lra = 0;
        if (blocks.length > 2) {
            blocks.sort((a, b) => a - b);
            const low = blocks[Math.floor(blocks.length * 0.1)];
            const high = blocks[Math.floor(blocks.length * 0.9)];
            lra = high - low;
        }

        return {
            lufs: Math.max(-100, lufs), // 限制最小值避免 -Infinity
            peak: peakDb,
            lra: lra
        };
    }

    /**
     * 執行音量整合 (峰值正規化)
     */
    async executeNormalization() {
        if (this.isProcessing) return;
        if (this.inputAudioBuffers.length === 0) {
            showToast('請先連接音訊來源', 'warning');
            return;
        }

        this.isProcessing = true;
        this.showProgress(true);

        try {
            const targetPeak = this.data.targetPeak;
            this.processedBuffers = [];

            // 1. 找出全域最大峰值 (用於相對模式)
            const allPeaks = this.data.fileAnalysis.filter(f => f.peak !== null).map(f => f.peak);
            const globalMaxPeak = Math.max(...allPeaks, -100);

            for (let i = 0; i < this.inputAudioBuffers.length; i++) {
                this.updateProgress((i + 1) / this.inputAudioBuffers.length);

                const buffer = this.inputAudioBuffers[i];
                const currentPeak = this.data.fileAnalysis[i]?.peak;

                if (!buffer || currentPeak === null) {
                    this.processedBuffers.push(buffer);
                    continue;
                }

                let adjustment;
                if (this.data.keepRelative) {
                    // 保持相對音量：所有檔案套用相同的增益
                    // 增益由最大聲的那個檔案決定，使其達到目標峰值
                    adjustment = targetPeak - globalMaxPeak;
                } else {
                    // 絕對峰值：每個檔案獨立調整到目標峰值
                    adjustment = targetPeak - currentPeak;
                }

                // 調整音量
                const processedBuffer = this.normalizeBuffer(buffer, adjustment);

                // 記錄調整量
                this.data.fileAnalysis[i].adjustment = adjustment;

                this.processedBuffers.push(processedBuffer);
            }

            // 標記為已處理
            this.data.processed = true;

            // 更新預覽相關資料
            this.previewBuffers = [...this.processedBuffers];
            this.previewFilenames = [...this.inputFilenames];

            this.files.items = this.processedBuffers.map((buffer, index) => ({
                buffer: buffer,
                filename: this.inputFilenames[index] || `處理結果 ${index + 1}`
            }));

            showToast('音量整合完成', 'success');
        } catch (error) {
            console.error('音量整合失敗:', error);
            showToast('處理失敗: ' + error.message, 'error');
        } finally {
            this.isProcessing = false;
            this.showProgress(false);
            this.updateContent();
            setTimeout(() => {
                this.initCurrentPageWaveSurfers({
                    waveformIdPrefix: `preview-waveform-${this.id}`,
                    actionPrefix: 'preview'
                });
            }, 100);
        }
    }

    /**
     * 調整音訊音量
     */
    normalizeBuffer(audioBuffer, adjustmentDb) {
        const gain = Math.pow(10, adjustmentDb / 20);
        const threshold = this.data.autoLimiter ? 0.95 : Infinity;

        // 建立新的 AudioBuffer
        const newBuffer = new AudioBuffer({
            numberOfChannels: audioBuffer.numberOfChannels,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate
        });

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = newBuffer.getChannelData(channel);

            for (let i = 0; i < inputData.length; i++) {
                let sample = inputData[i] * gain;

                // 限幅器
                if (this.data.autoLimiter) {
                    sample = this.softClip(sample, threshold);
                }

                outputData[i] = sample;
            }
        }

        return newBuffer;
    }

    /**
     * 軟限幅（Soft Clipping）
     */
    softClip(sample, threshold) {
        const abs = Math.abs(sample);
        if (abs <= threshold) {
            return sample;
        }
        // 使用 tanh 進行軟限幅
        const sign = sample > 0 ? 1 : -1;
        const excess = abs - threshold;
        const compressed = threshold + (1 - threshold) * Math.tanh(excess / (1 - threshold));
        return sign * Math.min(compressed, 1);
    }

    /**
     * 顯示/隱藏進度條
     */
    showProgress(show) {
        const progressEl = this.element.querySelector(`#volume-sync-progress-${this.id}`);
        if (progressEl) {
            progressEl.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * 更新進度條
     */
    updateProgress(progress) {
        const progressBar = this.element.querySelector('.volume-sync-progress-bar');
        const progressText = this.element.querySelector('.volume-sync-progress-text');
        if (progressBar) {
            progressBar.style.width = `${progress * 100}%`;
        }
        if (progressText) {
            progressText.textContent = `處理中... ${Math.round(progress * 100)}%`;
        }
    }

    /**
     * 顯示檔案細部分析面板
     */
    async showFileDetailPanel(index) {
        const fileAnalysis = this.data.fileAnalysis[index];
        if (!fileAnalysis) return;

        const audioBuffer = this.inputAudioBuffers[index];
        if (!audioBuffer) {
            showToast('無法取得音訊資料', 'error');
            return;
        }

        const panel = this.element.querySelector(`#volume-sync-detail-${this.id}`);
        if (!panel) return;

        // 如果沒有詳細分析，先進行分析
        if (!fileAnalysis.detailAnalysis) {
            fileAnalysis.detailAnalysis = this.analyzeAudio(audioBuffer);
        }

        const filename = fileAnalysis.filename;
        const detail = fileAnalysis.detailAnalysis || fileAnalysis;

        panel.style.display = 'block';
        panel.innerHTML = this.buildDetailPanelHTML(index, filename, detail);
        this.bindDetailPanelEvents(index);
        this.currentDetailIndex = index;

        // 更新按鈕狀態
        const btn = this.element.querySelector(`.volume-sync-analyze-btn[data-index="${index}"]`);
        if (btn) btn.textContent = '⇋';
    }

    /**
     * 建構細部分析面板 HTML
     */
    buildDetailPanelHTML(index, filename, detail) {
        // 所有檔案的峰值對照
        const barsHtml = this.data.fileAnalysis.map((f, i) => {
            if (f.peak === null) return '';

            // 計算相對位置（-60 到 0 dB 的範圍）
            const normalizedPeak = Math.max(0, (f.peak + 60) / 60);
            const width = normalizedPeak * 100;

            const colorClass = this.getPeakClass(f.peak);
            const isActive = i === index ? 'active' : '';

            return `
                <div class="volume-sync-bar-item ${isActive}" data-index="${i}">
                    <span class="bar-filename" title="${f.filename}">${f.filename}</span>
                    <div class="bar-container">
                        <div class="bar-fill ${colorClass}" style="width: ${width}%"></div>
                        <span class="bar-value">${f.peak.toFixed(1)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // 目標峰值線
        const targetNormalized = Math.max(0, (this.data.targetPeak + 60) / 60) * 100;

        // 判斷標籤對齊方式
        let alignClass = 'target-label';
        if (targetNormalized > 85) alignClass += ' right-aligned';
        else if (targetNormalized < 15) alignClass += ' left-aligned';

        return `
            <div class="volume-sync-detail-header">
                <span class="volume-sync-detail-title">⇋ 音量分析</span>
                <button class="volume-sync-detail-close" title="關閉">×</button>
            </div>
            
            <div class="volume-sync-detail-content">
                <div class="volume-sync-file-detail">
                    <h4>📄 ${filename}</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">真實峰值 (dBTP)</span>
                            <span class="detail-value">${detail.peak?.toFixed(1) || '--'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">參考響度 (LUFS)</span>
                            <span class="detail-value">${detail.lufs?.toFixed(1) || '--'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">響度範圍 (LRA)</span>
                            <span class="detail-value">${detail.lra?.toFixed(1) || '--'} dB</span>
                        </div>
                    </div>
                </div>
                
                <div class="volume-sync-comparison">
                    <h4>⇋ 峰值對照</h4>
                    <div class="volume-sync-bars">
                        ${barsHtml}
                        <div class="target-line" style="left: ${targetNormalized}%">
                            <span class="${alignClass}">目標: ${this.data.targetPeak.toFixed(1)} dBTP</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 綁定細部分析面板事件
     */
    bindDetailPanelEvents(index) {
        const panel = this.element.querySelector(`#volume-sync-detail-${this.id}`);
        if (!panel) return;

        // 關閉按鈕
        const closeBtn = panel.querySelector('.volume-sync-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideDetailPanel();
            });
        }

        // 點擊其他檔案項目切換
        panel.querySelectorAll('.volume-sync-bar-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemIndex = parseInt(item.dataset.index);
                if (itemIndex !== this.currentDetailIndex) {
                    this.showFileDetailPanel(itemIndex);
                }
            });
        });
    }

    /**
     * 隱藏細部分析面板
     */
    hideDetailPanel() {
        const panel = this.element.querySelector(`#volume-sync-detail-${this.id}`);
        if (panel) {
            panel.style.display = 'none';
            panel.innerHTML = '';
        }
        this.currentDetailIndex = null;
    }

    /**
     * 處理輸入並產生輸出
     * 注意：updateInputAudio 已由 graphEngine.executeNode 呼叫，不需在此重複呼叫
     */
    async process(inputs) {
        // 如果已處理，返回處理後的結果
        if (this.data.processed && this.processedBuffers.length > 0) {
            return {
                audio: this.processedBuffers[0] || null,
                audioFiles: this.processedBuffers,
                filenames: this.inputFilenames
            };
        }

        // 尚未處理時，返回原始輸入音訊（讓 updatePreview 可以正確顯示預覽）
        if (this.inputAudioBuffers.length > 0) {
            return {
                audio: this.inputAudioBuffers[0] || null,
                audioFiles: this.inputAudioBuffers,
                filenames: this.inputFilenames
            };
        }

        // 沒有輸入時返回空
        return { audio: null };
    }
}

window.VolumeSyncNode = VolumeSyncNode;


