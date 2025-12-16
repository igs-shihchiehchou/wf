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

        // 綁定「開啟編輯器」按鈕
        const editorBtn = this.element.querySelector('[data-action="open-editor"]');
        if (editorBtn && !editorBtn.disabled) {
            editorBtn.addEventListener('click', () => this.openEditor());
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
     * 產生影片縮圖（使用 canvas）- 含逾時保護
     */
    async generateVideoThumbnail(videoUrl, timeout = 10000) {
        return Promise.race([
            this._generateThumbnailCore(videoUrl),
            new Promise((resolve) => setTimeout(() => {
                console.warn('Thumbnail generation timeout');
                resolve(null);
            }, timeout))
        ]);
    }

    /**
     * 產生影片縮圖的核心邏輯
     */
    async _generateThumbnailCore(videoUrl) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');

            // Only set crossOrigin for actual cross-origin URLs
            if (videoUrl.startsWith('http')) {
                video.crossOrigin = 'anonymous';
            }

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

    /**
     * 建立模態視窗 DOM 元素
     */
    createModalElement() {
        // 建立模態遮罩層（覆蓋全螢幕）
        const overlay = document.createElement('div');
        overlay.className = 'video-preview-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // 建立模態視窗容器
        const modal = document.createElement('div');
        modal.className = 'video-preview-modal-window';
        modal.style.cssText = `
            background: var(--bg-dark);
            width: 90vw;
            height: 90vh;
            border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // 建立標題列（含關閉按鈕）
        const titleBar = document.createElement('div');
        titleBar.className = 'video-preview-modal-title';
        titleBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-3) var(--spacing-4);
            border-bottom: 1px solid var(--border-muted);
            background: var(--bg);
        `;
        titleBar.innerHTML = `
            <h3 style="margin: 0; font-size: var(--text-base); color: var(--text);">影片預覽編輯器</h3>
            <button class="video-preview-close-btn" style="
                background: none;
                border: none;
                color: var(--text-muted);
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: background 0.2s, color 0.2s;
            " title="關閉編輯器">×</button>
        `;

        // 建立主內容區域
        const content = document.createElement('div');
        content.className = 'video-preview-modal-content';
        content.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: var(--spacing-4);
        `;

        // 建立影片播放區域（video 元素）
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-preview-video-container';
        videoContainer.style.cssText = `
            width: 100%;
            max-height: 400px;
            background: #000;
            border-radius: 4px;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            margin-bottom: var(--spacing-4);
        `;

        const video = document.createElement('video');
        video.className = 'video-preview-video';
        video.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;
        video.controls = false; // 使用自訂控制列
        videoContainer.appendChild(video);

        // 建立播放控制列區域（占位）
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'video-preview-controls';
        controlsContainer.style.cssText = `
            padding: var(--spacing-3);
            background: var(--bg);
            border-radius: 4px;
            margin-bottom: var(--spacing-4);
            text-align: center;
            color: var(--text-muted);
            font-size: var(--text-sm);
        `;
        controlsContainer.textContent = '播放控制列（待實作）';

        // 建立時間軸區域（占位）
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'video-preview-timeline';
        timelineContainer.style.cssText = `
            padding: var(--spacing-3);
            background: var(--bg);
            border-radius: 4px;
            margin-bottom: var(--spacing-4);
            text-align: center;
            color: var(--text-muted);
            font-size: var(--text-sm);
        `;
        timelineContainer.textContent = '時間軸區域（待實作）';

        // 建立音軌列表容器（占位）
        const tracksContainer = document.createElement('div');
        tracksContainer.className = 'video-preview-tracks';
        tracksContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: var(--bg);
            border-radius: 4px;
            padding: var(--spacing-3);
            text-align: center;
            color: var(--text-muted);
            font-size: var(--text-sm);
        `;
        tracksContainer.textContent = '音軌列表容器（待實作）';

        // 組裝 DOM 結構
        content.appendChild(videoContainer);
        content.appendChild(controlsContainer);
        content.appendChild(timelineContainer);
        content.appendChild(tracksContainer);
        modal.appendChild(titleBar);
        modal.appendChild(content);
        overlay.appendChild(modal);

        // 儲存元素參考
        this.videoElement = video;
        this.modalElement = overlay;

        // 綁定關閉按鈕事件
        const closeBtn = titleBar.querySelector('.video-preview-close-btn');
        closeBtn.addEventListener('click', () => this.closeEditor());

        // 綁定遮罩點擊關閉（可選）
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeEditor();
            }
        });

        // hover 效果
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'var(--bg-dark)';
            closeBtn.style.color = 'var(--text)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'none';
            closeBtn.style.color = 'var(--text-muted)';
        });

        return overlay;
    }

    /**
     * 開啟編輯器
     */
    openEditor() {
        // 檢查是否有影片
        if (!this.data.videoUrl) {
            showToast('請先載入影片', 'warning');
            return;
        }

        // 建立模態 DOM
        const modal = this.createModalElement();

        // 載入影片到 video 元素
        this.videoElement.src = this.data.videoUrl;

        // 顯示模態視窗
        document.body.appendChild(modal);

        // 鎖定背景節點圖（添加 CSS 類）
        const graphCanvas = document.querySelector('.graph-canvas');
        if (graphCanvas) {
            graphCanvas.classList.add('video-preview-locked');
            // 添加內聯樣式確保鎖定效果
            graphCanvas.style.pointerEvents = 'none';
            graphCanvas.style.opacity = '0.5';
        }

        showToast('編輯器已開啟', 'info');
    }

    /**
     * 關閉編輯器
     */
    closeEditor() {
        // 停止所有播放
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.currentTime = 0;
        }

        // 銷毀 WaveSurfer 實例（待實作）
        // TODO: Task 3.2 - 在此處銷毀所有 WaveSurfer 實例

        // 移除模態 DOM
        if (this.modalElement && this.modalElement.parentNode) {
            this.modalElement.parentNode.removeChild(this.modalElement);
        }

        // 清理參考
        this.modalElement = null;
        this.videoElement = null;

        // 解鎖節點圖
        const graphCanvas = document.querySelector('.graph-canvas');
        if (graphCanvas) {
            graphCanvas.classList.remove('video-preview-locked');
            graphCanvas.style.pointerEvents = '';
            graphCanvas.style.opacity = '';
        }

        showToast('編輯器已關閉', 'info');
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
