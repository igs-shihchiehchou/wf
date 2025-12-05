/**
 * 調性整合節點（批量分析多檔案音高，移調至符合目標調性的最近音）
 */
class KeyIntegrationNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 各調性的調內音（自然大調音階）
    static SCALE_NOTES = {
        'C': [0, 2, 4, 5, 7, 9, 11],  // C D E F G A B
        'C#': [1, 3, 5, 6, 8, 10, 0],  // C# D# F F# G# A# C
        'D': [2, 4, 6, 7, 9, 11, 1],  // D E F# G A B C#
        'D#': [3, 5, 7, 8, 10, 0, 2],  // D# F G G# A# C D
        'E': [4, 6, 8, 9, 11, 1, 3],  // E F# G# A B C# D#
        'F': [5, 7, 9, 10, 0, 2, 4],  // F G A Bb C D E
        'F#': [6, 8, 10, 11, 1, 3, 5], // F# G# A# B C# D# F
        'G': [7, 9, 11, 0, 2, 4, 6],  // G A B C D E F#
        'G#': [8, 10, 0, 1, 3, 5, 7],  // G# A# C C# D# F G
        'A': [9, 11, 1, 2, 4, 6, 8],  // A B C# D E F# G#
        'A#': [10, 0, 2, 3, 5, 7, 9],  // A# C D D# F G A
        'B': [11, 1, 3, 4, 6, 8, 10]  // B C# D# E F# G# A#
    };

    constructor(id, options = {}) {
        const defaultData = {
            targetKey: null,           // 目標調性（音名，如 'C', 'D#'）
            fileAnalysis: [],          // 每個檔案的分析結果 [{ filename, detectedKey, semitones }]
            isAnalyzing: false,
            analysisProgress: 0
        };
        super(id, 'key-integration', '調性整合', '🎹', options, defaultData);

        this.inputAudioBuffers = [];
        this.inputFilenames = [];
        this.isAnalyzing = false;

        // 分析結果區域的分頁控制
        this.analysisCurrentPage = 0;
        this.analysisPerPage = 5;
        this.analysisExpanded = true; // 預設展開分析結果
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
        const isAnalyzing = this.data.isAnalyzing;

        // 生成目標調性選項
        const keyOptions = KeyIntegrationNode.NOTE_NAMES.map(note => {
            const selected = targetKey === note ? 'selected' : '';
            return `<option value="${note}" ${selected}>${note}</option>`;
        }).join('');

        // 計算是否可以套用
        const canApply = targetKey && fileAnalysis.length > 0 && !isAnalyzing;

        return `
            <div class="node-control key-integration-control">
                <label class="node-control-label">🎼 批量調性整合</label>
                
                <!-- 目標調性選擇 -->
                <div class="key-integration-target">
                    <span class="key-target-label">目標調性:</span>
                    <select class="target-key-select" ${isAnalyzing ? 'disabled' : ''}>
                        <option value="">-- 選擇調性 --</option>
                        ${keyOptions}
                    </select>
                    <button class="key-apply-btn" ${!canApply ? 'disabled' : ''}>套用</button>
                </div>

                <!-- 分析進度 -->
                <div class="key-analysis-progress" id="key-progress-${this.id}" style="display: ${isAnalyzing ? 'block' : 'none'};">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${this.data.analysisProgress}%"></div>
                    </div>
                    <span class="progress-text">分析中... ${Math.round(this.data.analysisProgress)}%</span>
                </div>

                <!-- 分析結果區域（第一個預覽區域） -->
                ${this.renderAnalysisSection()}
            </div>
        `;
    }

    /**
     * 渲染分析結果區域
     */
    renderAnalysisSection() {
        const fileAnalysis = this.data.fileAnalysis || [];
        const isAnalyzing = this.data.isAnalyzing;

        if (fileAnalysis.length === 0 && !isAnalyzing) {
            return `
                <div class="key-analysis-section key-analysis-empty">
                    <span class="key-empty-icon">📭</span>
                    <span class="key-empty-text">等待音訊輸入...</span>
                </div>
            `;
        }

        // 分頁計算
        const totalPages = Math.ceil(fileAnalysis.length / this.analysisPerPage);
        const start = this.analysisCurrentPage * this.analysisPerPage;
        const end = Math.min(start + this.analysisPerPage, fileAnalysis.length);
        const pageItems = fileAnalysis.slice(start, end);

        // 檔案分析列表
        let listHtml = '';
        for (let i = start; i < end; i++) {
            const item = fileAnalysis[i];
            if (!item) continue;

            // 改善無法偵測時的顯示
            let keyDisplay, confidenceDisplay, semitonesDisplay;

            if (item.detectedKey) {
                keyDisplay = `<span class="key-detected">${item.detectedKey.noteName}</span>`;
                confidenceDisplay = item.detectedKey.confidence
                    ? `<span class="key-confidence">${Math.round(item.detectedKey.confidence * 100)}%</span>`
                    : '';

                // 顯示移調資訊（包含目標音）
                if (item.semitones !== null && item.semitones !== undefined) {
                    const arrow = item.semitones === 0 ? '=' : '→';
                    const targetDisplay = item.targetNote ? `<span class="key-target-note">${item.targetNote}</span>` : '';
                    const semitoneClass = item.semitones > 0 ? 'up' : item.semitones < 0 ? 'down' : 'same';
                    const semitoneText = item.semitones === 0 ? '±0' : (item.semitones > 0 ? `+${item.semitones}` : `${item.semitones}`);
                    semitonesDisplay = `<span class="key-transpose-info">${arrow} ${targetDisplay} <span class="key-semitones ${semitoneClass}">(${semitoneText})</span></span>`;
                } else {
                    semitonesDisplay = '';
                }
            } else {
                // 無法偵測音高時顯示更明確的提示
                keyDisplay = `<span class="key-unknown" title="可能原因：音效過短、噪音、打擊樂或環境音等">⚠️ 無法偵測</span>`;
                confidenceDisplay = '';
                semitonesDisplay = `<span class="key-semitones-skip" title="此檔案將保持原樣不移調">不移調</span>`;
            }

            listHtml += `
                <div class="key-file-item" data-index="${i}">
                    <div class="key-file-info">
                        <span class="key-file-icon">📄</span>
                        <span class="key-file-name" title="${item.filename}">${item.filename}</span>
                    </div>
                    <div class="key-file-analysis">
                        ${keyDisplay}
                        ${confidenceDisplay}
                        ${semitonesDisplay}
                    </div>
                </div>
            `;
        }

        // 分頁控制
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = `
                <div class="key-pagination">
                    <button class="key-page-btn" data-action="analysis-prev" ${this.analysisCurrentPage === 0 ? 'disabled' : ''}>◀</button>
                    <span class="key-page-info">${this.analysisCurrentPage + 1} / ${totalPages}</span>
                    <button class="key-page-btn" data-action="analysis-next" ${this.analysisCurrentPage >= totalPages - 1 ? 'disabled' : ''}>▶</button>
                </div>
            `;
        }

        return `
            <div class="key-analysis-section">
                <div class="key-analysis-header">
                    <button class="key-analysis-toggle" data-action="toggle-analysis">
                        ${this.analysisExpanded ? '▼' : '▶'}
                    </button>
                    <span class="key-analysis-title">📊 調性分析結果</span>
                    <span class="key-analysis-count">${fileAnalysis.length} 個檔案</span>
                </div>
                <div class="key-analysis-content ${this.analysisExpanded ? 'expanded' : 'collapsed'}">
                    <div class="key-file-list">
                        ${listHtml}
                    </div>
                    ${paginationHtml}
                </div>
            </div>
        `;
    }

    bindContentEvents() {
        // 目標調性選擇
        const targetKeySelect = this.element.querySelector('.target-key-select');
        if (targetKeySelect) {
            targetKeySelect.addEventListener('change', (e) => {
                this.data.targetKey = e.target.value || null;
                this.updateSemitones();
                this.updateContent();
            });
        }

        // 套用按鈕
        const applyBtn = this.element.querySelector('.key-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyKeyIntegration();
            });
        }

        // 分析區域展開/收合
        const toggleBtn = this.element.querySelector('[data-action="toggle-analysis"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.analysisExpanded = !this.analysisExpanded;
                this.updateContent();
            });
        }

        // 分頁按鈕
        const prevBtn = this.element.querySelector('[data-action="analysis-prev"]');
        const nextBtn = this.element.querySelector('[data-action="analysis-next"]');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.analysisCurrentPage > 0) {
                    this.analysisCurrentPage--;
                    this.updateContent();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil((this.data.fileAnalysis || []).length / this.analysisPerPage);
                if (this.analysisCurrentPage < totalPages - 1) {
                    this.analysisCurrentPage++;
                    this.updateContent();
                }
            });
        }
    }

    /**
     * 當輸入音訊變更時，自動分析所有檔案
     */
    async updateInputAudio(audioBuffer, audioFiles, filenames) {
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
            this.updateContent();
            return;
        }

        // 開始分析
        await this.analyzeAllFiles();
    }

    /**
     * 分析所有檔案的音高（僅分析音高以加速）
     */
    async analyzeAllFiles() {
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

                // 僅進行音高分析（快速分析）
                const pitchResult = await this.analyzePitchOnly(buffer);

                this.data.fileAnalysis.push({
                    filename: filename,
                    detectedKey: pitchResult,
                    semitones: null // 稍後根據目標調性計算
                });

                // 更新進度
                this.data.analysisProgress = ((i + 1) / totalFiles) * 100;
                this.updateProgressUI();
            }

            // 如果已設定目標調性，計算半音數
            if (this.data.targetKey) {
                this.updateSemitones();
            }

        } catch (error) {
            console.error('批量音高分析失敗:', error);
        }

        this.isAnalyzing = false;
        this.data.isAnalyzing = false;
        this.data.analysisProgress = 100;
        this.updateContent();
    }

    /**
     * 僅分析音高（簡化版，不做完整頻譜分析）
     */
    async analyzePitchOnly(audioBuffer) {
        if (!audioBuffer) return null;

        try {
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);

            // 使用較大的窗口和 hop 來加速分析
            const windowSize = Math.floor(0.1 * sampleRate);
            const hopSize = Math.floor(0.1 * sampleRate); // 不重疊，更快

            const totalHops = Math.ceil((channelData.length - windowSize) / hopSize) + 1;
            const pitchCurve = [];

            for (let hopIndex = 0; hopIndex < totalHops; hopIndex++) {
                const windowStart = hopIndex * hopSize;
                const windowEnd = Math.min(windowStart + windowSize, channelData.length);

                if (windowEnd - windowStart < windowSize / 2) break;

                const windowSamples = channelData.slice(windowStart, windowEnd);
                const pitchResult = this.detectPitchYIN(windowSamples, sampleRate);

                pitchCurve.push({
                    frequency: pitchResult.frequency,
                    confidence: pitchResult.confidence
                });

                // 每 5 個讓出控制權
                if (hopIndex % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // 使用眾數法找出主要音高
            return this.detectDominantPitch(pitchCurve);

        } catch (error) {
            console.error('音高分析失敗:', error);
            return null;
        }
    }

    /**
     * YIN 音高偵測算法（簡化版）
     */
    detectPitchYIN(audioData, sampleRate) {
        if (!audioData || audioData.length === 0) {
            return { frequency: 0, confidence: 0 };
        }

        const THRESHOLD = 0.15;
        const MIN_FREQUENCY = 80;
        const MAX_FREQUENCY = 1000;
        const MAX_LAG = Math.floor(sampleRate / MIN_FREQUENCY);
        const MIN_LAG = Math.floor(sampleRate / MAX_FREQUENCY);
        const FRAME_LENGTH = audioData.length;

        if (MIN_LAG < 1 || MAX_LAG > FRAME_LENGTH) {
            return { frequency: 0, confidence: 0 };
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
            return { frequency: 0, confidence: 0 };
        }

        const confidence = Math.max(0, Math.min(1, 1 - minCmndf));
        return { frequency, confidence };
    }

    /**
     * 眾數法偵測主要音高
     */
    detectDominantPitch(pitchCurve) {
        if (!pitchCurve || pitchCurve.length === 0) {
            return null;
        }

        const CONFIDENCE_THRESHOLD = 0.5;
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
        const noteName = this.midiNoteToName(dominantMidiNote);

        return {
            noteName,
            frequency: standardFrequency,
            confidence,
            midiNote: dominantMidiNote
        };
    }

    /**
     * MIDI 音符轉音名
     */
    midiNoteToName(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        return noteNames[noteIndex] + octave;
    }

    /**
     * 更新所有檔案的移調半音數（移調至最近的調內音）
     */
    updateSemitones() {
        if (!this.data.targetKey) {
            this.data.fileAnalysis.forEach(item => {
                item.semitones = null;
                item.targetNote = null;
            });
            return;
        }

        const scaleNotes = KeyIntegrationNode.SCALE_NOTES[this.data.targetKey];
        if (!scaleNotes) {
            return;
        }

        this.data.fileAnalysis.forEach(item => {
            if (!item.detectedKey || !item.detectedKey.noteName) {
                item.semitones = null;
                item.targetNote = null;
                return;
            }

            const detectedNote = item.detectedKey.noteName.replace(/\d+$/, '');
            const detectedIndex = KeyIntegrationNode.NOTE_NAMES.indexOf(detectedNote);

            if (detectedIndex === -1) {
                item.semitones = null;
                item.targetNote = null;
                return;
            }

            // 找到最近的調內音
            let minDistance = Infinity;
            let bestSemitones = 0;
            let bestTargetNote = detectedNote;

            for (const scaleNoteIndex of scaleNotes) {
                // 計算距離（考慮正負方向）
                let distance = scaleNoteIndex - detectedIndex;

                // 選擇最短路徑（-6 到 +6 之間）
                if (distance > 6) distance -= 12;
                if (distance < -6) distance += 12;

                if (Math.abs(distance) < Math.abs(minDistance)) {
                    minDistance = distance;
                    bestSemitones = distance;
                    bestTargetNote = KeyIntegrationNode.NOTE_NAMES[scaleNoteIndex];
                }
            }

            item.semitones = bestSemitones;
            item.targetNote = bestTargetNote;
        });
    }

    /**
     * 更新進度 UI
     */
    updateProgressUI() {
        const progressContainer = this.element.querySelector(`#key-progress-${this.id}`);
        if (progressContainer) {
            const fill = progressContainer.querySelector('.progress-bar-fill');
            const text = progressContainer.querySelector('.progress-text');
            if (fill) fill.style.width = `${this.data.analysisProgress}%`;
            if (text) text.textContent = `分析中... ${Math.round(this.data.analysisProgress)}%`;
        }
    }

    /**
     * 套用調性整合
     */
    async applyKeyIntegration() {
        if (!this.data.targetKey || this.data.fileAnalysis.length === 0) {
            showToast('請先選擇目標調性', 'warning');
            return;
        }

        // 更新半音數
        this.updateSemitones();

        // 觸發預覽更新（會呼叫 process）
        this.schedulePreviewUpdate();

        showToast(`已套用調性整合至 ${this.data.targetKey}`, 'success');
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;

        // 更新輸入音訊（觸發分析）
        if (audioFiles && audioFiles.length > 0) {
            if (this.inputAudioBuffers.length !== audioFiles.length) {
                await this.updateInputAudio(audioBuffer, audioFiles, inputs.filenames);
            }
        } else if (audioBuffer) {
            if (this.inputAudioBuffers.length !== 1) {
                await this.updateInputAudio(audioBuffer, null, null);
            }
        }

        // 如果沒有目標調性或正在分析，返回原始音訊
        if (!this.data.targetKey || this.isAnalyzing) {
            if (audioFiles && audioFiles.length > 0) {
                return {
                    audio: audioFiles[0] || null,
                    audioFiles: audioFiles,
                    filenames: inputs.filenames
                };
            }
            return { audio: audioBuffer || null };
        }

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];

            for (let i = 0; i < audioFiles.length; i++) {
                const buffer = audioFiles[i];
                const analysis = this.data.fileAnalysis[i];

                if (!buffer) {
                    processedFiles.push(null);
                    continue;
                }

                // 取得該檔案需要移調的半音數
                const semitones = analysis?.semitones || 0;

                if (semitones === 0) {
                    processedFiles.push(buffer);
                } else {
                    // 使用 audioProcessor 進行音高調整
                    const processed = audioProcessor.changePitch(buffer, semitones);
                    processedFiles.push(processed);
                }
            }

            return {
                audio: processedFiles[0] || null,
                audioFiles: processedFiles,
                filenames: inputs.filenames
            };
        }

        // 單檔案處理
        if (!audioBuffer) return { audio: null };

        const analysis = this.data.fileAnalysis[0];
        const semitones = analysis?.semitones || 0;

        if (semitones === 0) {
            return { audio: audioBuffer };
        }

        const processed = audioProcessor.changePitch(audioBuffer, semitones);
        return { audio: processed };
    }
}

window.KeyIntegrationNode = KeyIntegrationNode;
