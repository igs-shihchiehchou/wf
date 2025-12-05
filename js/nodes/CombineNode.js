/**
 * 合併節點 - 將多個音訊輸入合併成一個列表
 * 支援動態新增/移除輸入點
 */

class CombineNode extends BaseNode {
    constructor(id, options = {}) {
        const defaultData = {
            inputCount: options.inputCount || 2,  // 預設 2 個輸入點
            minInputCount: 2  // 最少 2 個輸入點
        };

        // 在 super() 之前初始化（因為 renderContent 會在 super 中被呼叫）
        // 這些屬性會在 super() 後被正式設定

        super(id, 'combine', '合併節點', '🔗', options, defaultData);

        // 初始化動態輸入端口（如果尚未初始化）
        if (!this.dynamicInputPorts || this.dynamicInputPorts.length === 0) {
            this.initDynamicInputPorts(this.data.inputCount);
        }
    }

    setupPorts() {
        // 動態輸入端口資料（在 setupPorts 中初始化以確保在 renderContent 之前完成）
        this.dynamicInputPorts = [];

        // 初始化動態輸入端口
        const inputCount = this.data?.inputCount || 2;
        for (let i = 0; i < inputCount; i++) {
            this.addDynamicInputPort(i);
        }

        // 設定輸出端口
        this.addOutputPort('audio', 'audio', 'audio');
    }

    /**
     * 初始化動態輸入端口
     */
    initDynamicInputPorts(count) {
        this.dynamicInputPorts = [];
        this.inputPorts = [];
        this.ports = this.ports.filter(p => p.type !== 'input');

        for (let i = 0; i < count; i++) {
            this.addDynamicInputPort(i);
        }
    }

    /**
     * 新增一個動態輸入端口
     */
    addDynamicInputPort(index) {
        const portName = `audio-${index}`;
        const port = {
            name: portName,
            label: `音訊輸入 ${index + 1}`,
            dataType: 'audio',
            type: 'input',
            connected: false,
            element: null,
            nodeId: this.id,
            index: index
        };
        this.inputPorts.push(port);
        this.ports.push(port);
        this.dynamicInputPorts.push(port);
        return port;
    }

    getNodeCategory() {
        return 'process';
    }

    /**
     * 覆寫 createElement 以支援動態輸入端口
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
        const inputCount = this.data.inputCount || 2;
        const minInputCount = this.data.minInputCount || 2;

        // 防禦性檢查：確保 dynamicInputPorts 已初始化
        if (!this.dynamicInputPorts) {
            this.dynamicInputPorts = [];
        }

        let portsHtml = '';
        for (let i = 0; i < inputCount; i++) {
            const port = this.dynamicInputPorts[i];
            const canRemove = inputCount > minInputCount;

            portsHtml += `
                <div class="combine-input-row" data-index="${i}">
                    <div class="node-port input combine-input-port" 
                         data-port="audio-${i}" 
                         data-type="input" 
                         data-datatype="audio" 
                         data-index="${i}"
                         title="音訊輸入 ${i + 1}">
                    </div>
                    <span class="combine-input-label">輸入 ${i + 1}</span>
                    <span class="combine-input-status ${port?.connected ? 'connected' : ''}">${port?.connected ? '✓' : '○'}</span>
                    ${canRemove ? `<button class="combine-remove-btn" data-action="remove-input" data-index="${i}" title="移除輸入點">×</button>` : ''}
                </div>
            `;
        }

        // 計算已連接數量
        const connectedCount = this.dynamicInputPorts.filter(p => p?.connected).length;

        return `
            <div class="combine-inputs-container">
                <div class="combine-inputs-header">
                    <span class="combine-inputs-count">${connectedCount}/${inputCount} 個輸入已連接</span>
                </div>
                <div class="combine-inputs-list">
                    ${portsHtml}
                </div>
                <button class="node-btn combine-add-btn" data-action="add-input">
                    <span>＋</span> 新增輸入點
                </button>
            </div>
        `;
    }

    bindContentEvents() {
        // 新增輸入點按鈕
        const addBtn = this.element.querySelector('[data-action="add-input"]');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addInput());
        }

        // 移除輸入點按鈕
        const removeBtns = this.element.querySelectorAll('[data-action="remove-input"]');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeInput(index);
            });
        });

        // 綁定動態輸入端口事件
        const portEls = this.element.querySelectorAll('.combine-input-port');
        portEls.forEach(portEl => {
            const index = parseInt(portEl.dataset.index);
            const port = this.dynamicInputPorts[index];

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
     * 新增一個輸入點
     */
    addInput() {
        const newIndex = this.data.inputCount;
        this.data.inputCount++;

        // 新增端口
        this.addDynamicInputPort(newIndex);

        // 更新 UI
        this.updateContent();

        showToast(`已新增輸入點 ${newIndex + 1}`, 'success');
    }

