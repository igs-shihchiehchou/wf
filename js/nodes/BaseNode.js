/**
 * 節點基類 - 所有節點類型的基礎
 */

class BaseNode {
    constructor(id, type, title, icon, options = {}, defaultData = {}) {
        this.id = id;
        this.type = type;
        this.title = title;
        this.icon = icon;

        // 位置
        this.x = options.x || 0;
        this.y = options.y || 0;

        // 端口
        this.ports = [];
        this.inputPorts = [];
        this.outputPorts = [];

        // 狀態
        this.collapsed = false;
        this.processing = false;

        // 資料 - 先設定預設值，子類別可透過 defaultData 傳入
        this.data = { ...defaultData };

        // 事件回調
        this.onDelete = null;
        this.onPortConnect = null;
        this.onPortDisconnect = null;
        this.onDataChange = null;
        this.onPortDragStart = null;
        this.onGetInputData = null;

        // 預覽相關
        this.previewBuffer = null;
        this.previewWavesurfer = null;
        this.previewVisible = false;
        this.previewUpdateTimer = null;

        // 設定端口（子類別實作）
        this.setupPorts();

        // 建立 DOM（在 data 和 ports 設定後）
        this.element = this.createElement();
        this.setPosition(this.x, this.y);

        // 綁定內容事件
        this.bindContentEvents();
    }

    // 由子類別實作 - 設定端口
    setupPorts() {
        // 子類別覆寫
    }

    createElement() {
        const node = document.createElement('div');
        node.className = `graph-node node-${this.type}`;
        node.id = this.id;
        node.dataset.type = this.getNodeCategory();

        node.innerHTML = `
      <div class="node-header">
        <div class="node-header-left">
          <span class="node-color-dot"></span>
          <span class="node-icon">${this.icon}</span>
          <span class="node-title">${this.title}</span>
        </div>
        <div class="node-header-actions">
          <button class="node-action-btn collapse" title="折疊">▼</button>
          <button class="node-action-btn delete" title="刪除">×</button>
        </div>
      </div>
      <div class="node-content">
        ${this.renderContent()}
        ${this.renderPreview()}
      </div>
      <div class="node-ports-section">
        ${this.renderPorts()}
      </div>
    `;

        // 綁定事件
        this.bindEvents(node);

        // 綁定預覽事件（傳入 node 而非使用 this.element）
        this.bindPreviewEvents(node);

        return node;
    }

    getNodeCategory() {
        // 由子類別覆寫
        return 'process';
    }

    renderContent() {
        // 由子類別覆寫
        return '';
    }

