/**
 * 連線管理
 */

class GraphLink {
    constructor(id, sourceNodeId, sourcePort, targetNodeId, targetPort) {
        this.id = id;
        this.sourceNodeId = sourceNodeId;
        this.sourcePort = sourcePort;
        this.targetNodeId = targetNodeId;
        this.targetPort = targetPort;

        // 建立 SVG 元素
        this.element = this.createElement();

        // 標記端口已連接
        if (sourcePort) sourcePort.connected = true;
        if (targetPort) targetPort.connected = true;
    }

    createElement() {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('graph-link');
        path.dataset.linkId = this.id;

        // 直接設置 SVG 屬性以確保 Chrome/Edge 兼容性
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#bdae61'); // --primary 顏色 hsl(56, 38%, 57%)
        path.setAttribute('stroke-width', '2');
        path.style.pointerEvents = 'stroke';

        // 點擊選取
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onSelect) {
                this.onSelect(this);
            }
        });

        // 右鍵選單
        path.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.onContextMenu) {
                this.onContextMenu(this, e);
            }
        });

        return path;
    }

    setSelected(selected) {
        if (selected) {
            this.element.classList.add('selected');
            // 直接設置 SVG 屬性以確保 Chrome/Edge 兼容性
            this.element.setAttribute('stroke', '#bbb4e8'); // --secondary 顏色 hsl(242, 68%, 80%)
            this.element.setAttribute('stroke-width', '3');
        } else {
            this.element.classList.remove('selected');
            this.element.setAttribute('stroke', '#bdae61'); // --primary 顏色
            this.element.setAttribute('stroke-width', '2');
        }
    }

    setActive(active) {
        if (active) {
            this.element.classList.add('active');
            // 直接設置 SVG 屬性以確保 Chrome/Edge 兼容性
            this.element.setAttribute('stroke-dasharray', '10 5');
        } else {
            this.element.classList.remove('active');
            this.element.setAttribute('stroke-dasharray', 'none');
        }
    }

    destroy() {
        // 清除端口連接狀態
        if (this.sourcePort) this.sourcePort.connected = false;
        if (this.targetPort) this.targetPort.connected = false;

        // 移除元素
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
    }

    toJSON() {
        return {
            id: this.id,
            sourceNodeId: this.sourceNodeId,
            sourcePortName: this.sourcePort ? this.sourcePort.name : null,
            targetNodeId: this.targetNodeId,
            targetPortName: this.targetPort ? this.targetPort.name : null
        };
    }
}

// 匯出
window.GraphLink = GraphLink;
