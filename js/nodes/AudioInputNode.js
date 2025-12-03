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
