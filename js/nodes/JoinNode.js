/**
 * 串接音訊節點 - 將兩個音訊首尾相接成一個長音訊
 * 輸出長度 = 輸入1長度 + 輸入2長度
 */

class JoinNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            hasWarning: false,
            warningMessage: ''
        };
        super(id, 'join', '串接音訊', '🔗', options, defaultData);
    }

    setupPorts() {
        this.addInputPort('audio1', '前段音訊', 'audio');
        this.addInputPort('audio2', '後段音訊', 'audio');
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
        const hasWarning = this.data.hasWarning;
        const warningMessage = this.data.warningMessage;

        return `
            <div class="join-inputs-container">
                <div class="join-input-row" data-port="audio1">
                    <div class="node-port input" 
                         data-port="audio1" 
                         data-type="input" 
                         data-datatype="audio" 
                         title="前段音訊">
                    </div>
                    <span class="join-input-label">輸入1（前段）</span>
                    <span class="join-input-status ${input1Port?.connected ? 'connected' : ''}">${input1Port?.connected ? '✓' : '○'}</span>
                </div>
                <div class="join-input-row" data-port="audio2">
                    <div class="node-port input" 
                         data-port="audio2" 
                         data-type="input" 
                         data-datatype="audio" 
                         title="後段音訊">
                    </div>
                    <span class="join-input-label">輸入2（後段）</span>
                    <span class="join-input-status ${input2Port?.connected ? 'connected' : ''}">${input2Port?.connected ? '✓' : '○'}</span>
                </div>
                ${hasWarning ? `
                <div class="join-warning">
                    <span class="join-warning-icon">⚠️</span>
                    <span class="join-warning-text">${warningMessage}</span>
                </div>
                ` : ''}
                ${!input1Port?.connected && !input2Port?.connected ? `
                <div class="join-hint">
                    <span style="color: var(--text-muted); font-size: var(--text-sm);">請連接兩個音訊來源</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    bindContentEvents() {
        // 綁定輸入端口事件
        const portEls = this.element.querySelectorAll('.join-input-row .node-port.input');
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
            }
        });
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
            warningMessage = '串接音訊節點僅支援單一檔案輸入，請確保輸入來源只有一個檔案';
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
            this.data.warningMessage = '請連接輸入1（前段音訊）';
            this.updateContent();
            return { audio: null, audioFiles: [], filenames: [] };
        }

        if (!audio2) {
            this.data.warningMessage = '請連接輸入2（後段音訊）';
            this.updateContent();
            return { audio: null, audioFiles: [], filenames: [] };
        }

        try {
            // 執行串接處理
            const joinedBuffer = audioProcessor.joinAudio(audio1, audio2);

            // 生成輸出檔名
            const filename1 = inputs.filenames1?.[0] || inputs.filenames?.[0] || '音訊1';
            const filename2 = inputs.filenames2?.[0] || (inputs.filenames?.[1] || '音訊2');
            const outputFilename = `joined_${filename1}_${filename2}`.replace(/\.[^.]+$/, '');

            // 更新預覽
            this.previewBuffers = [joinedBuffer];
            this.previewFilenames = [outputFilename];
            this.syncPreviewToFiles();

            return {
                audio: joinedBuffer,
                audioFiles: [joinedBuffer],
                filenames: [outputFilename]
            };
        } catch (error) {
            console.error('串接音訊失敗:', error);
            showToast('串接音訊失敗: ' + error.message, 'error');
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
window.JoinNode = JoinNode;
