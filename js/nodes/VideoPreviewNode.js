/**
 * 影片預覽節點 - 使用影片作為參考編輯音訊的時間偏移和裁切
 */

class VideoPreviewNode extends BaseNode {
    constructor(id, options = {}) {
        // 設定預設資料結構
        const defaultData = {
            videoFile: null,      // File 物件
            videoUrl: null,       // Blob URL
            tracks: []            // 音軌參數陣列 [{offset: 0, cropStart: 0, cropEnd: null}]
        };

        super(id, 'video-preview', '影片預覽', '🎬', options, defaultData);
    }

    setupPorts() {
        // 建立 audio 輸入端口
        this.addInputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    renderContent() {
        // 基礎實作：顯示等待輸入
        return `
            <div class="node-placeholder" style="padding: var(--spacing-3); text-align: center;">
                <span style="color: var(--text-muted); font-size: var(--text-sm);">等待輸入...</span>
            </div>
        `;
    }

    bindContentEvents() {
        // 基礎實作：無事件綁定
    }

    async process(inputs) {
        // 基礎實作：直接返回輸入
        return {
            audio: inputs.audio || null
        };
    }

    toJSON() {
        const json = super.toJSON();
        json.tracks = this.data.tracks;
        // 注意：videoFile 和 videoUrl 不序列化（Blob 不可序列化）
        return json;
    }

    static fromJSON(json) {
        const node = new VideoPreviewNode(json.id, {
            x: json.x,
            y: json.y
        });
        node.collapsed = json.collapsed;
        node.data.tracks = json.tracks || [];
        return node;
    }
}

// 匯出到 window
window.VideoPreviewNode = VideoPreviewNode;
