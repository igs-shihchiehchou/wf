/**
 * 影片預覽節點 - 使用影片作為參考編輯音訊的時間偏移和裁切
 */

class VideoPreviewNode extends BaseNode {
    constructor(id, options = {}) {
        // 設定預設資料結構
        const defaultData = {
            videoFile: null,      // File 物件
            videoUrl: null,       // Blob URL
            videoThumbnail: null, // 影片縮圖 URL
            tracks: []            // 音軌參數陣列 [{offset: 0, cropStart: 0, cropEnd: null}]
        };

        super(id, 'video-preview', '影片預覽', '🎬', options, defaultData);
    }

    setupPorts() {
        // 建立 audio 輸入端口
        this.addInputPort('audio', 'audio', 'audio');
        this.addOutputPort('audio', 'audio', 'audio');
    }

    getNodeCategory() {
        return 'process';
    }

    /**
     * 轉義 HTML 以防止 XSS 攻擊
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderContent() {
        // 判斷狀態
        const hasInput = this.hasInputConnection();
        const hasVideo = this.data.videoUrl && this.data.videoFile;

        // State A: 無輸入 + 無影片 → 顯示「等待輸入」
        if (!hasInput && !hasVideo) {
            return `
                <div class="node-placeholder" style="padding: var(--spacing-3); text-align: center;">
                    <span style="color: var(--text-muted); font-size: var(--text-sm);">等待音訊輸入...</span>
                </div>
                <button class="node-btn" data-action="open-editor" disabled style="margin-top: var(--spacing-2);">開啟編輯器</button>
            `;
        }

        // State B: 無輸入 + 有影片 → 顯示影片縮圖 + 清除按鈕
        if (!hasInput && hasVideo) {
            return `
                <div class="video-preview-thumbnail-container" style="position: relative; margin-bottom: var(--spacing-2);">
                    <img src="${this.data.videoThumbnail || this.data.videoUrl}"
                         class="video-preview-thumbnail"
                         style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px; background: var(--bg-dark);"
                         alt="影片縮圖">
                    <button class="video-clear-btn"
                            data-action="clear-video"
                            style="position: absolute; top: var(--spacing-1); right: var(--spacing-1);
                                   background: rgba(0,0,0,0.7); color: white; border: none;
                                   border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                                   font-size: 16px; line-height: 1;"
                            title="清除影片">×</button>
                    <div style="margin-top: var(--spacing-2); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
                        ${this.escapeHtml(this.data.videoFile.name)}
                    </div>
                </div>
                <div style="text-align: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--spacing-2);">
                    請連接音訊輸入
                </div>
                <button class="node-btn node-btn-primary" data-action="open-editor" style="margin-top: var(--spacing-2);">開啟編輯器</button>
            `;
        }

        // State C: 有輸入 + 無影片 → 顯示上傳按鈕 + 拖放提示
        if (hasInput && !hasVideo) {
            return `
                <button class="node-btn node-btn-primary" data-action="select-video">選擇影片檔案</button>
                <div class="node-drop-hint" style="text-align: center; color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--spacing-2);">
                    或拖拉影片至此
                </div>
                <button class="node-btn" data-action="open-editor" disabled style="margin-top: var(--spacing-2);">開啟編輯器</button>
            `;
        }

        // State D: 有輸入 + 有影片 → 顯示影片縮圖 + 清除按鈕 + 啟用編輯器按鈕
        return `
            <div class="video-preview-thumbnail-container" style="position: relative; margin-bottom: var(--spacing-2);">
                <img src="${this.data.videoThumbnail || this.data.videoUrl}"
                     class="video-preview-thumbnail"
                     style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px; background: var(--bg-dark);"
                     alt="影片縮圖">
                <button class="video-clear-btn"
                        data-action="clear-video"
                        style="position: absolute; top: var(--spacing-1); right: var(--spacing-1);
                               background: rgba(0,0,0,0.7); color: white; border: none;
                               border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                               font-size: 16px; line-height: 1;"
                        title="清除影片">×</button>
                <div style="margin-top: var(--spacing-2); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
                    ${this.escapeHtml(this.data.videoFile.name)}
                </div>
            </div>
            <button class="node-btn node-btn-primary" data-action="open-editor" style="margin-top: var(--spacing-2);">開啟編輯器</button>
        `;
    }

    /**
     * 檢查是否有音訊輸入連接
     */
    hasInputConnection() {
        const audioPort = this.getInputPort('audio');
        return audioPort && audioPort.connected;
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
