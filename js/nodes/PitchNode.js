/**
 * 音高調整節點（基本版）
 */
class PitchNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            pitch: options.pitch || 0  // 半音數，範圍 -12 到 +12
        };
        super(id, 'pitch', '音高調整', '♪', options, defaultData);
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

window.PitchNode = PitchNode;
