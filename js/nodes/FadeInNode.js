/**
 * 淡入節點
 */
class FadeInNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            duration: options.duration || 1.0,
            audioDuration: options.audioDuration || 10
        };
        super(id, 'fade-in', '淡入', '📈', options, defaultData);

        this.wavesurfer = null;
        this.inputAudioBuffer = null;
        this.isDragging = false;
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
        const duration = this.data.duration || 1.0;

        return `
      <div class="fade-waveform-container">
        <div class="fade-waveform" id="fadein-waveform-${this.id}"></div>
        <div class="fade-region-overlay">
          <div class="fade-region fade-region-in" id="fadein-region-${this.id}">
            <div class="fade-handle fade-handle-end" data-handle="end"></div>
            <div class="fade-gradient fade-gradient-in"></div>
          </div>
        </div>
        <div class="fade-no-input" id="fadein-no-input-${this.id}">
          <span>等待音訊輸入...</span>
        </div>
      </div>
      <div class="fade-time-display">
        <span class="fade-time-label">淡入時間:</span>
        <span class="fade-time-value">${duration.toFixed(2)}s</span>
      </div>
    `;
    }

    bindContentEvents() {
        const handle = this.element.querySelector('.fade-handle-end');

        if (handle) {
            handle.addEventListener('mousedown', (e) => this.startDrag(e));
        }

        // 全局滑鼠事件
        this.onMouseMove = (e) => this.handleDrag(e);
        this.onMouseUp = () => this.endDrag();
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartValue = this.data.duration;
    }

    handleDrag(e) {
        if (!this.isDragging) return;

        const container = this.element.querySelector('.fade-waveform-container');
        if (!container) return;

        const containerWidth = container.offsetWidth;
        const deltaX = e.clientX - this.dragStartX;
        const deltaTime = (deltaX / containerWidth) * this.data.audioDuration;

        let newDuration = Math.max(0.1, this.dragStartValue + deltaTime);
        newDuration = Math.min(newDuration, this.data.audioDuration);
        this.data.duration = Math.round(newDuration * 100) / 100;

        this.updateRegionDisplay();
    }

    endDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            this.schedulePreviewUpdate();

            if (this.onDataChange) {
                this.onDataChange('duration', this.data.duration);
            }
        }
    }

    updateRegionDisplay() {
        const region = this.element.querySelector(`#fadein-region-${this.id}`);
        const valueDisplay = this.element.querySelector('.fade-time-value');

        if (region && this.data.audioDuration > 0) {
            const widthPercent = (this.data.duration / this.data.audioDuration) * 100;
            region.style.width = Math.min(widthPercent, 100) + '%';
        }

        if (valueDisplay) {
            valueDisplay.textContent = this.data.duration.toFixed(2) + 's';
        }
    }

    async updateInputAudio(audioBuffer) {
        if (!audioBuffer) {
            this.inputAudioBuffer = null;
            this.showNoInput(true);
            return;
        }

        this.inputAudioBuffer = audioBuffer;
        this.data.audioDuration = audioBuffer.duration;

        // 調整淡入時間不超過音訊長度
        if (this.data.duration > audioBuffer.duration) {
            this.data.duration = audioBuffer.duration;
        }

        this.showNoInput(false);
        await this.initWaveSurfer();
        this.updateRegionDisplay();
    }

    showNoInput(show) {
        const noInput = this.element.querySelector(`#fadein-no-input-${this.id}`);
        const waveform = this.element.querySelector(`#fadein-waveform-${this.id}`);
        const overlay = this.element.querySelector('.fade-region-overlay');

        if (noInput) noInput.style.display = show ? 'flex' : 'none';
        if (waveform) waveform.style.display = show ? 'none' : 'block';
        if (overlay) overlay.style.display = show ? 'none' : 'block';
    }

    async initWaveSurfer() {
        const container = this.element.querySelector(`#fadein-waveform-${this.id}`);
        if (!container || !this.inputAudioBuffer) return;

        if (this.wavesurfer) {
            try {
                this.wavesurfer.destroy();
            } catch (e) { }
            this.wavesurfer = null;
        }

        try {
            this.wavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(120 40% 45% / 0.6)',
                progressColor: 'hsl(120 40% 45%)',
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
            console.error('FadeInNode WaveSurfer 載入失敗:', error);
        }
    }

    destroy() {
        if (this.onMouseMove) {
            document.removeEventListener('mousemove', this.onMouseMove);
        }
        if (this.onMouseUp) {
            document.removeEventListener('mouseup', this.onMouseUp);
        }

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
                    const settings = {
                        volume: 1.0,
                        crop: { enabled: false },
                        fadeIn: {
                            enabled: true,
                            duration: this.data.duration
                        },
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

        const settings = {
            volume: 1.0,
            crop: { enabled: false },
            fadeIn: {
                enabled: true,
                duration: this.data.duration
            },
            fadeOut: { enabled: false },
            playbackRate: 1.0
        };

        const processed = audioProcessor.processAudio(audioBuffer, settings);
        return { audio: processed };
    }
}

window.FadeInNode = FadeInNode;
