/**
 * 音量調整節點
 */

class VolumeNode extends BaseNode {
    constructor(id, options = {}) {
        // 先設定預設值再呼叫 super
        const defaultData = {
            volume: options.volume || 100,
            clippingMode: options.clippingMode || 'none'
        };
        super(id, 'volume', '音量調整', '▲', options, defaultData);
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
        const clippingMode = this.data.clippingMode || 'none';
        return `
      <div class="node-control">
        <label class="node-control-label">音量</label>
        <div class="node-control-row">
          <input type="range" class="volume-slider" min="0" max="200" value="${volume}" step="1">
          <span class="node-control-value">${volume}%</span>
        </div>
      </div>
      <div class="node-control">
        <label class="node-control-label">削波保護</label>
        <select class="clipping-mode-select">
          <option value="none" ${clippingMode === 'none' ? 'selected' : ''}>無 (僅警告)</option>
          <option value="limiter" ${clippingMode === 'limiter' ? 'selected' : ''}>限制器</option>
          <option value="softclip" ${clippingMode === 'softclip' ? 'selected' : ''}>軟削波</option>
          <option value="normalize" ${clippingMode === 'normalize' ? 'selected' : ''}>自動正規化</option>
        </select>
      </div>
      <div class="clipping-warning" style="display: none;">
        <span class="clipping-warning-icon">⚠️</span>
        <span>偵測到削波</span>
      </div>
    `;
    }

    bindContentEvents() {
        const slider = this.element.querySelector('.volume-slider');
        const valueDisplay = this.element.querySelector('.node-control-value');
        const clippingSelect = this.element.querySelector('.clipping-mode-select');

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

        if (clippingSelect) {
            clippingSelect.addEventListener('change', (e) => {
                this.data.clippingMode = e.target.value;

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('clippingMode', this.data.clippingMode);
                }
            });
        }
    }

    async process(inputs) {
        const audioBuffer = inputs.audio;
        const audioFiles = inputs.audioFiles;
        const gain = this.data.volume / 100;
        const clippingMode = this.data.clippingMode || 'none';

        // Helper function to process single buffer
        const processSingleBuffer = (buffer) => {
            if (!buffer) return null;

            // Apply volume
            let processed = audioProcessor.adjustVolume(buffer, gain);

            // Detect clipping
            const clippingResult = audioProcessor.detectClipping(buffer, gain);

            // Apply clipping protection if needed
            if (clippingResult.clipped && clippingMode !== 'none') {
                switch (clippingMode) {
                    case 'limiter':
                        processed = audioProcessor.applyLimiter(processed);
                        break;
                    case 'softclip':
                        processed = audioProcessor.applySoftClip(processed);
                        break;
                    case 'normalize':
                        processed = audioProcessor.normalizeAudio(processed);
                        break;
                }
            }

            return { buffer: processed, clipped: clippingResult.clipped && clippingMode === 'none' };
        };

        // 處理多檔案
        if (audioFiles && audioFiles.length > 0) {
            const processedFiles = [];
            let anyClipped = false;

            for (const buffer of audioFiles) {
                const result = processSingleBuffer(buffer);
                if (result) {
                    processedFiles.push(result.buffer);
                    if (result.clipped) anyClipped = true;
                }
            }

            // Update warning display
            this.updateClippingWarning(anyClipped);

            return {
                audio: processedFiles[0] || null,
                audioFiles: processedFiles,
                filenames: inputs.filenames
            };
        }

        // 單檔案處理（向下相容）
        if (!audioBuffer) {
            this.updateClippingWarning(false);
            return { audio: null };
        }

        const result = processSingleBuffer(audioBuffer);
        this.updateClippingWarning(result.clipped);

        return { audio: result.buffer };
    }

    /**
     * 更新削波警告顯示
     */
    updateClippingWarning(show) {
        const warning = this.element?.querySelector('.clipping-warning');
        if (warning) {
            warning.style.display = show ? 'flex' : 'none';
        }
    }
}

window.VolumeNode = VolumeNode;
