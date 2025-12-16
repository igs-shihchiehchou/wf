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
        // 綁定「選擇影片檔案」按鈕點擊事件
        const selectBtn = this.element.querySelector('[data-action="select-video"]');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => this.openVideoDialog());
        }

        // 綁定清除按鈕
        const clearBtn = this.element.querySelector('[data-action="clear-video"]');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearVideo());
        }

        // 綁定「開啟編輯器」按鈕（暫時無功能）
        const editorBtn = this.element.querySelector('[data-action="open-editor"]');
        if (editorBtn) {
            editorBtn.addEventListener('click', () => {
                showToast('編輯器功能尚未實作', 'info');
            });
        }

        // 綁定拖放事件 - 只綁定一次（使用標記避免重複綁定）
        if (!this._dropEventsBound) {
            this._dropEventsBound = true;

            this.element.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.element.classList.add('drag-over');
            });

            this.element.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.element.classList.remove('drag-over');
            });

            this.element.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.element.classList.remove('drag-over');

                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
                if (files.length > 0) {
                    this.loadVideoFile(files[0]); // 只載入第一個影片
                } else {
                    showToast('請拖拉影片檔案', 'error');
                }
            });
        }
    }

    /**
     * 開啟影片檔案選擇對話框
     */
    openVideoDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadVideoFile(file);
            }
        };
        input.click();
    }

    /**
     * 載入影片檔案
     */
    async loadVideoFile(file) {
        try {
            // 檢查檔案類型（只接受 video/*）
            if (!file.type.startsWith('video/')) {
                showToast('只接受影片檔案', 'error');
                return;
            }

            // 檢查檔案大小（>100MB 顯示警告）
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > 100) {
                showToast(`警告: 影片檔案較大 (${fileSizeMB.toFixed(1)} MB)，載入可能需要較長時間`, 'warning');
            }

            this.setProcessing(true);

            // 釋放舊的 Blob URL（如果有）
            if (this.data.videoUrl) {
                URL.revokeObjectURL(this.data.videoUrl);
            }

            // 建立 Blob URL
            const videoUrl = URL.createObjectURL(file);

            // 儲存到 this.data
            this.data.videoFile = file;
            this.data.videoUrl = videoUrl;

            // 產生影片縮圖
            const thumbnail = await this.generateVideoThumbnail(videoUrl);
            this.data.videoThumbnail = thumbnail;

            // 更新節點 UI
            this.updateContent();

            this.setProcessing(false);
            showToast('影片載入成功', 'success');

            // 觸發資料變更
            if (this.onDataChange) {
                this.onDataChange('videoFile', this.data.videoFile);
            }

        } catch (error) {
            this.setProcessing(false);
            showToast(`載入失敗: ${error.message}`, 'error');
            console.error('載入影片失敗:', error);
        }
    }

    /**
     * 產生影片縮圖（使用 canvas）
     */
    async generateVideoThumbnail(videoUrl) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'metadata';

            video.addEventListener('loadedmetadata', () => {
                // 跳到影片的 10% 位置取得縮圖（避免黑屏）
                video.currentTime = Math.min(video.duration * 0.1, 1);
            });

            video.addEventListener('seeked', () => {
                try {
                    // 建立 canvas 並繪製當前幀
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // 轉換為 dataURL
                    const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);

                    // 清理
                    video.src = '';
                    video.load();

                    resolve(thumbnailUrl);
                } catch (error) {
                    console.error('產生縮圖失敗:', error);
                    resolve(null); // 失敗時返回 null，使用影片本身作為縮圖
                }
            });

            video.addEventListener('error', (e) => {
                console.error('影片載入失敗:', e);
                resolve(null);
            });

            video.src = videoUrl;
        });
    }

    /**
     * 清除影片
     */
    clearVideo() {
        // 釋放 Blob URL
        if (this.data.videoUrl) {
            URL.revokeObjectURL(this.data.videoUrl);
        }

        // 清除 videoFile、videoUrl 和 videoThumbnail
        this.data.videoFile = null;
        this.data.videoUrl = null;
        this.data.videoThumbnail = null;

        // 更新節點 UI
        this.updateContent();

        showToast('已清除影片', 'info');

        // 觸發資料變更
        if (this.onDataChange) {
            this.onDataChange('videoFile', null);
        }
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
