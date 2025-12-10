/**
 * 節拍整合節點（Tempo Integration Node）
 * 將多個音訊的節拍統一調整到一致的 BPM
 * 使用時間伸縮技術，改變速度但保持音高不變
 */

class BeatSyncNode extends BaseNode {
    // BPM 模式選項
    static BPM_MODES = {
        'average': { label: '平均值', icon: '📊' },
        'common': { label: '最常見', icon: '📈' },
        'min': { label: '最小值', icon: '⬇' },
        'max': { label: '最大值', icon: '⬆' },
        'custom': { label: '自訂', icon: '✎' }
    };

    // 音質模式
    static QUALITY_MODES = {
        'fast': { label: '快速', description: '處理速度快，音質普通' },
        'standard': { label: '標準', description: '平衡速度與音質（預設）' },
        'high': { label: '高品質', description: '處理較慢，音質最佳' }
    };

    // 常用 BPM 快速選項
    static COMMON_BPMS = [60, 90, 120, 140, 160, 180];

    constructor(id, options = {}) {
        const defaultData = {
            targetBPM: 120,             // 目標 BPM
            bpmMode: 'average',          // BPM 模式
            keepRelative: false,         // 保持相對節拍
            qualityMode: 'high',         // 音質模式（預設高品質）
            processed: false,            // 是否已處理
            fileAnalysis: [],            // 檔案分析結果 [{ filename, bpm, confidence, duration }]
            isAnalyzing: false,
            isProcessing: false,
            analysisProgress: 0,
            processProgress: 0
        };
        super(id, 'beat-sync', '節拍整合', '♩', options, defaultData);

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
        const isAnalyzing = this.data.isAnalyzing;
        const isProcessing = this.data.isProcessing;

        // 生成 BPM 模式選項
        const modeOptions = Object.entries(BeatSyncNode.BPM_MODES).map(([key, mode]) => {
            const selected = this.data.bpmMode === key ? 'selected' : '';
            return `<option value="${key}" ${selected}>${mode.icon} ${mode.label}</option>`;
        }).join('');

        // 生成音質選項
        const qualityOptions = Object.entries(BeatSyncNode.QUALITY_MODES).map(([key, mode]) => {
            const selected = this.data.qualityMode === key ? 'selected' : '';
            return `<option value="${key}" ${selected}>${mode.label}</option>`;
        }).join('');

        // BPM 摘要標籤
        const summaryTag = this.renderSummaryTag();

        return `
            <!-- 區域一：標題與摘要 -->
            <div class="beat-sync-header">
                <div class="beat-sync-title">
                    <span class="beat-sync-icon">♩</span>
                    <span class="beat-sync-label">節拍整合</span>
                </div>
                ${summaryTag}
            </div>

            <!-- 區域二：目標 BPM 設定 -->
            <div class="beat-sync-settings">
                <div class="beat-sync-mode-row">
                    <label class="beat-sync-mode-label">目標 BPM:</label>
                    <select class="beat-sync-mode-select" ${!hasFiles || isAnalyzing ? 'disabled' : ''}>
                        ${modeOptions}
                    </select>
                </div>
                
                ${this.data.bpmMode === 'custom' ? this.renderCustomBPMSlider() : ''}
                
                <!-- 快速 BPM 按鈕 -->
                <div class="beat-sync-quick-bpm">
                    ${BeatSyncNode.COMMON_BPMS.map(bpm => `
                        <button class="beat-sync-quick-btn ${this.data.targetBPM === bpm ? 'active' : ''}" 
                                data-bpm="${bpm}" ${!hasFiles ? 'disabled' : ''}>${bpm}</button>
                    `).join('')}
                </div>

                <!-- 選項 -->
                <div class="beat-sync-options">
                    <label class="beat-sync-checkbox">
                        <input type="checkbox" class="beat-sync-keep-relative" 
                               ${this.data.keepRelative ? 'checked' : ''}>
                        <span>保持相對節拍</span>
                    </label>
                    <div class="beat-sync-quality">
                        <label>音質:</label>
                        <select class="beat-sync-quality-select">
                            ${qualityOptions}
                        </select>
                    </div>
                </div>
            </div>

            <!-- 區域三：執行按鈕 -->
            <div class="beat-sync-actions">
                <button class="beat-sync-execute-btn" ${!hasFiles || isAnalyzing || isProcessing ? 'disabled' : ''}>
                    ${isProcessing ? '⏳ 處理中...' : (isProcessed ? '✅ 重新執行' : '▶ 執行')}
                </button>
            </div>

            <!-- 區域四：檔案列表 -->
            <div class="beat-sync-files">
                ${this.renderFilesList()}
            </div>

            <!-- 分析進度條 -->
            <div class="beat-sync-progress" id="beat-sync-analysis-progress-${this.id}" 
                 style="display: ${isAnalyzing ? 'block' : 'none'};">
                <div class="beat-sync-progress-bar">
                    <div class="beat-sync-progress-fill" style="width: ${this.data.analysisProgress}%"></div>
                </div>
                <span class="beat-sync-progress-text">分析 BPM 中... ${Math.round(this.data.analysisProgress)}%</span>
            </div>

            <!-- 處理進度條 -->
            <div class="beat-sync-progress" id="beat-sync-process-progress-${this.id}" 
                 style="display: ${isProcessing ? 'block' : 'none'};">
                <div class="beat-sync-progress-bar">
                    <div class="beat-sync-progress-fill" style="width: ${this.data.processProgress}%"></div>
                </div>
                <span class="beat-sync-progress-text">處理中... ${Math.round(this.data.processProgress)}%</span>
            </div>

            <!-- 細部分析面板 -->
            <div class="beat-sync-detail-panel" id="beat-sync-detail-${this.id}" style="display: none;"></div>
        `;
    }

