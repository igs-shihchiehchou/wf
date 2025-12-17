/**
 * 節點面板 - 可拖拉的節點選擇列表
 */

class NodePanel {
    constructor(container) {
        this.container = container;
        this.searchQuery = '';

        // 節點定義
        this.nodeCategories = [
            {
                name: '輸入',
                icon: '▼',
                nodes: [
                    { type: 'audio-input', label: '音效輸入', icon: '◎', description: '載入音效檔案' },
                    { type: 'combine', label: '多路合併', icon: '⊕', description: '合併多個音效輸入為一個列表' }
                ]
            },
            {
                name: '處理',
                icon: '☰',
                nodes: [
                    { type: 'volume', label: '音量調整', icon: '▲', description: '調整音量大小' },
                    { type: 'crop', label: '裁切', icon: '✂', description: '裁切音訊片段' },
                    { type: 'fade-in', label: '淡入', icon: '◢', description: '添加淡入效果' },
                    { type: 'fade-out', label: '淡出', icon: '◣', description: '添加淡出效果' },
                    { type: 'speed', label: '速度調整', icon: '🗲', description: '調整播放速度' },
                    { type: 'pitch', label: '音高調整', icon: '♪', description: '調整音高（不改變速度）' },
                    { type: 'smart-pitch', label: '智慧調音', icon: '𖦤', description: '音高偵測、轉調與頻譜分析' },
                    { type: 'key-integration', label: '批量調音', icon: '⚙', description: '分析多檔案調性，統一移調至目標調性' },
                    { type: 'volume-sync', label: '音量整合', icon: '⇋', description: '統一多個音訊的響度' },
                    { type: 'beat-sync', label: '節拍整合', icon: '♩', description: '統一多個音訊的 BPM，保持音高不變' },
                    { type: 'soften', label: '柔化', icon: '◠', description: '減少刺耳的高頻，讓聲音更柔和' },
                    { type: 'video-preview', label: '影片預覽', icon: '🎬', description: '使用影片作為參考編輯音訊時間軸' }
                ]
            },
            {
                name: '合成',
                icon: '⊕',
                nodes: [
                    { type: 'join', label: '串接音效', icon: '⛓', description: '將兩個音效首尾相接成一個長音效' },
                    { type: 'mix', label: '混音', icon: '⊗', description: '將兩個音效混合疊加成一個音效' }
                ]
            }
        ];

        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = `
      <div class="node-panel-header">
        <span class="node-panel-title">☐ 節點</span>
      </div>
      <div class="node-panel-search">
        <input type="text" placeholder="搜尋節點..." class="node-search-input">
      </div>
      <div class="node-panel-content">
        ${this.renderCategories()}
      </div>
    `;
    }

    renderCategories() {
        return this.nodeCategories.map(category => `
      <div class="node-category">
        <div class="node-category-title">${category.icon} ${category.name}</div>
        <div class="node-category-items">
          ${this.renderNodes(category.nodes)}
        </div>
      </div>
    `).join('');
    }

    renderNodes(nodes) {
        return nodes
            .filter(node => this.matchSearch(node))
            .map(node => `
        <div class="node-item" draggable="true" data-type="${node.type}" title="${node.description}">
          <span class="node-item-icon">${node.icon}</span>
          <span class="node-item-label">${node.label}</span>
        </div>
      `).join('');
    }

    matchSearch(node) {
        if (!this.searchQuery) return true;
        const query = this.searchQuery.toLowerCase();
        return node.label.toLowerCase().includes(query) ||
            node.description.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query);
    }

    bindEvents() {
        // 搜尋
        const searchInput = this.container.querySelector('.node-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.updateNodeList();
            });
        }

        // 拖拉
        this.bindDragEvents();
    }

    bindDragEvents() {
        const nodeItems = this.container.querySelectorAll('.node-item');

        nodeItems.forEach(item => {
            // 桌面版：滑鼠拖拉
            item.addEventListener('dragstart', (e) => {
                const type = item.dataset.type;
                e.dataTransfer.setData('nodeType', type);
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            // 手機版：觸控拖拉
            let touchStarted = false;
            let dragElement = null;

            item.addEventListener('touchstart', (e) => {
                touchStarted = true;
                const type = item.dataset.type;
                const touch = e.touches[0];

                // 創建拖拉視覺回饋元素
                dragElement = item.cloneNode(true);
                dragElement.style.position = 'fixed';
                dragElement.style.left = touch.clientX - 40 + 'px';
                dragElement.style.top = touch.clientY - 20 + 'px';
                dragElement.style.opacity = '0.7';
                dragElement.style.pointerEvents = 'none';
                dragElement.style.zIndex = '10000';
                dragElement.style.width = item.offsetWidth + 'px';
                document.body.appendChild(dragElement);

                item.classList.add('dragging');

                // 儲存節點類型到全域變數供 canvas 使用
                window.__draggedNodeType = type;
            }, { passive: false });

            item.addEventListener('touchmove', (e) => {
                if (!touchStarted || !dragElement) return;

                e.preventDefault();
                const touch = e.touches[0];

                // 更新拖拉元素位置
                dragElement.style.left = touch.clientX - 40 + 'px';
                dragElement.style.top = touch.clientY - 20 + 'px';
            }, { passive: false });

            item.addEventListener('touchend', (e) => {
                if (!touchStarted) return;

                touchStarted = false;
                item.classList.remove('dragging');

                // 移除拖拉視覺元素
                if (dragElement && dragElement.parentNode) {
                    dragElement.parentNode.removeChild(dragElement);
                }
                dragElement = null;

                // 獲取觸控結束位置
                const touch = e.changedTouches[0];
                const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

                // 觸發畫布的放置事件
                if (targetElement) {
                    const canvasArea = targetElement.closest('.canvas-area');
                    if (canvasArea && window.__draggedNodeType) {
                        // 創建自訂事件通知 canvas
                        const dropEvent = new CustomEvent('nodeDrop', {
                            detail: {
                                nodeType: window.__draggedNodeType,
                                x: touch.clientX,
                                y: touch.clientY
                            }
                        });
                        canvasArea.dispatchEvent(dropEvent);
                    }
                }

                // 清除全域變數
                delete window.__draggedNodeType;
            }, { passive: false });

            item.addEventListener('touchcancel', () => {
                touchStarted = false;
                item.classList.remove('dragging');

                if (dragElement && dragElement.parentNode) {
                    dragElement.parentNode.removeChild(dragElement);
                }
                dragElement = null;
                delete window.__draggedNodeType;
            });
        });
    }

    updateNodeList() {
        const content = this.container.querySelector('.node-panel-content');
        if (content) {
            content.innerHTML = this.renderCategories();
            this.bindDragEvents();
        }
    }

    // 響應式：切換顯示/隱藏
    toggle() {
        // 檢查是否為手機版（寬度 <= 768px）
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // 手機版：切換 open 類別
            this.container.classList.toggle('open');
        } else {
            // 桌面版：切換 hidden 類別
            this.container.classList.toggle('hidden');
        }
    }

    show() {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            this.container.classList.add('open');
        } else {
            this.container.classList.remove('hidden');
        }
    }

    hide() {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            this.container.classList.remove('open');
        } else {
            this.container.classList.add('hidden');
        }
    }

    isVisible() {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            return this.container.classList.contains('open');
        } else {
            return !this.container.classList.contains('hidden');
        }
    }
}

// 匯出
window.NodePanel = NodePanel;
