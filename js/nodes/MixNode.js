/**
 * 混音節點 - 將兩個音訊混合疊加成一個音訊
 * 輸出長度 = max(輸入1長度, 輸入2長度)
 */

class MixNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            balance: 50,           // 音量平衡：0=全音軌2, 50=等量, 100=全音軌1
            autoNormalize: true,   // 自動標準化防止削波
            hasWarning: false,
            warningMessage: ''
        };
        super(id, 'mix', '混音', '⊗', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio1', '音軌1', 'audio');
        this.addInputPort('audio2', '音軌2', 'audio');
        this.addOutputPort('audio', '輸出音訊', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    /**
     * 覆寫 createElement 以支援雙輸入端口
     */
    createElement() {
        const node = document.createElement('div');
        node.className = `graph-node node-${this.type}`;
        node.id = this.id;
        node.dataset.type = this.getNodeCategory();

        // 輸出端口
        const outputPort = this.outputPorts[0];

        node.innerHTML = `
            <div class="node-header">
                <div class="node-header-left">
                    <span class="node-icon">${this.icon}</span>
                    <span class="node-title">${this.title}</span>
                </div>
                <div class="node-header-actions">
                    <button class="node-action-btn collapse" title="折疊">▼</button>
                    <button class="node-action-btn delete" title="刪除">×</button>
                    ${outputPort ? `<div class="node-port output" data-port="${outputPort.name}" data-type="output" data-datatype="${outputPort.dataType}" title="${outputPort.label}"></div>` : ''}
                </div>
            </div>
            <div class="node-content">
                ${this.renderContent()}
                ${this.renderPreview()}
            </div>
            <div class="node-resize-handle" title="拖拉調整大小"></div>
        `;

        // 綁定事件
        this.bindEvents(node);
        this.bindPreviewEvents(node);

        return node;
    }

    renderContent() {
        const input1Port = this.inputPorts.find(p => p.name === 'audio1');
        const input2Port = this.inputPorts.find(p => p.name === 'audio2');
        const balance = this.data.balance || 50;
        const autoNormalize = this.data.autoNormalize !== false;
        const hasWarning = this.data.hasWarning;
        const warningMessage = this.data.warningMessage;

        return `
            <div class="mix-inputs-container">
                <div class="mix-input-row" data-port="audio1">
                    <div class="node-port input" 
                         data-port="audio1" 
                         data-type="input" 
                         data-datatype="audio" 
                         title="音軌1">
                    </div>
                    <span class="mix-input-label">音軌1</span>
                    <span class="mix-input-status ${input1Port?.connected ? 'connected' : ''}">${input1Port?.connected ? '✓' : '○'}</span>
                </div>
                <div class="mix-input-row" data-port="audio2">
                    <div class="node-port input" 
                         data-port="audio2" 
                         data-type="input" 
                         data-datatype="audio" 
                         title="音軌2">
                    </div>
                    <span class="mix-input-label">音軌2</span>
                    <span class="mix-input-status ${input2Port?.connected ? 'connected' : ''}">${input2Port?.connected ? '✓' : '○'}</span>
                </div>
                
                <div class="node-control">
                    <label class="node-control-label">音量平衡</label>
                    <div class="mix-balance-container">
                        <span class="mix-balance-label">音軌2</span>
                        <input type="range" class="mix-balance-slider" min="0" max="100" value="${balance}" step="1">
                        <span class="mix-balance-label">音軌1</span>
                    </div>
                    <div class="mix-balance-value">
                        <span>音軌1: ${balance}%</span>
                        <span>音軌2: ${100 - balance}%</span>
                    </div>
                </div>

                <div class="node-control">
                    <label class="node-checkbox-container">
                        <input type="checkbox" class="mix-normalize-checkbox" ${autoNormalize ? 'checked' : ''}>
                        <span class="node-checkbox-label">自動標準化（防止削波）</span>
                    </label>
                </div>

                ${hasWarning ? `
                <div class="mix-warning">
                    <span class="mix-warning-icon">⚠️</span>
                    <span class="mix-warning-text">${warningMessage}</span>
                </div>
                ` : ''}
                ${!input1Port?.connected && !input2Port?.connected ? `
                <div class="mix-hint">
                    <span style="color: var(--text-muted); font-size: var(--text-sm);">請連接兩個音訊來源</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    bindContentEvents() {
        // 綁定輸入端口事件
        const portEls = this.element.querySelectorAll('.mix-input-row .node-port.input');
        portEls.forEach(portEl => {
            const portName = portEl.dataset.port;
            const port = this.inputPorts.find(p => p.name === portName);

            if (port) {
                port.element = portEl;
                port.nodeId = this.id;

                portEl.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    if (this.onPortDragStart) {
                        this.onPortDragStart(port, this);
                    }
                });

                portEl.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    if (this.onPortDragStart) {
                        this.onPortDragStart(port, this, e.touches[0]);
                    }
                }, { passive: true });
            }
        });

        // 音量平衡滑桿
        const balanceSlider = this.element.querySelector('.mix-balance-slider');
        if (balanceSlider) {
            balanceSlider.addEventListener('input', (e) => {
                this.data.balance = parseInt(e.target.value);

                // 更新顯示
                const valueDisplay = this.element.querySelector('.mix-balance-value');
                if (valueDisplay) {
                    valueDisplay.innerHTML = `
                        <span>音軌1: ${this.data.balance}%</span>
                        <span>音軌2: ${100 - this.data.balance}%</span>
                    `;
                }

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('balance', this.data.balance);
                }
            });
        }

        // 自動標準化核取方塊
        const normalizeCheckbox = this.element.querySelector('.mix-normalize-checkbox');
        if (normalizeCheckbox) {
            normalizeCheckbox.addEventListener('change', (e) => {
                this.data.autoNormalize = e.target.checked;

                // 自動更新預覽
                this.schedulePreviewUpdate();

                if (this.onDataChange) {
                    this.onDataChange('autoNormalize', this.data.autoNormalize);
                }
            });
        }
    }

    /**
     * 檢查多檔案輸入警告
     */
    checkMultiFileWarning(inputs) {
        let hasWarning = false;
        let warningMessage = '';

        // 檢查輸入1
        if (inputs.audioFiles1 && inputs.audioFiles1.length > 1) {
            hasWarning = true;
        }

        // 檢查輸入2
        if (inputs.audioFiles2 && inputs.audioFiles2.length > 1) {
            hasWarning = true;
        }

        if (hasWarning) {
            warningMessage = '混音節點僅支援單一檔案輸入，請確保輸入來源只有一個檔案';
            showToast(warningMessage, 'warning');
        }

        this.data.hasWarning = hasWarning;
        this.data.warningMessage = warningMessage;

        // 更新 UI 顯示警告狀態
        if (hasWarning) {
            this.element.classList.add('has-warning');
        } else {
            this.element.classList.remove('has-warning');
        }

        return hasWarning;
    }

    async process(inputs) {
        const audio1 = inputs.audio1;
        const audio2 = inputs.audio2;

        // 檢查多檔案輸入
        const audioFiles1 = inputs.audioFiles1 || (audio1 ? [audio1] : []);
        const audioFiles2 = inputs.audioFiles2 || (audio2 ? [audio2] : []);

        // 設定 inputs 的 audioFiles 以便檢查
        inputs.audioFiles1 = audioFiles1;
        inputs.audioFiles2 = audioFiles2;

        // 檢查多檔案警告
        const hasMultiFileWarning = this.checkMultiFileWarning(inputs);

        // 更新 UI
        this.updateContent();

        // 如果有多檔案警告，不產生輸出
        if (hasMultiFileWarning) {
            this.previewBuffers = [];
            this.previewFilenames = [];
            this.syncPreviewToFiles();
            return { audio: null, audioFiles: [], filenames: [] };
        }

        // 檢查是否兩個輸入都有效
        if (!audio1 && !audio2) {
            return { audio: null, audioFiles: [], filenames: [] };
        }

        if (!audio1) {
            this.data.warningMessage = '請連接音軌1';
            this.updateContent();
            return { audio: null, audioFiles: [], filenames: [] };
        }

        if (!audio2) {
            this.data.warningMessage = '請連接音軌2';
            this.updateContent();
            return { audio: null, audioFiles: [], filenames: [] };
        }

        try {
            // 計算混音比例
            const balance1 = this.data.balance / 100;        // 音軌1 的比例
            const balance2 = (100 - this.data.balance) / 100; // 音軌2 的比例

            // 執行混音處理
            const result = audioProcessor.mixAudio(audio1, audio2, balance1, balance2, this.data.autoNormalize);

            // 如果有標準化，顯示提示
            if (result.normalized && this.data.autoNormalize) {
                showToast('已自動調整音量防止削波', 'info');
            }

            // 如果有削波警告
            if (result.clipped && !this.data.autoNormalize) {
                showToast('音訊可能有削波失真', 'warning');
            }

            // 生成輸出檔名
            const filename1 = inputs.filenames1?.[0] || inputs.filenames?.[0] || '音軌1';
            const filename2 = inputs.filenames2?.[0] || (inputs.filenames?.[1] || '音軌2');
            const outputFilename = `mixed_${filename1}_${filename2}`.replace(/\.[^.]+$/, '');

            // 更新預覽
            this.previewBuffers = [result.buffer];
            this.previewFilenames = [outputFilename];
            this.syncPreviewToFiles();

            return {
                audio: result.buffer,
                audioFiles: [result.buffer],
                filenames: [outputFilename]
            };
        } catch (error) {
            console.error('混音失敗:', error);
            showToast('混音失敗: ' + error.message, 'error');
            return { audio: null, audioFiles: [], filenames: [] };
        }
    }

    /**
     * 序列化
     */
    toJSON() {
        return super.toJSON();
    }
}

// 匯出
window.MixNode = MixNode;
