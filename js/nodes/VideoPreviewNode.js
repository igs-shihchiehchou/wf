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

        super(id, 'video-preview', '影片預覽', '▣', options, defaultData);

        // 模態視窗相關元素
        this.videoElement = null;    // 模態視窗中的 video 元素
        this.modalElement = null;    // 模態視窗覆蓋層元素
        this.handleKeyDown = null;   // ESC 鍵處理函數
        this.currentTimeEl = null;   // 當前時間顯示元素
        this.totalTimeEl = null;     // 總時長顯示元素
        this.timelineContainer = null; // 時間軸容器元素
        this.playbackCursor = null;  // 播放游標元素
        this.timelineTrack = null;   // 時間軸軌道元素
        this.animationFrameId = null; // requestAnimationFrame ID
        this.trackWaveSurfers = [];   // 音軌 WaveSurfer 實例陣列

        // 音訊播放引擎屬性 (Task 4.1)
        this.audioContext = null;
        this.sourceNodes = []; // 儲存當前播放的 SourceNodes 以便停止

        // 縮放相關屬性
        this.zoomLevel = 1.0;     // 縮放倍數 (1.0 = 100%, 2.0 = 200% 放大)
        this.viewOffset = 0;      // 視窗偏移 (秒)

        // 註冊節點刪除時的清理回調
        this.onDelete = () => {
            this.cleanup();
        };
    }

    /**
     * 清理資源（節點刪除時調用）
     */
    cleanup() {
        // 如果編輯器開啟中，先關閉
        if (this.modalElement) {
            this.closeEditor();
        }

        // 停止所有音訊播放
        this.stopAudio();

        // 釋放 Blob URL
        if (this.data.videoUrl) {
            URL.revokeObjectURL(this.data.videoUrl);
            this.data.videoUrl = null;
        }

        // 關閉 AudioContext（如果存在）
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                this.audioContext.close();
            } catch (e) {
                console.warn('關閉 AudioContext 失敗:', e);
            }
            this.audioContext = null;
        }

        // 清理數據
        this.data.videoFile = null;
        this.data.videoThumbnail = null;
        this.trackWaveSurfers = [];
        this.sourceNodes = [];
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

        // State A: 無輸入 + 無影片 → 顯示影片上傳介面
        if (!hasInput && !hasVideo) {
            return `
                <button class="node-btn node-btn-primary" data-action="select-video">選擇影片檔案</button>
                <div class="node-drop-hint" style="text-align: center; color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--spacing-2);">
                    或拖拉影片至此
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
        return new Promise((resolve, _reject) => {
            const video = document.createElement('video');

            // Only set crossOrigin for actual cross-origin URLs
            if (videoUrl.startsWith('http')) {
                video.crossOrigin = 'anonymous';
            }

            video.muted = true; // 避免自動播放限制
            video.playsInline = true;
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
                console.error('影片載入失敗 (縮圖產生):', video.error, e);
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

        // 建立播放控制列區域
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'video-preview-controls';
        controlsContainer.style.cssText = `
            padding: var(--spacing-3);
            background: var(--bg);
            border-radius: 4px;
            margin-bottom: var(--spacing-4);
            display: flex;
            align-items: center;
            gap: var(--spacing-3);
        `;
        // 使用 renderPlaybackControls() 渲染控制列內容
        controlsContainer.innerHTML = this.renderPlaybackControls();

        // 建立視窗信息欄（獨立容器，不受滾動影響）
        const viewInfoContainer = document.createElement('div');
        viewInfoContainer.id = 'timeline-view-info';
        viewInfoContainer.className = 'timeline-view-info';
        viewInfoContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-2) var(--spacing-3);
            background: var(--bg-dark);
            border-radius: 4px;
            margin-bottom: var(--spacing-2);
            font-size: var(--text-xs);
            color: var(--text-muted);
            font-family: monospace;
        `;
        viewInfoContainer.innerHTML = `
            <span id="view-time-range">View: 0.00s - 0.00s</span>
            <span id="view-zoom-level">Zoom: 100%</span>
        `;

        // 建立時間軸區域（不再獨立滾動）
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'video-preview-timeline';
        timelineContainer.style.cssText = `
            position: sticky;
            top: 0;
            z-index: 10;
            padding: var(--spacing-3);
            background: var(--bg);
            border-radius: 4px 4px 0 0;
            margin-bottom: 0;
            overflow: visible;
        `;
        // 使用 renderTimeline() 渲染時間軸內容
        this.timelineContainer = timelineContainer;

        // 建立音軌列表容器（不再獨立滾動）
        const tracksContainer = document.createElement('div');
        tracksContainer.className = 'video-preview-tracks';
        tracksContainer.style.cssText = `
            background: var(--bg);
            border-radius: 0 0 4px 4px;
            padding: var(--spacing-3);
            padding-top: 0;
            overflow: visible;
        `;
        // 儲存參考以便後續更新
        this.tracksContainer = tracksContainer;

        // 建立統一的水平滾動容器包裹 timeline 和 tracks
        const timelineScrollWrapper = document.createElement('div');
        timelineScrollWrapper.className = 'video-preview-timeline-scroll-wrapper';
        timelineScrollWrapper.style.cssText = `
            overflow-x: auto;
            overflow-y: auto;
            margin-bottom: var(--spacing-4);
            border-radius: 4px;
            max-height: 60vh;
        `;
        timelineScrollWrapper.appendChild(timelineContainer);
        timelineScrollWrapper.appendChild(tracksContainer);
        this.timelineScrollWrapper = timelineScrollWrapper;

        // 組裝 DOM 結構
        content.appendChild(videoContainer);
        content.appendChild(controlsContainer);
        content.appendChild(viewInfoContainer); // 視窗信息欄（獨立，不受滾動影響）
        content.appendChild(timelineScrollWrapper);
        modal.appendChild(titleBar);
        modal.appendChild(content);
        overlay.appendChild(modal);

        // 儲存元素參考
        this.videoElement = video;
        this.modalElement = overlay;
        this.controlsContainer = controlsContainer;

        // 綁定關閉按鈕事件
        const closeBtn = titleBar.querySelector('.video-preview-close-btn');
        closeBtn.addEventListener('click', () => this.closeEditor());

        // 綁定播放控制列事件
        this.bindPlaybackControlsEvents();

        // 綁定 video 元素事件
        this.bindVideoEvents();

        // 移除遮罩點擊關閉功能，防止誤觸
        // overlay.addEventListener('click', (e) => {
        //     if (e.target === overlay) {
        //         this.closeEditor();
        //     }
        // });

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
     * 格式化時間為 MM:SS.mmm 格式
     */
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) {
            return '00:00.000';
        }

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 1000);

        const mm = String(minutes).padStart(2, '0');
        const ss = String(secs).padStart(2, '0');
        const mmm = String(milliseconds).padStart(3, '0');

        return `${mm}:${ss}.${mmm}`;
    }

    /**
     * 渲染播放控制列內容
     */
    renderPlaybackControls() {
        return `
            <button class="video-playback-btn" style="
                background: var(--primary);
                color: var(--bg);
                border: none;
                border-radius: 4px;
                width: 40px;
                height: 40px;
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            " title="播放/暫停">▶</button>
            <div style="display: flex; align-items: center; gap: var(--spacing-2); color: var(--text); font-family: monospace; font-size: var(--text-sm);">
                <span class="video-current-time">00:00.000</span>
                <span style="color: var(--text-muted);">/</span>
                <span class="video-total-time">00:00.000</span>
            </div>
        `;
    }

    /**
     * 綁定播放控制列事件
     */
    bindPlaybackControlsEvents() {
        if (!this.controlsContainer) return;

        const playbackBtn = this.controlsContainer.querySelector('.video-playback-btn');
        if (playbackBtn) {
            playbackBtn.addEventListener('click', () => this.togglePlayback());

            // hover 效果
            playbackBtn.addEventListener('mouseenter', () => {
                playbackBtn.style.background = 'hsl(56 38% 65%)'; // Lighter shade of primary
            });
            playbackBtn.addEventListener('mouseleave', () => {
                playbackBtn.style.background = 'var(--primary)';
            });
        }
    }

    /**
     * 綁定 video 元素事件
     */
    bindVideoEvents() {
        if (!this.videoElement) return;

        // 快取 DOM 元素參考以避免重複查詢
        this.currentTimeEl = this.controlsContainer.querySelector('.video-current-time');
        this.totalTimeEl = this.controlsContainer.querySelector('.video-total-time');

        // 保存事件處理器引用以便後續移除
        this.videoEventHandlers = {
            timeupdate: () => {
                if (!this.videoElement) return;
                this.updateTimeDisplay();
            },
            loadedmetadata: () => {
                if (!this.videoElement) return;
                this.updateTotalTimeDisplay();
                this.renderTimeline();
            },
            play: () => {
                if (!this.videoElement) return;
                this.updatePlaybackButton(true);
            },
            playing: () => {
                if (!this.videoElement) return;
                // 影片實際開始播放時才啟動同步
                this.updatePlaybackCursor();
                this.startPlaybackLoop();
                this.playAudio(this.videoElement.currentTime);
            },
            pause: () => {
                if (!this.videoElement) return;
                this.updatePlaybackButton(false);
                this.stopPlaybackLoop();
                this.stopAudio();
            },
            ended: () => {
                if (!this.videoElement) return;
                this.updatePlaybackButton(false);
                this.stopPlaybackLoop();
                this.stopAudio();
            },
            seeking: () => {
                if (!this.videoElement) return;
                this.updatePlaybackCursor();
                this.stopAudio();
            },
            seeked: () => {
                if (!this.videoElement) return;
                this.updatePlaybackCursor();
                if (!this.videoElement.paused) {
                    this.playAudio(this.videoElement.currentTime);
                }
            }
        };

        // 綁定所有事件
        this.videoElement.addEventListener('timeupdate', this.videoEventHandlers.timeupdate);
        this.videoElement.addEventListener('loadedmetadata', this.videoEventHandlers.loadedmetadata);
        this.videoElement.addEventListener('play', this.videoEventHandlers.play);
        this.videoElement.addEventListener('playing', this.videoEventHandlers.playing);
        this.videoElement.addEventListener('pause', this.videoEventHandlers.pause);
        this.videoElement.addEventListener('ended', this.videoEventHandlers.ended);
        this.videoElement.addEventListener('seeking', this.videoEventHandlers.seeking);
        this.videoElement.addEventListener('seeked', this.videoEventHandlers.seeked);
    }

    /**
     * 更新時間顯示
     */
    updateTimeDisplay() {
        if (!this.videoElement || !this.currentTimeEl) return;
        this.currentTimeEl.textContent = this.formatTime(this.videoElement.currentTime);
    }

    /**
     * 更新總時長顯示
     */
    updateTotalTimeDisplay() {
        if (!this.videoElement || !this.totalTimeEl) return;
        this.totalTimeEl.textContent = this.formatTime(this.videoElement.duration);
    }

    /**
     * 更新播放/暫停按鈕圖示
     */
    updatePlaybackButton(isPlaying) {
        if (!this.controlsContainer) return;

        const playbackBtn = this.controlsContainer.querySelector('.video-playback-btn');
        if (playbackBtn) {
            playbackBtn.textContent = isPlaying ? '⏸' : '▶';
            playbackBtn.title = isPlaying ? '暫停' : '播放';
        }
    }

    /**
     * 切換播放/暫停
     */
    togglePlayback() {
        if (!this.videoElement) return;

        if (this.videoElement.paused) {
            // 播放
            this.videoElement.play().catch(error => {
                console.error('播放失敗:', error);
                showToast('播放失敗', 'error');
            });
        } else {
            // 暫停
            this.videoElement.pause();
        }
    }

    /**
     * 計算時間軸總長度（優先使用影片長度，無影片時使用音訊長度）
     */
    calculateTimelineDuration() {
        let duration = this.videoElement ? this.videoElement.duration : 0;

        // 防止 NaN（影片 metadata 尚未載入時）
        if (isNaN(duration)) duration = 0;

        // 如果沒有影片，才計算最長音訊結束時間
        if (duration === 0) {
            const audioData = this.getInputAudioData();
            if (audioData && audioData.length > 0) {
                audioData.forEach((audio, index) => {
                    const trackParams = this.data.tracks[index];
                    if (audio.buffer && trackParams) {
                        // 計算音訊結束時間 = 偏移 + 音訊時長
                        const audioEndTime = trackParams.offset + audio.buffer.duration;
                        // 取最大值
                        duration = Math.max(duration, audioEndTime);
                    }
                });
            }
        }

        return duration || 0;
    }

    /**
     * 渲染時間軸
     */
    renderTimeline() {
        if (!this.timelineContainer) return;

        const duration = this.calculateTimelineDuration();

        // 清空容器
        this.timelineContainer.innerHTML = '';

        // 更新視窗信息（在容器外部）
        this.updateViewInfo();

        // 建立時間刻度容器（寬度隨縮放而增加）
        const scaleContainer = document.createElement('div');
        scaleContainer.className = 'timeline-scale';
        const scaleWidth = `${100 * this.zoomLevel}%`;
        scaleContainer.style.cssText = `
            position: relative;
            height: 30px;
            margin-bottom: var(--spacing-2);
            user-select: none;
            width: ${scaleWidth};
            min-width: 100%;
        `;

        // 計算刻度間隔（根據總時長決定）
        const interval = this.calculateTimeInterval(duration);
        const tickCount = Math.ceil(duration / interval);

        // 渲染時間刻度標記
        for (let i = 0; i <= tickCount; i++) {
            const time = i * interval;
            if (time > duration) break;

            const percentage = duration > 0 ? (time / duration) * 100 : 0;

            const tick = document.createElement('div');
            tick.className = 'timeline-tick';
            tick.style.cssText = `
                position: absolute;
                left: ${percentage}%;
                top: 0;
                width: 1px;
                height: 12px;
                background: var(--border-muted);
            `;

            const label = document.createElement('div');
            label.className = 'timeline-label';
            label.style.cssText = `
                position: absolute;
                left: ${percentage}%;
                top: 14px;
                transform: translateX(-50%);
                font-size: 11px;
                color: var(--text-muted);
                font-family: monospace;
            `;
            label.textContent = this.formatTimeShort(time);

            scaleContainer.appendChild(tick);
            scaleContainer.appendChild(label);
        }

        // 建立可點擊的時間軸軌道（寬度隨縮放而增加）
        const track = document.createElement('div');
        track.className = 'timeline-track';
        const trackWidth = `${100 * this.zoomLevel}%`;
        track.style.cssText = `
            position: relative;
            height: 40px;
            background: var(--bg-dark);
            border-radius: 4px;
            cursor: pointer;
            margin-top: var(--spacing-2);
            width: ${trackWidth};
            min-width: 100%;
        `;

        // 建立播放游標
        const cursor = document.createElement('div');
        cursor.className = 'timeline-cursor';
        cursor.style.cssText = `
            position: absolute;
            left: 0%;
            top: 0;
            width: 2px;
            height: 100%;
            background: var(--primary);
            cursor: ew-resize;
            z-index: 10;
        `;

        // 建立游標頂部把手
        const cursorHandle = document.createElement('div');
        cursorHandle.className = 'timeline-cursor-handle';
        cursorHandle.style.cssText = `
            position: absolute;
            top: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 12px;
            height: 12px;
            background: var(--primary);
            border-radius: 50%;
            cursor: ew-resize;
        `;
        cursor.appendChild(cursorHandle);

        track.appendChild(cursor);

        // 移除舊的播放線（防止重複）
        if (this.playbackLine && this.playbackLine.parentNode) {
            this.playbackLine.parentNode.removeChild(this.playbackLine);
        }

        // 建立延伸播放線（貫穿所有音軌）
        const playbackLine = document.createElement('div');
        playbackLine.className = 'timeline-playback-line';
        this.modalElement.appendChild(playbackLine);

        // 儲存參考
        this.timelineTrack = track;
        this.playbackCursor = cursor;
        this.playbackLine = playbackLine;

        // 組裝時間軸
        this.timelineContainer.appendChild(scaleContainer);
        this.timelineContainer.appendChild(track);

        // 綁定時間軸事件
        this.bindTimelineEvents();

        // 綁定滾輪縮放事件
        this.bindZoomEvents();

        // 初始化播放線位置
        this.updatePlaybackLine();
    }

    /**
     * 計算時間刻度間隔（秒）
     */
    calculateTimeInterval(duration) {
        if (duration <= 10) return 1;      // 每秒
        if (duration <= 60) return 5;      // 每 5 秒
        if (duration <= 300) return 30;    // 每 30 秒
        if (duration <= 600) return 60;    // 每分鐘
        return 120;                        // 每 2 分鐘
    }

    /**
     * 格式化時間為簡短格式（用於刻度標籤）
     */
    formatTimeShort(seconds) {
        if (isNaN(seconds) || seconds < 0) {
            return '0:00';
        }

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);

        if (minutes > 0) {
            return `${minutes}:${String(secs).padStart(2, '0')}`;
        } else {
            return `0:${String(secs).padStart(2, '0')}`;
        }
    }

    /**
     * 綁定時間軸事件
     */
    bindTimelineEvents() {
        if (!this.timelineTrack || !this.playbackCursor) return;

        // 點擊時間軸跳轉
        const onTimelineClick = (e) => {
            // 忽略游標本身的點擊
            if (e.target === this.playbackCursor || e.target.closest('.timeline-cursor')) {
                return;
            }
            this.seekToPosition(e);
        };
        this.timelineTrack.addEventListener('click', onTimelineClick);

        // 拖動游標
        let isDragging = false;

        const onMouseDown = (e) => {
            isDragging = true;
            e.preventDefault();
            e.stopPropagation();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            this.seekToPosition(e);
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        // 綁定到游標
        this.playbackCursor.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // 儲存事件處理器以便清理
        this.timelineEventHandlers = {
            onTimelineClick,
            onMouseDown,
            onMouseMove,
            onMouseUp
        };
    }

    /**
     * 綁定滾輪縮放事件
     */
    bindZoomEvents() {
        if (!this.timelineScrollWrapper || !this.tracksContainer) return;

        // 移除舊的事件監聽器（如果存在）
        if (this.zoomEventHandler) {
            this.timelineScrollWrapper.removeEventListener('wheel', this.zoomEventHandler);
        }

        const onWheel = (e) => {
            e.preventDefault();

            // 根據 deltaY 計算縮放變化 (更精細的控制)
            // 注意:不同瀏覽器和設備的 deltaY 值差異很大
            // 使用 deltaMode 來標準化處理
            let deltaY = e.deltaY;

            // 標準化 deltaY 值 (某些設備/瀏覽器會返回很大的值)
            if (e.deltaMode === 1) {
                // DOM_DELTA_LINE - 以行為單位
                deltaY *= 33; // 轉換為像素
            } else if (e.deltaMode === 2) {
                // DOM_DELTA_PAGE - 以頁為單位
                deltaY *= 100; // 轉換為像素
            }

            // 使用固定步進,每次縮放固定 10%
            // 不管 deltaY 多大,每次都是固定增減 0.1
            const zoomStep = 0.1; // 固定每次 10%
            const zoomChange = deltaY > 0 ? -zoomStep : zoomStep;

            const oldZoomLevel = this.zoomLevel;
            const newZoomLevel = Math.max(1.0, Math.min(10.0, this.zoomLevel + zoomChange));

            // 如果縮放級別沒有變化,直接返回
            if (Math.abs(newZoomLevel - oldZoomLevel) < 0.01) return;

            // 調試日誌 (可以在瀏覽器控制台查看)
            console.log(`Zoom: ${oldZoomLevel.toFixed(2)} → ${newZoomLevel.toFixed(2)} (deltaY: ${e.deltaY}, normalized: ${deltaY}, change: ${zoomChange.toFixed(3)})`);

            // 計算滑鼠位置對應的時間點(作為縮放焦點)
            const rect = this.timelineTrack.getBoundingClientRect();
            const containerRect = this.timelineScrollWrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const containerScrollLeft = this.timelineScrollWrapper.scrollLeft;

            // 當前滑鼠位置對應的時間(考慮滾動)
            const duration = this.calculateTimelineDuration();
            const mouseTime = ((mouseX + containerScrollLeft) / rect.width) * duration;

            // 更新縮放級別
            this.zoomLevel = newZoomLevel;

            // 重新渲染時間軸和音軌（包含 WaveSurfer 重新創建）
            this.renderTimeline();
            this.renderTracks(false); // 必須重新創建 WaveSurfer 以正確顯示縮放後的波形

            // 調整滾動位置以保持滑鼠焦點
            // 新的時間軸寬度
            requestAnimationFrame(() => {
                if (!this.timelineTrack) return;
                const newRect = this.timelineTrack.getBoundingClientRect();
                const newMouseX = (mouseTime / duration) * newRect.width;
                const targetScrollLeft = newMouseX - (e.clientX - containerRect.left);

                this.timelineScrollWrapper.scrollLeft = Math.max(0, targetScrollLeft);

                // 更新視窗信息
                this.updateViewInfo();

                // 更新播放游標位置 (確保縮放後游標在正確位置)
                this.updatePlaybackCursor();
            });

            // 使用防抖顯示提示,避免頻繁更新
            if (this.zoomToastTimeout) {
                clearTimeout(this.zoomToastTimeout);
            }
            this.zoomToastTimeout = setTimeout(() => {
                showToast(`縮放: ${Math.round(this.zoomLevel * 100)}%`, 'info');
            }, 200);
        };

        // 綁定到統一滾動容器（支持在時間軸和音軌上縮放）
        this.timelineScrollWrapper.addEventListener('wheel', onWheel, { passive: false });

        // 保存事件處理器以便清理
        this.zoomEventHandler = onWheel;

        // 綁定滾動事件以更新視窗信息
        const onScroll = () => {
            this.updateViewInfo();
        };
        this.timelineScrollWrapper.addEventListener('scroll', onScroll);
        this.viewInfoScrollHandler = onScroll;
    }

    /**
     * 更新視窗信息顯示（時間範圍和縮放級別）
     */
    updateViewInfo() {
        const viewTimeRange = document.getElementById('view-time-range');
        const viewZoomLevel = document.getElementById('view-zoom-level');

        if (!viewTimeRange || !viewZoomLevel || !this.timelineTrack || !this.timelineContainer) return;

        const duration = this.calculateTimelineDuration();
        const trackRect = this.timelineTrack.getBoundingClientRect();
        const containerRect = this.timelineScrollWrapper.getBoundingClientRect();
        const scrollLeft = this.timelineScrollWrapper.scrollLeft;

        // 計算當前視窗顯示的時間範圍
        const viewStartTime = (scrollLeft / trackRect.width) * duration;
        const viewEndTime = ((scrollLeft + containerRect.width) / trackRect.width) * duration;

        // 更新顯示
        viewTimeRange.textContent = `View: ${viewStartTime.toFixed(2)}s - ${Math.min(viewEndTime, duration).toFixed(2)}s`;
        viewZoomLevel.textContent = `Zoom: ${Math.round(this.zoomLevel * 100)}%`;
    }

    /**
     * 根據滑鼠位置跳轉到對應時間
     */
    seekToPosition(event) {
        if (!this.timelineTrack || !this.videoElement) return;

        const rect = this.timelineTrack.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const duration = this.calculateTimelineDuration();
        const targetTime = percentage * duration;

        // 設定影片時間
        this.videoElement.currentTime = targetTime;

        // 立即更新游標位置
        this.updatePlaybackCursor();
    }

    /**
     * 更新播放游標位置
     */
    updatePlaybackCursor() {
        if (!this.playbackCursor || !this.videoElement) return;

        const duration = this.calculateTimelineDuration();
        if (duration === 0) return;

        const percentage = (this.videoElement.currentTime / duration) * 100;
        this.playbackCursor.style.left = `${Math.min(100, Math.max(0, percentage))}%`;

        // 同時更新延伸播放線
        this.updatePlaybackLine();
    }

    /**
     * 更新延伸播放線位置（貫穿所有音軌）
     */
    updatePlaybackLine() {
        if (!this.playbackLine || !this.timelineTrack || !this.tracksContainer) return;

        const trackRect = this.timelineTrack.getBoundingClientRect();
        const tracksRect = this.tracksContainer.getBoundingClientRect();

        // 計算左側位置（與游標同步）
        const duration = this.calculateTimelineDuration();
        if (duration === 0) return;

        const percentage = this.videoElement ? (this.videoElement.currentTime / duration) : 0;
        const leftPosition = trackRect.left + (trackRect.width * percentage);

        // 計算垂直範圍（從時間軸軌道頂部到音軌容器底部）
        const top = trackRect.top;
        const bottom = tracksRect.bottom;
        const height = bottom - top;

        // 更新播放線位置和尺寸
        this.playbackLine.style.left = `${leftPosition}px`;
        this.playbackLine.style.top = `${top}px`;
        this.playbackLine.style.height = `${height}px`;
    }

    /**
     * 啟動播放循環更新（使用 requestAnimationFrame）
     */
    startPlaybackLoop() {
        const loop = () => {
            if (this.videoElement && !this.videoElement.paused) {
                this.updatePlaybackCursor();
                this.animationFrameId = requestAnimationFrame(loop);
            }
        };
        loop();
    }

    /**
     * 停止播放循環更新
     */
    stopPlaybackLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * 初始化 AudioContext (Task 4.1)
     */
    setupAudioContext() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * 播放音訊 (Task 4.1)
     * @param {number} startTime 影片當前時間 (秒)
     */
    playAudio(startTime) {
        this.stopAudio(); // 先停止當前播放
        this.setupAudioContext();

        const audioData = this.getInputAudioData();
        if (audioData.length === 0) return;

        this.data.tracks.forEach((track, index) => {
            if (!audioData[index]) return;

            const buffer = audioData[index].buffer;

            // 計算音訊在時間軸上的有效區間
            const cropStart = track.cropStart || 0;
            const cropEnd = track.cropEnd !== null ? track.cropEnd : buffer.duration;
            const trackDuration = cropEnd - cropStart; // 裁切後的長度

            // 音訊在時間軸上的播放區間
            // trackStartTime = 音訊容器在時間軸上的起始位置
            // trackEndTime = 起始位置 + 裁切後的長度
            const trackStartTime = track.offset;
            const trackEndTime = trackStartTime + trackDuration;

            // 檢查當前時間點是否在這段音訊的播放範圍內
            // 影片時間: startTime
            // 音訊播放區間: [trackStartTime, trackEndTime]

            // 情況 1: 尚未播放到此音訊 (影片時間 < 音訊開始時間)
            // 需要排程在未來播放
            if (startTime < trackStartTime) {
                const delay = trackStartTime - startTime;
                const offset = cropStart; // 從裁切起點開始播
                const duration = trackDuration;

                this.scheduleAudioSource(buffer, delay, offset, duration);
            }

            // 情況 2: 正處於此音訊播放期間 (音訊開始時間 <= 影片時間 < 音訊結束時間)
            else if (startTime >= trackStartTime && startTime < trackEndTime) {
                const timeInTrack = startTime - trackStartTime; // 已經播了多久
                const offset = cropStart + timeInTrack; // 從裁切起點 + 已經播過的時間開始播
                const duration = trackDuration - timeInTrack; // 播剩下的長度

                if (duration > 0) {
                    this.scheduleAudioSource(buffer, 0, offset, duration);
                }
            }

            // 情況 3: 此音訊已播完 (影片時間 >= 音訊結束時間) -> 不用處理
        });
    }

    /**
     * 建立並排程 AudioBufferSourceNode
     */
    scheduleAudioSource(buffer, whenDelay, offset, duration) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        // when: AudioContext 時間座標
        // offset: Buffer 內的偏移
        // duration: 播放持續時間
        const acTime = this.audioContext.currentTime + whenDelay;

        source.start(acTime, offset, duration);
        this.sourceNodes.push(source);

        // 播放結束時自動從陣列移除 (非必要但好習慣)
        source.onended = () => {
            const idx = this.sourceNodes.indexOf(source);
            if (idx > -1) {
                this.sourceNodes.splice(idx, 1);
            }
        };
    }

    /**
     * 停止音訊播放 (Task 4.1)
     */
    stopAudio() {
        this.sourceNodes.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // 忽略已停止的錯誤
            }
        });
        this.sourceNodes = [];
    }

    /**
     * 確保 tracks 參數陣列長度與音訊數量一致
     */
    ensureTracksArray(count) {
        if (!this.data.tracks) {
            this.data.tracks = [];
        }

        // 補齊新增的音軌（使用預設參數）
        while (this.data.tracks.length < count) {
            this.data.tracks.push({
                offset: 0,         // 時間偏移（秒）
                cropStart: 0,      // 裁切起始點（秒）
                cropEnd: null,     // 裁切結束點（null 表示音訊結尾）
                stretchFactor: 1.0 // 時間伸縮係數（1.0 = 原速，>1.0 = 變慢/拉長，<1.0 = 變快/壓縮）
            });
        }

        // 移除多餘的音軌
        if (this.data.tracks.length > count) {
            this.data.tracks = this.data.tracks.slice(0, count);
        }
    }

    /**
     * 取得輸入音訊列表及其元資料
     */
    getInputAudioData() {
        // 從輸入端口取得資料
        const audioPort = this.getInputPort('audio');
        if (!audioPort || !audioPort.connected) {
            return [];
        }

        // 取得連接的節點和端口
        const sourceNode = audioPort.connectedTo?.node;
        const sourcePort = audioPort.connectedTo?.port;
        const sourcePortName = sourcePort?.name;

        if (!sourceNode) {
            return [];
        }

        // 檢查是否連接自預覽端口 (preview-output-N)
        const isPreviewPort = sourcePortName && sourcePortName.startsWith('preview-output-');
        const previewIndex = isPreviewPort ? parseInt(sourcePortName.split('-')[2]) : -1;

        // 嘗試從 lastOutputs 取得處理結果
        let outputs = sourceNode.lastOutputs;

        // 如果沒有執行結果，嘗試直接讀取節點狀態（改善 UX）
        if (!outputs) {
            // 情況 A: 連接的是 AudioInputNode (或其他支援 audioFiles 的節點)
            if (sourceNode.audioFiles && Array.isArray(sourceNode.audioFiles) && sourceNode.audioFiles.length > 0) {
                // 模擬輸出格式
                outputs = {
                    audioFiles: sourceNode.audioFiles.map(f => f.audioBuffer),
                    filenames: sourceNode.audioFiles.map(f => f.filename)
                };
            }
            // 情況 B: 舊版單檔節點
            else if (sourceNode.data && (sourceNode.data.audioBuffer || sourceNode.audioBuffer)) {
                outputs = {
                    audio: sourceNode.data.audioBuffer || sourceNode.audioBuffer
                };
            }
        }

        if (!outputs) {
            return [];
        }

        const lastOutputs = outputs; // 為了保持下方變數名稱一致

        // 如果連接自預覽端口，只返回該特定音訊
        if (isPreviewPort && lastOutputs.audioFiles && Array.isArray(lastOutputs.audioFiles)) {
            const filenames = lastOutputs.filenames || [];
            if (previewIndex >= 0 && previewIndex < lastOutputs.audioFiles.length) {
                const buffer = lastOutputs.audioFiles[previewIndex];
                if (buffer instanceof AudioBuffer) {
                    return [{
                        buffer: buffer,
                        filename: filenames[previewIndex] || `音訊 ${previewIndex + 1}`
                    }];
                }
            }
            // 如果預覽索引無效，返回空陣列
            console.warn(`Invalid preview index ${previewIndex} for audioFiles length ${lastOutputs.audioFiles.length}`);
            return [];
        }

        // 根據不同的輸出格式處理
        const audioData = [];

        // 格式 1: {audioFiles: [...], filenames: [...]}
        if (lastOutputs.audioFiles && Array.isArray(lastOutputs.audioFiles)) {
            const filenames = lastOutputs.filenames || [];
            for (let i = 0; i < lastOutputs.audioFiles.length; i++) {
                const buffer = lastOutputs.audioFiles[i];
                // 驗證 buffer 是有效的 AudioBuffer
                if (buffer instanceof AudioBuffer) {
                    audioData.push({
                        buffer: buffer,
                        filename: filenames[i] || `音訊 ${i + 1}`
                    });
                } else {
                    console.warn(`Invalid audio buffer at index ${i}, skipping`);
                }
            }
        }
        // 格式 2: {audio: AudioBuffer}
        else if (lastOutputs.audio && lastOutputs.audio instanceof AudioBuffer) {
            audioData.push({
                buffer: lastOutputs.audio,
                filename: sourceNode.data?.filename || '音訊 1'
            });
        }

        return audioData;
    }

    /**
     * 渲染音軌列表
     * @param {boolean} skipWaveSurfer - 是否跳過 WaveSurfer 重新創建(縮放時使用)
     */
    renderTracks(skipWaveSurfer = false) {
        if (!this.tracksContainer) return;

        // 取得輸入音訊列表
        const audioData = this.getInputAudioData();

        // 確保 tracks 參數陣列長度一致
        this.ensureTracksArray(audioData.length);

        // 大量音軌警告
        if (audioData.length > 10) {
            showToast(`音軌數量較多 (${audioData.length})，可能影響效能`, 'warning');
        }

        // 清理舊的 WaveSurfer 實例（必須在清空 DOM 之前執行）
        if (this.trackWaveSurfers && this.trackWaveSurfers.length > 0) {
            this.trackWaveSurfers.forEach(ws => {
                if (ws) {
                    try {
                        ws.destroy();
                    } catch (e) {
                        console.warn('WaveSurfer destroy error:', e);
                    }
                }
            });
            this.trackWaveSurfers = [];
        }

        // 清空容器
        this.tracksContainer.innerHTML = '';

        // 處理無音訊輸入的情況（只顯示影片）
        if (audioData.length === 0) {
            this.tracksContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--spacing-4);">
                    無音訊輸入 - 僅預覽影片
                </div>
            `;
            return;
        }

        // 計算時間軸的像素寬度（用於對齊）
        const timelineDuration = this.calculateTimelineDuration();
        console.log(`[RenderTracks] CalculateTimelineDuration: ${timelineDuration}s`);
        console.log(`[RenderTracks] VideoDuration: ${this.videoElement?.duration || 0}s`);
        console.log(`[RenderTracks] AudioData count: ${audioData.length}`);

        // 驗證時間軸已準備好
        if (timelineDuration === 0 || !this.timelineTrack) {
            console.warn('Timeline not ready, deferring track rendering');
            this.tracksContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--spacing-4);">
                    等待影片載入...
                </div>
            `;
            return;
        }

        // 計算時間軸實際寬度（使用容器寬度 × 縮放倍率以避免 offsetWidth 的四捨五入誤差）
        const containerWidth = this.timelineScrollWrapper.offsetWidth;
        const timelineWidth = containerWidth * this.zoomLevel;

        // 額外驗證
        if (timelineWidth === 0) {
            console.warn('Timeline width is 0, deferring track rendering');
            return;
        }

        // 為每個音訊建立音軌 DOM
        audioData.forEach((audio, index) => {
            const trackParams = this.data.tracks[index];
            const buffer = audio.buffer;

            // 建立音軌容器（不加padding，讓內部元素自行處理對齊）
            const trackDiv = document.createElement('div');
            trackDiv.className = 'video-preview-track';
            trackDiv.style.cssText = `
                margin-bottom: var(--spacing-3);
                background: var(--bg-dark);
                border-radius: 4px;
                overflow: visible;
            `;

            // 音軌標題（顯示檔案名，添加padding）
            const trackTitle = document.createElement('div');
            trackTitle.className = 'track-title';
            trackTitle.style.cssText = `
                color: var(--text);
                font-size: var(--text-sm);
                font-weight: 500;
                margin-bottom: var(--spacing-2);
                padding: var(--spacing-3);
                padding-bottom: 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            const stretchFactor = trackParams.stretchFactor || 1.0;
            const cropStart = trackParams.cropStart || 0;
            const cropEnd = trackParams.cropEnd !== null ? trackParams.cropEnd : buffer.duration;
            const stretchedDuration = (cropEnd - cropStart) * stretchFactor;
            // 計算時間軸上的起始和結束時間
            const startTime = trackParams.offset + cropStart;
            const endTime = trackParams.offset + cropEnd;

            trackTitle.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; gap: var(--spacing-2);">
                    <span>${this.escapeHtml(audio.filename)}</span>
                    <div style="display: flex; align-items: center; gap: var(--spacing-2);">
                        <span class="track-time-info" style="color: var(--text-muted); font-size: var(--text-xs); font-family: monospace;">
                            Start: ${startTime.toFixed(2)}s | End: ${endTime.toFixed(2)}s | Dur: ${stretchedDuration.toFixed(2)}s
                            ${stretchFactor !== 1.0 ? `(${stretchFactor.toFixed(2)}x)` : ''}
                        </span>
                        <button class="track-stretch-btn" data-track-index="${index}" style="
                            background: ${trackParams.stretchMode ? 'var(--primary)' : 'var(--bg)'};
                            color: ${trackParams.stretchMode ? 'var(--bg)' : 'var(--text)'};
                            border: 1px solid var(--border);
                            border-radius: 4px;
                            padding: 2px 8px;
                            font-size: var(--text-xs);
                            cursor: pointer;
                            transition: all 0.2s;
                        " title="切換時長調整模式">⇔</button>
                        <button class="track-reset-stretch-btn" data-track-index="${index}" style="
                            background: var(--bg);
                            color: var(--text);
                            border: 1px solid var(--border);
                            border-radius: 4px;
                            padding: 2px 8px;
                            font-size: var(--text-xs);
                            cursor: pointer;
                            transition: all 0.2s;
                        " title="重置時長">↺</button>
                    </div>
                </div>
            `;

            // 時間軸容器（與統一時間軸對齊，不再獨立滾動）
            const trackTimelineContainer = document.createElement('div');
            trackTimelineContainer.className = 'track-timeline';
            const trackWidth = `${100 * this.zoomLevel}%`;
            trackTimelineContainer.style.cssText = `
                position: relative;
                height: 60px;
                background: var(--bg);
                border-radius: 4px;
                overflow: hidden;
                width: ${trackWidth};
                min-width: 100%;
            `;

            // 音訊區塊容器（占位，Task 3.2 將添加 WaveSurfer）
            const audioBlockContainer = document.createElement('div');
            audioBlockContainer.className = 'track-audio-block';
            audioBlockContainer.style.cssText = `
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                height: 80%;
                background: var(--primary);
                opacity: 0.8;
                border-radius: 2px;
                cursor: move;
                box-sizing: border-box;
            `;

            // 計算音訊區塊的位置和寬度 (考慮縮放)
            // 注意: timelineWidth 已經包含縮放因子 (因為 timeline track 的 width 是 ${100 * this.zoomLevel}%)
            const pixelsPerSecond = timelineWidth / (timelineDuration || 1);
            // cropStart 和 cropEnd 已在前面聲明
            const audioDuration = buffer.duration;

            // 音訊區塊容器 (Full Container)
            // Container 代表整個音訊檔案的長度
            const blockLeftPixels = trackParams.offset * pixelsPerSecond;
            const blockWidthPixels = audioDuration * pixelsPerSecond;

            console.log(`[Track ${index}] Audio: ${audioDuration}s, Offset: ${trackParams.offset}s, End: ${trackParams.offset + audioDuration}s`);
            console.log(`[Track ${index}] TimelineWidth: ${timelineWidth}px, TimelineDuration: ${timelineDuration}s, PPS: ${pixelsPerSecond.toFixed(2)}`);
            console.log(`[Track ${index}] Block: left=${blockLeftPixels.toFixed(2)}px, width=${blockWidthPixels.toFixed(2)}px`);

            // 限制 cropEnd 不超過 audioDuration
            const safeCropEnd = Math.min(cropEnd, audioDuration);

            audioBlockContainer.style.left = `${blockLeftPixels}px`;
            audioBlockContainer.style.width = `${blockWidthPixels}px`;
            // audioBlockContainer.style.overflow = 'hidden'; // 移除 hidden 以顯示 ghost

            // 1. 內部波形容器 (Full Waveform)
            const waveContainer = document.createElement('div');
            waveContainer.className = 'track-wave-container';
            const waveContainerId = `video-preview-wave-${this.id}-${index}`;
            waveContainer.id = waveContainerId;
            waveContainer.style.cssText = `
                position: relative;
                height: 100%;
                width: 100%;
            `;

            // 2. 左側遮罩 (Start Curtain)
            const startCurtain = document.createElement('div');
            startCurtain.className = 'crop-curtain-start';
            startCurtain.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: ${cropStart * pixelsPerSecond}px;
                background-color: rgba(0, 0, 0, 0.5); 
                pointer-events: none; /* 讓事件穿透到 Container 處理 */
                z-index: 10;
                border-right: 2px solid var(--primary); /* 裁切線 */
            `;

            // 3. 右側遮罩 (End Curtain)
            const endCurtain = document.createElement('div');
            endCurtain.className = 'crop-curtain-end';
            endCurtain.style.cssText = `
                position: absolute;
                right: 0; 
                top: 0;
                bottom: 0;
                width: ${(audioDuration - safeCropEnd) * pixelsPerSecond}px;
                background-color: rgba(0, 0, 0, 0.5);
                pointer-events: none;
                z-index: 10;
                border-left: 2px solid var(--primary); /* 裁切線 */
            `;

            audioBlockContainer.appendChild(waveContainer);
            audioBlockContainer.appendChild(startCurtain);
            audioBlockContainer.appendChild(endCurtain);

            // 添加時長伸縮把手（當伸縮模式啟用時）
            if (trackParams.stretchMode) {
                const stretchHandle = this.createStretchHandle(index, audioBlockContainer, trackTitle, pixelsPerSecond, buffer.duration);
                audioBlockContainer.appendChild(stretchHandle);
            }

            // 綁定拖曳與裁切事件 (Task 3.4)
            // 傳入遮罩元素以便更新
            // Task 4.4: 傳入 trackTitle 以便更新時間顯示
            this.bindTrackDragEvents(audioBlockContainer, waveContainer, startCurtain, endCurtain, index, pixelsPerSecond, audioDuration, trackTitle);

            // 組裝音軌 DOM
            trackTimelineContainer.appendChild(audioBlockContainer);
            trackDiv.appendChild(trackTitle);
            trackDiv.appendChild(trackTimelineContainer);
            this.tracksContainer.appendChild(trackDiv);

            // 綁定時長調整按鈕事件
            const stretchBtn = trackDiv.querySelector('.track-stretch-btn');
            const resetBtn = trackDiv.querySelector('.track-reset-stretch-btn');

            if (stretchBtn) {
                stretchBtn.addEventListener('click', () => {
                    // 切換伸縮模式
                    trackParams.stretchMode = !trackParams.stretchMode;
                    showToast(trackParams.stretchMode ? '時長調整模式已啟用' : '時長調整模式已關閉', 'info');

                    // 優化：只更新按鈕樣式，不重新渲染整個列表
                    stretchBtn.style.background = trackParams.stretchMode ? 'var(--primary)' : 'var(--bg)';
                    stretchBtn.style.color = trackParams.stretchMode ? 'var(--bg)' : 'var(--text)';

                    // 如果啟用伸縮模式，添加伸縮把手；否則移除
                    const existingHandle = audioBlockContainer.querySelector('.track-stretch-handle');
                    if (trackParams.stretchMode && !existingHandle) {
                        const stretchHandle = this.createStretchHandle(index, audioBlockContainer, trackTitle, pixelsPerSecond, buffer.duration);
                        audioBlockContainer.appendChild(stretchHandle);
                    } else if (!trackParams.stretchMode && existingHandle) {
                        existingHandle.remove();
                    }
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    trackParams.stretchFactor = 1.0;
                    this.setData('tracks', this.data.tracks);
                    showToast('時長已重置', 'success');

                    // 優化：只更新這一個音軌的寬度和顯示，不重新渲染整個列表
                    const originalWidth = buffer.duration * pixelsPerSecond;
                    audioBlockContainer.style.width = `${originalWidth}px`;

                    // 更新時間顯示
                    const timeInfo = trackTitle.querySelector('.track-time-info');
                    if (timeInfo) {
                        const cropStart = trackParams.cropStart || 0;
                        const cropEnd = trackParams.cropEnd !== null ? trackParams.cropEnd : buffer.duration;
                        const duration = cropEnd - cropStart;
                        const startTime = trackParams.offset + cropStart;
                        const endTime = trackParams.offset + cropEnd;
                        timeInfo.textContent = `Start: ${startTime.toFixed(2)}s | End: ${endTime.toFixed(2)}s | Dur: ${duration.toFixed(2)}s`;
                    }
                });
            }
        });

        // 延遲初始化 WaveSurfer 以確保 DOM 已渲染（縮放時跳過以提高性能）
        if (!skipWaveSurfer) {
            requestAnimationFrame(() => {
                audioData.forEach((audio, index) => {
                    this.initTrackWaveSurfer(index, audio.buffer);
                });
            });
        }
    }

    /**
     * 初始化單一音軌的 WaveSurfer
     */
    async initTrackWaveSurfer(index, buffer) {
        if (!buffer) return;

        try {
            // 清理舊實例
            if (this.trackWaveSurfers[index]) {
                this.trackWaveSurfers[index].destroy();
                this.trackWaveSurfers[index] = null;
            }

            // 取得容器 (現在是 inner wave container)
            const waveContainerId = `video-preview-wave-${this.id}-${index}`;
            const container = document.getElementById(waveContainerId);

            if (!container) {
                console.warn(`WaveSurfer container not found: ${waveContainerId}`);
                console.log(document.getElementById(`video-preview-wave-${this.id}-${index}`));
                // 嘗試再次查找，有時可能是尚未插入 DOM
                return;
            }

            // 建立 WaveSurfer 實例
            const wavesurfer = WaveSurfer.create({
                container: container,
                waveColor: 'hsl(0 0% 100% / 0.8)',
                progressColor: 'hsl(0 0% 100% / 0.8)', // 不顯示進度顏色（由外部移動控制）
                cursorColor: 'transparent',
                height: container.clientHeight || 48,
                barWidth: 2,
                barGap: 1,
                responsive: false, // 禁用 responsive 以避免視窗滾動時的裁切問題
                normalize: true,
                interact: false // 禁止內部互動（點擊等由外部控制）
            });

            // 載入音訊
            const wavData = audioBufferToWav(buffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            wavesurfer.loadBlob(blob);

            // 儲存實例
            this.trackWaveSurfers[index] = wavesurfer;

        } catch (error) {
            console.error(`WaveSurfer init failed for track ${index}:`, error);
        }
    }

    /**
     * 綁定音軌拖曳與裁切事件 (Task 3.3 & 3.4 & 4.4)
     */
    bindTrackDragEvents(element, waveContainer, startCurtain, endCurtain, index, pixelsPerSecond, audioDuration, trackTitleElement) {
        let startX = 0;
        let startLeft = 0; // element.style.left
        let startCropStart = 0;
        let startCropEnd = 0;

        let dragMode = 'none'; // 'move', 'resize-left', 'resize-right'

        // Task 4.4: 取得時間顯示元素
        const timeInfoEl = trackTitleElement ? trackTitleElement.querySelector('.track-time-info') : null;

        const updateTimeInfo = (track) => {
            if (!timeInfoEl) return;
            const cs = track.cropStart || 0;
            const ce = track.cropEnd !== null ? track.cropEnd : audioDuration;
            // 修正顯示：Start 等於此片段在時間軸上的起始時間 (offset + cropStart)
            // End 等於結束時間 (offset + cropEnd)
            const startTime = track.offset + cs;
            const endTime = track.offset + ce;
            const duration = ce - cs;

            timeInfoEl.textContent = `Start: ${startTime.toFixed(2)}s | End: ${endTime.toFixed(2)}s | Dur: ${duration.toFixed(2)}s`;
        };

        // 建立 tooltip 元素（顯示在右側）
        let tooltip = document.createElement('div');
        tooltip.className = 'drag-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            top: -25px;
            left: 100%;
            transform: translateX(10px);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            pointer-events: none;
            display: none;
            white-space: nowrap;
            z-index: 1000;
        `;
        element.appendChild(tooltip);

        const onMouseDown = (e) => {
            const rect = element.getBoundingClientRect();
            const clickXPixels = e.clientX - rect.left; // 相對於容器左側的像素

            // 取得目前的 crop 參數 (單位: 秒)
            const currentCropStart = this.data.tracks[index].cropStart || 0;
            const currentCropEnd = this.data.tracks[index].cropEnd !== undefined ? this.data.tracks[index].cropEnd : audioDuration;

            // 轉換為像素位置
            const cropStartPixels = currentCropStart * pixelsPerSecond;
            const cropEndPixels = currentCropEnd * pixelsPerSecond;

            const edgeThreshold = 10;

            // 判斷點擊位置
            // 修改優先級：預設為拖拉(move)，只有按住 Shift 鍵時才啟用裁切功能
            if (e.shiftKey) {
                // Shift 模式：啟用裁切功能
                // 1. Resize Left: 在 cropStart 附近
                if (Math.abs(clickXPixels - cropStartPixels) < edgeThreshold) {
                    dragMode = 'resize-left';
                    element.style.cursor = 'w-resize';
                }
                // 2. Resize Right: 在 cropEnd 附近
                else if (Math.abs(clickXPixels - cropEndPixels) < edgeThreshold) {
                    dragMode = 'resize-right';
                    element.style.cursor = 'e-resize';
                }
                // 3. Move: 其他區域仍為移動
                else {
                    dragMode = 'move';
                    element.style.cursor = 'grabbing';
                }
            } else {
                // 預設模式：整個區域都可以拖拉
                dragMode = 'move';
                element.style.cursor = 'grabbing';
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopPropagation();

            startX = e.clientX;

            // 記錄初始狀態
            startLeft = parseFloat(element.style.left) || 0;

            // 確保 tracks[index].cropStart/End 有值
            if (this.data.tracks[index].cropStart === undefined) this.data.tracks[index].cropStart = 0;
            if (this.data.tracks[index].cropEnd === undefined || this.data.tracks[index].cropEnd === null) this.data.tracks[index].cropEnd = audioDuration;

            startCropStart = this.data.tracks[index].cropStart;
            startCropEnd = this.data.tracks[index].cropEnd;

            element.classList.add('dragging');
            tooltip.style.display = 'block';
            this.updateTooltip(tooltip, dragMode, this.data.tracks[index]);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (dragMode === 'none') return;

            const deltaPixels = e.clientX - startX;
            const deltaSeconds = deltaPixels / pixelsPerSecond;

            const minDuration = 0.1; // 最小保留 0.1 秒

            if (dragMode === 'move') {
                // 移動模式：只改變 offset (容器的 left)
                const newLeft = startLeft + deltaPixels;
                element.style.left = `${newLeft}px`;

                // Offset = newLeft / pps
                this.data.tracks[index].offset = newLeft / pixelsPerSecond;
                this.updateTooltip(tooltip, 'move', this.data.tracks[index]);
                updateTimeInfo(this.data.tracks[index]); // Update UI info

            } else if (dragMode === 'resize-left') {
                // 左裁切：改變 cropStart
                let newCropStart = startCropStart + deltaSeconds;

                // 邊界檢查
                if (newCropStart < 0) newCropStart = 0;
                if (newCropStart > startCropEnd - minDuration) newCropStart = startCropEnd - minDuration;

                // 更新數據
                this.data.tracks[index].cropStart = newCropStart;

                // 更新視覺 (Start Curtain Width)
                startCurtain.style.width = `${newCropStart * pixelsPerSecond}px`;

                this.updateTooltip(tooltip, 'resize-left', this.data.tracks[index]);
                updateTimeInfo(this.data.tracks[index]); // Update UI info

            } else if (dragMode === 'resize-right') {
                // 右裁切：改變 cropEnd
                let newCropEnd = startCropEnd + deltaSeconds;

                // 邊界檢查
                if (newCropEnd > audioDuration) newCropEnd = audioDuration;
                if (newCropEnd < startCropStart + minDuration) newCropEnd = startCropStart + minDuration;

                // 更新數據
                this.data.tracks[index].cropEnd = newCropEnd;

                // 更新視覺 (End Curtain Width)
                endCurtain.style.width = `${(audioDuration - newCropEnd) * pixelsPerSecond}px`;

                this.updateTooltip(tooltip, 'resize-right', this.data.tracks[index]);
                updateTimeInfo(this.data.tracks[index]); // Update UI info
            }
        };

        const onMouseUp = () => {
            if (dragMode === 'none') return;
            dragMode = 'none';

            element.style.cursor = 'move';
            element.classList.remove('dragging');
            tooltip.style.display = 'none';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            this.setData('tracks', this.data.tracks);
        };

        // Hover cursor 處理 - 只有按住 Shift 時才顯示裁切游標
        element.addEventListener('mousemove', (e) => {
            if (dragMode !== 'none') return; // 拖曳中不改變

            const rect = element.getBoundingClientRect();
            const hoverXPixels = e.clientX - rect.left;

            const currentCropStart = this.data.tracks[index].cropStart || 0;
            const currentCropEnd = this.data.tracks[index].cropEnd !== undefined ? this.data.tracks[index].cropEnd : audioDuration;

            const cropStartPixels = currentCropStart * pixelsPerSecond;
            const cropEndPixels = currentCropEnd * pixelsPerSecond;
            const edgeThreshold = 10;

            // 只有按住 Shift 鍵時才顯示裁切游標
            if (e.shiftKey) {
                if (Math.abs(hoverXPixels - cropStartPixels) < edgeThreshold) {
                    element.style.cursor = 'w-resize';
                } else if (Math.abs(hoverXPixels - cropEndPixels) < edgeThreshold) {
                    element.style.cursor = 'e-resize';
                } else {
                    element.style.cursor = 'move';
                }
            } else {
                // 預設顯示移動游標
                element.style.cursor = 'move';
            }
        });

        element.addEventListener('mousedown', onMouseDown);
    }

    /**
     * 建立伸縮把手元素
     */
    createStretchHandle(trackIndex, audioBlock, trackTitle, pixelsPerSecond, originalDuration) {
        const stretchHandle = document.createElement('div');
        stretchHandle.className = 'track-stretch-handle';
        stretchHandle.style.cssText = `
            position: absolute;
            right: -6px;
            top: 0;
            bottom: 0;
            width: 12px;
            background: var(--primary);
            cursor: ew-resize;
            z-index: 20;
            opacity: 0.9;
            border-radius: 2px;
            transition: opacity 0.2s;
        `;
        stretchHandle.title = '拖曳以調整時長';

        stretchHandle.addEventListener('mouseenter', () => {
            stretchHandle.style.opacity = '1';
        });
        stretchHandle.addEventListener('mouseleave', () => {
            stretchHandle.style.opacity = '0.9';
        });

        // 綁定伸縮拖曳事件
        this.bindStretchDragEvents(stretchHandle, trackIndex, audioBlock, trackTitle, pixelsPerSecond, originalDuration);

        return stretchHandle;
    }

    /**
     * 綁定時長伸縮拖曳事件
     */
    bindStretchDragEvents(handle, trackIndex, audioBlock, trackTitle, pixelsPerSecond, originalDuration) {
        let isDragging = false;
        let startX = 0;
        let startStretchFactor = 1.0;
        let startWidth = 0;

        const updateStretchDisplay = () => {
            const timeInfo = trackTitle.querySelector('.track-time-info');
            if (timeInfo) {
                const trackParams = this.data.tracks[trackIndex];
                const stretchFactor = trackParams.stretchFactor || 1.0;
                const cropStart = trackParams.cropStart || 0;
                const cropEnd = trackParams.cropEnd !== null ? trackParams.cropEnd : originalDuration;
                const stretchedDuration = (cropEnd - cropStart) * stretchFactor;

                timeInfo.textContent = `Dur: ${stretchedDuration.toFixed(2)}s ${stretchFactor !== 1.0 ? `(${stretchFactor.toFixed(2)}x)` : ''}`;
            }
        };

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startStretchFactor = this.data.tracks[trackIndex].stretchFactor || 1.0;

            // 獲取當前音訊區塊的寬度
            const rect = audioBlock.getBoundingClientRect();
            startWidth = rect.width;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const originalWidth = originalDuration * pixelsPerSecond;

            // 計算新的伸縮係數
            // 原始寬度 * startStretchFactor + deltaX = 原始寬度 * newStretchFactor
            const newStretchFactor = startStretchFactor + (deltaX / originalWidth);

            // 限制伸縮範圍（0.25x ~ 4.0x）
            const clampedStretchFactor = Math.max(0.25, Math.min(4.0, newStretchFactor));

            // 更新數據
            this.data.tracks[trackIndex].stretchFactor = clampedStretchFactor;

            // 更新視覺寬度
            const newWidth = originalWidth * clampedStretchFactor;
            audioBlock.style.width = `${newWidth}px`;

            // 更新顯示
            updateStretchDisplay();
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;

            // 保存數據
            this.setData('tracks', this.data.tracks);

            showToast(`時長已調整為 ${this.data.tracks[trackIndex].stretchFactor.toFixed(2)}x`, 'success');

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    updateTooltip(tooltip, mode, track) {
        if (mode === 'move') {
            tooltip.textContent = `Offset: ${track.offset.toFixed(3)}s`;
        } else if (mode === 'resize-left') {
            tooltip.textContent = `Start: ${track.cropStart.toFixed(3)}s`;
        } else if (mode === 'resize-right') {
            tooltip.textContent = `End: ${track.cropEnd.toFixed(3)}s`;
        }
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

        // 立即顯示模態視窗，以確保 renderTracks 時有寬度
        document.body.appendChild(modal);

        // 載入影片到 video 元素
        this.videoElement.src = this.data.videoUrl;

        // 添加影片載入錯誤處理
        this.videoElement.onerror = () => {
            showToast('影片載入失敗', 'error');
            this.closeEditor();
        };

        // 在影片載入 metadata 後渲染音軌
        const onLoadedMetadata = () => {
            this.renderTracks();
            this.videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
        };

        // Check if metadata is already loaded (cached video)
        if (this.videoElement.readyState >= 1) {
            // Metadata already loaded, render immediately
            onLoadedMetadata();
        } else {
            // Wait for metadata to load
            this.videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
        }

        // 鎖定背景節點圖（添加 CSS 類）
        const graphCanvas = document.querySelector('.graph-canvas');
        if (graphCanvas) {
            graphCanvas.classList.add('video-preview-locked');
            // 添加內聯樣式確保鎖定效果
            graphCanvas.style.pointerEvents = 'none';
            graphCanvas.style.opacity = '0.5';
        }

        // 添加鍵盤事件處理（ESC 關閉，阻止其他快捷鍵）
        this.handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.closeEditor();
                return;
            }

            // 阻止空白鍵和其他圖形快捷鍵在模態視窗開啟時觸發
            if (e.code === 'Space' || e.key === 'f' || e.key === 'F' ||
                e.key === 'Delete' || e.key === 'Home' ||
                e.key === '+' || e.key === '-' ||
                (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'o' || e.key === 'O'))) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        document.addEventListener('keydown', this.handleKeyDown, true); // 使用捕獲階段

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

        // 停止播放循環
        this.stopPlaybackLoop();

        // 清理影片事件處理器
        if (this.videoEventHandlers && this.videoElement) {
            this.videoElement.removeEventListener('timeupdate', this.videoEventHandlers.timeupdate);
            this.videoElement.removeEventListener('loadedmetadata', this.videoEventHandlers.loadedmetadata);
            this.videoElement.removeEventListener('play', this.videoEventHandlers.play);
            this.videoElement.removeEventListener('playing', this.videoEventHandlers.playing);
            this.videoElement.removeEventListener('pause', this.videoEventHandlers.pause);
            this.videoElement.removeEventListener('ended', this.videoEventHandlers.ended);
            this.videoElement.removeEventListener('seeking', this.videoEventHandlers.seeking);
            this.videoElement.removeEventListener('seeked', this.videoEventHandlers.seeked);
            this.videoEventHandlers = null;
        }

        // 清理時間軸事件處理器
        if (this.timelineEventHandlers) {
            if (this.timelineTrack) {
                this.timelineTrack.removeEventListener('click', this.timelineEventHandlers.onTimelineClick);
            }
            if (this.playbackCursor) {
                this.playbackCursor.removeEventListener('mousedown', this.timelineEventHandlers.onMouseDown);
            }
            document.removeEventListener('mousemove', this.timelineEventHandlers.onMouseMove);
            document.removeEventListener('mouseup', this.timelineEventHandlers.onMouseUp);
            this.timelineEventHandlers = null;
        }

        // 清理滾輪縮放事件處理器
        if (this.zoomEventHandler && this.timelineScrollWrapper) {
            this.timelineScrollWrapper.removeEventListener('wheel', this.zoomEventHandler);
            this.zoomEventHandler = null;
        }

        // 清理滾動事件處理器
        if (this.viewInfoScrollHandler && this.timelineScrollWrapper) {
            this.timelineScrollWrapper.removeEventListener('scroll', this.viewInfoScrollHandler);
            this.viewInfoScrollHandler = null;
        }

        // 重置縮放狀態
        this.zoomLevel = 1.0;
        this.viewOffset = 0;

        // 銷毀 WaveSurfer 實例（待實作）
        // 銷毀所有 WaveSurfer 實例
        if (this.trackWaveSurfers) {
            this.trackWaveSurfers.forEach(ws => {
                if (ws) {
                    try {
                        ws.destroy();
                    } catch (e) {
                        console.warn('Destroy wavesurfer failed:', e);
                    }
                }
            });
            this.trackWaveSurfers = [];
        }

        // 移除延伸播放線
        if (this.playbackLine && this.playbackLine.parentNode) {
            this.playbackLine.parentNode.removeChild(this.playbackLine);
        }

        // 移除模態 DOM
        if (this.modalElement && this.modalElement.parentNode) {
            this.modalElement.parentNode.removeChild(this.modalElement);
        }

        // 清理參考
        this.modalElement = null;
        this.videoElement = null;
        this.controlsContainer = null;
        this.currentTimeEl = null;
        this.totalTimeEl = null;
        this.timelineContainer = null;
        this.playbackCursor = null;
        this.playbackLine = null;
        this.timelineTrack = null;
        this.tracksContainer = null;

        // 解鎖節點圖
        const graphCanvas = document.querySelector('.graph-canvas');
        if (graphCanvas) {
            graphCanvas.classList.remove('video-preview-locked');
            graphCanvas.style.pointerEvents = '';
            graphCanvas.style.opacity = '';
        }

        // 移除鍵盤事件監聽器
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown, true);
            this.handleKeyDown = null;
        }

        showToast('編輯器已關閉', 'info');
    }

    /**
     * 應用時間偏移到音訊 Buffer
     * @param {AudioBuffer} buffer - 原始音訊 buffer
     * @param {number} offset - 時間偏移（秒），正數為延後，負數為提前
     * @returns {AudioBuffer} 處理後的 buffer
     */
    applyTimeOffset(buffer, offset) {
        if (!buffer) return null;
        if (offset === 0) return buffer;

        const sampleRate = buffer.sampleRate;
        const numberOfChannels = buffer.numberOfChannels;

        // 正偏移：在開頭添加靜音
        if (offset > 0) {
            const silentSamples = Math.floor(offset * sampleRate);
            const newLength = buffer.length + silentSamples;

            // 建立新的 AudioBuffer
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

            // 複製原音訊到偏移位置
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const originalData = buffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);

                // 開頭是靜音（預設為 0）
                // 從 silentSamples 位置開始複製原始音訊
                newData.set(originalData, silentSamples);
            }

            return newBuffer;
        }

        // 負偏移：裁切開頭部分
        else {
            const cropSeconds = Math.abs(offset);
            // 使用 audioProcessor.cropAudio() 裁切開頭
            return audioProcessor.cropAudio(buffer, cropSeconds, buffer.duration);
        }
    }

    async process(inputs) {
        // 取得輸入音訊列表
        const audioData = this.getInputAudioData();

        // 如果沒有音訊輸入，返回空
        if (audioData.length === 0) {
            return {
                audio: null,
                audioFiles: [],
                filenames: []
            };
        }

        // 確保 tracks 參數陣列長度一致
        this.ensureTracksArray(audioData.length);

        // 為每個音訊應用處理
        const processedAudioFiles = [];
        const processedFilenames = [];

        for (let i = 0; i < audioData.length; i++) {
            const audioItem = audioData[i];
            const trackParams = this.data.tracks[i];
            let processedBuffer = audioItem.buffer;

            // 驗證 AudioBuffer
            if (!processedBuffer || !(processedBuffer instanceof AudioBuffer)) {
                console.warn(`音訊 ${i} 無效，跳過處理`);
                showToast(`音訊 "${audioItem.filename}" 無效`, 'warning');
                continue;
            }

            // 驗證 AudioBuffer 不為空
            if (processedBuffer.length === 0 || processedBuffer.duration === 0) {
                console.warn(`音訊 ${i} 為空，跳過處理`);
                showToast(`音訊 "${audioItem.filename}" 為空`, 'warning');
                continue;
            }

            try {
                // 步驟 1：裁切（cropStart, cropEnd）
                let cropStart = trackParams.cropStart || 0;
                let cropEnd = trackParams.cropEnd !== null && trackParams.cropEnd !== undefined
                    ? trackParams.cropEnd
                    : processedBuffer.duration;

                // 驗證並修正裁切參數
                if (cropStart < 0) {
                    console.warn(`音訊 ${i}: cropStart < 0，已修正為 0`);
                    cropStart = 0;
                }
                if (cropEnd > processedBuffer.duration) {
                    console.warn(`音訊 ${i}: cropEnd 超出音訊長度，已修正為 ${processedBuffer.duration}`);
                    cropEnd = processedBuffer.duration;
                }
                if (cropStart >= cropEnd) {
                    console.warn(`音訊 ${i}: cropStart >= cropEnd，跳過裁切`);
                    cropStart = 0;
                    cropEnd = processedBuffer.duration;
                }

                if (cropStart > 0 || cropEnd < processedBuffer.duration) {
                    processedBuffer = audioProcessor.cropAudio(processedBuffer, cropStart, cropEnd);
                }

                // 步驟 2：應用時間偏移（offset）
                const offset = trackParams.offset || 0;
                if (offset !== 0) {
                    processedBuffer = this.applyTimeOffset(processedBuffer, offset);
                }

                // 步驟 3：應用時間伸縮（stretchFactor）
                let stretchFactor = trackParams.stretchFactor || 1.0;

                // 驗證並修正伸縮係數（範圍 0.25x ~ 4.0x）
                if (stretchFactor < 0.25 || stretchFactor > 4.0) {
                    console.warn(`音訊 ${i}: stretchFactor 超出範圍 (${stretchFactor})，已限制在 0.25-4.0`);
                    stretchFactor = Math.max(0.25, Math.min(4.0, stretchFactor));
                }

                if (stretchFactor !== 1.0) {
                    // 使用播放速率變更來實現時間伸縮
                    // 注意：這會同時改變音高
                    // stretchFactor > 1.0: 變慢 -> playbackRate < 1.0
                    // stretchFactor < 1.0: 變快 -> playbackRate > 1.0
                    const playbackRate = 1.0 / stretchFactor;
                    processedBuffer = audioProcessor.changePlaybackRate(processedBuffer, playbackRate);
                }

                processedAudioFiles.push(processedBuffer);
                processedFilenames.push(audioItem.filename);

            } catch (error) {
                console.error(`處理音訊 ${i} 時發生錯誤:`, error);
                showToast(`處理音訊 "${audioItem.filename}" 失敗`, 'error');
                // 錯誤時使用原始 buffer
                processedAudioFiles.push(audioItem.buffer);
                processedFilenames.push(audioItem.filename);
            }
        }

        // 返回多檔案格式（支援 BaseNode 的多檔案預覽系統）
        return {
            audio: processedAudioFiles[0] || null,  // 向下相容單檔案格式
            audioFiles: processedAudioFiles,
            filenames: processedFilenames
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
