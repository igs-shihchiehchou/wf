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
 * 音高調整節點
 */

class PitchNode extends BaseNode {
    // 音名常數（不含八度）
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    constructor(id, options = {}) {
        const defaultData = {
            pitch: options.pitch || 0,  // 半音數，範圍 -12 到 +12
            detectedKey: null,          // 偵測到的音高 { noteName, midiNote, confidence }
            targetKey: null             // 目標調性（音名，不含八度，如 'C', 'D#'）
        };
        super(id, 'pitch', '音高調整 (Pitch)', '🎵', options, defaultData);
        
        this.inputAudioBuffer = null;
        this.isAnalyzing = false;
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
        const keyOptions = PitchNode.NOTE_NAMES.map(note => {
            const selected = targetKey === note ? 'selected' : '';
            return `<option value="${note}" ${selected}>${note}</option>`;
        }).join('');

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

        const detectedIndex = PitchNode.NOTE_NAMES.indexOf(detectedNote);
        const targetIndex = PitchNode.NOTE_NAMES.indexOf(targetNote);

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
        const slider = this.element.querySelector('.pitch-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');
        const presetBtns = this.element.querySelectorAll('.pitch-preset-btn');
        const targetKeySelect = this.element.querySelector('.target-key-select');
        const applyBtn = this.element.querySelector('.transpose-apply-btn');

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
     * 套用轉調設定到音高滑桿
     */
    applyTranspose() {
        if (!this.data.detectedKey || !this.data.targetKey) {
            return;
        }

        const semitones = this.calculateTransposeSemitonesValue();
        if (semitones === null) return;

        // 更新 pitch 值
        this.data.pitch = semitones;

        // 更新 UI
        const slider = this.element.querySelector('.pitch-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');

        if (slider) slider.value = semitones;
        if (valueDisplay) {
            const display = semitones >= 0 ? `+${semitones}` : `${semitones}`;
            valueDisplay.textContent = display;
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

        const detectedIndex = PitchNode.NOTE_NAMES.indexOf(detectedNote);
        const targetIndex = PitchNode.NOTE_NAMES.indexOf(targetNote);

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
     * 當輸入音訊變更時，分析音高
     */
    async updateInputAudio(audioBuffer) {
        if (!audioBuffer) {
            this.inputAudioBuffer = null;
            this.data.detectedKey = null;
            this.updateDetectedKeyUI();
            return;
        }

        this.inputAudioBuffer = audioBuffer;

        // 開始分析音高
        await this.analyzeAudioPitch(audioBuffer);
    }

    /**
     * 分析音訊的主要音高
     */
    async analyzeAudioPitch(audioBuffer) {
        if (this.isAnalyzing) return;
        
        this.isAnalyzing = true;
        this.updateDetectedKeyUI('分析中...');

        try {
            // 使用 audioAnalyzer 分析音高
            const result = await window.audioAnalyzer.analyze(audioBuffer, () => {});
            
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
        } catch (error) {
            console.error('音高分析失敗:', error);
            this.data.detectedKey = null;
        }

        this.isAnalyzing = false;
        this.updateDetectedKeyUI();
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
            } else if (this.data.detectedKey) {
                detectedKeyValue.textContent = `${this.data.detectedKey.noteName} (${Math.round(this.data.detectedKey.confidence * 100)}%)`;
            } else {
                detectedKeyValue.textContent = '無法判定';
            }
        }

        if (targetKeySelect) {
            targetKeySelect.disabled = !this.data.detectedKey;
        }

        this.updateTransposeUI();
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
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

// 匯出
window.VolumeNode = VolumeNode;
window.CropNode = CropNode;
window.FadeInNode = FadeInNode;
window.FadeOutNode = FadeOutNode;
window.SpeedNode = SpeedNode;
window.PitchNode = PitchNode;
