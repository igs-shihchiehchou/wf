/**
 * 音訊輸入節點 - 載入音訊檔案
 */

class AudioInputNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            filename: options.filename || ''
        };
        super(id, 'audio-input', '音訊輸入', '📁', options, defaultData);

        // 音訊資料
        this.audioBuffer = null;
        this.filename = defaultData.filename;
        this.wavesurfer = null;

        // 音訊分析結果存儲
        this.analysisResult = null;
        this.progressBar = null;
    }

    setupPorts() {
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'input';
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
        if (this.audioBuffer) {
            const duration = this.audioBuffer ? formatTime(this.audioBuffer.duration) : '00:00';
            const displayName = this.formatFilename(this.filename, 20);
            return `
        <div class="node-file-info">
          <span class="node-file-icon">📄</span>
          <span class="node-file-name" title="${this.filename}">${displayName}</span>
        </div>
        <div class="node-waveform" id="waveform-${this.id}"></div>
        <div class="node-playback">
          <button class="node-play-btn" data-action="play">▶</button>
          <span class="node-time">
            <span class="current-time">00:00</span> / <span class="total-time">${duration}</span>
          </span>
          <button class="node-download-btn" data-action="download" title="下載">⬇</button>
        </div>
        <button class="node-btn" data-action="change">更換檔案</button>
      `;
        }

        return `
      <button class="node-btn node-btn-primary" data-action="select">選擇音訊檔案</button>
      <div class="node-drop-hint" style="text-align: center; color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--spacing-2);">
        或拖拉檔案至此
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

        // 播放按鈕
        const playBtn = this.element.querySelector('[data-action="play"]');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlay());
        }

        // 下載按鈕
        const downloadBtn = this.element.querySelector('[data-action="download"]');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadAudio());
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

            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                this.loadFile(file);
            }
        });

        // 初始化波形
        if (this.audioBuffer) {
            // 延遲初始化以確保 DOM 已更新
            requestAnimationFrame(() => {
                this.initWaveSurfer();
            });
        }
    }

    openFileDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadFile(file);
            }
        };
        input.click();
    }

    async loadFile(file) {
        try {
            this.setProcessing(true);

            // 使用現有的 audioProcessor 載入
            this.audioBuffer = await audioProcessor.loadAudioFromFile(file);
            this.filename = file.name;

            // 更新 UI
            this.updateContent();

            // 延遲初始化波形以確保 DOM 已更新
            await new Promise(resolve => setTimeout(resolve, 50));
            await this.initWaveSurfer();

            this.setProcessing(false);

            // 觸發資料變更
            if (this.onDataChange) {
                this.onDataChange('audioBuffer', this.audioBuffer);
            }

            showToast(`已載入: ${this.filename}`, 'success');

            // 非阻塞式音訊分析 - 在後台開始分析，不等待完成
            // 這樣可以讓 UI 和波形立即顯示，同時進行分析
            this.analyzeAudio(this.audioBuffer).catch(error => {
                console.warn('音訊分析非阻塞調用失敗:', error);
                // 分析失敗不應該影響整體流程，所以只記錄警告
            });

        } catch (error) {
            this.setProcessing(false);
            showToast(`載入失敗: ${error.message}`, 'error');
            console.error('載入音訊失敗:', error);
        }
    }

    async initWaveSurfer() {
        const container = this.element.querySelector(`#waveform-${this.id}`);
        if (!container || !this.audioBuffer) return;

        // 銷毀舊的 wavesurfer
        if (this.wavesurfer) {
            try {
                this.wavesurfer.destroy();
            } catch (e) {
                console.warn('銷毀 WaveSurfer 時發生錯誤:', e);
            }
            this.wavesurfer = null;
        }

        try {
            // 建立新的 wavesurfer
            this.wavesurfer = WaveSurfer.create({
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
            const wavData = audioBufferToWav(this.audioBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            // 使用 loadBlob 而不是 load 避免 CORS 問題
            await this.wavesurfer.loadBlob(blob);
            URL.revokeObjectURL(url);

            // 更新時間顯示
            this.wavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector('.current-time');
                if (timeEl) {
                    timeEl.textContent = formatTime(currentTime);
                }
            });

            this.wavesurfer.on('play', () => {
                const btn = this.element.querySelector('[data-action="play"]');
                if (btn) btn.textContent = '⏸';
            });

            this.wavesurfer.on('pause', () => {
                const btn = this.element.querySelector('[data-action="play"]');
                if (btn) btn.textContent = '▶';
            });

            this.wavesurfer.on('finish', () => {
                const btn = this.element.querySelector('[data-action="play"]');
                if (btn) btn.textContent = '▶';
            });

        } catch (error) {
            console.error('WaveSurfer 載入失敗:', error);
        }
    }

    togglePlay() {
        if (this.wavesurfer) {
            this.wavesurfer.playPause();
        }
    }

    downloadAudio() {
        if (!this.audioBuffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(this.audioBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            const baseName = this.filename.replace(/\.[^.]+$/, '');
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
     * 分析音訊檔案的各項特性
     *
     * 該方法執行以下操作：
     * 1. 檢查音訊分析器是否可用
     * 2. 在節點內容中創建進度條組件
     * 3. 調用 audioAnalyzer.analyze() 進行分析，並通過回調報告進度
     * 4. 在進度條中實時更新分析進度和狀態消息
     * 5. 分析完成後移除進度條並存儲分析結果
     * 6. 錯誤時顯示警告吐司，但不阻止整體流程
     *
     * @param {AudioBuffer} audioBuffer - 要分析的音訊緩衝區
     * @returns {Promise<void>}
     * @private
     */
    async analyzeAudio(audioBuffer) {
        try {
            // 檢查音訊分析器是否可用
            if (!window.audioAnalyzer) {
                console.warn('音訊分析器不可用，跳過分析');
                return;
            }

            // 檢查 ProgressBar 組件是否可用
            if (!window.ProgressBar) {
                console.warn('ProgressBar 組件不可用，跳過進度顯示');
                return;
            }

            // 檢查音訊緩衝區有效性
            if (!audioBuffer) {
                console.warn('音訊緩衝區無效，無法進行分析');
                return;
            }

            // 獲取節點內容容器（用於顯示進度條）
            const contentArea = this.element.querySelector('.node-content');
            if (!contentArea) {
                console.warn('節點內容區域不存在，無法顯示進度條');
                return;
            }

            // 創建進度條組件並插入到節點內容區域
            // 進度條會顯示在波形下方，提供實時的分析進度反饋
            this.progressBar = new window.ProgressBar(contentArea);

            // 開始分析，並通過進度回調實時更新進度條
            // onProgress 簽名：(progress: 0-100, message: string) => void
            this.analysisResult = await window.audioAnalyzer.analyze(
                audioBuffer,
                (progress, message) => {
                    // 更新進度條填充百分比和狀態消息
                    if (this.progressBar) {
                        this.progressBar.update(progress, message);
                    }
                }
            );

            // 分析完成：移除進度條
            if (this.progressBar) {
                this.progressBar.remove();
                this.progressBar = null;
            }

            // 記錄分析完成
            console.log('音訊分析完成:', this.analysisResult);

            // 顯示分析結果面板
            this.showAnalysisResult();

            // 顯示分析完成提示（可選，取決於設計需求）
            // showToast('音訊分析完成', 'success');

        } catch (error) {
            // 錯誤處理：不阻止整體流程，只顯示警告
            console.error('音訊分析發生錯誤:', error);

            // 移除進度條（如果還存在）
            if (this.progressBar) {
                this.progressBar.remove();
                this.progressBar = null;
            }

            // 顯示警告吐司讓用戶知道分析失敗
            showToast(`音訊分析失敗: ${error.message}`, 'warning');

            // 注意：不重新拋出錯誤，允許整體流程繼續進行
            // 這確保了分析失敗不會影響音訊文件的加載和波形顯示
        }
    }

    /**
     * 顯示音訊分析結果面板
     *
     * 在節點內容區域中創建並顯示分析結果，包括：
     * 1. 基本資訊區（duration, sample rate, channels）
     * 2. 頻譜分析區（low/mid/high 頻率分布，dominant frequency）
     * 3. 音高分析區（average pitch, range, isPitched 標記）
     *
     * 所有區塊都支持展開/收合功能
     *
     * @private
     */
    showAnalysisResult() {
        // 檢查分析結果是否存在
        if (!this.analysisResult) {
            console.warn('沒有可用的分析結果');
            return;
        }

        // 獲取節點內容容器
        const contentArea = this.element.querySelector('.node-content');
        if (!contentArea) {
            console.warn('找不到節點內容區域');
            return;
        }

        // 檢查是否已經存在分析面板，如果存在則移除舊的
        const existingPanel = contentArea.querySelector('.analysis-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        // 創建分析面板容器
        const panelDiv = document.createElement('div');
        panelDiv.className = 'analysis-panel';

        // 構建分析面板 HTML
        panelDiv.innerHTML = this.buildAnalysisPanelHTML();

        // 將面板插入到節點內容區域（在波形下方）
        contentArea.appendChild(panelDiv);

        // 綁定展開/收合事件
        this.bindAnalysisPanelEvents(panelDiv);
    }

    /**
     * 從 localStorage 載入收合狀態
     *
     * @param {string} sectionName - 區段名稱（basic, frequency, pitch）
     * @param {boolean} defaultCollapsed - 預設是否收合
     * @returns {boolean} 是否收合
     * @private
     */
    getSectionCollapseState(sectionName, defaultCollapsed = false) {
        try {
            const key = `analysis_${sectionName}_collapsed`;
            const saved = localStorage.getItem(key);
            if (saved !== null) {
                return saved === 'true';
            }
            return defaultCollapsed;
        } catch (error) {
            console.warn('無法讀取收合狀態:', error);
            return defaultCollapsed;
        }
    }

    /**
     * 儲存收合狀態到 localStorage
     *
     * @param {string} sectionName - 區段名稱（basic, frequency, pitch）
     * @param {boolean} isCollapsed - 是否收合
     * @private
     */
    saveSectionCollapseState(sectionName, isCollapsed) {
        try {
            const key = `analysis_${sectionName}_collapsed`;
            localStorage.setItem(key, isCollapsed.toString());
        } catch (error) {
            console.warn('無法儲存收合狀態:', error);
        }
    }

    /**
     * 構建分析面板 HTML 字串
     *
     * @returns {string} 分析面板的 HTML 內容
     * @private
     */
    buildAnalysisPanelHTML() {
        const { basicInfo, frequency, pitch } = this.analysisResult;

        let html = '';

        // === 1. 基本資訊區 ===
        if (basicInfo) {
            const isCollapsed = this.getSectionCollapseState('basic', false);
            const icon = isCollapsed ? '▶' : '▼';
            const display = isCollapsed ? 'none' : 'block';
            const collapsedClass = isCollapsed ? ' analysis-section-collapsed' : '';

            html += `
        <div class="analysis-section${collapsedClass}" data-section="basic">
          <div class="analysis-section-header">
            <span class="analysis-section-icon">${icon}</span>
            <span class="analysis-section-title">基本資訊</span>
          </div>
          <div class="analysis-section-content" style="display: ${display};">
            <div class="analysis-info-row">
              <span class="analysis-info-label">時長:</span>
              <span class="analysis-info-value">${basicInfo.duration}</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">取樣率:</span>
              <span class="analysis-info-value">${basicInfo.sampleRate}</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">聲道:</span>
              <span class="analysis-info-value">${basicInfo.channelMode}</span>
            </div>
          </div>
        </div>
      `;
        }

        // === 2. 頻譜分析區 ===
        if (frequency) {
            // 頻率範圍解讀（用於遊戲音效分析）
            const dominantFreq = frequency.dominantFrequency;
            let freqInterpretation = '';
            if (dominantFreq < 200) {
                freqInterpretation = '低頻為主（爆炸、隆隆聲）';
            } else if (dominantFreq < 2000) {
                freqInterpretation = '中頻為主（人聲、旋律）';
            } else if (dominantFreq < 6000) {
                freqInterpretation = '中高頻為主（金屬、碰撞）';
            } else {
                freqInterpretation = '高頻為主（尖銳、明亮）';
            }

            const isCollapsed = this.getSectionCollapseState('frequency', true);
            const icon = isCollapsed ? '▶' : '▼';
            const display = isCollapsed ? 'none' : 'block';
            const collapsedClass = isCollapsed ? ' analysis-section-collapsed' : '';

            html += `
        <div class="analysis-section${collapsedClass}" data-section="frequency">
          <div class="analysis-section-header">
            <span class="analysis-section-icon">${icon}</span>
            <span class="analysis-section-title">頻譜分析</span>
          </div>
          <div class="analysis-section-content" style="display: ${display};">
            <!-- 頻率分布視覺化 -->
            <div class="frequency-bars">
              <div class="frequency-bar">
                <div class="frequency-bar-label">低頻</div>
                <div class="frequency-bar-container">
                  <div class="frequency-bar-fill" style="width: ${(frequency.spectrum.low * 100).toFixed(1)}%"></div>
                </div>
                <div class="frequency-bar-value">${(frequency.spectrum.low * 100).toFixed(1)}%</div>
              </div>
              <div class="frequency-bar">
                <div class="frequency-bar-label">中頻</div>
                <div class="frequency-bar-container">
                  <div class="frequency-bar-fill" style="width: ${(frequency.spectrum.mid * 100).toFixed(1)}%"></div>
                </div>
                <div class="frequency-bar-value">${(frequency.spectrum.mid * 100).toFixed(1)}%</div>
              </div>
              <div class="frequency-bar">
                <div class="frequency-bar-label">高頻</div>
                <div class="frequency-bar-container">
                  <div class="frequency-bar-fill" style="width: ${(frequency.spectrum.high * 100).toFixed(1)}%"></div>
                </div>
                <div class="frequency-bar-value">${(frequency.spectrum.high * 100).toFixed(1)}%</div>
              </div>
            </div>

            <!-- 主要頻率 -->
            <div class="analysis-info-row">
              <span class="analysis-info-label">主要頻率:</span>
              <span class="analysis-info-value">${dominantFreq.toFixed(1)} Hz</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">音色特徵:</span>
              <span class="analysis-info-value">${freqInterpretation}</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">頻譜重心:</span>
              <span class="analysis-info-value">${frequency.spectralCentroid.toFixed(1)} Hz</span>
            </div>
          </div>
        </div>
      `;
        }

        // === 3. 音高分析區 (默認收合) ===
        if (pitch) {
            const pitchedText = pitch.isPitched ? '是（有明確音高）' : '否（噪音或無明確音高）';
            let avgPitchText = '無';
            if (pitch.averagePitch > 0) {
                const noteName = frequencyToNoteName(pitch.averagePitch);
                avgPitchText = noteName
                    ? `${pitch.averagePitch.toFixed(1)} Hz (${noteName})`
                    : `${pitch.averagePitch.toFixed(1)} Hz`;
            }
            
            // 格式化音高範圍，包含音符名稱
            let pitchRangeText = '無';
            if (pitch.pitchRange.min > 0 && pitch.pitchRange.max > 0) {
                const minNote = frequencyToNoteName(pitch.pitchRange.min);
                const maxNote = frequencyToNoteName(pitch.pitchRange.max);
                const minStr = minNote 
                    ? `${pitch.pitchRange.min.toFixed(1)} Hz (${minNote})`
                    : `${pitch.pitchRange.min.toFixed(1)} Hz`;
                const maxStr = maxNote
                    ? `${pitch.pitchRange.max.toFixed(1)} Hz (${maxNote})`
                    : `${pitch.pitchRange.max.toFixed(1)} Hz`;
                pitchRangeText = `${minStr} ~ ${maxStr}`;
            }

            // 檢查頻譜圖數據是否存在
            const hasSpectrogram = pitch.spectrogram && pitch.spectrogram.data && pitch.spectrogram.data.length > 0;

            // 音高分析區預設收合（不讀取 localStorage，強制使用預設值）
            const isCollapsed = true;
            const icon = '▶';
            const display = 'none';
            const collapsedClass = isCollapsed ? ' analysis-section-collapsed' : '';

            html += `
        <div class="analysis-section${collapsedClass}" data-section="pitch">
          <div class="analysis-section-header">
            <span class="analysis-section-icon">${icon}</span>
            <span class="analysis-section-title">音高分析</span>
          </div>
          <div class="analysis-section-content" style="display: ${display};">
            <div class="analysis-info-row">
              <span class="analysis-info-label">是否為音調性聲音:</span>
              <span class="analysis-info-value">${pitchedText}</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">平均音高:</span>
              <span class="analysis-info-value">${avgPitchText}</span>
            </div>
            <div class="analysis-info-row">
              <span class="analysis-info-label">音高範圍:</span>
              <span class="analysis-info-value">${pitchRangeText}</span>
            </div>

            <!-- 頻譜圖視覺化 -->
            ${hasSpectrogram ? `
            <div class="spectrogram-container spectrogram-clickable" data-action="open-spectrogram-modal">
              <div class="spectrogram-header">
                <span class="spectrogram-title">頻譜圖</span>
                <span class="spectrogram-expand-hint">🔍 點擊放大</span>
              </div>
              <canvas class="spectrogram-canvas" id="spectrogram-${this.id}"></canvas>
            </div>
            ` : `
            <div class="spectrogram-error">
              <span class="analysis-info-label">頻譜圖:</span>
              <span class="analysis-info-value">無法生成頻譜圖</span>
            </div>
            `}
          </div>
        </div>
      `;
        }

        return html;
    }

    /**
     * 綁定分析面板的展開/收合事件
     *
     * @param {HTMLElement} panelDiv - 分析面板容器元素
     * @private
     */
    bindAnalysisPanelEvents(panelDiv) {
        // 綁定頻譜圖點擊放大事件
        const spectrogramContainer = panelDiv.querySelector('[data-action="open-spectrogram-modal"]');
        if (spectrogramContainer) {
            spectrogramContainer.addEventListener('click', (e) => {
                // 防止事件冒泡到 section header
                e.stopPropagation();
                this.openSpectrogramModal();
            });
        }

        // 找到所有的區段標題
        const headers = panelDiv.querySelectorAll('.analysis-section-header');

        headers.forEach(header => {
            header.addEventListener('click', () => {
                // 獲取父級 section
                const section = header.closest('.analysis-section');
                const content = section.querySelector('.analysis-section-content');
                const icon = header.querySelector('.analysis-section-icon');
                const sectionType = section.getAttribute('data-section');

                // 切換展開/收合狀態
                const isCollapsed = section.classList.toggle('analysis-section-collapsed');

                if (isCollapsed) {
                    // 收合
                    content.style.display = 'none';
                    icon.textContent = '▶';
                } else {
                    // 展開
                    content.style.display = 'block';
                    icon.textContent = '▼';

                    // 等待下一幀以確保容器已完成佈局後再渲染頻譜圖
                    requestAnimationFrame(() => {
                        if (sectionType === 'pitch') {
                            this.renderSpectrogramIfNeeded();
                        }
                    });
                }

                // 儲存收合狀態到 localStorage
                this.saveSectionCollapseState(sectionType, isCollapsed);
            });
        });
    }

    /**
     * 在音高分析區展開時渲染頻譜圖（僅渲染一次）
     *
     * @private
     */
    renderSpectrogramIfNeeded() {
        // 檢查分析結果中是否包含頻譜圖數據
        if (!this.analysisResult || !this.analysisResult.pitch || !this.analysisResult.pitch.spectrogram) {
            return;
        }

        const spectrogramData = this.analysisResult.pitch.spectrogram;

        // 檢查頻譜圖數據是否有效
        if (!spectrogramData.data || spectrogramData.data.length === 0) {
            return;
        }

        // 獲取 canvas 元素
        const canvas = this.element.querySelector(`#spectrogram-${this.id}`);
        if (!canvas) {
            return;
        }

        // 檢查 SpectrogramRenderer 是否可用
        if (!window.SpectrogramRenderer) {
            console.warn('SpectrogramRenderer 不可用，無法渲染頻譜圖');
            return;
        }

        try {
            // 獲取容器的實際尺寸
            const container = canvas.parentElement;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;

            // SpectrogramRenderer 會添加邊距：
            // marginLeft=50, marginRight=10, marginTop=20, marginBottom=40
            // 總邊距：水平 60px，垂直 60px
            // 因此 canvas 的 canvasWidth/Height 參數需要減去這些邊距
            const marginHorizontal = 60;  // marginLeft + marginRight
            const marginVertical = 60;     // marginTop + marginBottom
            const containerPadding = 16;   // 容器內邊距 (var(--spacing-2) * 2)

            // 計算實際可用於頻譜圖的繪圖區域
            const canvasWidth = Math.max(containerWidth - containerPadding - marginHorizontal, 150);
            const canvasHeight = Math.max(containerHeight - containerPadding - marginVertical, 100);

            // 創建頻譜圖渲染器並渲染
            const renderer = new window.SpectrogramRenderer(canvas);
            renderer.render(spectrogramData, {
                canvasWidth: canvasWidth,
                canvasHeight: canvasHeight
            });

            // 添加互動性（滑鼠懸停顯示時間和頻率）
            renderer.addInteractivity();

            // 儲存渲染器引用以便後續清理（如果需要）
            if (!this.spectrogramRenderers) {
                this.spectrogramRenderers = [];
            }
            this.spectrogramRenderers.push(renderer);

        } catch (error) {
            console.error('渲染頻譜圖時發生錯誤:', error);
        }
    }

    async process(inputs) {
        // 輸入節點直接輸出 audioBuffer
        return {
            audio: this.audioBuffer
        };
    }

    /**
     * 開啟頻譜圖放大 Modal
     *
     * 創建一個全螢幕 Modal 顯示大尺寸的頻譜圖，
     * 保留完整的 hover 互動功能（顯示時間/頻率/強度）。
     *
     * @private
     */
    openSpectrogramModal() {
        // 檢查頻譜圖數據是否存在
        if (!this.analysisResult || !this.analysisResult.pitch || !this.analysisResult.pitch.spectrogram) {
            console.warn('無法開啟頻譜圖 Modal：缺少頻譜圖數據');
            return;
        }

        const spectrogramData = this.analysisResult.pitch.spectrogram;
        const pitch = this.analysisResult.pitch;

        // 檢查 SpectrogramRenderer 是否可用
        if (!window.SpectrogramRenderer) {
            console.warn('SpectrogramRenderer 不可用');
            return;
        }

        // 創建 Modal 背景遮罩
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'spectrogram-modal-overlay';

        // 格式化音高資訊
        let avgPitchText = '無';
        if (pitch.averagePitch > 0) {
            const noteName = typeof frequencyToNoteName === 'function' 
                ? frequencyToNoteName(pitch.averagePitch) 
                : null;
            avgPitchText = noteName
                ? `${pitch.averagePitch.toFixed(1)} Hz (${noteName})`
                : `${pitch.averagePitch.toFixed(1)} Hz`;
        }
        
        // 格式化音高範圍，包含音符名稱
        let pitchRangeText = '無';
        if (pitch.pitchRange.min > 0 && pitch.pitchRange.max > 0) {
            const minNote = typeof frequencyToNoteName === 'function'
                ? frequencyToNoteName(pitch.pitchRange.min)
                : null;
            const maxNote = typeof frequencyToNoteName === 'function'
                ? frequencyToNoteName(pitch.pitchRange.max)
                : null;
            const minStr = minNote 
                ? `${pitch.pitchRange.min.toFixed(1)} Hz (${minNote})`
                : `${pitch.pitchRange.min.toFixed(1)} Hz`;
            const maxStr = maxNote
                ? `${pitch.pitchRange.max.toFixed(1)} Hz (${maxNote})`
                : `${pitch.pitchRange.max.toFixed(1)} Hz`;
            pitchRangeText = `${minStr} ~ ${maxStr}`;
        }

        // Modal 內容
        modalOverlay.innerHTML = `
            <div class="spectrogram-modal">
                <div class="spectrogram-modal-header">
                    <h3 class="spectrogram-modal-title">📊 頻譜圖 - ${this.filename || '音訊檔案'}</h3>
                    <button class="spectrogram-modal-close" aria-label="關閉">&times;</button>
                </div>
                <div class="spectrogram-modal-body">
                    <canvas class="spectrogram-modal-canvas" id="spectrogram-modal-canvas"></canvas>
                </div>
                <div class="spectrogram-modal-footer">
                    <div class="spectrogram-modal-info">
                        <span>平均音高: ${avgPitchText}</span>
                        <span>音高範圍: ${pitchRangeText}</span>
                        <span>類型: ${pitch.isPitched ? '音調性聲音' : '噪音類'}</span>
                    </div>
                    <div class="spectrogram-modal-hint">💡 將滑鼠移到頻譜圖上查看詳細資訊</div>
                </div>
            </div>
        `;

        // 添加到 body
        document.body.appendChild(modalOverlay);

        // 獲取 Modal 內的 canvas
        const modalCanvas = modalOverlay.querySelector('#spectrogram-modal-canvas');
        const modalBody = modalOverlay.querySelector('.spectrogram-modal-body');

        // 計算 Modal 內的 canvas 尺寸（留出邊距）
        // 使用 setTimeout 確保 DOM 已完全渲染並有正確的尺寸
        setTimeout(() => {
            const bodyRect = modalBody.getBoundingClientRect();
            
            // 調試日誌
            console.log('Modal body rect:', bodyRect.width, 'x', bodyRect.height);
            
            // SpectrogramRenderer 的邊距
            const marginHorizontal = 60;  // marginLeft(50) + marginRight(10)
            const marginVertical = 60;    // marginTop(20) + marginBottom(40)
            const padding = 32;           // Modal body 的內邊距 (16px * 2)

            // 計算可用於頻譜圖繪圖區域的尺寸
            const canvasWidth = Math.max(bodyRect.width - padding - marginHorizontal, 400);
            const canvasHeight = Math.max(bodyRect.height - padding - marginVertical, 300);
            
            console.log('Calculated canvas size:', canvasWidth, 'x', canvasHeight);
            console.log('Spectrogram data:', spectrogramData);

            // 創建並渲染頻譜圖
            const modalRenderer = new window.SpectrogramRenderer(modalCanvas);
            modalRenderer.render(spectrogramData, {
                canvasWidth: canvasWidth,
                canvasHeight: canvasHeight
            });

            // 添加互動功能
            modalRenderer.addInteractivity();

            // 保存渲染器引用以便清理
            modalOverlay._spectrogramRenderer = modalRenderer;
        }, 50);  // 50ms 延遲確保 CSS 動畫開始後 DOM 尺寸正確

        // 關閉 Modal 的事件處理
        const closeModal = () => {
            // 清理頻譜圖渲染器的互動功能
            if (modalOverlay._spectrogramRenderer) {
                modalOverlay._spectrogramRenderer.removeInteractivity();
            }
            modalOverlay.remove();
        };

        // 點擊關閉按鈕
        const closeBtn = modalOverlay.querySelector('.spectrogram-modal-close');
        closeBtn.addEventListener('click', closeModal);

        // 點擊背景遮罩關閉
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });

        // ESC 鍵關閉
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    toJSON() {
        const json = super.toJSON();
        json.filename = this.filename;
        // 注意：audioBuffer 不序列化，需要重新載入
        return json;
    }
}

// 匯出
window.AudioInputNode = AudioInputNode;
