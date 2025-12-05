/**
 * 音量調整節點
 */

class VolumeNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            volume: options.volume || 100
        };
        super(id, 'volume', '音量調整', '🎚️', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const volume = this.data.volume || 100;
        return `
      <div class="node-control">
        <label class="node-control-label">音量</label>
        <div class="node-control-row">
          <input type="range" class="volume-slider" min="0" max="200" value="${volume}" step="1">
          <span class="node-control-value">${volume}%</span>
        </div>
      </div>
    `;
    }

    bindContentEvents() {
        const slider = this.element.querySelector('.volume-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');

        if (slider) {
            slider.addEventListener('input', (e) => {
                this.data.volume = parseInt(e.target.value);
                valueDisplay.textContent = this.data.volume + '%';

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('volume', this.data.volume);
                }
            });
        }
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
                        volume: this.data.volume / 100,
                        crop: { enabled: false },
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

        // 使用 audioProcessor 調整音量
        const settings = {
            volume: this.data.volume / 100,
            crop: { enabled: false },
            fadeIn: { enabled: false },
            fadeOut: { enabled: false },
            playbackRate: 1.0
        };

        const processed = audioProcessor.processAudio(audioBuffer, settings);
        return { audio: processed };
    }
}

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

/**
 * 淡出節點
 */

class FadeOutNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            duration: options.duration || 1.0,
            audioDuration: options.audioDuration || 10
        };
        super(id, 'fade-out', '淡出', '📉', options, defaultData);

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
        <div class="fade-waveform" id="fadeout-waveform-${this.id}"></div>
        <div class="fade-region-overlay">
          <div class="fade-region fade-region-out" id="fadeout-region-${this.id}">
            <div class="fade-handle fade-handle-start" data-handle="start"></div>
            <div class="fade-gradient fade-gradient-out"></div>
          </div>
        </div>
        <div class="fade-no-input" id="fadeout-no-input-${this.id}">
          <span>等待音訊輸入...</span>
        </div>
      </div>
      <div class="fade-time-display">
        <span class="fade-time-label">淡出時間:</span>
        <span class="fade-time-value">${duration.toFixed(2)}s</span>
      </div>
    `;
    }

    bindContentEvents() {
        const handle = this.element.querySelector('.fade-handle-start');

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
        // 淡出是反向的：向左拖動增加時間
        const deltaTime = -(deltaX / containerWidth) * this.data.audioDuration;

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
        const region = this.element.querySelector(`#fadeout-region-${this.id}`);
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

        // 調整淡出時間不超過音訊長度
        if (this.data.duration > audioBuffer.duration) {
            this.data.duration = audioBuffer.duration;
        }

        this.showNoInput(false);
        await this.initWaveSurfer();
        this.updateRegionDisplay();
    }

    showNoInput(show) {
        const noInput = this.element.querySelector(`#fadeout-no-input-${this.id}`);
        const waveform = this.element.querySelector(`#fadeout-waveform-${this.id}`);
        const overlay = this.element.querySelector('.fade-region-overlay');

        if (noInput) noInput.style.display = show ? 'flex' : 'none';
        if (waveform) waveform.style.display = show ? 'none' : 'block';
        if (overlay) overlay.style.display = show ? 'none' : 'block';
    }

    async initWaveSurfer() {
        const container = this.element.querySelector(`#fadeout-waveform-${this.id}`);
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
                waveColor: 'hsl(0 50% 50% / 0.6)',
                progressColor: 'hsl(0 50% 50%)',
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
            console.error('FadeOutNode WaveSurfer 載入失敗:', error);
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
                        fadeIn: { enabled: false },
                        fadeOut: {
                            enabled: true,
                            duration: this.data.duration
                        },
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
            fadeIn: { enabled: false },
            fadeOut: {
                enabled: true,
                duration: this.data.duration
            },
            playbackRate: 1.0
        };

        const processed = audioProcessor.processAudio(audioBuffer, settings);
        return { audio: processed };
    }
}

/**
 * 速度調整節點
 */

class SpeedNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            speed: options.speed || 100
        };
        super(id, 'speed', '速度調整', '⏩', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const speed = this.data.speed || 100;
        return `
      <div class="node-control">
        <label class="node-control-label">速度</label>
        <div class="node-control-row">
          <input type="range" class="speed-slider" min="50" max="200" value="${speed}" step="1">
          <span class="node-control-value">${(speed / 100).toFixed(1)}x</span>
        </div>
      </div>
    `;
    }

    bindContentEvents() {
        const slider = this.element.querySelector('.speed-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');

        if (slider) {
            slider.addEventListener('input', (e) => {
                this.data.speed = parseInt(e.target.value);
                valueDisplay.textContent = (this.data.speed / 100).toFixed(1) + 'x';

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('speed', this.data.speed);
                }
            });
        }
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
                        fadeIn: { enabled: false },
                        fadeOut: { enabled: false },
                        playbackRate: this.data.speed / 100
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
            fadeIn: { enabled: false },
            fadeOut: { enabled: false },
            playbackRate: this.data.speed / 100
        };

        const processed = audioProcessor.processAudio(audioBuffer, settings);
        return { audio: processed };
    }
}

/**
 * 音高調整節點（基本版）
 */

class PitchNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            pitch: options.pitch || 0  // 半音數，範圍 -12 到 +12
        };
        super(id, 'pitch', '音高調整', '🎵', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const pitch = this.data.pitch || 0;
        const pitchDisplay = pitch >= 0 ? `+${pitch}` : `${pitch}`;

        return `
      <div class="node-control">
        <label class="node-control-label">音高 (半音)</label>
        <div class="node-control-row">
          <input type="range" class="pitch-slider" min="-12" max="12" value="${pitch}" step="1">
          <span class="node-control-value">${pitchDisplay}</span>
        </div>
        <div class="pitch-presets">
          <button class="pitch-preset-btn" data-pitch="-12" title="降低八度">-8ve</button>
          <button class="pitch-preset-btn" data-pitch="-5" title="降低五度">-5th</button>
          <button class="pitch-preset-btn" data-pitch="0" title="原調">0</button>
          <button class="pitch-preset-btn" data-pitch="5" title="升高五度">+5th</button>
          <button class="pitch-preset-btn" data-pitch="12" title="升高八度">+8ve</button>
        </div>
      </div>
    `;
    }

    bindContentEvents() {
        const slider = this.element.querySelector('.pitch-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');
        const presetBtns = this.element.querySelectorAll('.pitch-preset-btn');

        if (slider) {
            slider.addEventListener('input', (e) => {
                this.data.pitch = parseInt(e.target.value);
                const display = this.data.pitch >= 0 ? `+${this.data.pitch}` : `${this.data.pitch}`;
                valueDisplay.textContent = display;

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('pitch', this.data.pitch);
                }
            });
        }

        // 預設按鈕
        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pitchValue = parseInt(btn.dataset.pitch);
                this.data.pitch = pitchValue;

                if (slider) slider.value = pitchValue;
                const display = pitchValue >= 0 ? `+${pitchValue}` : `${pitchValue}`;
                if (valueDisplay) valueDisplay.textContent = display;

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('pitch', this.data.pitch);
                }
            });
        });
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];
            for (const buffer of audioFiles) {
                if (buffer) {
                    // 如果 pitch 為 0，直接返回原音訊
                    if (this.data.pitch === 0) {
                        processedFiles.push(buffer);
                    } else {
                        processedFiles.push(audioProcessor.changePitch(buffer, this.data.pitch));
                    }
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

/**
 * 智慧音高調整節點（含音高偵測、轉調、分析功能）
 */

class SmartPitchNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    constructor(id, options = {}) {
        const defaultData = {
            pitch: options.pitch || 0,  // 半音數，範圍 -12 到 +12
            detectedKey: null,          // 偵測到的音高 { noteName, midiNote, confidence }
            targetKey: null             // 目標調性（音名，不含八度，如 'C', 'D#'）
        };
        super(id, 'smart-pitch', '智慧音高調整', '🎼', options, defaultData);

        this.inputAudioBuffer = null;
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
        const pitch = this.data.pitch || 0;
        const pitchDisplay = pitch >= 0 ? `+${pitch}` : `${pitch}`;
        const detectedKey = this.data.detectedKey;
        const targetKey = this.data.targetKey;

        // 生成目標調性選項
        const keyOptions = SmartPitchNode.NOTE_NAMES.map(note => {
            const selected = targetKey === note ? 'selected' : '';
            return `<option value="${note}" ${selected}>${note}</option>`;
        }).join('');

        return `
      <div class="node-control transpose-control">
        <label class="node-control-label">🎹 智慧轉調</label>
        <div class="transpose-info">
          <div class="transpose-row">
            <span class="transpose-label">偵測音高:</span>
            <span class="detected-key-value">${detectedKey ? `${detectedKey.noteName} (${Math.round(detectedKey.confidence * 100)}%)` : '等待分析...'}</span>
          </div>
          <div class="transpose-row">
            <span class="transpose-label">目標調性:</span>
            <select class="target-key-select" ${!detectedKey ? 'disabled' : ''}>
              <option value="">-- 選擇調性 --</option>
              ${keyOptions}
            </select>
          </div>
          <div class="transpose-row transpose-result" style="display: ${targetKey && detectedKey ? 'flex' : 'none'}">
            <span class="transpose-label">轉調半音:</span>
            <span class="transpose-semitones">${this.calculateTransposeSemitones()}</span>
          </div>
        </div>
        <button class="transpose-apply-btn" ${!targetKey || !detectedKey ? 'disabled' : ''}>套用轉調</button>
      </div>
      
      <div class="analysis-progress" id="analysis-progress-${this.id}" style="display: none;"></div>
      <div class="analysis-panel" id="analysis-panel-${this.id}" style="display: none;"></div>
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
        const targetKeySelect = this.element.querySelector('.target-key-select');
        const applyBtn = this.element.querySelector('.transpose-apply-btn');

        // 目標調性選擇
        if (targetKeySelect) {
            targetKeySelect.addEventListener('change', (e) => {
                this.data.targetKey = e.target.value || null;
                this.updateTransposeUI();
            });
        }

        // 套用轉調按鈕
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyTranspose();
            });
        }
    }

    /**
     * 更新轉調 UI 顯示
     */
    updateTransposeUI() {
        const transposeResult = this.element.querySelector('.transpose-result');
        const transposeSemitones = this.element.querySelector('.transpose-semitones');
        const applyBtn = this.element.querySelector('.transpose-apply-btn');

        if (transposeResult) {
            transposeResult.style.display = (this.data.targetKey && this.data.detectedKey) ? 'flex' : 'none';
        }

        if (transposeSemitones) {
            transposeSemitones.textContent = this.calculateTransposeSemitones();
        }

        if (applyBtn) {
            applyBtn.disabled = !this.data.targetKey || !this.data.detectedKey;
        }
    }

    /**
     * 套用轉調設定
     */
    applyTranspose() {
        if (!this.data.detectedKey || !this.data.targetKey) {
            return;
        }

        const semitones = this.calculateTransposeSemitonesValue();
        if (semitones === null) return;

        // 更新 pitch 值
        this.data.pitch = semitones;

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
     * 當輸入音訊變更時，自動分析
     */
    async updateInputAudio(audioBuffer) {
        if (!audioBuffer) {
            this.inputAudioBuffer = null;
            this.data.detectedKey = null;
            this.analysisResult = null;
            this.updateDetectedKeyUI();
            this.hideAnalysisPanel();
            return;
        }

        this.inputAudioBuffer = audioBuffer;

        // 開始完整分析
        await this.analyzeAudio(audioBuffer);
    }

    /**
     * 完整分析音訊（含音高偵測與頻譜分析）
     */
    async analyzeAudio(audioBuffer) {
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        this.updateDetectedKeyUI('分析中...');
        this.showProgressBar();

        try {
            // 使用 audioAnalyzer 進行完整分析
            const result = await window.audioAnalyzer.analyze(audioBuffer, (progress) => {
                this.updateProgress(progress);
            });

            this.analysisResult = result;

            // 更新偵測到的音高
            if (result.pitch && result.pitch.dominantPitch && result.pitch.dominantPitch.noteName) {
                this.data.detectedKey = {
                    noteName: result.pitch.dominantPitch.noteName,
                    midiNote: result.pitch.dominantPitch.midiNote,
                    confidence: result.pitch.dominantPitch.confidence,
                    frequency: result.pitch.dominantPitch.frequency
                };
            } else {
                this.data.detectedKey = null;
            }

            // 顯示分析結果面板
            this.showAnalysisResult(result);
        } catch (error) {
            console.error('音訊分析失敗:', error);
            this.data.detectedKey = null;
            this.analysisResult = null;
        }

        this.isAnalyzing = false;
        this.hideProgressBar();
        this.updateDetectedKeyUI();
    }

    /**
     * 顯示進度條
     */
    showProgressBar() {
        const container = this.element.querySelector(`#analysis-progress-${this.id}`);
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
        const container = this.element.querySelector(`#analysis-progress-${this.id}`);
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
     * 顯示分析結果面板
     */
    showAnalysisResult(result) {
        const panel = this.element.querySelector(`#analysis-panel-${this.id}`);
        if (!panel) return;

        panel.style.display = 'block';
        panel.innerHTML = this.buildAnalysisPanelHTML(result);
        this.bindAnalysisPanelEvents();
    }

    /**
     * 隱藏分析面板
     */
    hideAnalysisPanel() {
        const panel = this.element.querySelector(`#analysis-panel-${this.id}`);
        if (panel) {
            panel.style.display = 'none';
            panel.innerHTML = '';
        }
    }

    /**
     * 建構分析面板 HTML
     */
    buildAnalysisPanelHTML(result) {
        const basic = result.basic || {};
        const frequency = result.frequency || {};
        const pitch = result.pitch || {};

        // 基本資訊區塊
        const basicCollapsed = this.getSectionCollapseState('basic') ? 'collapsed' : '';
        const basicHTML = `
            <div class="analysis-section ${basicCollapsed}" data-section="basic">
                <div class="analysis-section-header">
                    <span class="analysis-section-icon">📊</span>
                    <span class="analysis-section-title">基本資訊</span>
                    <span class="analysis-section-toggle">▼</span>
                </div>
                <div class="analysis-section-content">
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
                    </div>
                </div>
            </div>
        `;

        // 頻率分析區塊
        const freqCollapsed = this.getSectionCollapseState('frequency') ? 'collapsed' : '';
        // frequency.spectrum 包含 {low, mid, high} 低中高頻能量比例
        const spectrum = frequency.spectrum || {};
        const freqBands = [
            { label: '低頻', value: spectrum.low || 0, class: 'low' },
            { label: '中頻', value: spectrum.mid || 0, class: 'mid' },
            { label: '高頻', value: spectrum.high || 0, class: 'high' }
        ];

        // 使用水平條形圖
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

        // 顯示主頻率和頻譜重心
        const dominantFreq = frequency.dominantFrequency ? frequency.dominantFrequency.toFixed(0) + ' Hz' : '-';
        const spectralCentroid = frequency.spectralCentroid ? frequency.spectralCentroid.toFixed(0) + ' Hz' : '-';

        const freqHTML = `
            <div class="analysis-section ${freqCollapsed}" data-section="frequency">
                <div class="analysis-section-header">
                    <span class="analysis-section-icon">📈</span>
                    <span class="analysis-section-title">頻譜分析</span>
                    <span class="analysis-section-toggle">▼</span>
                </div>
                <div class="analysis-section-content">
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
            </div>
        `;

        // 音高/頻譜圖區塊
        const pitchCollapsed = this.getSectionCollapseState('pitch') ? 'collapsed' : '';
        const dominantPitch = pitch.dominantPitch || {};
        const pitchHTML = `
            <div class="analysis-section ${pitchCollapsed}" data-section="pitch">
                <div class="analysis-section-header">
                    <span class="analysis-section-icon">🎵</span>
                    <span class="analysis-section-title">音高 / 頻譜圖</span>
                    <span class="analysis-section-toggle">▼</span>
                </div>
                <div class="analysis-section-content">
                    <div class="pitch-info">
                        <div class="dominant-pitch">
                            <span class="pitch-note">${dominantPitch.noteName || '-'}</span>
                            <span class="pitch-freq">${dominantPitch.frequency ? dominantPitch.frequency.toFixed(1) + ' Hz' : ''}</span>
                            ${dominantPitch.confidence ? `<span class="pitch-confidence">${Math.round(dominantPitch.confidence * 100)}%</span>` : ''}
                        </div>
                    </div>
                    <div class="spectrogram-container" id="spectrogram-container-${this.id}">
                        <canvas id="spectrogram-canvas-${this.id}" class="spectrogram-canvas"></canvas>
                        <div class="spectrogram-hover-info" id="spectrogram-hover-${this.id}"></div>
                    </div>
                </div>
            </div>
        `;

        return basicHTML + freqHTML + pitchHTML;
    }

    /**
     * 綁定分析面板事件
     */
    bindAnalysisPanelEvents() {
        // 區塊展開/收合
        const sections = this.element.querySelectorAll('.analysis-section');
        sections.forEach(section => {
            const header = section.querySelector('.analysis-section-header');
            if (header) {
                header.addEventListener('click', () => {
                    section.classList.toggle('collapsed');
                    const sectionName = section.dataset.section;
                    this.saveSectionCollapseState(sectionName, section.classList.contains('collapsed'));

                    // 如果是音高區塊展開，渲染頻譜圖
                    if (sectionName === 'pitch' && !section.classList.contains('collapsed')) {
                        this.renderSpectrogramIfNeeded();
                    }
                });
            }
        });

        // 初始渲染頻譜圖（如果音高區塊已展開）
        const pitchSection = this.element.querySelector('.analysis-section[data-section="pitch"]');
        if (pitchSection && !pitchSection.classList.contains('collapsed')) {
            this.renderSpectrogramIfNeeded();
        }
    }

    /**
     * 渲染頻譜圖（如果需要）
     */
    renderSpectrogramIfNeeded() {
        // 頻譜圖在 pitch.spectrogram 中
        if (!this.analysisResult || !this.analysisResult.pitch || !this.analysisResult.pitch.spectrogram) return;

        const canvas = this.element.querySelector(`#spectrogram-canvas-${this.id}`);
        const container = this.element.querySelector(`#spectrogram-container-${this.id}`);
        const hoverInfo = this.element.querySelector(`#spectrogram-hover-${this.id}`);

        if (!canvas || !container) return;

        // 設定 canvas 尺寸
        const rect = container.getBoundingClientRect();
        const canvasWidth = rect.width || 280;
        const canvasHeight = 100;

        // 建立或更新 SpectrogramRenderer
        if (!this.spectrogramRenderer) {
            this.spectrogramRenderer = new SpectrogramRenderer(canvas);
        }

        // 渲染頻譜圖 - 傳入整個 spectrogramData 物件和選項
        const specData = this.analysisResult.pitch.spectrogram;
        this.spectrogramRenderer.render(specData, {
            canvasWidth: canvasWidth,
            canvasHeight: canvasHeight
        });

        // 綁定滑鼠懸停事件
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // 計算時間和頻率索引
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

        // 點擊開啟大圖
        canvas.addEventListener('click', () => {
            this.openSpectrogramModal();
        });
        canvas.style.cursor = 'pointer';
    }

    /**
     * 開啟頻譜圖大圖 Modal
     */
    openSpectrogramModal() {
        if (!this.analysisResult || !this.analysisResult.pitch || !this.analysisResult.pitch.spectrogram) return;

        // 建立 Modal
        const overlay = document.createElement('div');
        overlay.className = 'spectrogram-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'spectrogram-modal';
        modal.innerHTML = `
            <div class="spectrogram-modal-header">
                <span class="spectrogram-modal-title">頻譜圖</span>
                <button class="spectrogram-modal-close">&times;</button>
            </div>
            <div class="spectrogram-modal-content">
                <canvas id="spectrogram-modal-canvas" class="spectrogram-modal-canvas"></canvas>
                <div class="spectrogram-modal-hover-info" id="spectrogram-modal-hover"></div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 設定大圖 canvas
        const canvas = modal.querySelector('#spectrogram-modal-canvas');
        const hoverInfo = modal.querySelector('#spectrogram-modal-hover');

        // 設定較大的尺寸
        const canvasWidth = Math.min(window.innerWidth - 100, 800);
        const canvasHeight = 300;

        // 渲染
        const renderer = new SpectrogramRenderer(canvas);
        const specData = this.analysisResult.pitch.spectrogram;
        renderer.render(specData, {
            canvasWidth: canvasWidth,
            canvasHeight: canvasHeight
        });

        // 懸停事件
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // 計算時間和頻率索引
            const timeIndex = Math.floor((x / rect.width) * specData.width);
            const freqIndex = Math.floor(((rect.height - y) / rect.height) * specData.height);

            if (timeIndex >= 0 && timeIndex < specData.width &&
                freqIndex >= 0 && freqIndex < specData.height) {
                const time = timeIndex * specData.timeStep;
                const freq = (freqIndex / specData.height) * specData.frequencyRange[1];
                const magnitude = specData.data[timeIndex]?.[freqIndex] || 0;

                hoverInfo.style.display = 'block';
                hoverInfo.style.left = (x + 10) + 'px';
                hoverInfo.style.top = (y - 30) + 'px';
                hoverInfo.innerHTML = `
                    <div>時間: ${time.toFixed(2)}s</div>
                    <div>頻率: ${freq.toFixed(0)} Hz</div>
                    <div>強度: ${magnitude.toFixed(1)}</div>
                `;
            }
        });

        canvas.addEventListener('mouseleave', () => {
            hoverInfo.style.display = 'none';
        });

        // 關閉事件
        const closeBtn = modal.querySelector('.spectrogram-modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        // ESC 關閉
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
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
     * 更新偵測音高 UI
     */
    updateDetectedKeyUI(customText = null) {
        const detectedKeyValue = this.element.querySelector('.detected-key-value');
        const targetKeySelect = this.element.querySelector('.target-key-select');

        if (detectedKeyValue) {
            if (customText) {
                detectedKeyValue.textContent = customText;
                detectedKeyValue.title = '';
                detectedKeyValue.classList.remove('key-undetectable');
            } else if (this.data.detectedKey) {
                detectedKeyValue.textContent = `${this.data.detectedKey.noteName} (${Math.round(this.data.detectedKey.confidence * 100)}%)`;
                detectedKeyValue.title = '';
                detectedKeyValue.classList.remove('key-undetectable');
            } else {
                detectedKeyValue.innerHTML = '⚠️ 無法偵測';
                detectedKeyValue.title = '可能原因：音效過短、噪音、打擊樂或環境音等';
                detectedKeyValue.classList.add('key-undetectable');
            }
        }

        if (targetKeySelect) {
            targetKeySelect.disabled = !this.data.detectedKey;
        }

        this.updateTransposeUI();
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
            for (const buffer of audioFiles) {
                if (buffer) {
                    // 如果 pitch 為 0，直接返回原音訊
                    if (this.data.pitch === 0) {
                        processedFiles.push(buffer);
                    } else {
                        processedFiles.push(audioProcessor.changePitch(buffer, this.data.pitch));
                    }
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

/**
 * 調性整合節點（批量分析多檔案音高，移調至符合目標調性的最近音）
 */

class KeyIntegrationNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // 各調性的調內音（自然大調音階）
    static SCALE_NOTES = {
        'C':  [0, 2, 4, 5, 7, 9, 11],  // C D E F G A B
        'C#': [1, 3, 5, 6, 8, 10, 0],  // C# D# F F# G# A# C
        'D':  [2, 4, 6, 7, 9, 11, 1],  // D E F# G A B C#
        'D#': [3, 5, 7, 8, 10, 0, 2],  // D# F G G# A# C D
        'E':  [4, 6, 8, 9, 11, 1, 3],  // E F# G# A B C# D#
        'F':  [5, 7, 9, 10, 0, 2, 4],  // F G A Bb C D E
        'F#': [6, 8, 10, 11, 1, 3, 5], // F# G# A# B C# D# F
        'G':  [7, 9, 11, 0, 2, 4, 6],  // G A B C D E F#
        'G#': [8, 10, 0, 1, 3, 5, 7],  // G# A# C C# D# F G
        'A':  [9, 11, 1, 2, 4, 6, 8],  // A B C# D E F# G#
        'A#': [10, 0, 2, 3, 5, 7, 9],  // A# C D D# F G A
        'B':  [11, 1, 3, 4, 6, 8, 10]  // B C# D# E F# G# A#
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

// 匯出
window.VolumeNode = VolumeNode;
window.CropNode = CropNode;
window.FadeInNode = FadeInNode;
window.FadeOutNode = FadeOutNode;
window.SpeedNode = SpeedNode;
window.PitchNode = PitchNode;
window.SmartPitchNode = SmartPitchNode;
window.KeyIntegrationNode = KeyIntegrationNode;
