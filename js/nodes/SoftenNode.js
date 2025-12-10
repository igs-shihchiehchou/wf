/**
 * 柔化節點 - 使用低通濾波器減少刺耳的高頻聲音
 * 讓音效聽起來更柔和、溫暖
 */

class SoftenNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            cutoffFrequency: options.cutoffFrequency || 8000,  // 截止頻率 (Hz)
            intensity: options.intensity || 50  // 柔化強度 (0-100)
        };
        super(id, 'soften', '柔化', '◠', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        const cutoffFrequency = this.data.cutoffFrequency || 8000;
        const intensity = this.data.intensity || 50;

        return `
      <div class="node-control">
        <label class="node-control-label">截止頻率</label>
        <div class="node-control-row">
          <input type="range" class="cutoff-slider" min="1000" max="16000" value="${cutoffFrequency}" step="100">
          <span class="cutoff-value">${this.formatFrequency(cutoffFrequency)}</span>
        </div>
        <div class="node-control-hint">較低的頻率 = 更柔和的聲音</div>
      </div>
      <div class="node-control">
        <label class="node-control-label">柔化強度</label>
        <div class="node-control-row">
          <input type="range" class="intensity-slider" min="0" max="100" value="${intensity}" step="5">
          <span class="intensity-value">${intensity}%</span>
        </div>
      </div>
      <div class="node-control soften-presets">
        <label class="node-control-label">快速預設</label>
        <div class="preset-buttons">
          <button class="preset-btn" data-cutoff="12000" data-intensity="30" title="輕微柔化">輕微</button>
          <button class="preset-btn" data-cutoff="8000" data-intensity="50" title="中等柔化">中等</button>
          <button class="preset-btn" data-cutoff="4000" data-intensity="70" title="強烈柔化">強烈</button>
          <button class="preset-btn" data-cutoff="2000" data-intensity="90" title="非常柔和，適合背景音">極柔</button>
        </div>
      </div>
    `;
    }

    formatFrequency(freq) {
        if (freq >= 1000) {
            return (freq / 1000).toFixed(1) + ' kHz';
        }
        return freq + ' Hz';
    }

    bindContentEvents() {
        const cutoffSlider = this.element.querySelector('.cutoff-slider');
        const cutoffValue = this.element.querySelector('.cutoff-value');
        const intensitySlider = this.element.querySelector('.intensity-slider');
        const intensityValue = this.element.querySelector('.intensity-value');
        const presetButtons = this.element.querySelectorAll('.preset-btn');

        if (cutoffSlider) {
            cutoffSlider.addEventListener('input', (e) => {
                this.data.cutoffFrequency = parseInt(e.target.value);
                cutoffValue.textContent = this.formatFrequency(this.data.cutoffFrequency);
                this.schedulePreviewUpdate();
                if (this.onDataChange) {
                    this.onDataChange('cutoffFrequency', this.data.cutoffFrequency);
                }
            });
        }

        if (intensitySlider) {
            intensitySlider.addEventListener('input', (e) => {
                this.data.intensity = parseInt(e.target.value);
                intensityValue.textContent = this.data.intensity + '%';
                this.schedulePreviewUpdate();
                if (this.onDataChange) {
                    this.onDataChange('intensity', this.data.intensity);
                }
            });
        }

        // 預設按鈕事件
        presetButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cutoff = parseInt(btn.dataset.cutoff);
                const intensity = parseInt(btn.dataset.intensity);

                this.data.cutoffFrequency = cutoff;
                this.data.intensity = intensity;

                // 更新 UI
                if (cutoffSlider) {
                    cutoffSlider.value = cutoff;
                    cutoffValue.textContent = this.formatFrequency(cutoff);
                }
                if (intensitySlider) {
                    intensitySlider.value = intensity;
                    intensityValue.textContent = intensity + '%';
                }

                this.schedulePreviewUpdate();
                if (this.onDataChange) {
                    this.onDataChange('preset', { cutoff, intensity });
                }
            });
        });
    }

    /**
     * 應用低通濾波器來柔化音訊
     * @param {AudioBuffer} audioBuffer - 原始音訊
     * @param {number} cutoffFrequency - 截止頻率 (Hz)
     * @param {number} intensity - 柔化強度 (0-100)
     */
    applySoftenFilter(audioBuffer, cutoffFrequency, intensity) {
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;

        // 創建新的 buffer
        const newBuffer = audioProcessor.audioContext.createBuffer(
            numChannels,
            length,
            sampleRate
        );

        // 強度為 0 時直接返回原始音訊
        if (intensity === 0) {
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                newData.set(oldData);
            }
            return newBuffer;
        }

        // 計算濾波器係數 (簡單的一階低通濾波器)
        // RC 低通濾波器: y[n] = α * x[n] + (1 - α) * y[n-1]
        // α = dt / (RC + dt), 其中 RC = 1 / (2π * fc)
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoffFrequency);
        const alpha = dt / (rc + dt);

        // 混合係數：根據強度決定原始信號和濾波信號的混合比例
        const mixRatio = intensity / 100;

        for (let channel = 0; channel < numChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = newBuffer.getChannelData(channel);

            // 濾波後的數據
            let filteredPrev = inputData[0];

            for (let i = 0; i < length; i++) {
                const input = inputData[i];

                // 應用低通濾波器
                const filtered = alpha * input + (1 - alpha) * filteredPrev;
                filteredPrev = filtered;

                // 混合原始信號和濾波後的信號
                outputData[i] = input * (1 - mixRatio) + filtered * mixRatio;
            }
        }

        return newBuffer;
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;

        const cutoffFrequency = this.data.cutoffFrequency || 8000;
        const intensity = this.data.intensity || 50;

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];
            for (const buffer of audioFiles) {
                if (buffer) {
                    const processed = this.applySoftenFilter(buffer, cutoffFrequency, intensity);
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

        const processed = this.applySoftenFilter(audioBuffer, cutoffFrequency, intensity);
        return { audio: processed };
    }
}

window.SoftenNode = SoftenNode;