    /**
     * 移除一個輸入點
     */
    removeInput(index) {
        const port = this.dynamicInputPorts[index];

        // 檢查是否已連接
        if (port && port.connected) {
            showToast('請先移除連線再刪除輸入點', 'warning');
            return;
        }

        // 檢查是否已達最小數量
        if (this.data.inputCount <= this.data.minInputCount) {
            showToast(`至少需要 ${this.data.minInputCount} 個輸入點`, 'warning');
            return;
        }

        // 移除端口
        const portIndex = this.ports.findIndex(p => p.name === `audio-${index}`);
        if (portIndex !== -1) {
            this.ports.splice(portIndex, 1);
        }

        const inputPortIndex = this.inputPorts.findIndex(p => p.name === `audio-${index}`);
        if (inputPortIndex !== -1) {
            this.inputPorts.splice(inputPortIndex, 1);
        }

        // 重新編號所有端口
        this.data.inputCount--;
        this.reindexInputPorts();

        // 更新 UI
        this.updateContent();

        showToast('已移除輸入點', 'info');
    }

    /**
     * 重新編號所有輸入端口
     */
    reindexInputPorts() {
        this.dynamicInputPorts = [];
        const oldInputPorts = [...this.inputPorts];

        this.inputPorts = [];
        this.ports = this.ports.filter(p => p.type !== 'input');

        for (let i = 0; i < this.data.inputCount; i++) {
            const oldPort = oldInputPorts[i];
            const port = {
                name: `audio-${i}`,
                label: `音訊輸入 ${i + 1}`,
                dataType: 'audio',
                type: 'input',
                connected: oldPort ? oldPort.connected : false,
                element: null,
                nodeId: this.id,
                index: i
            };
            this.inputPorts.push(port);
            this.ports.push(port);
            this.dynamicInputPorts.push(port);
        }
    }

    /**
     * 覆寫 getInputPort 以支援動態端口
     */
    getInputPort(name) {
        return this.inputPorts.find(p => p.name === name);
    }

    /**
     * 覆寫 findPort 以支援動態端口
     */
    findPort(name, type) {
        return this.ports.find(p => p.name === name && p.type === type);
    }

    /**
     * 取得多檔案項目（用於預覽）
     */
    getMultiFileItems() {
        return this.files.items;
    }

    /**
     * 取得檔案的 AudioBuffer
     */
    getFileBuffer(index) {
        const items = this.getMultiFileItems();
        return items[index]?.buffer || null;
    }

    /**
     * 取得檔案名稱
     */
    getFileName(index) {
        const items = this.getMultiFileItems();
        return items[index]?.filename || `檔案 ${index + 1}`;
    }

    /**
     * 取得多檔案總數
     */
    getMultiFileCount() {
        return this.files.items.length;
    }

    /**
     * 處理輸入並合併
     */
    async process(inputs) {
        const audioFiles = [];
        const filenames = [];

        // 依序收集所有輸入及其檔名
        for (let i = 0; i < this.data.inputCount; i++) {
            const portName = `audio-${i}`;
            const input = inputs[portName];

            if (input) {
                // 取得此端口的檔名
                const portFilenames = inputs._portFilenames?.[portName];

                // 檢查輸入是否為陣列格式（多檔案）
                if (Array.isArray(input)) {
                    audioFiles.push(...input);
                    // 對應的檔名也要展開
                    if (Array.isArray(portFilenames)) {
                        filenames.push(...portFilenames);
                    } else if (portFilenames) {
                        filenames.push(portFilenames);
                    } else {
                        // 為每個檔案生成預設名稱
                        for (let j = 0; j < input.length; j++) {
                            filenames.push(`輸入${i + 1}-檔案${j + 1}`);
                        }
                    }
                } else {
                    // 單一 AudioBuffer
                    audioFiles.push(input);
                    // 取得對應的檔名
                    if (Array.isArray(portFilenames)) {
                        filenames.push(portFilenames[0] || `輸入 ${i + 1}`);
                    } else if (portFilenames) {
                        filenames.push(portFilenames);
                    } else {
                        filenames.push(`輸入 ${i + 1}`);
                    }
                }
            }
        }

        // 確保檔名數量與檔案數量一致
        while (filenames.length < audioFiles.length) {
            filenames.push(`檔案 ${filenames.length + 1}`);
        }

        // 更新預覽資料
        this.previewBuffers = audioFiles;
        this.previewFilenames = filenames;
        this.syncPreviewToFiles();

        // 更新連接狀態顯示
        this.updateContent();

        return {
            audio: audioFiles[0] || null,
            audioFiles: audioFiles,
            filenames: this.previewFilenames
        };
    }

    /**
     * 序列化
     */
    toJSON() {
        const json = super.toJSON();
        json.inputCount = this.data.inputCount;
        return json;
    }
}

// 匯出
window.CombineNode = CombineNode;
