/**
 * 智慧調音節點（含音高偵測、轉調、分析功能）
 */
class SmartPitchNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    constructor(id, options = {}) {
        const defaultData = {
            pitch: options.pitch || 0,  // 半音數，範圍 -12 到 +12（單檔案模式用）
            detectedKey: null,          // 偵測到的音高 { noteName, midiNote, confidence }（第一個檔案或單檔案）
            targetKey: null,            // 目標調性（音名，不含八度，如 'C', 'D#'）
            fileAnalysis: []            // 多檔案分析結果 [{ filename, detectedKey, semitones }]
        };
        super(id, 'smart-pitch', '智慧調音', '♬', options, defaultData);

        this.inputAudioBuffer = null;
        this.inputAudioBuffers = [];    // 多檔案音訊緩衝區
        this.inputFilenames = [];       // 多檔案名稱
        this.isAnalyzing = false;
        this.analysisResult = null;
        this.progressBar = null;
        this.spectrogramRenderer = null;
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const targetKey = this.data.targetKey;
        const fileAnalysis = this.data.fileAnalysis || [];
        const hasFiles = fileAnalysis.length > 0;

        // 生成目標調性選項
        const keyOptions = SmartPitchNode.NOTE_NAMES.map(note => {
            const selected = targetKey === note ? 'selected' : '';
            return `<option value="${note}" ${selected}>${note}</option>`;
        }).join('');

        // 計算是否可以套用
        const canApply = targetKey && hasFiles;

