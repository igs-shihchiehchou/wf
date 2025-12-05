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

window.VolumeNode = VolumeNode;
