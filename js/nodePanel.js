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
                icon: '📥',
                nodes: [
                    { type: 'audio-input', label: '音訊輸入', icon: '📁', description: '載入音訊檔案' },
                    { type: 'combine', label: '合併節點', icon: '🔗', description: '合併多個音訊輸入為一個列表' }
                ]
            },
            {
                name: '處理',
                icon: '🎛️',
                nodes: [
                    { type: 'volume', label: '音量調整', icon: '🎚️', description: '調整音量大小' },
                    { type: 'crop', label: '裁切', icon: '✂️', description: '裁切音訊片段' },
                    { type: 'fade-in', label: '淡入', icon: '📈', description: '添加淡入效果' },
                    { type: 'fade-out', label: '淡出', icon: '📉', description: '添加淡出效果' },
                    { type: 'speed', label: '速度調整', icon: '⏩', description: '調整播放速度' },
                    { type: 'pitch', label: '音高調整', icon: '🎵', description: '調整音高（不改變速度）' },
                    { type: 'smart-pitch', label: '智慧音高調整', icon: '🎼', description: '音高偵測、轉調與頻譜分析' },
                    { type: 'key-integration', label: '調性整合', icon: '🎹', description: '分析多檔案調性，統一移調至目標調性' }
                ]
            },
            {
                name: '合成',
                icon: '🔀',
                nodes: [
                    { type: 'join', label: '串接音訊', icon: '🔗', description: '將兩個音訊首尾相接成一個長音訊' },
                    { type: 'mix', label: '混音', icon: '🎚️', description: '將兩個音訊混合疊加成一個音訊' }
                ]
            }
        ];

        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = `
      <div class="node-panel-header">
        <span class="node-panel-title">📦 節點</span>
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
            item.addEventListener('dragstart', (e) => {
                const type = item.dataset.type;
                e.dataTransfer.setData('nodeType', type);
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
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
        this.container.classList.toggle('hidden');
        // 同時處理手機版的 open 類別
        if (this.container.classList.contains('hidden')) {
            this.container.classList.remove('open');
        }
    }

    show() {
        this.container.classList.remove('hidden');
        this.container.classList.add('open');
    }

    hide() {
        this.container.classList.add('hidden');
        this.container.classList.remove('open');
    }

    isVisible() {
        return !this.container.classList.contains('hidden');
    }
}

// 匯出
window.NodePanel = NodePanel;
