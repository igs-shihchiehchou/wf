/**
 * 圖形執行引擎 - 管理節點連接與資料流
 */

class GraphEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.nodeIdCounter = 0;
        this.linkIdCounter = 0;

        // 節點註冊表
        this.nodeTypes = {
            'audio-input': AudioInputNode,
            'volume': VolumeNode,
            'crop': CropNode,
            'fade-in': FadeInNode,
            'fade-out': FadeOutNode,
            'speed': SpeedNode,
            'pitch': PitchNode,
            'smart-pitch': SmartPitchNode,
            'key-integration': KeyIntegrationNode,
            'combine': CombineNode,
            'join': JoinNode,
            'mix': MixNode
        };

        // 綁定畫布事件
        this.bindCanvasEvents();
    }

    bindCanvasEvents() {
        // 建立連線
        this.canvas.onLinkCreate = (sourceNode, sourcePort, targetNode, targetPort) => {
            this.createLink(sourceNode, sourcePort, targetNode, targetPort);
        };

        // 刪除連線
        this.canvas.onLinkDelete = (link) => {
            this.onLinkDeleted(link);
        };

        // 建立節點
        this.canvas.onNodeCreate = (type, x, y) => {
            this.createNode(type, x, y);
        };

        // 右鍵選單
        this.canvas.onContextMenu = (e) => {
            this.showContextMenu(e);
        };
    }

    // ========== 節點管理 ==========

    createNode(type, x, y) {
        const NodeClass = this.nodeTypes[type];
        if (!NodeClass) {
            console.error('未知的節點類型:', type);
            return null;
        }

        const id = `node-${++this.nodeIdCounter}`;
        const node = new NodeClass(id, { x, y });

        // 綁定節點事件
        node.onDelete = () => {
            this.canvas.removeNode(node.id);
        };

        node.onPortDragStart = (port, node) => {
            this.canvas.startDraggingLink(port, node);
        };

        node.onDataChange = (key, value) => {
            // 當節點資料變更時，重新執行圖形
            this.executeFromNode(node.id);
        };

        // 提供取得輸入資料的方法（用於預覽功能）
        node.onGetInputData = async (targetNode) => {
            return await this.getNodeInputData(targetNode.id);
        };

        // 加入畫布
        this.canvas.addNode(node);

        return node;
    }

    // ========== 複製貼上 ==========

    /**
     * 複製選取的節點
     * @returns {Object|null} 剪貼簿資料，格式與存檔相同
     */
    copySelectedNodes() {
        const selectedIds = this.canvas.selectedNodes;
        if (selectedIds.size === 0) {
            return null;
        }

        const nodes = [];
        const links = [];

        // 收集選取的節點資料
        selectedIds.forEach(nodeId => {
            const node = this.canvas.nodes.get(nodeId);
            if (node) {
                nodes.push(node.toJSON());
            }
        });

        // 收集選取節點之間的連線
        this.canvas.links.forEach(link => {
            if (selectedIds.has(link.sourceNodeId) && selectedIds.has(link.targetNodeId)) {
                links.push({
                    sourceNodeId: link.sourceNodeId,
                    sourcePortName: link.sourcePort.name,
                    targetNodeId: link.targetNodeId,
                    targetPortName: link.targetPort.name
                });
            }
        });

        showToast(`已複製 ${nodes.length} 個節點`, 'success');

        // 格式與存檔相同，方便互通
        return {
            transform: null,  // 複製時不包含視圖變換
            nodes,
            links
        };
    }

    /**
     * 貼上節點（也可用於從檔案載入後貼上）
     * @param {Object} data 剪貼簿資料或檔案資料
     * @param {number} offsetX X 偏移量（預設 50，設為 0 可保持原位置）
     * @param {number} offsetY Y 偏移量（預設 50，設為 0 可保持原位置）
     */
    pasteNodes(data, offsetX = 50, offsetY = 50) {
        if (!data || !data.nodes || data.nodes.length === 0) {
            return;
        }

        // 清除目前選取
        this.canvas.clearSelection();

        // 建立 ID 對照表（舊 ID -> 新 ID）
        const idMap = new Map();
        const newNodes = [];

        // 建立新節點
        for (const nodeData of data.nodes) {
            const newNode = this.createNode(
                nodeData.type,
                nodeData.x + offsetX,
                nodeData.y + offsetY
            );

            if (newNode) {
                idMap.set(nodeData.id, newNode.id);
                newNodes.push(newNode);

                // 恢復節點資料（排除音訊相關資料，因為無法複製 AudioBuffer）
                if (nodeData.data) {
                    const dataToCopy = { ...nodeData.data };
                    // 不複製 AudioBuffer 相關資料
                    delete dataToCopy.audioBuffer;
                    Object.assign(newNode.data, dataToCopy);
                    newNode.updateContent();

                    // 恢復節點尺寸
                    if (nodeData.data.width) {
                        newNode.element.style.width = nodeData.data.width + 'px';
                    }
                    if (nodeData.data.height) {
                        newNode.element.style.minHeight = nodeData.data.height + 'px';
                    }
                }

                if (nodeData.collapsed) {
                    newNode.toggleCollapse();
                }

                // 選取新建立的節點
                this.canvas.selectNode(newNode.id);
            }
        }

        // 恢復連線
        for (const linkData of data.links) {
            const newSourceId = idMap.get(linkData.sourceNodeId);
            const newTargetId = idMap.get(linkData.targetNodeId);

            if (newSourceId && newTargetId) {
                const sourceNode = this.canvas.nodes.get(newSourceId);
                const targetNode = this.canvas.nodes.get(newTargetId);

                if (sourceNode && targetNode) {
                    const sourcePort = sourceNode.getOutputPort(linkData.sourcePortName);
                    const targetPort = targetNode.getInputPort(linkData.targetPortName);

                    if (sourcePort && targetPort) {
                        // 建立連線但不顯示 toast
                        const id = `link-${++this.linkIdCounter}`;
                        const link = new GraphLink(id, sourceNode.id, sourcePort, targetNode.id, targetPort);

                        link.onSelect = (link) => {
                            this.canvas.clearSelection();
                            this.canvas.selectedLinks.add(link.id);
                            link.setSelected(true);
                        };

                        link.onContextMenu = (link, e) => {
                            this.showLinkContextMenu(link, e);
                        };

                        this.canvas.addLink(link);
                    }
                }
            }
        }

        showToast(`已貼上 ${newNodes.length} 個節點`, 'success');
    }

    // ========== 連線管理 ==========

    createLink(sourceNode, sourcePort, targetNode, targetPort) {
        // 檢查是否已存在相同連線
        const existingLink = this.findLink(sourceNode.id, sourcePort.name, targetNode.id, targetPort.name);
        if (existingLink) {
            showToast('連線已存在', 'info');
            return null;
        }

        // 檢查目標端口是否已有連線（輸入端口只能有一個連線）
        const existingInputLink = this.findLinkByInputPort(targetNode.id, targetPort.name);
        if (existingInputLink) {
            // 移除舊連線
            this.canvas.removeLink(existingInputLink.id);
        }

        const id = `link-${++this.linkIdCounter}`;
        const link = new GraphLink(id, sourceNode.id, sourcePort, targetNode.id, targetPort);

        // 綁定連線事件
        link.onSelect = (link) => {
            this.canvas.clearSelection();
            this.canvas.selectedLinks.add(link.id);
            link.setSelected(true);
        };

        link.onContextMenu = (link, e) => {
            this.showLinkContextMenu(link, e);
        };

        // 加入畫布
        this.canvas.addLink(link);

        // 如果是預覽輸出端口連線，更新連線狀態
        if (sourcePort.isPreviewOutput) {
            sourceNode.setPreviewOutputConnection(sourcePort.fileIndex, true);
            sourceNode.refreshMultiFileUI();
        }

        // 如果目標節點是合併節點，更新其 UI
        if (targetNode.type === 'combine') {
            targetNode.updateContent();
        }

        // 執行資料流
        this.executeFromNode(targetNode.id);

        showToast('已建立連線', 'success');
        return link;
    }

    findLink(sourceNodeId, sourcePortName, targetNodeId, targetPortName) {
        for (const [id, link] of this.canvas.links) {
            if (link.sourceNodeId === sourceNodeId &&
                link.sourcePort.name === sourcePortName &&
                link.targetNodeId === targetNodeId &&
                link.targetPort.name === targetPortName) {
                return link;
            }
        }
        return null;
    }

    findLinkByInputPort(nodeId, portName) {
        for (const [id, link] of this.canvas.links) {
            if (link.targetNodeId === nodeId && link.targetPort.name === portName) {
                return link;
            }
        }
        return null;
    }

    findLinksByOutputPort(nodeId, portName) {
        const links = [];
        for (const [id, link] of this.canvas.links) {
            if (link.sourceNodeId === nodeId && link.sourcePort.name === portName) {
                links.push(link);
            }
        }
        return links;
    }

    onLinkDeleted(link) {
        // 如果是預覽輸出端口連線，更新連線狀態
        if (link.sourcePort && link.sourcePort.isPreviewOutput) {
            const sourceNode = this.canvas.nodes.get(link.sourceNodeId);
            if (sourceNode) {
                sourceNode.setPreviewOutputConnection(link.sourcePort.fileIndex, false);
                sourceNode.refreshMultiFileUI();
            }
        }

        // 當連線被刪除時，更新目標節點的 UI
        const targetNode = this.canvas.nodes.get(link.targetNodeId);

        if (targetNode) {
            // 如果目標節點是合併節點，更新其 UI
            if (targetNode.type === 'combine') {
                targetNode.updateContent();
            }

            // 重新執行目標節點及其下游節點以更新預覽
            this.executeFromNode(targetNode.id);
        }
    }

    /**
     * 清除節點及其所有下游節點的預覽
     */
    clearNodeAndDownstream(node) {
        // 清除當前節點
        if (node.updateInputAudio) {
            node.updateInputAudio(null);
        }
        if (node.setAudioBuffer) {
            node.setAudioBuffer(null);
        }
        if (node.clearPreview) {
            node.clearPreview();
        }

        // 找出所有從此節點輸出的連線，遞迴清除下游節點
        for (const outputPort of node.outputPorts) {
            const downstreamLinks = this.findLinksByOutputPort(node.id, outputPort.name);
            for (const link of downstreamLinks) {
                const downstreamNode = this.canvas.nodes.get(link.targetNodeId);
                if (downstreamNode) {
                    this.clearNodeAndDownstream(downstreamNode);
                }
            }
        }
    }

    // ========== 圖形執行 ==========

    // 取得節點的輸入資料（用於預覽功能）
    async getNodeInputData(nodeId) {
        const node = this.canvas.nodes.get(nodeId);
        if (!node) return {};

        const inputs = {};

        // 為合併節點特別處理：為每個端口分別儲存檔名
        const isCombineNode = node.type === 'combine';
        // 為 Join 和 Mix 節點特別處理：需要分別傳遞兩個輸入的檔名
        const isJoinOrMixNode = node.type === 'join' || node.type === 'mix';
        
        if (isCombineNode) {
            inputs._portFilenames = {};  // 儲存每個端口的檔名
        }

        for (const port of node.inputPorts) {
            const link = this.findLinkByInputPort(nodeId, port.name);
            if (link) {
                const sourceNode = this.canvas.nodes.get(link.sourceNodeId);
                if (sourceNode) {
                    // 遞迴取得來源節點的輸入並處理
                    const sourceInputs = await this.getNodeInputData(link.sourceNodeId);
                    const sourceOutput = await sourceNode.process(sourceInputs);

                    // 檢查是否來自預覽輸出端口（單一檔案）
                    if (link.sourcePort.isPreviewOutput) {
                        const fileIndex = link.sourcePort.fileIndex;
                        // 從多檔案中取得指定索引的單一檔案
                        if (sourceOutput.audioFiles && sourceOutput.audioFiles[fileIndex]) {
                            inputs[port.name] = sourceOutput.audioFiles[fileIndex];

                            // 為合併節點儲存每個端口的檔名
                            if (isCombineNode) {
                                inputs._portFilenames[port.name] = sourceOutput.filenames?.[fileIndex] || `檔案`;
                            } else if (isJoinOrMixNode) {
                                // 為 Join/Mix 節點儲存每個輸入端口的檔名和檔案陣列
                                const portSuffix = port.name === 'audio1' ? '1' : '2';
                                inputs[`audioFiles${portSuffix}`] = [sourceOutput.audioFiles[fileIndex]];
                                inputs[`filenames${portSuffix}`] = [sourceOutput.filenames?.[fileIndex] || '檔案'];
                            } else {
                                inputs.audioFiles = [sourceOutput.audioFiles[fileIndex]];
                                if (sourceOutput.filenames && sourceOutput.filenames[fileIndex]) {
                                    inputs.filenames = [sourceOutput.filenames[fileIndex]];
                                }
                            }
                        } else {
                            inputs[port.name] = sourceOutput[link.sourcePort.name];
                        }
                    } else {
                        // 傳遞主要端口資料
                        inputs[port.name] = sourceOutput[link.sourcePort.name];

                        // 為合併節點儲存每個端口的檔名
                        if (isCombineNode) {
                            // 取得來源的檔名（優先使用 filenames，否則使用預設）
                            if (sourceOutput.filenames && sourceOutput.filenames.length > 0) {
                                inputs._portFilenames[port.name] = sourceOutput.filenames;
                            } else {
                                inputs._portFilenames[port.name] = [`檔案`];
                            }
                        } else if (isJoinOrMixNode) {
                            // 為 Join/Mix 節點儲存每個輸入端口的檔名和檔案陣列
                            const portSuffix = port.name === 'audio1' ? '1' : '2';
                            if (sourceOutput.audioFiles) {
                                inputs[`audioFiles${portSuffix}`] = sourceOutput.audioFiles;
                            }
                            if (sourceOutput.filenames && sourceOutput.filenames.length > 0) {
                                inputs[`filenames${portSuffix}`] = sourceOutput.filenames;
                            } else {
                                inputs[`filenames${portSuffix}`] = ['檔案'];
                            }
                        } else {
                            // 同時傳遞多檔案相關資料（如果存在）
                            if (sourceOutput.audioFiles) {
                                inputs.audioFiles = sourceOutput.audioFiles;
                            }
                            if (sourceOutput.filenames) {
                                inputs.filenames = sourceOutput.filenames;
                            }
                        }
                    }
                }
            }
        }
        return inputs;
    }

    async executeFromNode(startNodeId) {
        try {
            // 取得拓撲排序（從 startNode 開始的下游節點）
            const sortedNodes = this.getDownstreamNodes(startNodeId);

            // 執行每個節點
            for (const nodeId of sortedNodes) {
                await this.executeNode(nodeId);
            }
        } catch (error) {
            console.error('執行圖形失敗:', error);
            showToast('處理失敗: ' + error.message, 'error');
        }
    }

    async executeAll() {
        try {
            // 取得完整拓撲排序
            const sortedNodes = this.topologicalSort();

            // 執行每個節點
            for (const nodeId of sortedNodes) {
                await this.executeNode(nodeId);
            }

            showToast('執行完成', 'success');
        } catch (error) {
            console.error('執行圖形失敗:', error);
            showToast('處理失敗: ' + error.message, 'error');
        }
    }

    async executeNode(nodeId) {
        const node = this.canvas.nodes.get(nodeId);
        if (!node) return;

        // 收集輸入 - 使用遞迴取得完整輸入鏈
        const inputs = await this.getNodeInputData(nodeId);

        // 如果是裁切節點或需要更新輸入音訊的節點
        if (node.updateInputAudio) {
            // 傳遞完整輸入（支援多檔案）
            await node.updateInputAudio(inputs.audio || null, inputs.audioFiles, inputs.filenames);
        }

        // 執行節點
        node.setProcessing(true);
        try {
            await node.process(inputs);

            // 顯示連線動畫
            this.canvas.links.forEach(link => {
                if (link.sourceNodeId === nodeId) {
                    link.setActive(true);
                    setTimeout(() => link.setActive(false), 500);
                }
            });

            // 更新節點預覽（如果有預覽功能）
            if (node.updatePreview) {
                await node.updatePreview();
            }
        } finally {
            node.setProcessing(false);
        }
    }

    // ========== 拓撲排序 ==========

    topologicalSort() {
        const result = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (nodeId) => {
            if (visited.has(nodeId)) return;
            if (visiting.has(nodeId)) {
                throw new Error('偵測到循環依賴');
            }

            visiting.add(nodeId);

            // 先訪問所有上游節點
            for (const [id, link] of this.canvas.links) {
                if (link.targetNodeId === nodeId) {
                    visit(link.sourceNodeId);
                }
            }

            visiting.delete(nodeId);
            visited.add(nodeId);
            result.push(nodeId);
        };

        // 訪問所有節點
        for (const [nodeId] of this.canvas.nodes) {
            if (!visited.has(nodeId)) {
                visit(nodeId);
            }
        }

        return result;
    }

    getDownstreamNodes(startNodeId) {
        const result = [];
        const visited = new Set();
        const queue = [startNodeId];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);
            result.push(nodeId);

            // 找所有下游節點
            for (const [id, link] of this.canvas.links) {
                if (link.sourceNodeId === nodeId) {
                    queue.push(link.targetNodeId);
                }
            }
        }

        return result;
    }

    // ========== 右鍵選單 ==========

    showContextMenu(e) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = e.screenX + 'px';
        menu.style.top = e.screenY + 'px';

        menu.innerHTML = `
      <div class="context-menu-item" data-action="add-audio-input">
        <span class="context-menu-icon">📁</span>
        <span>新增音訊輸入</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="add-volume">
        <span class="context-menu-icon">🎚️</span>
        <span>新增音量調整</span>
      </div>
      <div class="context-menu-item" data-action="add-crop">
        <span class="context-menu-icon">✂️</span>
        <span>新增裁切</span>
      </div>
      <div class="context-menu-item" data-action="add-fade-in">
        <span class="context-menu-icon">📈</span>
        <span>新增淡入</span>
      </div>
      <div class="context-menu-item" data-action="add-fade-out">
        <span class="context-menu-icon">📉</span>
        <span>新增淡出</span>
      </div>
      <div class="context-menu-item" data-action="add-speed">
        <span class="context-menu-icon">⏩</span>
        <span>新增速度調整</span>
      </div>
      <div class="context-menu-item" data-action="add-pitch">
        <span class="context-menu-icon">🎵</span>
        <span>新增音高調整</span>
      </div>
      <div class="context-menu-item" data-action="add-smart-pitch">
        <span class="context-menu-icon">🎼</span>
        <span>新增智慧音高調整</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="add-combine">
        <span class="context-menu-icon">🔗</span>
        <span>新增合併節點</span>
      </div>
      <div class="context-menu-item" data-action="add-join">
        <span class="context-menu-icon">🔗</span>
        <span>新增串接音訊</span>
      </div>
      <div class="context-menu-item" data-action="add-mix">
        <span class="context-menu-icon">🎚️</span>
        <span>新增混音</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="fit-view">
        <span class="context-menu-icon">⊞</span>
        <span>適應畫布</span>
      </div>
      <div class="context-menu-item" data-action="reset-view">
        <span class="context-menu-icon">↺</span>
        <span>重置視圖</span>
      </div>
    `;

        // 綁定事件
        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleContextMenuAction(action, e.canvasX, e.canvasY);
                this.hideContextMenu();
            });
        });

        document.body.appendChild(menu);
        this.contextMenu = menu;

        // 點擊其他地方關閉選單
        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 0);
    }

    showLinkContextMenu(link, e) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        menu.innerHTML = `
      <div class="context-menu-item danger" data-action="delete-link">
        <span class="context-menu-icon">🗑️</span>
        <span>刪除連線</span>
      </div>
    `;

        menu.querySelector('[data-action="delete-link"]').addEventListener('click', () => {
            this.canvas.removeLink(link.id);
            this.hideContextMenu();
            showToast('已刪除連線', 'info');
        });

        document.body.appendChild(menu);
        this.contextMenu = menu;

        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 0);
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    handleContextMenuAction(action, x, y) {
        const nodeTypeMap = {
            'add-audio-input': 'audio-input',
            'add-volume': 'volume',
            'add-crop': 'crop',
            'add-fade-in': 'fade-in',
            'add-fade-out': 'fade-out',
            'add-speed': 'speed',
            'add-pitch': 'pitch',
            'add-smart-pitch': 'smart-pitch',
            'add-combine': 'combine',
            'add-join': 'join',
            'add-mix': 'mix'
        };

        if (nodeTypeMap[action]) {
            this.createNode(nodeTypeMap[action], x, y);
        } else if (action === 'fit-view') {
            this.canvas.fitToContent();
        } else if (action === 'reset-view') {
            this.canvas.resetView();
        }
    }

    // ========== 序列化 ==========

    toJSON() {
        return this.canvas.toJSON();
    }

    fromJSON(json) {
        // 清空畫布
        this.canvas.nodes.forEach((node, id) => {
            this.canvas.removeNode(id);
        });

        // 恢復視圖
        if (json.transform) {
            this.canvas.transform = json.transform;
            this.canvas.updateTransform();
            this.canvas.updateZoomDisplay();
        }

        // 恢復節點
        const nodeMap = new Map();
        for (const nodeData of json.nodes) {
            const node = this.createNode(nodeData.type, nodeData.x, nodeData.y);
            if (node) {
                nodeMap.set(nodeData.id, node.id);

                // 恢復節點資料
                if (nodeData.data) {
                    Object.assign(node.data, nodeData.data);
                    node.updateContent();

                    // 恢復節點尺寸
                    if (nodeData.data.width) {
                        node.element.style.width = nodeData.data.width + 'px';
                    }
                    if (nodeData.data.height) {
                        node.element.style.minHeight = nodeData.data.height + 'px';
                    }
                }

                if (nodeData.collapsed) {
                    node.toggleCollapse();
                }
            }
        }

        // 恢復連線
        for (const linkData of json.links) {
            const sourceNodeId = nodeMap.get(linkData.sourceNodeId);
            const targetNodeId = nodeMap.get(linkData.targetNodeId);

            if (sourceNodeId && targetNodeId) {
                const sourceNode = this.canvas.nodes.get(sourceNodeId);
                const targetNode = this.canvas.nodes.get(targetNodeId);

                if (sourceNode && targetNode) {
                    const sourcePort = sourceNode.getOutputPort(linkData.sourcePortName);
                    const targetPort = targetNode.getInputPort(linkData.targetPortName);

                    if (sourcePort && targetPort) {
                        this.createLink(sourceNode, sourcePort, targetNode, targetPort);
                    }
                }
            }
        }
    }

    // ========== 儲存/載入 ==========

    saveToLocalStorage(key = 'audioGraphState') {
        try {
            const json = this.toJSON();
            localStorage.setItem(key, JSON.stringify(json));
            showToast('快速儲存完成', 'success');
        } catch (error) {
            console.error('儲存失敗:', error);
            showToast('儲存失敗', 'error');
        }
    }

    loadFromLocalStorage(key = 'audioGraphState') {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                const json = JSON.parse(data);
                this.fromJSON(json);
                showToast('快速載入完成', 'success');
            } else {
                showToast('沒有快速存檔', 'warning');
            }
        } catch (error) {
            console.error('載入失敗:', error);
            showToast('載入失敗', 'error');
        }
    }

    // 另存新檔（下載 JSON 檔案）
    saveToFile(filename = 'audio-graph') {
        try {
            const json = this.toJSON();
            const jsonString = JSON.stringify(json, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // 建立下載連結
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('檔案已下載', 'success');
        } catch (error) {
            console.error('另存檔案失敗:', error);
            showToast('另存檔案失敗', 'error');
        }
    }

    // 儲存選擇的節點為檔案
    saveSelectedToFile(filename = 'workflow-selected') {
        try {
            const data = this.copySelectedNodes();
            if (!data || data.nodes.length === 0) {
                showToast('請先選擇要儲存的節點', 'warning');
                return;
            }

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // 建立下載連結
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`已儲存 ${data.nodes.length} 個節點`, 'success');
        } catch (error) {
            console.error('儲存選擇工作流失敗:', error);
            showToast('儲存失敗', 'error');
        }
    }

    // 從檔案載入
    loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('未選擇檔案'));
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        this.fromJSON(json);
                        showToast(`已載入: ${file.name}`, 'success');
                        resolve(json);
                    } catch (error) {
                        console.error('解析檔案失敗:', error);
                        showToast('檔案格式錯誤', 'error');
                        reject(error);
                    }
                };

                reader.onerror = () => {
                    showToast('讀取檔案失敗', 'error');
                    reject(new Error('讀取檔案失敗'));
                };

                reader.readAsText(file);
            };

            input.click();
        });
    }

    // 從檔案加入工作流（不清除現有節點）
    appendFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('未選擇檔案'));
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        // 使用 pasteNodes 來加入節點，不清除現有內容
                        this.pasteNodes(json, 100, 100);
                        showToast(`已加入工作流: ${file.name}`, 'success');
                        resolve(json);
                    } catch (error) {
                        console.error('解析檔案失敗:', error);
                        showToast('檔案格式錯誤', 'error');
                        reject(error);
                    }
                };

                reader.onerror = () => {
                    showToast('讀取檔案失敗', 'error');
                    reject(new Error('讀取檔案失敗'));
                };

                reader.readAsText(file);
            };

            input.click();
        });
    }
}

// 匯出
window.GraphEngine = GraphEngine;
