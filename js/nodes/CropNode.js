/**
 * 裁切節點
 */

class CropNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            start: options.start || 0,
            end: options.end || 10,
            duration: options.duration || 10
        };
        super(id, 'crop', '裁切', '✂️', options, defaultData);

        this.wavesurfer = null;
        this.inputAudioBuffer = null;
        this.isDragging = null; // 'start', 'end', 'region' or null
        this.dragStartX = 0;
        this.dragStartValue = 0;
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const start = this.data.start || 0;
        const end = this.data.end || this.data.duration || 10;
        const duration = this.data.duration || 10;
        const cropLength = Math.max(0, end - start);

        return `
      <div class="crop-waveform-container">
        <div class="crop-waveform" id="crop-waveform-${this.id}"></div>
        <div class="crop-region-overlay">
          <div class="crop-region" id="crop-region-${this.id}">
            <div class="crop-handle crop-handle-start" data-handle="start"></div>
            <div class="crop-handle crop-handle-end" data-handle="end"></div>
          </div>
        </div>
        <div class="crop-no-input" id="crop-no-input-${this.id}">
          <span>等待音訊輸入...</span>
        </div>
      </div>
      <div class="crop-time-display">
        <span class="crop-time-start">${formatTime(start)}</span>
        <span class="crop-time-length">長度: ${formatTime(cropLength)}</span>
        <span class="crop-time-end">${formatTime(end)}</span>
      </div>
    `;
    }

    bindContentEvents() {
        // 拖動事件綁定
        const region = this.element.querySelector(`#crop-region-${this.id}`);
        const startHandle = this.element.querySelector('.crop-handle-start');
        const endHandle = this.element.querySelector('.crop-handle-end');

        if (startHandle) {
            startHandle.addEventListener('mousedown', (e) => this.startDrag(e, 'start'));
        }
        if (endHandle) {
            endHandle.addEventListener('mousedown', (e) => this.startDrag(e, 'end'));
        }
        if (region) {
            region.addEventListener('mousedown', (e) => {
                if (e.target === region) {
                    this.startDrag(e, 'region');
                }
            });
        }

        // 全局滑鼠事件
        this.onMouseMove = (e) => this.handleDrag(e);
        this.onMouseUp = () => this.endDrag();
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    startDrag(e, type) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = type;
        this.dragStartX = e.clientX;

        if (type === 'start') {
            this.dragStartValue = this.data.start;
        } else if (type === 'end') {
            this.dragStartValue = this.data.end;
        } else if (type === 'region') {
            this.dragStartValue = { start: this.data.start, end: this.data.end };
        }
    }

    handleDrag(e) {
        if (!this.isDragging) return;

        const container = this.element.querySelector('.crop-waveform-container');
        if (!container) return;

        const containerWidth = container.offsetWidth;
        const deltaX = e.clientX - this.dragStartX;
        const deltaTime = (deltaX / containerWidth) * this.data.duration;

        if (this.isDragging === 'start') {
            let newStart = Math.max(0, this.dragStartValue + deltaTime);
            newStart = Math.min(newStart, this.data.end - 0.1);
            this.data.start = Math.round(newStart * 100) / 100;
        } else if (this.isDragging === 'end') {
            let newEnd = Math.min(this.data.duration, this.dragStartValue + deltaTime);
            newEnd = Math.max(newEnd, this.data.start + 0.1);
            this.data.end = Math.round(newEnd * 100) / 100;
        } else if (this.isDragging === 'region') {
            const regionLength = this.dragStartValue.end - this.dragStartValue.start;
            let newStart = this.dragStartValue.start + deltaTime;
            let newEnd = this.dragStartValue.end + deltaTime;

            if (newStart < 0) {
                newStart = 0;
                newEnd = regionLength;
            }
            if (newEnd > this.data.duration) {
                newEnd = this.data.duration;
                newStart = this.data.duration - regionLength;
            }

            this.data.start = Math.round(newStart * 100) / 100;
            this.data.end = Math.round(newEnd * 100) / 100;
        }

        this.updateRegionDisplay();
    }

    endDrag() {
        if (this.isDragging) {
            this.isDragging = null;
            this.schedulePreviewUpdate();

            if (this.onDataChange) {
                this.onDataChange('crop', { start: this.data.start, end: this.data.end });
            }
        }
    }

    updateRegionDisplay() {
        const region = this.element.querySelector(`#crop-region-${this.id}`);
        const startDisplay = this.element.querySelector('.crop-time-start');
        const endDisplay = this.element.querySelector('.crop-time-end');
        const lengthDisplay = this.element.querySelector('.crop-time-length');

        if (region && this.data.duration > 0) {
            const startPercent = (this.data.start / this.data.duration) * 100;
            const endPercent = (this.data.end / this.data.duration) * 100;
            region.style.left = startPercent + '%';
            region.style.width = (endPercent - startPercent) + '%';
        }

        if (startDisplay) startDisplay.textContent = formatTime(this.data.start);
        if (endDisplay) endDisplay.textContent = formatTime(this.data.end);
        if (lengthDisplay) lengthDisplay.textContent = '長度: ' + formatTime(this.data.end - this.data.start);
    }

    /**
     * 當輸入音訊變更時更新波形
     */
    async updateInputAudio(audioBuffer) {
        if (!audioBuffer) {
            this.inputAudioBuffer = null;
            this.showNoInput(true);
            return;
        }

        this.inputAudioBuffer = audioBuffer;
        this.data.duration = audioBuffer.duration;

        // 調整結束時間
        if (this.data.end > audioBuffer.duration) {
            this.data.end = audioBuffer.duration;
        }
        if (this.data.start >= this.data.end) {
            this.data.start = 0;
        }

        this.showNoInput(false);
        await this.initWaveSurfer();
        this.updateRegionDisplay();
    }

    showNoInput(show) {
        const noInput = this.element.querySelector(`#crop-no-input-${this.id}`);
        const waveform = this.element.querySelector(`#crop-waveform-${this.id}`);
        const overlay = this.element.querySelector('.crop-region-overlay');

        if (noInput) noInput.style.display = show ? 'flex' : 'none';
        if (waveform) waveform.style.display = show ? 'none' : 'block';
        if (overlay) overlay.style.display = show ? 'none' : 'block';
    }

    async initWaveSurfer() {
        const container = this.element.querySelector(`#crop-waveform-${this.id}`);
        if (!container || !this.inputAudioBuffer) return;

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
            this.wavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(217 28% 50% / 0.6)',
                progressColor: 'hsl(217 28% 50%)',
                cursorColor: 'transparent',
                height: 50,
                barWidth: 2,
                barGap: 1,
                responsive: true,
                normalize: true,
                interact: false
            });

            const wavData = audioBufferToWav(this.inputAudioBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            await this.wavesurfer.loadBlob(blob);

        } catch (error) {
            console.error('CropNode WaveSurfer 載入失敗:', error);
        }
    }

    destroy() {
        // 移除全局事件監聽
        if (this.onMouseMove) {
            document.removeEventListener('mousemove', this.onMouseMove);
        }
        if (this.onMouseUp) {
            document.removeEventListener('mouseup', this.onMouseUp);
        }

        // 銷毀 wavesurfer
        if (this.wavesurfer) {
            try {
                this.wavesurfer.destroy();
            } catch (e) { }
            this.wavesurfer = null;
        }

        super.destroy();
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];
            for (const buffer of audioFiles) {
                if (buffer) {
                    // 更新結束時間為音訊長度（如果超過）
                    const end = Math.min(this.data.end, buffer.duration);
                    const settings = {
                        volume: 1.0,
                        crop: {
                            enabled: true,
                            start: this.data.start,
                            end: end
                        },
                        fadeIn: { enabled: false },
                        fadeOut: { enabled: false },
                        playbackRate: 1.0
                    };
                    processedFiles.push(audioProcessor.processAudio(buffer, settings));
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

        // 更新結束時間為音訊長度（如果超過）
        if (this.data.end > audioBuffer.duration) {
            this.data.end = audioBuffer.duration;
        }

        const settings = {
            volume: 1.0,
            crop: {
                enabled: true,
                start: this.data.start,
                end: Math.min(this.data.end, audioBuffer.duration)
            },
            fadeIn: { enabled: false },
            fadeOut: { enabled: false },
            playbackRate: 1.0
        };

        const processed = audioProcessor.processAudio(audioBuffer, settings);
        return { audio: processed };
    }
}

window.CropNode = CropNode;