    /**
     * 渲染 BPM 摘要標籤
     */
    renderSummaryTag() {
        const fileAnalysis = this.data.fileAnalysis || [];
        if (fileAnalysis.length === 0) {
            return '<div class="beat-sync-summary-tag empty">等待輸入...</div>';
        }

        const bpmValues = fileAnalysis.filter(f => f.bpm !== null && f.bpm > 0).map(f => f.bpm);
        if (bpmValues.length === 0) {
            return '<div class="beat-sync-summary-tag analyzing">分析中...</div>';
        }

        const maxBPM = Math.max(...bpmValues);
        const minBPM = Math.min(...bpmValues);
        const delta = maxBPM - minBPM;

        return `
            <div class="beat-sync-summary-tag">
                <span class="summary-bpm-range">BPM: ${Math.round(minBPM)}-${Math.round(maxBPM)}</span>
                <span class="summary-delta">Δ ${Math.round(delta)} BPM</span>
            </div>
        `;
    }

    /**
     * 渲染自訂 BPM 滑桿
     */
    renderCustomBPMSlider() {
        return `
            <div class="beat-sync-custom-slider">
                <input type="range" class="beat-sync-bpm-slider" 
                       min="40" max="240" step="1" value="${this.data.targetBPM}">
                <input type="number" class="beat-sync-bpm-input" 
                       min="40" max="240" value="${this.data.targetBPM}">
                <span class="beat-sync-bpm-unit">BPM</span>
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
                <div class="beat-sync-empty">
                    <span class="beat-sync-empty-icon">📭</span>
                    <span class="beat-sync-empty-text">請連接音訊來源</span>
                </div>
            `;
        }

