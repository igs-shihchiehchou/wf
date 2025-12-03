/**
 * 畫布系統 - 管理可縮放/拖拉的圖形畫布
 */

class GraphCanvas {
    constructor(container) {
        this.container = container;
        this.viewport = null;
        this.linksLayer = null;
        this.nodesLayer = null;
        this.svgElement = null;

        // 視口狀態
        this.transform = {
            x: 0,
            y: 0,
            scale: 1
        };

        // 縮放限制
        this.minScale = 0.25;
        this.maxScale = 2;
        this.scaleStep = 0.1;

        // 拖拉狀態
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };

        // 選取狀態
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionBox = null;

        // 節點與連線
        this.nodes = new Map();
        this.links = new Map();
        this.selectedNodes = new Set();
        this.selectedLinks = new Set();

        // 拖拉連線
        this.isDraggingLink = false;
        this.dragLinkStart = null;
        this.tempLink = null;

        // 事件回調
        this.onNodeSelect = null;
        this.onLinkCreate = null;
        this.onLinkDelete = null;
        this.onContextMenu = null;

        this.init();
    }

    init() {
        this.createDOM();
        this.attachEventListeners();
        this.updateTransform();
    }

    createDOM() {
        // 清空容器
        this.container.innerHTML = '';

        // 背景格線
        const background = document.createElement('div');
        background.className = 'canvas-background';
        this.container.appendChild(background);
        this.background = background;

        // 視口容器
        this.viewport = document.createElement('div');
        this.viewport.className = 'canvas-viewport';
        this.container.appendChild(this.viewport);

        // SVG 連線層
        this.linksLayer = document.createElement('div');
        this.linksLayer.className = 'canvas-links';
        this.viewport.appendChild(this.linksLayer);

        // 建立 SVG
        this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svgElement.style.overflow = 'visible';
        this.linksLayer.appendChild(this.svgElement);

        // 節點層
        this.nodesLayer = document.createElement('div');
        this.nodesLayer.className = 'canvas-nodes';
        this.viewport.appendChild(this.nodesLayer);

        // 選取框
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.display = 'none';
        this.container.appendChild(this.selectionBox);

        // 空畫布提示
        this.hint = document.createElement('div');
        this.hint.className = 'canvas-hint';
        this.hint.innerHTML = `
      <div class="canvas-hint-icon">🎵</div>
      <div class="canvas-hint-text">從左側面板拖拉節點開始</div>
      <div class="canvas-hint-subtext">或右鍵點擊畫布新增節點</div>
    `;
        this.container.appendChild(this.hint);
    }

    attachEventListeners() {
        // 滾輪縮放
        this.container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // 滑鼠事件
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // 右鍵選單
        this.container.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // 鍵盤事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 拖放事件（從節點面板）
        this.container.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.container.addEventListener('drop', (e) => this.handleDrop(e));
    }

    // ========== 視口控制 ==========

    handleWheel(e) {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 計算縮放
        const delta = e.deltaY > 0 ? -this.scaleStep : this.scaleStep;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.transform.scale + delta));

        if (newScale !== this.transform.scale) {
            // 以滑鼠位置為中心縮放
            const scaleRatio = newScale / this.transform.scale;

            this.transform.x = mouseX - (mouseX - this.transform.x) * scaleRatio;
            this.transform.y = mouseY - (mouseY - this.transform.y) * scaleRatio;
            this.transform.scale = newScale;

            this.updateTransform();
            this.updateZoomDisplay();
        }
    }

    handleMouseDown(e) {
        // 中鍵或空白+左鍵拖拉畫布
        if (e.button === 1 || (e.button === 0 && e.target === this.container || e.target === this.background || e.target.classList.contains('canvas-background'))) {
            if (e.button === 0 && !e.shiftKey) {
                // 左鍵且沒有按 shift，開始框選
                if (e.target === this.container || e.target === this.background || e.target.classList.contains('canvas-background')) {
                    // 清除選取
                    this.clearSelection();

                    // 開始框選
                    this.isSelecting = true;
                    const rect = this.container.getBoundingClientRect();
                    this.selectionStart = {
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top
                    };
                }
            } else {
                // 中鍵或 shift+左鍵，拖拉畫布
                this.isPanning = true;
                this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
                this.container.style.cursor = 'grabbing';
            }
            e.preventDefault();
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            this.transform.x = e.clientX - this.panStart.x;
            this.transform.y = e.clientY - this.panStart.y;
            this.updateTransform();
        }

        if (this.isSelecting) {
            const rect = this.container.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            // 計算選取框位置和大小
            const left = Math.min(this.selectionStart.x, currentX);
            const top = Math.min(this.selectionStart.y, currentY);
            const width = Math.abs(currentX - this.selectionStart.x);
            const height = Math.abs(currentY - this.selectionStart.y);

            this.selectionBox.style.display = 'block';
            this.selectionBox.style.left = left + 'px';
            this.selectionBox.style.top = top + 'px';
            this.selectionBox.style.width = width + 'px';
            this.selectionBox.style.height = height + 'px';

            // 選取框內的節點
            this.selectNodesInRect(left, top, width, height);
        }

        if (this.isDraggingLink && this.tempLink) {
            this.updateTempLink(e);
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.container.style.cursor = '';
        }

        if (this.isSelecting) {
            this.isSelecting = false;
            this.selectionBox.style.display = 'none';
        }

        if (this.isDraggingLink) {
            this.finishDraggingLink(e);
        }
    }

    handleContextMenu(e) {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 轉換為畫布座標
        const canvasPos = this.screenToCanvas(x, y);

        if (this.onContextMenu) {
            this.onContextMenu({
                screenX: e.clientX,
                screenY: e.clientY,
                canvasX: canvasPos.x,
                canvasY: canvasPos.y,
                target: e.target
            });
        }
    }

    handleKeyDown(e) {
        // Delete 鍵刪除選取的節點/連線
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedNodes.size > 0 || this.selectedLinks.size > 0) {
                this.deleteSelected();
                e.preventDefault();
            }
        }

        // Escape 取消選取
        if (e.key === 'Escape') {
            this.clearSelection();
            this.cancelDraggingLink();
        }

        // Ctrl+A 全選
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            if (document.activeElement === document.body) {
                this.selectAll();
                e.preventDefault();
            }
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    handleDrop(e) {
        e.preventDefault();

        const nodeType = e.dataTransfer.getData('nodeType');
        if (!nodeType) return;

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 轉換為畫布座標
        const canvasPos = this.screenToCanvas(x, y);

        // 發送建立節點事件
        if (this.onNodeCreate) {
            this.onNodeCreate(nodeType, canvasPos.x, canvasPos.y);
        }
    }

    // ========== 座標轉換 ==========

    screenToCanvas(screenX, screenY) {
        return {
            x: (screenX - this.transform.x) / this.transform.scale,
            y: (screenY - this.transform.y) / this.transform.scale
        };
    }

    canvasToScreen(canvasX, canvasY) {
        return {
            x: canvasX * this.transform.scale + this.transform.x,
            y: canvasY * this.transform.scale + this.transform.y
        };
    }

    // ========== 節點管理 ==========

    addNode(node) {
        this.nodes.set(node.id, node);
        this.nodesLayer.appendChild(node.element);
        this.updateHint();

        // 綁定節點事件
        this.bindNodeEvents(node);
    }

    removeNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node) {
            // 刪除相關連線
            this.links.forEach((link, linkId) => {
                if (link.sourceNodeId === nodeId || link.targetNodeId === nodeId) {
                    this.removeLink(linkId);
                }
            });

            node.element.remove();
            this.nodes.delete(nodeId);
            this.selectedNodes.delete(nodeId);
            this.updateHint();
        }
    }

    bindNodeEvents(node) {
        const header = node.element.querySelector('.node-header');

        // 節點選取
        node.element.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                if (!e.ctrlKey && !e.metaKey && !this.selectedNodes.has(node.id)) {
                    this.clearSelection();
                }
                this.selectNode(node.id);
            }
        });

        // 節點拖拉
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            if (e.button === 0 && e.target.closest('.node-header') && !e.target.closest('.node-action-btn')) {
                isDragging = true;
                const rect = node.element.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();

                dragOffset = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                e.stopPropagation();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const rect = this.container.getBoundingClientRect();
                const x = e.clientX - rect.left - dragOffset.x;
                const y = e.clientY - rect.top - dragOffset.y;

                // 轉換為畫布座標
                const canvasPos = this.screenToCanvas(x, y);

                // 移動所有選取的節點
                if (this.selectedNodes.has(node.id)) {
                    const dx = canvasPos.x - node.x;
                    const dy = canvasPos.y - node.y;

                    this.selectedNodes.forEach(id => {
                        const n = this.nodes.get(id);
                        if (n) {
                            n.setPosition(n.x + dx, n.y + dy);
                        }
                    });
                } else {
                    node.setPosition(canvasPos.x, canvasPos.y);
                }

                this.updateLinks();
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    selectNode(nodeId) {
        this.selectedNodes.add(nodeId);
        const node = this.nodes.get(nodeId);
        if (node) {
            node.element.classList.add('selected');
            if (this.onNodeSelect) {
                this.onNodeSelect(node);
            }
        }
    }

    deselectNode(nodeId) {
        this.selectedNodes.delete(nodeId);
        const node = this.nodes.get(nodeId);
        if (node) {
            node.element.classList.remove('selected');
        }
    }

    selectNodesInRect(left, top, width, height) {
        // 清除之前的選取
        this.selectedNodes.forEach(id => {
            const node = this.nodes.get(id);
            if (node) {
                node.element.classList.remove('selected');
            }
        });
        this.selectedNodes.clear();

        // 選取框內的節點
        this.nodes.forEach((node, id) => {
            const screenPos = this.canvasToScreen(node.x, node.y);
            const nodeRect = {
                left: screenPos.x,
                top: screenPos.y,
                right: screenPos.x + node.element.offsetWidth * this.transform.scale,
                bottom: screenPos.y + node.element.offsetHeight * this.transform.scale
            };

            const selRect = {
                left: left,
                top: top,
                right: left + width,
                bottom: top + height
            };

            // 檢查是否相交
            if (!(nodeRect.right < selRect.left ||
                nodeRect.left > selRect.right ||
                nodeRect.bottom < selRect.top ||
                nodeRect.top > selRect.bottom)) {
                this.selectNode(id);
            }
        });
    }

    clearSelection() {
        this.selectedNodes.forEach(id => {
            const node = this.nodes.get(id);
            if (node) {
                node.element.classList.remove('selected');
            }
        });
        this.selectedNodes.clear();

        this.selectedLinks.forEach(id => {
            const link = this.links.get(id);
            if (link && link.element) {
                link.element.classList.remove('selected');
            }
        });
        this.selectedLinks.clear();
    }

    selectAll() {
        this.nodes.forEach((node, id) => {
            this.selectNode(id);
        });
    }

    deleteSelected() {
        // 刪除選取的連線
        this.selectedLinks.forEach(linkId => {
            this.removeLink(linkId);
        });

        // 刪除選取的節點
        this.selectedNodes.forEach(nodeId => {
            const node = this.nodes.get(nodeId);
            if (node && node.onDelete) {
                node.onDelete();
            }
            this.removeNode(nodeId);
        });
    }

    // ========== 連線管理 ==========

    addLink(link) {
        this.links.set(link.id, link);
        this.svgElement.appendChild(link.element);
        this.updateLink(link);
    }

    removeLink(linkId) {
        const link = this.links.get(linkId);
        if (link) {
            link.element.remove();
            this.links.delete(linkId);
            this.selectedLinks.delete(linkId);

            // 更新端口狀態
            if (link.sourcePort) link.sourcePort.connected = false;
            if (link.targetPort) link.targetPort.connected = false;

            if (this.onLinkDelete) {
                this.onLinkDelete(link);
            }
        }
    }

    updateLink(link) {
        if (!link.sourcePort || !link.targetPort) return;

        const sourceNode = this.nodes.get(link.sourceNodeId);
        const targetNode = this.nodes.get(link.targetNodeId);

        if (!sourceNode || !targetNode) return;

        // 計算端口位置
        const sourcePos = this.getPortPosition(sourceNode, link.sourcePort, 'output');
        const targetPos = this.getPortPosition(targetNode, link.targetPort, 'input');

        // 繪製貝茲曲線
        const path = this.createBezierPath(sourcePos, targetPos);
        link.element.setAttribute('d', path);
    }

    updateLinks() {
        this.links.forEach(link => this.updateLink(link));
    }

    getPortPosition(node, port, type) {
        const portElement = port.element;
        if (!portElement) return { x: node.x, y: node.y };

        const nodeRect = node.element.getBoundingClientRect();
        const portRect = portElement.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        return {
            x: (portRect.left + portRect.width / 2 - containerRect.left - this.transform.x) / this.transform.scale,
            y: (portRect.top + portRect.height / 2 - containerRect.top - this.transform.y) / this.transform.scale
        };
    }

    createBezierPath(start, end) {
        const dx = Math.abs(end.x - start.x);
        const controlOffset = Math.min(dx * 0.5, 100);

        return `M ${start.x} ${start.y}
            C ${start.x + controlOffset} ${start.y},
              ${end.x - controlOffset} ${end.y},
              ${end.x} ${end.y}`;
    }

    // ========== 拖拉連線 ==========

    startDraggingLink(port, node) {
        this.isDraggingLink = true;
        this.dragLinkStart = { port, node };

        // 建立暫時連線
        this.tempLink = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempLink.classList.add('graph-link', 'dragging');
        this.svgElement.appendChild(this.tempLink);

        // 高亮相容的端口
        this.highlightCompatiblePorts(port);
    }

    updateTempLink(e) {
        if (!this.tempLink || !this.dragLinkStart) return;

        const rect = this.container.getBoundingClientRect();
        const endPos = this.screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);

        const startNode = this.dragLinkStart.node;
        const startPort = this.dragLinkStart.port;
        const startPos = this.getPortPosition(startNode, startPort, startPort.type);

        const path = startPort.type === 'output'
            ? this.createBezierPath(startPos, endPos)
            : this.createBezierPath(endPos, startPos);

        this.tempLink.setAttribute('d', path);
    }

    finishDraggingLink(e) {
        if (!this.isDraggingLink) return;

        // 檢查是否放在有效端口上
        const targetPort = this.findPortAtPosition(e.clientX, e.clientY);

        if (targetPort && this.canConnect(this.dragLinkStart.port, targetPort.port)) {
            // 建立連線
            if (this.onLinkCreate) {
                const sourcePort = this.dragLinkStart.port.type === 'output'
                    ? this.dragLinkStart.port
                    : targetPort.port;
                const sourceNode = this.dragLinkStart.port.type === 'output'
                    ? this.dragLinkStart.node
                    : targetPort.node;
                const targetPortObj = this.dragLinkStart.port.type === 'output'
                    ? targetPort.port
                    : this.dragLinkStart.port;
                const targetNode = this.dragLinkStart.port.type === 'output'
                    ? targetPort.node
                    : this.dragLinkStart.node;

                this.onLinkCreate(sourceNode, sourcePort, targetNode, targetPortObj);
            }
        }

        this.cancelDraggingLink();
    }

    cancelDraggingLink() {
        this.isDraggingLink = false;
        this.dragLinkStart = null;

        if (this.tempLink) {
            this.tempLink.remove();
            this.tempLink = null;
        }

        // 移除端口高亮
        this.clearPortHighlights();
    }

    findPortAtPosition(clientX, clientY) {
        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            if (el.classList.contains('node-port')) {
                // 找到對應的節點和端口
                const nodeElement = el.closest('.graph-node');
                if (nodeElement) {
                    const node = this.nodes.get(nodeElement.id);
                    if (node) {
                        const port = node.findPortByElement(el);
                        if (port) {
                            return { node, port };
                        }
                    }
                }
            }
        }
        return null;
    }

    canConnect(sourcePort, targetPort) {
        // 不能連接同類型的端口
        if (sourcePort.type === targetPort.type) return false;

        // 不能連接同一個節點
        if (sourcePort.nodeId === targetPort.nodeId) return false;

        // 檢查資料類型是否相容
        const inputPort = sourcePort.type === 'input' ? sourcePort : targetPort;
        const outputPort = sourcePort.type === 'output' ? sourcePort : targetPort;

        return inputPort.dataType === outputPort.dataType;
    }

    highlightCompatiblePorts(sourcePort) {
        const targetType = sourcePort.type === 'output' ? 'input' : 'output';

        this.nodes.forEach(node => {
            node.ports.forEach(port => {
                if (port.type === targetType && port.dataType === sourcePort.dataType) {
                    port.element.classList.add('compatible');
                } else if (port !== sourcePort) {
                    port.element.classList.add('incompatible');
                }
            });
        });
    }

    clearPortHighlights() {
        this.nodes.forEach(node => {
            node.ports.forEach(port => {
                port.element.classList.remove('compatible', 'incompatible');
            });
        });
    }

    // ========== 視圖更新 ==========

    updateTransform() {
        this.viewport.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;

        // 更新背景格線
        const size = 20 * this.transform.scale;
        this.background.style.backgroundSize = `${size}px ${size}px`;
        this.background.style.backgroundPosition = `${this.transform.x}px ${this.transform.y}px`;
    }

    updateZoomDisplay() {
        const zoomDisplay = document.querySelector('.canvas-zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.transform.scale * 100) + '%';
        }
    }

    updateHint() {
        if (this.hint) {
            this.hint.style.display = this.nodes.size === 0 ? 'block' : 'none';
        }
    }

    // ========== 縮放控制 ==========

    zoomIn() {
        const newScale = Math.min(this.maxScale, this.transform.scale + this.scaleStep);
        this.setScale(newScale);
    }

    zoomOut() {
        const newScale = Math.max(this.minScale, this.transform.scale - this.scaleStep);
        this.setScale(newScale);
    }

    setScale(scale) {
        // 以畫布中心為縮放中心
        const rect = this.container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const scaleRatio = scale / this.transform.scale;
        this.transform.x = centerX - (centerX - this.transform.x) * scaleRatio;
        this.transform.y = centerY - (centerY - this.transform.y) * scaleRatio;
        this.transform.scale = scale;

        this.updateTransform();
        this.updateZoomDisplay();
    }

    resetView() {
        this.transform = { x: 0, y: 0, scale: 1 };
        this.updateTransform();
        this.updateZoomDisplay();
    }

    fitToContent() {
        if (this.nodes.size === 0) {
            this.resetView();
            return;
        }

        // 計算所有節點的邊界
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.element.offsetWidth);
            maxY = Math.max(maxY, node.y + node.element.offsetHeight);
        });

        const padding = 50;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        const rect = this.container.getBoundingClientRect();
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        const scale = Math.min(scaleX, scaleY, 1);

        this.transform.scale = scale;
        this.transform.x = (rect.width - contentWidth * scale) / 2 - (minX - padding) * scale;
        this.transform.y = (rect.height - contentHeight * scale) / 2 - (minY - padding) * scale;

        this.updateTransform();
        this.updateZoomDisplay();
    }

    // ========== 序列化 ==========

    toJSON() {
        const nodes = [];
        this.nodes.forEach(node => {
            nodes.push(node.toJSON());
        });

        const links = [];
        this.links.forEach(link => {
            links.push({
                id: link.id,
                sourceNodeId: link.sourceNodeId,
                sourcePortName: link.sourcePort.name,
                targetNodeId: link.targetNodeId,
                targetPortName: link.targetPort.name
            });
        });

        return {
            transform: { ...this.transform },
            nodes,
            links
        };
    }
}

// 匯出
window.GraphCanvas = GraphCanvas;
