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
            const contentArea = this.element.querySelector('.node-content-area');
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

    async process(inputs) {
        // 輸入節點直接輸出 audioBuffer
        return {
            audio: this.audioBuffer
        };
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
