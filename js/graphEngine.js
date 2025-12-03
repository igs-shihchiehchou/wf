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
            'pitch': PitchNode
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
        // 當連線被刪除時，清除目標節點的輸入資料
        const targetNode = this.canvas.nodes.get(link.targetNodeId);
        if (targetNode) {
            // 如果是裁切節點，清除波形
            if (targetNode.updateInputAudio) {
                targetNode.updateInputAudio(null);
            }
            if (targetNode.setAudioBuffer) {
                targetNode.setAudioBuffer(null);
            }
        }
    }

    // ========== 圖形執行 ==========

    // 取得節點的輸入資料（用於預覽功能）
    async getNodeInputData(nodeId) {
        const node = this.canvas.nodes.get(nodeId);
        if (!node) return {};

        const inputs = {};
        for (const port of node.inputPorts) {
            const link = this.findLinkByInputPort(nodeId, port.name);
            if (link) {
                const sourceNode = this.canvas.nodes.get(link.sourceNodeId);
                if (sourceNode) {
                    // 遞迴取得來源節點的輸入並處理
                    const sourceInputs = await this.getNodeInputData(link.sourceNodeId);
                    const sourceOutput = await sourceNode.process(sourceInputs);
                    inputs[port.name] = sourceOutput[link.sourcePort.name];
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

        // 如果是裁切節點，更新輸入音訊波形
        if (node.updateInputAudio) {
            await node.updateInputAudio(inputs.audio || null);
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
            'add-pitch': 'pitch'
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
            showToast('已儲存', 'success');
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
                showToast('已載入', 'success');
            }
        } catch (error) {
            console.error('載入失敗:', error);
            showToast('載入失敗', 'error');
        }
    }
}

// 匯出
window.GraphEngine = GraphEngine;