        const listHtml = fileAnalysis.map((item, index) => {
            // BPM 顯示（可點擊編輯）
            let bpmDisplay;
            if (item.bpm !== null && item.bpm > 0) {
                const manualTag = item.manuallyAdjusted ? '<span class="beat-sync-manual-tag">已修正</span>' : '';

                if (item.estimated) {
                    // 估算值：顯示時長計算方式，無信心度
                    const durationText = item.duration ? item.duration.toFixed(2) : '?';
                    bpmDisplay = `
                        <span class="beat-sync-bpm estimated editable" 
                              data-index="${index}" 
                              title="以音訊長度（${durationText}秒）作為一拍計算&#10;點擊以手動修正 BPM">
                            ${Math.round(item.bpm)} BPM
                        </span>
                        <span class="beat-sync-duration-calc" title="音訊長度 ${durationText} 秒 = 一拍">⏱${durationText}s</span>
                        ${manualTag}
                        <span class="beat-sync-warning estimated-warning" title="音訊過短，無法偵測節拍&#10;BPM 以音訊長度作為一拍計算&#10;建議手動確認或修正">⚠</span>
                    `;
                } else {
                    // 正常偵測值：顯示信心度
                    const confidenceClass = this.getConfidenceClass(item.confidence);
                    const confidencePercent = Math.round((item.confidence || 0) * 100);
                    bpmDisplay = `
                        <span class="beat-sync-bpm ${confidenceClass} editable" 
                              data-index="${index}" 
                              title="信心度: ${confidencePercent}%&#10;點擊以手動修正 BPM">
                            ${Math.round(item.bpm)} BPM
                        </span>
                        ${manualTag}
                    `;

                    // 低信心度警告
                    if (item.confidence < 0.6) {
                        bpmDisplay += `<span class="beat-sync-warning" title="低信心度，建議手動確認">⚠</span>`;
                    }
                }
            } else if (item.analyzing) {
                bpmDisplay = `<span class="beat-sync-analyzing">⏳</span>`;
            } else if (item.error) {
                // 無法偵測時也提供手動輸入
                bpmDisplay = `
                    <span class="beat-sync-error editable" data-index="${index}" title="${item.error}&#10;點擊以手動輸入 BPM">⚠️ 無法偵測</span>
                    <span class="beat-sync-manual-input-hint">點擊輸入</span>
                `;
            } else {
                bpmDisplay = `<span class="beat-sync-pending">--</span>`;
            }

            // 調整量顯示
            let adjustDisplay = '';
            if (this.data.processed && item.speedRatio !== undefined) {
                const percentChange = ((item.speedRatio - 1) * 100).toFixed(1);
                const adjustClass = item.speedRatio > 1 ? 'faster' : item.speedRatio < 1 ? 'slower' : 'same';
                const sign = item.speedRatio > 1 ? '+' : '';
                adjustDisplay = `<span class="beat-sync-adjustment ${adjustClass}">${sign}${percentChange}%</span>`;
            }

            // 時長變化顯示
            let durationDisplay = '';
            if (item.duration) {
                const originalDuration = item.duration.toFixed(2);
                if (this.data.processed && item.newDuration) {
                    durationDisplay = `<span class="beat-sync-duration">${originalDuration}s → ${item.newDuration.toFixed(2)}s</span>`;
                } else {
                    durationDisplay = `<span class="beat-sync-duration">${originalDuration}s</span>`;
                }
            }

            // 分析按鈕
            const hasDetail = item.detailAnalysis !== undefined;
            const analyzeIcon = hasDetail ? '⇋' : '🔍';
            const analyzeTitle = hasDetail ? '查看分析結果' : '點擊進行細部分析';

            // 判斷是否顯示修正按鈕區域（有 BPM 或偵測失敗都可以手動輸入）
            const showAdjustArea = item.bpm > 0 || item.error;
            // 判斷是否已手動修改（可以重設）
            const canReset = item.manuallyAdjusted && item.originalBPM !== null && item.originalBPM !== undefined;

            return `
                <div class="beat-sync-file-item" data-index="${index}">
                    <div class="beat-sync-file-info">
                        <span class="beat-sync-file-icon">📄</span>
                        <span class="beat-sync-file-name" title="${item.filename}">${item.filename}</span>
                    </div>
                    <div class="beat-sync-file-analysis">
                        ${bpmDisplay}
                        ${adjustDisplay}
                        ${durationDisplay}
                        <button class="beat-sync-analyze-btn" data-index="${index}" title="${analyzeTitle}">${analyzeIcon}</button>
                    </div>
                    <!-- BPM 修正區域 -->
                    ${showAdjustArea ? `
                    <div class="beat-sync-bpm-adjust">
                        <label class="beat-sync-bpm-label" title="手動修正此音訊的 BPM 值&#10;若自動偵測不準確，可在此輸入正確的 BPM">修正 BPM:</label>
                        <input type="number" class="beat-sync-bpm-edit" data-index="${index}" 
                               min="40" max="240" step="1" 
                               value="${item.bpm > 0 ? Math.round(item.bpm) : ''}"
                               placeholder="輸入 BPM"
                               title="手動輸入此音訊的 BPM 值（範圍 40-240）&#10;按 Enter 確認修改">
                        <button class="beat-sync-half-btn" data-index="${index}" title="將目前 BPM 除以 2&#10;適用於偵測值偏高時修正" ${!item.bpm ? 'disabled' : ''}>÷2</button>
                        <button class="beat-sync-double-btn" data-index="${index}" title="將目前 BPM 乘以 2&#10;適用於偵測值偏低時修正" ${!item.bpm ? 'disabled' : ''}>×2</button>
                        <button class="beat-sync-reset-btn" data-index="${index}" 
                                title="重設為原始偵測值：${item.originalBPM ? Math.round(item.originalBPM) + ' BPM' : '無'}" 
                                ${!canReset ? 'disabled' : ''}>↺</button>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        return `<div class="beat-sync-file-list">${listHtml}</div>`;
    }

    /**
     * 根據信心度取得 CSS 類別
     */
    getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'high-confidence';
        if (confidence >= 0.6) return 'medium-confidence';
        return 'low-confidence';
    }