    renderPorts() {
        let html = '<div class="node-ports">';

        // 計算最大行數
        const maxRows = Math.max(this.inputPorts.length, this.outputPorts.length);

        for (let i = 0; i < maxRows; i++) {
            const input = this.inputPorts[i];
            const output = this.outputPorts[i];

            let rowClass = 'node-port-row';
            if (!input) rowClass += ' output-only';
            if (!output) rowClass += ' input-only';

            html += `<div class="${rowClass}">`;

            if (input) {
                html += `
          <div class="node-port input" data-port="${input.name}" data-type="input" data-datatype="${input.dataType}"></div>
          <span class="node-port-label input">${input.label}</span>
        `;
            }

            if (output) {
                html += `
          <span class="node-port-label output">${output.label}</span>
          <div class="node-port output" data-port="${output.name}" data-type="output" data-datatype="${output.dataType}"></div>
        `;
            }

            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ========== 預覽功能（所有節點共用）==========

    renderPreview() {
        // 只有處理節點才顯示預覽區域
        if (this.getNodeCategory() === 'input') return '';

        return `
      <div class="node-preview" style="display: none;">
        <div class="node-preview-header">
          <span class="node-preview-label">預覽</span>
          <button class="node-preview-close" data-action="close-preview">×</button>
        </div>
        <div class="node-waveform" id="preview-waveform-${this.id}"></div>
        <div class="node-playback">
          <button class="node-play-btn" data-action="preview-play">▶</button>
          <span class="node-time">
            <span class="preview-current-time">00:00</span> / <span class="preview-total-time">00:00</span>
          </span>
          <button class="node-download-btn" data-action="preview-download" title="下載">⬇</button>
        </div>
      </div>
      <button class="node-btn node-preview-btn" data-action="show-preview">🎧 預覽結果</button>
    `;
    }

    bindPreviewEvents(node) {
        // 使用傳入的 node 或 this.element
        const element = node || this.element;
        if (!element) return;

        // 預覽按鈕
        const previewBtn = element.querySelector('[data-action="show-preview"]');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.showPreview());
        }

        // 關閉預覽
        const closeBtn = element.querySelector('[data-action="close-preview"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hidePreview());
        }

        // 播放按鈕
        const playBtn = element.querySelector('[data-action="preview-play"]');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePreviewPlay());
        }

        // 下載按鈕
        const downloadBtn = element.querySelector('[data-action="preview-download"]');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadPreview());
        }
    }

    async showPreview() {
        const previewEl = this.element.querySelector('.node-preview');
        const previewBtn = this.element.querySelector('.node-preview-btn');
        if (!previewEl) return;

        // 標記預覽已開啟
        this.previewVisible = true;

        // 執行此節點取得處理後的音訊
        try {
            this.setProcessing(true);

            // 取得輸入資料
            const inputs = await this.getInputData();
            const outputs = await this.process(inputs);

            // 取得輸出的音訊
            this.previewBuffer = outputs.audio;

            if (!this.previewBuffer) {
                showToast('沒有音訊可預覽，請先連接輸入', 'warning');
                this.setProcessing(false);
                return;
            }

            // 顯示預覽區域
            previewEl.style.display = 'block';
            if (previewBtn) previewBtn.style.display = 'none';

            // 更新時間顯示
            const totalTimeEl = this.element.querySelector('.preview-total-time');
            if (totalTimeEl) {
                totalTimeEl.textContent = formatTime(this.previewBuffer.duration);
            }

            // 初始化波形
            await this.initPreviewWaveSurfer();

            this.setProcessing(false);
        } catch (error) {
            this.setProcessing(false);
            showToast('預覽失敗: ' + error.message, 'error');
            console.error('預覽失敗:', error);
        }
    }

    hidePreview() {
        this.previewVisible = false;
        const previewEl = this.element.querySelector('.node-preview');
        const previewBtn = this.element.querySelector('.node-preview-btn');
        if (previewEl) previewEl.style.display = 'none';
        if (previewBtn) previewBtn.style.display = 'block';

        // 銷毀 wavesurfer
        if (this.previewWavesurfer) {
            try {
                this.previewWavesurfer.destroy();
            } catch (e) { }
            this.previewWavesurfer = null;
        }
    }

    async initPreviewWaveSurfer() {
        const container = this.element.querySelector(`#preview-waveform-${this.id}`);
        if (!container || !this.previewBuffer) return;

        // 銷毀舊的
        if (this.previewWavesurfer) {
            try {
                this.previewWavesurfer.destroy();
            } catch (e) { }
            this.previewWavesurfer = null;
        }

        try {
            this.previewWavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(242 68% 80% / 0.6)',
                progressColor: 'hsl(242 68% 80%)',
                cursorColor: 'hsl(58 40% 92%)',
                height: 40,
                barWidth: 2,
                barGap: 1,
                responsive: true,
                normalize: true
            });

            const wavData = audioBufferToWav(this.previewBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            await this.previewWavesurfer.loadBlob(blob);

            this.previewWavesurfer.on('timeupdate', (currentTime) => {
                const timeEl = this.element.querySelector('.preview-current-time');
                if (timeEl) timeEl.textContent = formatTime(currentTime);
            });

            this.previewWavesurfer.on('play', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '⏸';
            });

            this.previewWavesurfer.on('pause', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '▶';
            });

            this.previewWavesurfer.on('finish', () => {
                const btn = this.element.querySelector('[data-action="preview-play"]');
                if (btn) btn.textContent = '▶';
            });
        } catch (error) {
            console.error('預覽 WaveSurfer 載入失敗:', error);
        }
    }

    togglePreviewPlay() {
        if (this.previewWavesurfer) {
            this.previewWavesurfer.playPause();
        }
    }

    downloadPreview() {
        if (!this.previewBuffer) {
            showToast('沒有音訊可下載', 'warning');
            return;
        }

        try {
            const wavData = audioBufferToWav(this.previewBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.title}_processed.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('下載已開始', 'success');
        } catch (error) {
            showToast('下載失敗: ' + error.message, 'error');
        }
    }

    // 取得輸入資料（需要 graphEngine 支援）
    async getInputData() {
        if (this.onGetInputData) {
            return await this.onGetInputData(this);
        }
        return {};
    }

    // 當節點資料變更時呼叫，自動更新預覽
    schedulePreviewUpdate() {
        if (!this.previewVisible) return;

        // 防抖動：清除之前的計時器
        if (this.previewUpdateTimer) {
            clearTimeout(this.previewUpdateTimer);
        }

        // 延遲 300ms 後更新
        this.previewUpdateTimer = setTimeout(() => {
            this.refreshPreview();
        }, 300);
    }

    // 重新整理預覽（不隱藏再顯示）
    async refreshPreview() {
        if (!this.previewVisible) return;

        try {
            // 取得輸入資料
            const inputs = await this.getInputData();
            const outputs = await this.process(inputs);

            // 取得輸出的音訊
            this.previewBuffer = outputs.audio;

            if (!this.previewBuffer) return;

            // 更新時間顯示
            const totalTimeEl = this.element.querySelector('.preview-total-time');
            if (totalTimeEl) {
                totalTimeEl.textContent = formatTime(this.previewBuffer.duration);
            }

            // 重新載入波形
            await this.initPreviewWaveSurfer();
        } catch (error) {
            console.error('預覽更新失敗:', error);
        }
    }

    bindEvents(node) {
        // 折疊按鈕
        const collapseBtn = node.querySelector('.node-action-btn.collapse');
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        });

        // 刪除按鈕
        const deleteBtn = node.querySelector('.node-action-btn.delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onDelete) {
                this.onDelete();
            }
        });

        // 端口事件
        const ports = node.querySelectorAll('.node-port');
        ports.forEach(portEl => {
            const portName = portEl.dataset.port;
            const portType = portEl.dataset.type;
            const port = this.findPort(portName, portType);

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

    // ========== 端口管理 ==========

    addInputPort(name, label, dataType = 'audio') {
        const port = {
            name,
            label,
            dataType,
            type: 'input',
            connected: false,
            element: null,
            nodeId: this.id
        };
        this.inputPorts.push(port);
        this.ports.push(port);
        return port;
    }

    addOutputPort(name, label, dataType = 'audio') {
        const port = {
            name,
            label,
            dataType,
            type: 'output',
            connected: false,
            element: null,
            nodeId: this.id
        };
        this.outputPorts.push(port);
        this.ports.push(port);
        return port;
    }

    findPort(name, type) {
        return this.ports.find(p => p.name === name && p.type === type);
    }

    findPortByElement(element) {
        return this.ports.find(p => p.element === element);
    }

    getInputPort(name) {
        return this.inputPorts.find(p => p.name === name);
    }

    getOutputPort(name) {
        return this.outputPorts.find(p => p.name === name);
    }

    // ========== 位置 ==========

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    }

    // ========== 狀態 ==========

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        const content = this.element.querySelector('.node-content');
        const collapseBtn = this.element.querySelector('.node-action-btn.collapse');

        if (this.collapsed) {
            content.classList.add('collapsed');
            collapseBtn.textContent = '▶';
        } else {
            content.classList.remove('collapsed');
            collapseBtn.textContent = '▼';
        }
    }

    setProcessing(processing) {
        this.processing = processing;
        if (processing) {
            this.element.classList.add('processing');
        } else {
            this.element.classList.remove('processing');
        }
    }

    // ========== 資料 ==========

    setData(key, value) {
        this.data[key] = value;
        if (this.onDataChange) {
            this.onDataChange(key, value);
        }
    }

    getData(key) {
        return this.data[key];
    }

    // ========== 處理（由子類別實作） ==========

    async process(inputs) {
        // 由子類別覆寫
        // inputs: { portName: data }
        // 返回: { portName: data }
        return {};
    }

    // ========== 更新 UI ==========

    updateContent() {
        const contentEl = this.element.querySelector('.node-content');
        contentEl.innerHTML = this.renderContent();
        this.bindContentEvents();
    }

    bindContentEvents() {
        // 由子類別覆寫，綁定內容區域的事件
    }

    // ========== 序列化 ==========

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            collapsed: this.collapsed,
            data: { ...this.data }
        };
    }

    static fromJSON(json) {
        // 由子類別實作
        return null;
    }
}

// 匯出
window.BaseNode = BaseNode;
