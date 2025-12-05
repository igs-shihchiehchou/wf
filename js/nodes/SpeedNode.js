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

window.SpeedNode = SpeedNode;