    bindContentEvents() {
        // BPM 模式選擇
        const modeSelect = this.element.querySelector('.beat-sync-mode-select');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                this.data.bpmMode = e.target.value;
                this.updateTargetBPMFromMode();
                this.updateContent();
            });
        }

        // 自訂 BPM 滑桿
        const bpmSlider = this.element.querySelector('.beat-sync-bpm-slider');
        if (bpmSlider) {
            bpmSlider.addEventListener('input', (e) => {
                this.data.targetBPM = parseInt(e.target.value);
                const bpmInput = this.element.querySelector('.beat-sync-bpm-input');
                if (bpmInput) bpmInput.value = this.data.targetBPM;
                this.updateQuickBPMButtons();
            });
        }

        // 自訂 BPM 輸入框
        const bpmInput = this.element.querySelector('.beat-sync-bpm-input');
        if (bpmInput) {
            bpmInput.addEventListener('change', (e) => {
                let value = parseInt(e.target.value);
                value = Math.max(40, Math.min(240, value));
                this.data.targetBPM = value;
                e.target.value = value;
                const bpmSlider = this.element.querySelector('.beat-sync-bpm-slider');
                if (bpmSlider) bpmSlider.value = value;
                this.updateQuickBPMButtons();
            });
        }

        // 快速 BPM 按鈕
        this.element.querySelectorAll('.beat-sync-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const bpm = parseInt(btn.dataset.bpm);
                this.data.targetBPM = bpm;
                this.data.bpmMode = 'custom';
                this.updateContent();
            });
        });

        // 保持相對節拍選項
        const keepRelativeCheckbox = this.element.querySelector('.beat-sync-keep-relative');
        if (keepRelativeCheckbox) {
            keepRelativeCheckbox.addEventListener('change', (e) => {
                this.data.keepRelative = e.target.checked;
            });
        }

        // 音質選擇
        const qualitySelect = this.element.querySelector('.beat-sync-quality-select');
        if (qualitySelect) {
            qualitySelect.addEventListener('change', (e) => {
                this.data.qualityMode = e.target.value;
            });
        }

        // 執行按鈕
        const executeBtn = this.element.querySelector('.beat-sync-execute-btn');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => {
                this.executeTempoSync();
            });
        }

        // BPM 修正按鈕
        this.bindBPMAdjustButtons();

        // 分析按鈕
        this.bindAnalyzeButtons();
    }

    /**
     * 綁定 BPM 修正按鈕
     */
    bindBPMAdjustButtons() {
        // 手動輸入 BPM
        this.element.querySelectorAll('.beat-sync-bpm-edit').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                const index = parseInt(input.dataset.index);
                const newBPM = parseInt(input.value);
                this.setManualBPM(index, newBPM);
            });

            // 按 Enter 鍵確認
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                }
            });
        });

        // 點擊 BPM 標籤進入編輯模式
        this.element.querySelectorAll('.beat-sync-bpm.editable, .beat-sync-error.editable').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(span.dataset.index);
                const input = this.element.querySelector(`.beat-sync-bpm-edit[data-index="${index}"]`);
                if (input) {
                    input.focus();
                    input.select();
                }
            });
        });

        // ÷2 按鈕
        this.element.querySelectorAll('.beat-sync-half-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.adjustFileBPM(index, 0.5);
            });
        });

        // ×2 按鈕
        this.element.querySelectorAll('.beat-sync-double-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.adjustFileBPM(index, 2);
            });
        });

        // 重設按鈕
        this.element.querySelectorAll('.beat-sync-reset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.resetBPM(index);
            });
        });
    }

    /**
     * 手動設定檔案的 BPM
     */
    setManualBPM(index, newBPM) {
        const item = this.data.fileAnalysis[index];
        if (!item) return;

        // 驗證 BPM 範圍
        if (isNaN(newBPM) || newBPM < 40 || newBPM > 240) {
            showToast('BPM 必須在 40-240 之間', 'warning');
            this.updateFilesListUI();
            return;
        }

        item.bpm = newBPM;
        item.manuallyAdjusted = true;
        item.confidence = 1.0; // 手動輸入視為 100% 信心度
        item.error = null; // 清除錯誤狀態

        // 重新計算目標 BPM（如果是自動模式）
        if (this.data.bpmMode !== 'custom') {
            this.updateTargetBPMFromMode();
        }

        this.updateFilesListUI();
        showToast(`已手動設定 BPM 為 ${newBPM}`, 'success');
    }

    /**
     * 重設檔案的 BPM 為原始偵測值
     */
    resetBPM(index) {
        const item = this.data.fileAnalysis[index];
        if (!item) return;

        // 檢查是否有原始偵測值可以重設
        if (item.originalBPM === null || item.originalBPM === undefined) {
            showToast('無法重設：沒有原始偵測值', 'warning');
            return;
        }

        // 恢復原始值
        item.bpm = item.originalBPM;
        item.confidence = item.originalConfidence || 0.5;
        item.estimated = item.originalEstimated || false;
        item.manuallyAdjusted = false;
        item.error = null;

        // 重新計算目標 BPM（如果是自動模式）
        if (this.data.bpmMode !== 'custom') {
            this.updateTargetBPMFromMode();
        }

        this.updateFilesListUI();
        showToast(`已重設 BPM 為原始偵測值 ${Math.round(item.bpm)}`, 'success');
    }

    /**
     * 調整檔案的 BPM（倍數修正）
     */
    adjustFileBPM(index, multiplier) {
        const item = this.data.fileAnalysis[index];
        if (!item || !item.bpm) return;

        item.bpm = item.bpm * multiplier;
        item.manuallyAdjusted = true;

        // 重新計算目標 BPM（如果是自動模式）
        if (this.data.bpmMode !== 'custom') {
            this.updateTargetBPMFromMode();
        }

        this.updateFilesListUI();
        showToast(`已${multiplier > 1 ? '倍數' : '半速'}修正 BPM 至 ${Math.round(item.bpm)}`, 'success');
    }

    /**
     * 綁定分析按鈕事件
     */
    bindAnalyzeButtons() {
        this.element.querySelectorAll('.beat-sync-analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.showFileDetailPanel(index);
            });
        });
    }

    /**
     * 更新快速 BPM 按鈕狀態
     */
    updateQuickBPMButtons() {
        this.element.querySelectorAll('.beat-sync-quick-btn').forEach(btn => {
            const bpm = parseInt(btn.dataset.bpm);
            btn.classList.toggle('active', this.data.targetBPM === bpm);
        });
    }

    /**
     * 根據模式更新目標 BPM
     */
    updateTargetBPMFromMode() {
        const bpmValues = this.data.fileAnalysis
            .filter(f => f.bpm !== null && f.bpm > 0)
            .map(f => f.bpm);

        if (bpmValues.length === 0) return;

        switch (this.data.bpmMode) {
            case 'average':
                this.data.targetBPM = Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length);
                break;
            case 'common':
                // 找最常見的 BPM（四捨五入到整數）
                const bpmCounts = {};
                bpmValues.forEach(bpm => {
                    const rounded = Math.round(bpm);
                    bpmCounts[rounded] = (bpmCounts[rounded] || 0) + 1;
                });
                let maxCount = 0;
                let commonBPM = bpmValues[0];
                for (const [bpm, count] of Object.entries(bpmCounts)) {
                    if (count > maxCount) {
                        maxCount = count;
                        commonBPM = parseInt(bpm);
                    }
                }
                this.data.targetBPM = commonBPM;
                break;
            case 'min':
                this.data.targetBPM = Math.round(Math.min(...bpmValues));
                break;
            case 'max':
                this.data.targetBPM = Math.round(Math.max(...bpmValues));
                break;
            // 'custom' 模式保持用戶設定的值
        }
    }

    /**
     * 更新輸入音訊（支援多檔案）
     */
    async updateInputAudio(audioBuffer, audioFiles = null, filenames = null) {
        // 處理多檔案輸入
        if (audioFiles && audioFiles.length > 0) {
            this.inputAudioBuffers = audioFiles;
            this.inputFilenames = filenames || audioFiles.map((_, i) => `檔案 ${i + 1}`);
        } else if (audioBuffer) {
            this.inputAudioBuffers = [audioBuffer];
            this.inputFilenames = ['檔案 1'];
        } else {
            this.inputAudioBuffers = [];
            this.inputFilenames = [];
            this.data.fileAnalysis = [];
            this.data.processed = false;
            this.processedBuffers = [];
            this.updateContent();
            return;
        }

        // 重置處理狀態
        this.data.processed = false;
        this.processedBuffers = [];

        // 開始分析 BPM
        await this.analyzeAllBPM();
    }

    /**
     * 分析所有檔案的 BPM
     */
    async analyzeAllBPM() {
        if (this.isAnalyzing) return;
        if (this.inputAudioBuffers.length === 0) return;

        this.isAnalyzing = true;
        this.data.isAnalyzing = true;
        this.data.analysisProgress = 0;
        this.data.fileAnalysis = [];
        this.updateContent();

        try {
            const totalFiles = this.inputAudioBuffers.length;

            for (let i = 0; i < totalFiles; i++) {
                const buffer = this.inputAudioBuffers[i];
                const filename = this.inputFilenames[i] || `檔案 ${i + 1}`;

                // 標記該檔案正在分析
                this.data.fileAnalysis.push({
                    filename: filename,
                    bpm: null,
                    confidence: 0,
                    duration: buffer.duration,
                    analyzing: true
                });
                this.updateFilesListUI();

                // 分析 BPM
                const bpmResult = await this.detectBPM(buffer);

                // 更新分析結果
                this.data.fileAnalysis[i] = {
                    filename: filename,
                    bpm: bpmResult.bpm,
                    originalBPM: bpmResult.bpm,  // 保存原始偵測值供重設使用
                    originalConfidence: bpmResult.confidence,
                    confidence: bpmResult.confidence,
                    duration: buffer.duration,
                    analyzing: false,
                    error: bpmResult.error,
                    estimated: bpmResult.estimated || false,
                    originalEstimated: bpmResult.estimated || false,
                    note: bpmResult.note || null
                };

                // 更新進度
                this.data.analysisProgress = ((i + 1) / totalFiles) * 100;
                this.updateProgressUI('analysis');
                this.updateFilesListUI();
            }

            // 根據模式更新目標 BPM
            this.updateTargetBPMFromMode();

        } catch (error) {
            console.error('BPM 分析失敗:', error);
            showToast('BPM 分析失敗', 'error');
        }

        this.isAnalyzing = false;
        this.data.isAnalyzing = false;
        this.data.analysisProgress = 100;
        this.updateContent();
    }

    /**
     * BPM 偵測算法（能量峰值法）
     */
    async detectBPM(audioBuffer) {
        try {
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);
            const duration = audioBuffer.duration;

            // 音訊太短：使用音訊長度作為一拍的時長來計算 BPM
            if (duration < 2) {
                // BPM = 60 / 一拍的秒數
                const estimatedBPM = 60 / duration;

                // 將 BPM 調整到合理範圍（60-200）
                let adjustedBPM = estimatedBPM;
                while (adjustedBPM > 200) adjustedBPM /= 2;
                while (adjustedBPM < 60) adjustedBPM *= 2;

                return {
                    bpm: adjustedBPM,
                    confidence: 0.5,  // 中等信心度，因為是估算
                    estimated: true,  // 標記為估算值
                    estimateMethod: 'duration',
                    originalBPM: estimatedBPM,
                    note: `以音訊長度（${duration.toFixed(2)}秒）作為一拍估算`
                };
            }

            // 設定分析參數
            const windowSize = Math.floor(sampleRate * 0.01); // 10ms 窗口
            const hopSize = Math.floor(windowSize / 2);

            // 計算能量包絡
            const energyEnvelope = [];
            for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
                let energy = 0;
                for (let j = 0; j < windowSize; j++) {
                    energy += channelData[i + j] * channelData[i + j];
                }
                energyEnvelope.push(Math.sqrt(energy / windowSize));
            }

            // 計算能量變化（onset detection）
            const onsetFunction = [];
            for (let i = 1; i < energyEnvelope.length; i++) {
                const diff = energyEnvelope[i] - energyEnvelope[i - 1];
                onsetFunction.push(Math.max(0, diff)); // 只保留正向變化
            }

            // 自相關函數計算 BPM
            const minBPM = 60;
            const maxBPM = 200;
            const minLag = Math.floor((60 / maxBPM) * (sampleRate / hopSize));
            const maxLag = Math.floor((60 / minBPM) * (sampleRate / hopSize));

            const autocorr = new Float32Array(maxLag - minLag + 1);
            let maxCorr = 0;
            let maxCorrLag = minLag;

            for (let lag = minLag; lag <= maxLag; lag++) {
                let sum = 0;
                let count = 0;
                for (let i = 0; i < onsetFunction.length - lag; i++) {
                    sum += onsetFunction[i] * onsetFunction[i + lag];
                    count++;
                }
                const corr = sum / count;
                autocorr[lag - minLag] = corr;

                if (corr > maxCorr) {
                    maxCorr = corr;
                    maxCorrLag = lag;
                }

                // 每 100 次讓出控制權
                if (lag % 100 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // 計算 BPM
            const samplesPerBeat = maxCorrLag * hopSize;
            const bpm = (60 * sampleRate) / samplesPerBeat;

            // 計算信心度（基於自相關峰值的顯著性）
            const avgCorr = autocorr.reduce((a, b) => a + b, 0) / autocorr.length;
            const confidence = avgCorr > 0 ? Math.min(1, (maxCorr - avgCorr) / avgCorr) : 0;

            // BPM 範圍檢查和倍數調整
            let adjustedBPM = bpm;
            if (bpm > 180) {
                adjustedBPM = bpm / 2;
            } else if (bpm < 70) {
                adjustedBPM = bpm * 2;
            }

            return {
                bpm: adjustedBPM,
                confidence: Math.max(0.3, Math.min(1, confidence)),
                originalBPM: bpm
            };

        } catch (error) {
            console.error('BPM 偵測錯誤:', error);
            return { bpm: null, confidence: 0, error: error.message };
        }
    }

    /**
     * 執行節拍整合
     */
    async executeTempoSync() {
        if (this.isProcessing) return;
        if (this.inputAudioBuffers.length === 0) {
            showToast('請先連接音訊來源', 'warning');
            return;
        }

        // 檢查是否有需要大幅調整的檔案
        const extremeChanges = this.data.fileAnalysis.filter(item => {
            if (!item.bpm || item.bpm === 0) return false;
            const ratio = this.data.targetBPM / item.bpm;
            return ratio > 2 || ratio < 0.5;
        });

        if (extremeChanges.length > 0) {
            const confirmed = confirm(`有 ${extremeChanges.length} 個檔案的速度變化超過 2 倍，音質可能下降。是否繼續處理？`);
            if (!confirmed) return;
        }

        this.isProcessing = true;
        this.data.isProcessing = true;
        this.data.processProgress = 0;
        this.processedBuffers = [];
        this.updateContent();

        try {
            const totalFiles = this.inputAudioBuffers.length;

            // 計算基準比例（保持相對節拍模式）
            let baseRatio = 1;
            if (this.data.keepRelative && this.data.fileAnalysis.length > 0) {
                const firstBPM = this.data.fileAnalysis.find(f => f.bpm > 0)?.bpm;
                if (firstBPM) {
                    baseRatio = this.data.targetBPM / firstBPM;
                }
            }

            for (let i = 0; i < totalFiles; i++) {
                const buffer = this.inputAudioBuffers[i];
                const fileAnalysis = this.data.fileAnalysis[i];

                let speedRatio;
                if (!fileAnalysis.bpm || fileAnalysis.bpm === 0) {
                    // 無法偵測 BPM 的檔案保持原速
                    speedRatio = 1;
                } else if (this.data.keepRelative) {
                    // 保持相對節拍：所有檔案同比例調整
                    speedRatio = baseRatio;
                } else {
                    // 絕對 BPM 模式：每個檔案獨立調整至目標 BPM
                    speedRatio = this.data.targetBPM / fileAnalysis.bpm;
                }

                // 時間伸縮處理
                const processed = await this.timeStretch(buffer, speedRatio);
                this.processedBuffers.push(processed);

                // 更新檔案分析結果
                fileAnalysis.speedRatio = speedRatio;
                fileAnalysis.newDuration = buffer.duration / speedRatio;
                fileAnalysis.newBPM = this.data.keepRelative
                    ? (fileAnalysis.bpm * speedRatio)
                    : this.data.targetBPM;

                // 更新進度
                this.data.processProgress = ((i + 1) / totalFiles) * 100;
                this.updateProgressUI('process');
            }

            this.data.processed = true;

            // 更新多檔案預覽
            this.files.items = this.processedBuffers.map((buffer, i) => ({
                buffer: buffer,
                filename: this.inputFilenames[i]
            }));

            // 觸發預覽更新
            this.schedulePreviewUpdate();

            showToast('節拍整合完成！', 'success');

        } catch (error) {
            console.error('節拍整合失敗:', error);
            showToast('處理失敗: ' + error.message, 'error');
        }

        this.isProcessing = false;
        this.data.isProcessing = false;
        this.updateContent();
    }

    /**
     * 時間伸縮處理（改變速度但保持音高）
     * 使用 WSOLA (Waveform Similarity Overlap-Add) 算法
     */
    async timeStretch(audioBuffer, speedRatio) {
        if (speedRatio === 1) return audioBuffer;

        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const inputLength = audioBuffer.length;
        const outputLength = Math.round(inputLength / speedRatio);

        if (outputLength <= 0) return audioBuffer;

        const newBuffer = window.audioProcessor.audioContext.createBuffer(
            numChannels,
            outputLength,
            sampleRate
        );

        // 根據音質模式調整窗口大小
        let windowSize;
        switch (this.data.qualityMode) {
            case 'fast':
                windowSize = 1024;
                break;
            case 'high':
                windowSize = 4096;
                break;
            default: // standard
                windowSize = 2048;
        }

        const hopIn = Math.round(windowSize / 4);
        const hopOut = Math.round(hopIn / speedRatio);

        // Hanning 窗
        const hannWindow = new Float32Array(windowSize);
        for (let i = 0; i < windowSize; i++) {
            hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / windowSize));
        }

        for (let channel = 0; channel < numChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = newBuffer.getChannelData(channel);
            outputData.fill(0);

            let inputPos = 0;
            let outputPos = 0;

            while (inputPos < inputLength - windowSize && outputPos < outputLength - windowSize) {
                // 應用窗口並疊加
                for (let i = 0; i < windowSize; i++) {
                    if (inputPos + i < inputLength && outputPos + i < outputLength) {
                        outputData[outputPos + i] += inputData[inputPos + i] * hannWindow[i];
                    }
                }

                inputPos += hopIn;
                outputPos += hopOut;
            }

            // 正規化
            const normFactor = hopOut / hopIn;
            for (let i = 0; i < outputLength; i++) {
                outputData[i] *= normFactor * 0.7;
            }

            // 每個聲道讓出控制權
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return newBuffer;
    }

    /**
     * 顯示檔案細部分析面板
     */
    showFileDetailPanel(index) {
        const panel = this.element.querySelector(`#beat-sync-detail-${this.id}`);
        if (!panel) return;

        const fileAnalysis = this.data.fileAnalysis[index];
        if (!fileAnalysis) return;

        const filename = fileAnalysis.filename;
        const bpm = fileAnalysis.bpm ? Math.round(fileAnalysis.bpm) : '--';
        const confidence = fileAnalysis.confidence ? Math.round(fileAnalysis.confidence * 100) : 0;
        const duration = fileAnalysis.duration ? fileAnalysis.duration.toFixed(2) : '--';

        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="beat-sync-detail-header">
                <span class="beat-sync-detail-title">📄 ${filename}</span>
                <button class="beat-sync-detail-close" title="關閉">×</button>
            </div>
            <div class="beat-sync-detail-content">
                <div class="beat-sync-detail-grid">
                    <div class="beat-sync-detail-item main">
                        <span class="detail-label">偵測 BPM</span>
                        <span class="detail-value large">${bpm} <small>BPM</small></span>
                    </div>
                    <div class="beat-sync-detail-item">
                        <span class="detail-label">信心度</span>
                        <span class="detail-value">${confidence}%</span>
                        <div class="confidence-bar">
                            <div class="confidence-fill" style="width: ${confidence}%"></div>
                        </div>
                    </div>
                    <div class="beat-sync-detail-item">
                        <span class="detail-label">音訊時長</span>
                        <span class="detail-value">${duration}s</span>
                    </div>
                    ${this.data.processed && fileAnalysis.newBPM ? `
                    <div class="beat-sync-detail-item">
                        <span class="detail-label">處理後 BPM</span>
                        <span class="detail-value">${Math.round(fileAnalysis.newBPM)} BPM</span>
                    </div>
                    <div class="beat-sync-detail-item">
                        <span class="detail-label">速度變化</span>
                        <span class="detail-value">${((fileAnalysis.speedRatio - 1) * 100).toFixed(1)}%</span>
                    </div>
                    <div class="beat-sync-detail-item">
                        <span class="detail-label">處理後時長</span>
                        <span class="detail-value">${fileAnalysis.newDuration?.toFixed(2)}s</span>
                    </div>
                    ` : ''}
                </div>
                ${this.renderBPMComparisonChart()}
            </div>
        `;

        // 綁定關閉按鈕
        const closeBtn = panel.querySelector('.beat-sync-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
            });
        }

        this.currentDetailIndex = index;
    }

    /**
     * 渲染 BPM 對照長條圖
     */
    renderBPMComparisonChart() {
        const fileAnalysis = this.data.fileAnalysis || [];
        const validFiles = fileAnalysis.filter(f => f.bpm && f.bpm > 0);

        if (validFiles.length === 0) return '';

        const maxBPM = Math.max(...validFiles.map(f => f.bpm));
        const minBPM = Math.min(...validFiles.map(f => f.bpm));
        const avgBPM = validFiles.reduce((sum, f) => sum + f.bpm, 0) / validFiles.length;
        const targetBPM = this.data.targetBPM;

        const barsHtml = validFiles.map((item, index) => {
            const width = (item.bpm / maxBPM) * 100;
            const isFast = item.bpm > avgBPM + 10;
            const isSlow = item.bpm < avgBPM - 10;
            const colorClass = isFast ? 'fast' : (isSlow ? 'slow' : 'normal');

            return `
                <div class="bpm-bar-item">
                    <span class="bpm-bar-label" title="${item.filename}">${item.filename.substring(0, 10)}...</span>
                    <div class="bpm-bar">
                        <div class="bpm-bar-fill ${colorClass}" style="width: ${width}%"></div>
                        <span class="bpm-bar-value">${Math.round(item.bpm)}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="bpm-comparison-chart">
                <div class="bpm-chart-title">BPM 對照</div>
                <div class="bpm-chart-bars">${barsHtml}</div>
                <div class="bpm-chart-summary">
                    <span>最小: ${Math.round(minBPM)}</span>
                    <span>平均: ${Math.round(avgBPM)}</span>
                    <span>最大: ${Math.round(maxBPM)}</span>
                    <span>目標: ${targetBPM}</span>
                </div>
            </div>
        `;
    }

    /**
     * 更新進度 UI
     */
    updateProgressUI(type) {
        const progressId = type === 'analysis'
            ? `beat-sync-analysis-progress-${this.id}`
            : `beat-sync-process-progress-${this.id}`;
        const progress = type === 'analysis'
            ? this.data.analysisProgress
            : this.data.processProgress;

        const progressContainer = this.element.querySelector(`#${progressId}`);
        if (progressContainer) {
            const fill = progressContainer.querySelector('.beat-sync-progress-fill');
            const text = progressContainer.querySelector('.beat-sync-progress-text');
            if (fill) fill.style.width = `${progress}%`;
            if (text) {
                text.textContent = type === 'analysis'
                    ? `分析 BPM 中... ${Math.round(progress)}%`
                    : `處理中... ${Math.round(progress)}%`;
            }
        }
    }

    /**
     * 更新檔案列表 UI
     */
    updateFilesListUI() {
        const filesContainer = this.element.querySelector('.beat-sync-files');
        if (filesContainer) {
            filesContainer.innerHTML = this.renderFilesList();
            this.bindBPMAdjustButtons();
            this.bindAnalyzeButtons();
        }

        // 更新摘要標籤
        const summaryContainer = this.element.querySelector('.beat-sync-header');
        if (summaryContainer) {
            const oldSummary = summaryContainer.querySelector('.beat-sync-summary-tag');
            if (oldSummary) {
                oldSummary.outerHTML = this.renderSummaryTag();
            }
        }
    }

    /**
     * 處理流程
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

        // 尚未處理時，返回原始輸入音訊（讓預覽可以正常顯示）
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

    /**
     * 取得多檔案下載用的檔名前綴
     */
    getMultiFileDownloadPrefix() {
        return `tempo-sync_${this.data.targetBPM}bpm`;
    }
}

// 註冊到全域
window.BeatSyncNode = BeatSyncNode;
