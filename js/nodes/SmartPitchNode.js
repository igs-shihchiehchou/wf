/**
 * 智慧調音節點（含音高偵測、轉調、分析功能）
 */
class SmartPitchNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // 大調與小調選項
    static KEY_OPTIONS = [
        // 大調
        { value: 'C', label: 'C 大調', type: 'major' },
        { value: 'C#', label: 'C# 大調', type: 'major' },
        { value: 'D', label: 'D 大調', type: 'major' },
        { value: 'D#', label: 'D# 大調', type: 'major' },
        { value: 'E', label: 'E 大調', type: 'major' },
        { value: 'F', label: 'F 大調', type: 'major' },
        { value: 'F#', label: 'F# 大調', type: 'major' },
        { value: 'G', label: 'G 大調', type: 'major' },
        { value: 'G#', label: 'G# 大調', type: 'major' },
        { value: 'A', label: 'A 大調', type: 'major' },
        { value: 'A#', label: 'A# 大調', type: 'major' },
        { value: 'B', label: 'B 大調', type: 'major' },
        // 小調
        { value: 'Cm', label: 'C 小調', type: 'minor' },
        { value: 'C#m', label: 'C# 小調', type: 'minor' },
        { value: 'Dm', label: 'D 小調', type: 'minor' },
        { value: 'D#m', label: 'D# 小調', type: 'minor' },
        { value: 'Em', label: 'E 小調', type: 'minor' },
        { value: 'Fm', label: 'F 小調', type: 'minor' },
        { value: 'F#m', label: 'F# 小調', type: 'minor' },
        { value: 'Gm', label: 'G 小調', type: 'minor' },
        { value: 'G#m', label: 'G# 小調', type: 'minor' },
        { value: 'Am', label: 'A 小調', type: 'minor' },
        { value: 'A#m', label: 'A# 小調', type: 'minor' },
        { value: 'Bm', label: 'B 小調', type: 'minor' }
    ];

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

        // 分頁控制（與批量調音一致）
        this.currentPage = 0;
        this.perPage = 5;
        this.listExpanded = true;
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

        // 生成目標調性選項（分組顯示大調與小調）
        const majorOptions = SmartPitchNode.KEY_OPTIONS
            .filter(k => k.type === 'major')
            .map(k => {
                const selected = targetKey === k.value ? 'selected' : '';
                return `<option value="${k.value}" ${selected}>${k.label}</option>`;
            }).join('');
        const minorOptions = SmartPitchNode.KEY_OPTIONS
            .filter(k => k.type === 'minor')
            .map(k => {
                const selected = targetKey === k.value ? 'selected' : '';
                return `<option value="${k.value}" ${selected}>${k.label}</option>`;
            }).join('');
        const keyOptions = `<optgroup label="大調">${majorOptions}</optgroup><optgroup label="小調">${minorOptions}</optgroup>`;

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
     * 渲染檔案列表（含分頁功能，與批量調音一致）
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

        // 分頁計算
        const totalPages = Math.ceil(fileAnalysis.length / this.perPage);
        const start = this.currentPage * this.perPage;
        const end = Math.min(start + this.perPage, fileAnalysis.length);

        // 檔案分析列表（只顯示當前頁）
        let listHtml = '';
        for (let i = start; i < end; i++) {
            const item = fileAnalysis[i];
            if (!item) continue;

            // 偵測音高顯示（與批量調音一致）
            let pitchDisplay, confidenceDisplay, transposeDisplay;

            if (item.detectedKey) {
                pitchDisplay = `<span class="smart-pitch-detected">${item.detectedKey.noteName}</span>`;
                // 顯示信心度百分比
                confidenceDisplay = item.detectedKey.confidence
                    ? `<span class="smart-pitch-confidence">${Math.round(item.detectedKey.confidence * 100)}%</span>`
                    : '';

                // 顯示移調資訊（包含目標音）
                if (this.data.targetKey && item.semitones !== null && item.semitones !== undefined) {
                    const arrow = item.semitones === 0 ? '=' : '→';
                    const targetDisplay = item.targetNote ? `<span class="smart-pitch-target-note">${item.targetNote}</span>` : '';
                    const semitoneClass = item.semitones > 0 ? 'up' : item.semitones < 0 ? 'down' : 'same';
                    const semitoneText = item.semitones === 0 ? '±0' : (item.semitones > 0 ? `+${item.semitones}` : `${item.semitones}`);
                    transposeDisplay = `<span class="smart-pitch-transpose-info">${arrow} ${targetDisplay} <span class="smart-pitch-semitones ${semitoneClass}">(${semitoneText})</span></span>`;
                } else {
                    transposeDisplay = '';
                }
            } else {
                // 無法偵測音高時顯示更明確的提示
                pitchDisplay = `<span class="smart-pitch-unknown" title="可能原因：音效過短、噪音、打擊樂或環境音等">⚠️ 無法偵測</span>`;
                confidenceDisplay = '';
                transposeDisplay = this.data.targetKey
                    ? `<span class="smart-pitch-skip" title="此檔案將保持原樣不移調">不移調</span>`
                    : '';
            }

            // 分析狀態
            const isAnalyzed = item.detailAnalysis !== undefined;
            const analyzeIcon = isAnalyzed ? '≡' : '◎';
            const analyzeTitle = isAnalyzed ? '查看分析結果' : '點擊進行細部分析';

            listHtml += `
                <div class="smart-pitch-file-item" data-index="${i}">
                    <div class="smart-pitch-file-info">
                        <span class="smart-pitch-file-icon">▭</span>
                        <span class="smart-pitch-file-name" title="${item.filename}">${item.filename}</span>
                    </div>
                    <div class="smart-pitch-file-analysis">
                        ${pitchDisplay}
                        ${confidenceDisplay}
                        ${transposeDisplay}
                        <button class="smart-pitch-analyze-btn" data-index="${i}" title="${analyzeTitle}">${analyzeIcon}</button>
                    </div>
                </div>
            `;
        }

        // 分頁控制
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = `
                <div class="smart-pitch-pagination">
                    <button class="smart-pitch-page-btn" data-action="prev" ${this.currentPage === 0 ? 'disabled' : ''}>◀</button>
                    <span class="smart-pitch-page-info">${this.currentPage + 1} / ${totalPages}</span>
                    <button class="smart-pitch-page-btn" data-action="next" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}>▶</button>
                </div>
            `;
        }

        return `
            <div class="smart-pitch-list-section">
                <div class="smart-pitch-list-header">
                    <button class="smart-pitch-list-toggle" data-action="toggle-list">
                        ${this.listExpanded ? '▼' : '▶'}
                    </button>
                    <span class="smart-pitch-list-title">≡ 音高分析結果</span>
                    <span class="smart-pitch-list-count">${fileAnalysis.length} 個檔案</span>
                </div>
                <div class="smart-pitch-list-content ${this.listExpanded ? 'expanded' : 'collapsed'}">
                    <div class="smart-pitch-file-list">
                        ${listHtml}
                    </div>
                    ${paginationHtml}
                </div>
            </div>
        `;
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
        // 從目標調性中提取音名（移除小調標記 'm'）
        const targetNote = this.data.targetKey.replace(/m$/, '');

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
        this.bindFileListEvents();

        // 列表展開/收合
        const toggleBtn = this.element.querySelector('[data-action="toggle-list"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.listExpanded = !this.listExpanded;
                this.updateFilesListUI();
            });
        }

        // 分頁按鈕
        const prevBtn = this.element.querySelector('[data-action="prev"]');
        const nextBtn = this.element.querySelector('[data-action="next"]');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.updateFilesListUI();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil((this.data.fileAnalysis || []).length / this.perPage);
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.updateFilesListUI();
                }
            });
        }
    }

    /**
     * 綁定檔案列表事件（分析按鈕、分頁等）
     */
    bindFileListEvents() {
        // 檔案分析按鈕
        this.element.querySelectorAll('.smart-pitch-analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                this.analyzeFileDetail(index);
            });
        });

        // 分頁按鈕
        const prevBtn = this.element.querySelector('[data-action="prev"]');
        const nextBtn = this.element.querySelector('[data-action="next"]');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.updateFilesListUI();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil((this.data.fileAnalysis || []).length / this.perPage);
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.updateFilesListUI();
                }
            });
        }

        // 列表展開/收合
        const toggleBtn = this.element.querySelector('[data-action="toggle-list"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.listExpanded = !this.listExpanded;
                this.updateFilesListUI();
            });
        }
    }

    /**
     * 更新檔案列表 UI
     */
    updateFilesListUI() {
        const filesContainer = this.element.querySelector('.smart-pitch-files');
        if (filesContainer) {
            filesContainer.innerHTML = this.renderFilesList();
            // 重新綁定事件
            this.bindFileListEvents();
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
        // 從目標調性中提取音名（移除小調標記 'm'）
        const targetNote = this.data.targetKey.replace(/m$/, '');

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
     * 快速偵測音高（使用滑動窗口 + 眾數法，與批量調音一致）
     */
    async detectPitchOnly(audioBuffer) {
        if (!audioBuffer) return null;

        try {
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);

            // 動態調整窗口大小（優化短音效處理）
            const audioDurationMs = (channelData.length / sampleRate) * 1000;
            let windowMs = 100;
            if (audioDurationMs < 100) {
                windowMs = 25;
            } else if (audioDurationMs < 200) {
                windowMs = 50;
            }

            const windowSize = Math.floor((windowMs / 1000) * sampleRate);
            const hopSize = Math.floor(windowSize / 2); // 50% 重疊

            const totalHops = Math.ceil((channelData.length - windowSize) / hopSize) + 1;
            const pitchCurve = [];

            for (let hopIndex = 0; hopIndex < totalHops; hopIndex++) {
                const windowStart = hopIndex * hopSize;
                const windowEnd = Math.min(windowStart + windowSize, channelData.length);

                if (windowEnd - windowStart < windowSize / 2) break;

                const windowSamples = channelData.slice(windowStart, windowEnd);
                const pitchResult = this.detectPitchYIN(windowSamples, sampleRate);

                if (pitchResult) {
                    pitchCurve.push({
                        frequency: pitchResult.frequency,
                        confidence: pitchResult.confidence
                    });
                }

                // 每 5 個讓出控制權
                if (hopIndex % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // 使用眾數法找出主要音高
            return this.detectDominantPitch(pitchCurve);

        } catch (error) {
            console.error('音高偵測失敗:', error);
        }

        return null;
    }

    /**
     * 眾數法偵測主要音高
     */
    detectDominantPitch(pitchCurve) {
        if (!pitchCurve || pitchCurve.length === 0) {
            return null;
        }

        // 降低閾值以提高偵測成功率（與批量調音一致）
        const CONFIDENCE_THRESHOLD = 0.35;
        const validPitches = pitchCurve.filter(p => p.confidence > CONFIDENCE_THRESHOLD && p.frequency > 0);

        if (validPitches.length === 0) {
            return null;
        }

        const noteCounts = new Map();

        for (const pitch of validPitches) {
            const midiNote = Math.round(69 + 12 * Math.log2(pitch.frequency / 440));
            if (midiNote < 21 || midiNote > 127) continue;
            const count = noteCounts.get(midiNote) || 0;
            noteCounts.set(midiNote, count + 1);
        }

        let dominantMidiNote = 0;
        let maxCount = 0;

        for (const [midiNote, count] of noteCounts) {
            if (count > maxCount) {
                maxCount = count;
                dominantMidiNote = midiNote;
            }
        }

        if (dominantMidiNote === 0 || maxCount === 0) {
            return null;
        }

        const confidence = maxCount / validPitches.length;
        const standardFrequency = 440 * Math.pow(2, (dominantMidiNote - 69) / 12);
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(dominantMidiNote / 12) - 1;
        const noteIndex = dominantMidiNote % 12;
        const noteName = noteNames[noteIndex] + octave;

        return {
            noteName,
            frequency: standardFrequency,
            confidence,
            midiNote: dominantMidiNote
        };
    }

    /**
     * YIN 演算法偵測單一窗口音高
     */
    detectPitchYIN(audioData, sampleRate) {
        if (!audioData || audioData.length === 0) {
            return null;
        }

        // ========== 音量門檻過濾 ==========
        let sumSquaresForRMS = 0;
        for (let i = 0; i < audioData.length; i++) {
            sumSquaresForRMS += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sumSquaresForRMS / audioData.length);
        const RMS_THRESHOLD = 0.01;
        if (rms < RMS_THRESHOLD) {
            return null;
        }

        const THRESHOLD = 0.15;
        const MIN_FREQUENCY = 50;
        const MAX_FREQUENCY = 2000;
        const MAX_LAG = Math.floor(sampleRate / MIN_FREQUENCY);
        const MIN_LAG = Math.floor(sampleRate / MAX_FREQUENCY);
        const FRAME_LENGTH = audioData.length;

        if (MIN_LAG < 1 || MAX_LAG > FRAME_LENGTH) {
            return null;
        }

        // 差異函數
        const differenceFunction = new Float32Array(FRAME_LENGTH);
        for (let lag = 0; lag < FRAME_LENGTH; lag++) {
            let sum = 0;
            for (let i = 0; i < FRAME_LENGTH - lag; i++) {
                const diff = audioData[i] - audioData[i + lag];
                sum += diff * diff;
            }
            differenceFunction[lag] = sum;
        }

        // CMNDF
        const cmndf = new Float32Array(FRAME_LENGTH);
        cmndf[0] = 1;
        let runningMean = 0;

        for (let lag = 1; lag < FRAME_LENGTH; lag++) {
            runningMean += differenceFunction[lag];
            cmndf[lag] = (differenceFunction[lag] * lag) / (runningMean + 1e-10);
        }

        // 找閾值點
        let foundLag = 0;
        let minCmndf = Infinity;

        for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
            if (cmndf[lag] < THRESHOLD) {
                foundLag = lag;
                minCmndf = cmndf[lag];
                break;
            }
            if (cmndf[lag] < minCmndf) {
                minCmndf = cmndf[lag];
                foundLag = lag;
            }
        }

        // 拋物線插值
        let refinedLag = foundLag;
        if (foundLag > 0 && foundLag < FRAME_LENGTH - 1) {
            const y1 = cmndf[foundLag - 1];
            const y0 = cmndf[foundLag];
            const y2 = cmndf[foundLag + 1];
            const a = (y1 - 2 * y0 + y2) / 2;
            const b = (y2 - y1) / 2;
            if (Math.abs(a) > 1e-10) {
                refinedLag = foundLag + (-b / (2 * a));
            }
        }

        let frequency = refinedLag > 0 ? sampleRate / refinedLag : 0;
        if (frequency > MAX_FREQUENCY * 10 || frequency < MIN_FREQUENCY / 10) {
            return null;
        }

        const confidence = Math.max(0, Math.min(1, 1 - minCmndf));
        return { frequency, confidence };
    }

    /**
     * 更新所有檔案的半音數
     */
    updateAllSemitones() {
        if (!this.data.targetKey) {
            this.data.fileAnalysis.forEach(item => {
                item.semitones = null;
                item.targetNote = null;
            });
            return;
        }

        // 從目標調性中提取音名（移除小調標記 'm'）
        const targetNote = this.data.targetKey.replace(/m$/, '');
        const targetIndex = SmartPitchNode.NOTE_NAMES.indexOf(targetNote);
        if (targetIndex === -1) return;

        this.data.fileAnalysis.forEach(item => {
            if (!item.detectedKey || !item.detectedKey.noteName) {
                item.semitones = null;
                item.targetNote = null;
                return;
            }

            const detectedNote = item.detectedKey.noteName.replace(/\d+$/, '');
            const detectedIndex = SmartPitchNode.NOTE_NAMES.indexOf(detectedNote);

            if (detectedIndex === -1) {
                item.semitones = null;
                item.targetNote = null;
                return;
            }

            // 計算最短路徑的半音數
            let semitones = targetIndex - detectedIndex;

            // 選擇最短路徑（-6 到 +6 之間）
            if (semitones > 6) semitones -= 12;
            if (semitones < -6) semitones += 12;

            item.semitones = semitones;
            // 計算目標音名（顯示完整調性，包含大/小調）
            item.targetNote = this.data.targetKey;
            item.targetKeyType = this.data.targetKey.endsWith('m') ? 'minor' : 'major';
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