        return `
            <!-- 區域一：標題與目標調性 -->
            <div class="smart-pitch-header">
                <div class="smart-pitch-title">
                    <span class="smart-pitch-icon">♬</span>
                    <span class="smart-pitch-label">智慧調音</span>
                </div>
                <div class="smart-pitch-target">
                    <label class="smart-pitch-target-label">目標音:</label>
                    <select class="smart-pitch-target-select" ${!hasFiles ? 'disabled' : ''}>
                        <option value="">-- 選擇 --</option>
                        ${keyOptions}
                    </select>
                    <button class="smart-pitch-apply-btn" ${!canApply ? 'disabled' : ''}>套用</button>
                </div>
            </div>

            <!-- 區域二：檔案列表與分析 -->
            <div class="smart-pitch-files">
                ${this.renderFilesList()}
            </div>

            <!-- 進度條 -->
            <div class="smart-pitch-progress" id="smart-pitch-progress-${this.id}" style="display: none;"></div>

            <!-- 細部分析面板（點擊檔案後顯示） -->
            <div class="smart-pitch-detail-panel" id="smart-pitch-detail-${this.id}" style="display: none;"></div>
        `;
    }

    /**
     * 渲染檔案列表
     */
    renderFilesList() {
        const fileAnalysis = this.data.fileAnalysis || [];

        if (fileAnalysis.length === 0) {
            return `
                <div class="smart-pitch-empty">
                    <span class="smart-pitch-empty-icon">○</span>
                    <span class="smart-pitch-empty-text">等待音效輸入...</span>
                </div>
            `;
        }

        const listHtml = fileAnalysis.map((item, index) => {
            // 偵測音高顯示
            let pitchDisplay;
            if (item.detectedKey) {
                pitchDisplay = `<span class="smart-pitch-detected">${item.detectedKey.noteName}</span>`;
            } else {
                pitchDisplay = `<span class="smart-pitch-unknown" title="可能原因：音效過短、噪音、打擊樂或環境音等">⚠️ 無法偵測</span>`;
            }

            // 轉調資訊
            let transposeDisplay = '';
            if (this.data.targetKey && item.semitones !== null && item.semitones !== undefined) {
                const semitoneClass = item.semitones > 0 ? 'up' : item.semitones < 0 ? 'down' : 'same';
                const semitoneText = item.semitones === 0 ? '±0' : (item.semitones > 0 ? `+${item.semitones}` : `${item.semitones}`);
                transposeDisplay = `<span class="smart-pitch-semitones ${semitoneClass}">${semitoneText}</span>`;
            } else if (this.data.targetKey && !item.detectedKey) {
                transposeDisplay = `<span class="smart-pitch-skip">不移調</span>`;
            }

            // 分析狀態
            const isAnalyzed = item.detailAnalysis !== undefined;
            const analyzeIcon = isAnalyzed ? '≡' : '◎';
            const analyzeTitle = isAnalyzed ? '查看分析結果' : '點擊進行細部分析';

            return `
                <div class="smart-pitch-file-item" data-index="${index}">
                    <div class="smart-pitch-file-info">
                        <span class="smart-pitch-file-icon">▭</span>
                        <span class="smart-pitch-file-name" title="${item.filename}">${item.filename}</span>
                    </div>
                    <div class="smart-pitch-file-analysis">
                        ${pitchDisplay}
                        ${transposeDisplay}
                        <button class="smart-pitch-analyze-btn" data-index="${index}" title="${analyzeTitle}">${analyzeIcon}</button>
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="smart-pitch-file-list">${listHtml}</div>`;
    }

    /**
     * 計算從偵測音高到目標調性需要的半音數
     * @returns {string} 半音數顯示字串
     */
    calculateTransposeSemitones() {
        if (!this.data.detectedKey || !this.data.targetKey) {
            return '--';
        }

        const detectedNoteName = this.data.detectedKey.noteName;
        // 從音名中提取不含八度的部分（如 'A4' -> 'A', 'C#3' -> 'C#'）
        const detectedNote = detectedNoteName.replace(/\d+$/, '');
        const targetNote = this.data.targetKey;

        const detectedIndex = SmartPitchNode.NOTE_NAMES.indexOf(detectedNote);
        const targetIndex = SmartPitchNode.NOTE_NAMES.indexOf(targetNote);

        if (detectedIndex === -1 || targetIndex === -1) {
            return '--';
        }

        // 計算最短路徑的半音數（可能是正或負）
        let semitones = targetIndex - detectedIndex;

        // 選擇最短路徑（-6 到 +6 之間）
        if (semitones > 6) {
            semitones -= 12;
        } else if (semitones < -6) {
            semitones += 12;
        }

        const display = semitones >= 0 ? `+${semitones}` : `${semitones}`;
        return display;
    }

    bindContentEvents() {
        const targetKeySelect = this.element.querySelector('.smart-pitch-target-select');
        const applyBtn = this.element.querySelector('.smart-pitch-apply-btn');

        // 目標調性選擇
        if (targetKeySelect) {
            targetKeySelect.addEventListener('change', (e) => {
                this.data.targetKey = e.target.value || null;
                // 更新所有檔案的半音數
                this.updateAllSemitones();
                this.updateFilesListUI();
                this.updateApplyButtonState();
            });
        }

        // 套用轉調按鈕
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyTranspose();
            });
        }

        // 檔案分析按鈕
        this.element.querySelectorAll('.smart-pitch-analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                this.analyzeFileDetail(index);
            });
        });
    }

    /**
     * 更新檔案列表 UI
     */
    updateFilesListUI() {
        const filesContainer = this.element.querySelector('.smart-pitch-files');
        if (filesContainer) {
            filesContainer.innerHTML = this.renderFilesList();
            // 重新綁定分析按鈕事件
            this.element.querySelectorAll('.smart-pitch-analyze-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index, 10);
                    this.analyzeFileDetail(index);
                });
            });
        }
    }

    /**
     * 更新套用按鈕狀態
     */
    updateApplyButtonState() {
        const applyBtn = this.element.querySelector('.smart-pitch-apply-btn');
        const hasFiles = this.data.fileAnalysis && this.data.fileAnalysis.length > 0;
        if (applyBtn) {
            applyBtn.disabled = !this.data.targetKey || !hasFiles;
        }
    }

    /**
     * 分析單一檔案的細部資訊
     */
    async analyzeFileDetail(index) {
        const fileAnalysis = this.data.fileAnalysis[index];
        if (!fileAnalysis) return;

        const audioBuffer = this.inputAudioBuffers[index];
        if (!audioBuffer) {
            showToast('無法取得音訊資料', 'error');
            return;
        }

        // 如果已有分析結果，直接顯示
        if (fileAnalysis.detailAnalysis) {
            this.showFileDetailPanel(index, fileAnalysis.detailAnalysis);
            return;
        }

        // 顯示分析中狀態
        const btn = this.element.querySelector(`.smart-pitch-analyze-btn[data-index="${index}"]`);
        if (btn) {
            btn.textContent = '⏳';
            btn.disabled = true;
        }

        try {
            // 使用 audioAnalyzer 進行完整分析
            const result = await window.audioAnalyzer.analyze(audioBuffer, (progress) => {
                // 可以在這裡更新進度
            });

            // 儲存分析結果
            fileAnalysis.detailAnalysis = result;

            // 更新按鈕狀態
            if (btn) {
                btn.textContent = '≡';
                btn.disabled = false;
            }

            // 顯示分析面板
            this.showFileDetailPanel(index, result);

        } catch (error) {
            console.error('檔案細部分析失敗:', error);
            showToast('分析失敗', 'error');
            if (btn) {
                btn.textContent = '◎';
                btn.disabled = false;
            }
        }
    }

    /**
     * 顯示檔案細部分析面板
     */
    showFileDetailPanel(index, result) {
        const panel = this.element.querySelector(`#smart-pitch-detail-${this.id}`);
        if (!panel) return;

        const fileAnalysis = this.data.fileAnalysis[index];
        const filename = fileAnalysis?.filename || `檔案 ${index + 1}`;

        panel.style.display = 'block';
        panel.innerHTML = this.buildFileDetailPanelHTML(index, filename, result);
        this.bindFileDetailPanelEvents(index);

        // 記錄當前顯示的檔案索引
        this.currentDetailIndex = index;
    }

    /**
     * 隱藏檔案細部分析面板
     */
    hideFileDetailPanel() {
        const panel = this.element.querySelector(`#smart-pitch-detail-${this.id}`);
        if (panel) {
            panel.style.display = 'none';
            panel.innerHTML = '';
        }
        this.currentDetailIndex = null;
    }

    /**
     * 建構檔案細部分析面板 HTML
     */
    buildFileDetailPanelHTML(index, filename, result) {
        const basic = result.basic || {};
        const frequency = result.frequency || {};
        const pitch = result.pitch || {};

        // 頭部（檔名與關閉按鈕）
        const headerHTML = `
            <div class="smart-pitch-detail-header">
                <span class="smart-pitch-detail-title">▭ ${filename}</span>
                <button class="smart-pitch-detail-close" title="關閉">×</button>
            </div>
        `;

        // 頁籤選單
        const tabsHTML = `
            <div class="smart-pitch-detail-tabs">
                <button class="smart-pitch-tab active" data-tab="basic">基本資訊</button>
                <button class="smart-pitch-tab" data-tab="frequency">頻譜分析</button>
                <button class="smart-pitch-tab" data-tab="pitch">音高圖</button>
            </div>
        `;

        // 基本資訊內容
        const basicContentHTML = `
            <div class="smart-pitch-tab-content active" data-tab="basic">
                <div class="analysis-info-grid">
                    <div class="analysis-info-item">
                        <span class="info-label">時長</span>
                        <span class="info-value">${basic.duration ? basic.duration.toFixed(2) + 's' : '-'}</span>
                    </div>
                    <div class="analysis-info-item">
                        <span class="info-label">取樣率</span>
                        <span class="info-value">${basic.sampleRate ? basic.sampleRate + ' Hz' : '-'}</span>
                    </div>
                    <div class="analysis-info-item">
                        <span class="info-label">聲道數</span>
                        <span class="info-value">${basic.channels || '-'}</span>
                    </div>
                    <div class="analysis-info-item">
                        <span class="info-label">偵測音高</span>
                        <span class="info-value">${pitch.dominantPitch?.noteName || '-'}</span>
                    </div>
                </div>
            </div>
        `;

        // 頻譜分析內容
        const spectrum = frequency.spectrum || {};
        const freqBands = [
            { label: '低頻', value: spectrum.low || 0, class: 'low' },
            { label: '中頻', value: spectrum.mid || 0, class: 'mid' },
            { label: '高頻', value: spectrum.high || 0, class: 'high' }
        ];

        const freqBarsHTML = freqBands.map(band => {
            const width = Math.round(band.value * 100);
            const percentage = (band.value * 100).toFixed(1);
            return `
                <div class="frequency-bar-item">
                    <span class="frequency-bar-label">${band.label}</span>
                    <div class="frequency-bar">
                        <div class="frequency-bar-fill ${band.class}" style="width: ${width}%">
                            <span class="frequency-bar-percentage">${percentage}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const dominantFreq = frequency.dominantFrequency ? frequency.dominantFrequency.toFixed(0) + ' Hz' : '-';
        const spectralCentroid = frequency.spectralCentroid ? frequency.spectralCentroid.toFixed(0) + ' Hz' : '-';

        const frequencyContentHTML = `
            <div class="smart-pitch-tab-content" data-tab="frequency">
                <div class="frequency-bars">
                    ${freqBarsHTML}
                </div>
                <div class="frequency-stats">
                    <div class="frequency-stat-item">
                        <span class="frequency-stat-label">主頻率</span>
                        <span class="frequency-stat-value">${dominantFreq}</span>
                    </div>
                    <div class="frequency-stat-item">
                        <span class="frequency-stat-label">頻譜重心</span>
                        <span class="frequency-stat-value">${spectralCentroid}</span>
                    </div>
                </div>
            </div>
        `;

        // 音高圖內容
        const dominantPitch = pitch.dominantPitch || {};
        const pitchContentHTML = `
            <div class="smart-pitch-tab-content" data-tab="pitch">
                <div class="pitch-info">
                    <div class="dominant-pitch">
                        <span class="pitch-note">${dominantPitch.noteName || '-'}</span>
                        <span class="pitch-freq">${dominantPitch.frequency ? dominantPitch.frequency.toFixed(1) + ' Hz' : ''}</span>
                        ${dominantPitch.confidence ? `<span class="pitch-confidence">${Math.round(dominantPitch.confidence * 100)}%</span>` : ''}
                    </div>
                </div>
                <div class="spectrogram-container" id="spectrogram-container-${this.id}-${index}">
                    <canvas id="spectrogram-canvas-${this.id}-${index}" class="spectrogram-canvas"></canvas>
                    <div class="spectrogram-hover-info" id="spectrogram-hover-${this.id}-${index}"></div>
                </div>
            </div>
        `;

        return headerHTML + tabsHTML + basicContentHTML + frequencyContentHTML + pitchContentHTML;
    }

    /**
     * 綁定檔案細部分析面板事件
     */
    bindFileDetailPanelEvents(index) {
        const panel = this.element.querySelector(`#smart-pitch-detail-${this.id}`);
        if (!panel) return;

        // 關閉按鈕
        const closeBtn = panel.querySelector('.smart-pitch-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideFileDetailPanel();
            });
        }

        // 頁籤切換
        const tabs = panel.querySelectorAll('.smart-pitch-tab');
        const contents = panel.querySelectorAll('.smart-pitch-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // 更新頁籤狀態
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 更新內容顯示
                contents.forEach(content => {
                    content.classList.toggle('active', content.dataset.tab === targetTab);
                });

                // 如果切換到音高圖頁籤，渲染頻譜圖
                if (targetTab === 'pitch') {
                    this.renderFileSpectrogram(index);
                }
            });
        });
    }

    /**
     * 渲染單一檔案的頻譜圖
     */
    renderFileSpectrogram(index) {
        const fileAnalysis = this.data.fileAnalysis[index];
        if (!fileAnalysis?.detailAnalysis?.pitch?.spectrogram) return;

        const canvas = this.element.querySelector(`#spectrogram-canvas-${this.id}-${index}`);
        const container = this.element.querySelector(`#spectrogram-container-${this.id}-${index}`);
        const hoverInfo = this.element.querySelector(`#spectrogram-hover-${this.id}-${index}`);

        if (!canvas || !container) return;

        // 設定 canvas 尺寸
        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width || 280;
        const canvasHeight = 100;

        // 建立 SpectrogramRenderer
        const renderer = new SpectrogramRenderer(canvas);

        // 渲染頻譜圖
        const specData = fileAnalysis.detailAnalysis.pitch.spectrogram;
        renderer.render(specData, {
            canvasWidth: canvasWidth,
            canvasHeight: canvasHeight
        });

        // 綁定滑鼠懸停事件
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const timeIndex = Math.floor((x / rect.width) * specData.width);
            const freqIndex = Math.floor(((rect.height - y) / rect.height) * specData.height);

            if (timeIndex >= 0 && timeIndex < specData.width &&
                freqIndex >= 0 && freqIndex < specData.height) {
                const time = timeIndex * specData.timeStep;
                const freq = (freqIndex / specData.height) * specData.frequencyRange[1];
                const magnitude = specData.data[timeIndex]?.[freqIndex] || 0;

                if (hoverInfo) {
                    hoverInfo.style.display = 'block';
                    hoverInfo.style.left = (x + 10) + 'px';
                    hoverInfo.style.top = (y - 30) + 'px';
                    hoverInfo.innerHTML = `
                        <div>時間: ${time.toFixed(2)}s</div>
                        <div>頻率: ${freq.toFixed(0)} Hz</div>
                        <div>強度: ${magnitude.toFixed(1)} dB</div>
                    `;
                }
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (hoverInfo) {
                hoverInfo.style.display = 'none';
            }
        });
    }

    /**
     * 更新轉調 UI 顯示（保留向下相容）
     */
    updateTransposeUI() {
        this.updateFilesListUI();
        this.updateApplyButtonState();
    }

    /**
     * 套用轉調設定
     */
    applyTranspose() {
        if (!this.data.targetKey) {
            return;
        }

        // 更新所有檔案的半音數
        this.updateAllSemitones();

        // 更新第一個檔案的 pitch 值（向下相容）
        const semitones = this.calculateTransposeSemitonesValue();
        if (semitones !== null) {
            this.data.pitch = semitones;
        }

        // 自動更新預覽
        this.schedulePreviewUpdate();

        if (this.onDataChange) {
            this.onDataChange('pitch', this.data.pitch);
        }
    }

    /**
     * 計算轉調半音數值
     * @returns {number|null} 半音數，或 null 如果無法計算
     */
    calculateTransposeSemitonesValue() {
        if (!this.data.detectedKey || !this.data.targetKey) {
            return null;
        }

        const detectedNoteName = this.data.detectedKey.noteName;
        const detectedNote = detectedNoteName.replace(/\d+$/, '');
        const targetNote = this.data.targetKey;

        const detectedIndex = SmartPitchNode.NOTE_NAMES.indexOf(detectedNote);
        const targetIndex = SmartPitchNode.NOTE_NAMES.indexOf(targetNote);

        if (detectedIndex === -1 || targetIndex === -1) {
            return null;
        }

        let semitones = targetIndex - detectedIndex;

        // 選擇最短路徑（-6 到 +6 之間）
        if (semitones > 6) {
            semitones -= 12;
        } else if (semitones < -6) {
            semitones += 12;
        }

        return semitones;
    }

    /**
     * 當輸入音訊變更時，自動分析（支援多檔案）
     */
    async updateInputAudio(audioBuffer, audioFiles = null, filenames = null) {
        // 多檔案模式
        if (audioFiles && audioFiles.length > 0) {
            this.inputAudioBuffers = audioFiles;
            this.inputFilenames = filenames || audioFiles.map((_, i) => `檔案 ${i + 1}`);
            this.inputAudioBuffer = audioFiles[0];

            // 分析所有檔案
            await this.analyzeMultipleAudio(audioFiles, this.inputFilenames);
            return;
        }

        // 單檔案模式
        if (!audioBuffer) {
            this.inputAudioBuffer = null;
            this.inputAudioBuffers = [];
            this.inputFilenames = [];
            this.data.detectedKey = null;
            this.data.fileAnalysis = [];
            this.analysisResult = null;
            this.updateDetectedKeyUI();
            this.hideFileDetailPanel();
            return;
        }

        this.inputAudioBuffer = audioBuffer;
        this.inputAudioBuffers = [audioBuffer];
        this.inputFilenames = ['音訊'];

        // 開始完整分析（單檔案）
        await this.analyzeAudio(audioBuffer);
    }

    /**
     * 分析多個音訊檔案
     */
    async analyzeMultipleAudio(audioFiles, filenames) {
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        this.updateDetectedKeyUI('分析中...');
        this.showProgressBar();

        try {
            const fileAnalysis = [];
            const totalFiles = audioFiles.length;

            for (let i = 0; i < totalFiles; i++) {
                const buffer = audioFiles[i];
                const filename = filenames[i] || `檔案 ${i + 1}`;

                // 更新進度
                const baseProgress = (i / totalFiles) * 100;
                this.updateProgress(baseProgress);

                if (!buffer) {
                    fileAnalysis.push({
                        filename,
                        detectedKey: null,
                        semitones: null
                    });
                    continue;
                }

                // 使用 YIN 演算法快速偵測音高
                const detectedKey = await this.detectPitchOnly(buffer);

                fileAnalysis.push({
                    filename,
                    detectedKey,
                    semitones: null  // 等選擇目標調性後再計算
                });
            }

            this.data.fileAnalysis = fileAnalysis;

            // 第一個檔案的結果作為主要顯示
            if (fileAnalysis.length > 0 && fileAnalysis[0].detectedKey) {
                this.data.detectedKey = fileAnalysis[0].detectedKey;
            } else {
                this.data.detectedKey = null;
            }

            // 如果已經有目標調性，更新所有檔案的半音數
            if (this.data.targetKey) {
                this.updateAllSemitones();
            }

            // 不再自動進行完整分析，改為使用者點擊時才分析

        } catch (error) {
            console.error('多檔案音訊分析失敗:', error);
            this.data.detectedKey = null;
            this.data.fileAnalysis = [];
            this.analysisResult = null;
        }

        this.isAnalyzing = false;
        this.hideProgressBar();
        this.updateDetectedKeyUI();
    }

    /**
     * 快速偵測音高（只用 YIN 演算法）
     */
    async detectPitchOnly(audioBuffer) {
        try {
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            // 使用 YIN 演算法偵測音高
            const pitchResult = this.detectPitchYIN(channelData, sampleRate);

            if (pitchResult && pitchResult.frequency > 0) {
                const midiNote = 12 * Math.log2(pitchResult.frequency / 440) + 69;
                const noteIndex = Math.round(midiNote) % 12;
                const octave = Math.floor(Math.round(midiNote) / 12) - 1;
                const noteName = SmartPitchNode.NOTE_NAMES[noteIndex] + octave;

                return {
                    noteName,
                    midiNote: Math.round(midiNote),
                    confidence: pitchResult.confidence,
                    frequency: pitchResult.frequency
                };
            }
        } catch (error) {
            console.error('音高偵測失敗:', error);
        }

        return null;
    }

    /**
     * YIN 演算法偵測音高
     */
    detectPitchYIN(channelData, sampleRate) {
        const bufferSize = Math.min(4096, channelData.length);
        const yinBuffer = new Float32Array(bufferSize / 2);

        // 差分函數
        for (let tau = 0; tau < yinBuffer.length; tau++) {
            yinBuffer[tau] = 0;
            for (let i = 0; i < yinBuffer.length; i++) {
                const delta = channelData[i] - channelData[i + tau];
                yinBuffer[tau] += delta * delta;
            }
        }

        // 累積平均正規化差分函數
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < yinBuffer.length; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] *= tau / runningSum;
        }

        // 找絕對閾值
        const threshold = 0.1;
        let tauEstimate = -1;
        for (let tau = 2; tau < yinBuffer.length; tau++) {
            if (yinBuffer[tau] < threshold) {
                while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                    tau++;
                }
                tauEstimate = tau;
                break;
            }
        }

        if (tauEstimate === -1) {
            // 找最小值
            let minVal = yinBuffer[0];
            let minTau = 0;
            for (let tau = 1; tau < yinBuffer.length; tau++) {
                if (yinBuffer[tau] < minVal) {
                    minVal = yinBuffer[tau];
                    minTau = tau;
                }
            }
            tauEstimate = minTau;
        }

        // 拋物線插值
        let betterTau = tauEstimate;
        if (tauEstimate > 0 && tauEstimate < yinBuffer.length - 1) {
            const s0 = yinBuffer[tauEstimate - 1];
            const s1 = yinBuffer[tauEstimate];
            const s2 = yinBuffer[tauEstimate + 1];
            betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
        }

        const frequency = sampleRate / betterTau;
        const confidence = 1 - yinBuffer[tauEstimate];

        // 過濾不合理的頻率
        if (frequency < 50 || frequency > 2000 || confidence < 0.5) {
            return null;
        }

        return { frequency, confidence };
    }

    /**
     * 更新所有檔案的半音數
     */
    updateAllSemitones() {
        if (!this.data.targetKey) {
            this.data.fileAnalysis.forEach(item => {
                item.semitones = null;
            });
            return;
        }

        const targetIndex = SmartPitchNode.NOTE_NAMES.indexOf(this.data.targetKey);
        if (targetIndex === -1) return;

        this.data.fileAnalysis.forEach(item => {
            if (!item.detectedKey || !item.detectedKey.noteName) {
                item.semitones = null;
                return;
            }

            const detectedNote = item.detectedKey.noteName.replace(/\d+$/, '');
            const detectedIndex = SmartPitchNode.NOTE_NAMES.indexOf(detectedNote);

            if (detectedIndex === -1) {
                item.semitones = null;
                return;
            }

            // 計算最短路徑的半音數
            let semitones = targetIndex - detectedIndex;

            // 選擇最短路徑（-6 到 +6 之間）
            if (semitones > 6) semitones -= 12;
            if (semitones < -6) semitones += 12;

            item.semitones = semitones;
        });

        // 更新第一個檔案的 pitch（用於向下相容）
        if (this.data.fileAnalysis.length > 0 && this.data.fileAnalysis[0].semitones !== null) {
            this.data.pitch = this.data.fileAnalysis[0].semitones;
        }
    }

    /**
     * 完整分析音訊（單檔案模式，含音高偵測與頻譜分析）
     */
    async analyzeAudio(audioBuffer) {
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        this.showProgressBar();

        try {
            // 使用 YIN 演算法快速偵測音高
            const detectedKey = await this.detectPitchOnly(audioBuffer);

            // 建立單一檔案的分析記錄
            this.data.fileAnalysis = [{
                filename: '音訊',
                detectedKey,
                semitones: null
            }];

            // 更新偵測到的音高
            this.data.detectedKey = detectedKey;

            // 如果已經有目標調性，更新半音數
            if (this.data.targetKey) {
                this.updateAllSemitones();
            }

        } catch (error) {
            console.error('音訊分析失敗:', error);
            this.data.detectedKey = null;
            this.data.fileAnalysis = [];
        }

        this.isAnalyzing = false;
        this.hideProgressBar();
        this.updateDetectedKeyUI();
    }

    /**
     * 顯示進度條
     */
    showProgressBar() {
        const container = this.element.querySelector(`#smart-pitch-progress-${this.id}`);
        if (!container) return;

        container.style.display = 'block';

        // 移除舊的進度條（如果存在）
        if (this.progressBar) {
            this.progressBar.remove();
            this.progressBar = null;
        }

        // 建立新的進度條
        this.progressBar = new ProgressBar(container);
        this.progressBar.update(0, '分析音訊中...');
    }

    /**
     * 隱藏進度條
     */
    hideProgressBar() {
        const container = this.element.querySelector(`#smart-pitch-progress-${this.id}`);
        if (container) {
            container.style.display = 'none';
        }

        if (this.progressBar) {
            this.progressBar.remove();
            this.progressBar = null;
        }
    }

    /**
     * 更新進度
     */
    updateProgress(progress) {
        if (this.progressBar) {
            this.progressBar.update(progress);
        }
    }

    /**
     * 取得區塊收合狀態
     */
    getSectionCollapseState(sectionName) {
        const key = `smartPitchNode_section_${sectionName}_collapsed`;
        const stored = localStorage.getItem(key);
        // 預設為收合狀態（true），除非使用者明確展開過（stored === 'false'）
        if (stored === null) {
            return true; // 預設收合
        }
        return stored === 'true';
    }

    /**
     * 儲存區塊收合狀態
     */
    saveSectionCollapseState(sectionName, collapsed) {
        const key = `smartPitchNode_section_${sectionName}_collapsed`;
        localStorage.setItem(key, collapsed ? 'true' : 'false');
    }

    /**
     * 更新偵測音高 UI（新版：更新檔案列表）
     */
    updateDetectedKeyUI(customText = null) {
        // 更新檔案列表
        this.updateFilesListUI();

        // 更新目標調性選擇器狀態
        const targetKeySelect = this.element.querySelector('.smart-pitch-target-select');
        const hasFiles = this.data.fileAnalysis && this.data.fileAnalysis.length > 0;

        if (targetKeySelect) {
            targetKeySelect.disabled = !hasFiles;
        }

        // 更新套用按鈕狀態
        this.updateApplyButtonState();
    }

    /**
     * 清理資源
     */
    destroy() {
        if (this.spectrogramRenderer) {
            this.spectrogramRenderer = null;
        }
        if (this.progressBar) {
            this.progressBar = null;
        }
        super.destroy();
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];

            for (let i = 0; i < audioFiles.length; i++) {
                const buffer = audioFiles[i];

                if (!buffer) {
                    processedFiles.push(null);
                    continue;
                }

                // 取得該檔案的 semitones（每個檔案可能不同）
                const analysis = this.data.fileAnalysis[i];
                const semitones = analysis?.semitones ?? this.data.pitch;

                // 如果 semitones 為 0 或 null，直接返回原音訊
                if (semitones === 0 || semitones === null) {
                    processedFiles.push(buffer);
                } else {
                    processedFiles.push(audioProcessor.changePitch(buffer, semitones));
                }
            }

            return {
                audio: processedFiles[0] || null,
                audioFiles: processedFiles,
                filenames: inputs.filenames
            };
        }

        // 單檔案處理（向下相容）
        if (!audioBuffer) return { audio: null };

        // 如果 pitch 為 0，直接返回原音訊
        if (this.data.pitch === 0) {
            return { audio: audioBuffer };
        }

        // 直接呼叫 changePitch 而非透過 processAudio
        const processed = audioProcessor.changePitch(audioBuffer, this.data.pitch);
        return { audio: processed };
    }
}

window.SmartPitchNode = SmartPitchNode;
