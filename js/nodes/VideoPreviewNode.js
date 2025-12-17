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
        return new Promise((resolve, _reject) => {
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

        // 建立時間軸區域
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'video-preview-timeline';
        timelineContainer.style.cssText = `
            padding: var(--spacing-3);
            background: var(--bg);
            border-radius: 4px;
            margin-bottom: var(--spacing-4);
        `;
        // 使用 renderTimeline() 渲染時間軸內容
        this.timelineContainer = timelineContainer;

        // 建立音軌列表容器
        const tracksContainer = document.createElement('div');
        tracksContainer.className = 'video-preview-tracks';
        tracksContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: var(--bg);
            border-radius: 4px;
            padding: var(--spacing-3);
        `;
        // 儲存參考以便後續更新
        this.tracksContainer = tracksContainer;

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
        this.controlsContainer = controlsContainer;

        // 綁定關閉按鈕事件
        const closeBtn = titleBar.querySelector('.video-preview-close-btn');
        closeBtn.addEventListener('click', () => this.closeEditor());

        // 綁定播放控制列事件
        this.bindPlaybackControlsEvents();

        // 綁定 video 元素事件
        this.bindVideoEvents();

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

        // timeupdate：更新時間顯示
        this.videoElement.addEventListener('timeupdate', () => {
            this.updateTimeDisplay();
        });

        // loadedmetadata：影片載入完成後更新總時長並渲染時間軸
        this.videoElement.addEventListener('loadedmetadata', () => {
            this.updateTotalTimeDisplay();
            this.renderTimeline();
        });

        // play：更新按鈕為暫停圖示，啟動播放循環
        this.videoElement.addEventListener('play', () => {
            this.updatePlaybackButton(true);
            this.startPlaybackLoop();
        });

        // pause：更新按鈕為播放圖示，停止播放循環
        this.videoElement.addEventListener('pause', () => {
            this.updatePlaybackButton(false);
            this.stopPlaybackLoop();
        });

        // ended：處理播放結束
        this.videoElement.addEventListener('ended', () => {
            this.updatePlaybackButton(false);
            this.stopPlaybackLoop();
            // TODO: Task 4.2 - 處理音訊繼續播放
        });

        // seeking：跳轉時更新游標
        this.videoElement.addEventListener('seeking', () => {
            this.updatePlaybackCursor();
        });

        // seeked：跳轉完成時更新游標
        this.videoElement.addEventListener('seeked', () => {
            this.updatePlaybackCursor();
        });
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
     * 計算時間軸總長度（影片長度或最長音訊）
     */
    calculateTimelineDuration() {
        let duration = this.videoElement ? this.videoElement.duration : 0;

        // 防止 NaN（影片 metadata 尚未載入時）
        if (isNaN(duration)) duration = 0;

        // 如果有音訊輸入，計算最長音訊結束時間
        // TODO: Task 3.1 - 當有音訊輸入時，計算 max(視訊長度, 音訊偏移 + 音訊長度)
        // 目前僅使用影片長度

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

        // 建立時間刻度容器
        const scaleContainer = document.createElement('div');
        scaleContainer.className = 'timeline-scale';
        scaleContainer.style.cssText = `
            position: relative;
            height: 30px;
            margin-bottom: var(--spacing-2);
            user-select: none;
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

        // 建立可點擊的時間軸軌道
        const track = document.createElement('div');
        track.className = 'timeline-track';
        track.style.cssText = `
            position: relative;
            height: 40px;
            background: var(--bg-dark);
            border-radius: 4px;
            cursor: pointer;
            margin-top: var(--spacing-2);
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

        // 儲存參考
        this.timelineTrack = track;
        this.playbackCursor = cursor;

        // 組裝時間軸
        this.timelineContainer.appendChild(scaleContainer);
        this.timelineContainer.appendChild(track);

        // 綁定時間軸事件
        this.bindTimelineEvents();
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
     * 確保 tracks 參數陣列長度與音訊數量一致
     */
    ensureTracksArray(count) {
        if (!this.data.tracks) {
            this.data.tracks = [];
        }

        // 補齊新增的音軌（使用預設參數）
        while (this.data.tracks.length < count) {
            this.data.tracks.push({
                offset: 0,       // 時間偏移（秒）
                cropStart: 0,    // 裁切起始點（秒）
                cropEnd: null    // 裁切結束點（null 表示音訊結尾）
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

        // 取得連接的節點
        // 取得連接的節點
        const sourceNode = audioPort.connectedTo?.node;

        if (!sourceNode) {
            return [];
        }

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
     */
    renderTracks() {
        if (!this.tracksContainer) return;

        // 取得輸入音訊列表
        const audioData = this.getInputAudioData();

        // 確保 tracks 參數陣列長度一致
        this.ensureTracksArray(audioData.length);

        // 大量音軌警告
        if (audioData.length > 10) {
            showToast(`音軌數量較多 (${audioData.length})，可能影響效能`, 'warning');
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

        const timelineWidth = this.timelineTrack.offsetWidth;

        // 額外驗證
        if (timelineWidth === 0) {
            console.warn('Timeline width is 0, deferring track rendering');
            return;
        }

        // 為每個音訊建立音軌 DOM
        audioData.forEach((audio, index) => {
            const trackParams = this.data.tracks[index];
            const buffer = audio.buffer;

            // 建立音軌容器
            const trackDiv = document.createElement('div');
            trackDiv.className = 'video-preview-track';
            trackDiv.style.cssText = `
                margin-bottom: var(--spacing-3);
                padding: var(--spacing-3);
                background: var(--bg-dark);
                border-radius: 4px;
            `;

            // 音軌標題（顯示檔案名）
            const trackTitle = document.createElement('div');
            trackTitle.className = 'track-title';
            trackTitle.style.cssText = `
                color: var(--text);
                font-size: var(--text-sm);
                font-weight: 500;
                margin-bottom: var(--spacing-2);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            trackTitle.innerHTML = `
                <span>${this.escapeHtml(audio.filename)}</span>
                <span style="color: var(--text-muted); font-size: var(--text-xs); font-family: monospace;">
                    ${buffer.duration.toFixed(2)}s | ${buffer.sampleRate}Hz
                </span>
            `;

            // 時間軸容器（與統一時間軸對齊）
            const trackTimelineContainer = document.createElement('div');
            trackTimelineContainer.className = 'track-timeline';
            trackTimelineContainer.style.cssText = `
                position: relative;
                height: 60px;
                background: var(--bg);
                border-radius: 4px;
                overflow: hidden;
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
                opacity: 0.6;
                border-radius: 2px;
                cursor: move;
            `;

            // 計算音訊區塊的位置和寬度
            const pixelsPerSecond = timelineWidth / (timelineDuration || 1);
            const offsetPixels = trackParams.offset * pixelsPerSecond;
            const audioDuration = buffer.duration;
            const cropEnd = trackParams.cropEnd !== null ? trackParams.cropEnd : audioDuration;
            const visibleDuration = cropEnd - trackParams.cropStart;
            const widthPixels = visibleDuration * pixelsPerSecond;

            audioBlockContainer.style.left = `${offsetPixels}px`;
            audioBlockContainer.style.width = `${widthPixels}px`;

            // 設定 ID 以便 WaveSurfer 綁定
            const waveContainerId = `video-preview-wave-${this.id}-${index}`;
            audioBlockContainer.id = waveContainerId;
            // 清空內容（移除占位符）
            audioBlockContainer.innerHTML = '';

            // 綁定拖曳事件 (Task 3.3)
            this.bindTrackDragEvents(audioBlockContainer, index, pixelsPerSecond);

            // 組裝音軌 DOM
            trackTimelineContainer.appendChild(audioBlockContainer);
            trackDiv.appendChild(trackTitle);
            trackDiv.appendChild(trackTimelineContainer);
            this.tracksContainer.appendChild(trackDiv);
        });

        // 延遲初始化 WaveSurfer 以確保 DOM 已渲染
        requestAnimationFrame(() => {
            audioData.forEach((audio, index) => {
                this.initTrackWaveSurfer(index, audio.buffer);
            });
        });
    }

    /**
     * 初始化單一音軌的 WaveSurfer
     */
    initTrackWaveSurfer(index, buffer) {
        if (!buffer) return;

        const containerId = `#video-preview-wave-${this.id}-${index}`;
        const container = this.tracksContainer.querySelector(containerId);

        if (!container) return;

        try {
            // 銷毀舊實例（如果存在）
            if (this.trackWaveSurfers[index]) {
                this.trackWaveSurfers[index].destroy();
                this.trackWaveSurfers[index] = null;
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
                responsive: true,
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
     * 綁定音軌拖曳事件
     */
    bindTrackDragEvents(element, index, pixelsPerSecond) {
        let startX = 0;
        let startLeft = 0;
        let isDragging = false;

        // 建立 tooltip 元素
        let tooltip = document.createElement('div');
        tooltip.className = 'drag-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
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
            // 防止與 WaveSurfer 互動衝突（雖然已設為 interact: false）
            // 且防止觸發裁切邊緣（之後 Task 3.4 會處理邊緣）
            // 這裡簡單判定：點擊位置不在左右邊緣 10px 內才算拖曳移動
            const rect = element.getBoundingClientRect();
            const edgeThreshold = 10;
            const clickX = e.clientX - rect.left;

            // 如果實作了邊緣裁切，這裡要避開邊緣。目前 Task 3.3 先全部視為拖曳。
            // 為了預留 Task 3.4 空間，我們預留判斷邏輯
            if (clickX < edgeThreshold || clickX > rect.width - edgeThreshold) {
                return; // 邊緣操作交給 Task 3.4
            }

            e.preventDefault();
            e.stopPropagation();

            isDragging = true;
            startX = e.clientX;
            startLeft = parseFloat(element.style.left) || 0;

            element.style.cursor = 'grabbing';
            element.classList.add('dragging');

            // 顯示 tooltip
            tooltip.style.display = 'block';
            tooltip.textContent = `Offset: ${this.tracks[index].offset.toFixed(3)}s`;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const newLeft = startLeft + dx;

            // 更新視覺位置
            element.style.left = `${newLeft}px`;

            // 計算並更新 offset
            const newOffset = newLeft / pixelsPerSecond;
            this.tracks[index].offset = newOffset;

            // 更新 tooltip
            tooltip.textContent = `Offset: ${newOffset.toFixed(3)}s`;
        };

        const onMouseUp = () => {
            if (!isDragging) return;

            isDragging = false;
            element.style.cursor = 'move'; // 回復為 move (hover 狀態)
            element.classList.remove('dragging');
            tooltip.style.display = 'none';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 觸發資料變更以儲存狀態
            this.setData('tracks', this.tracks);
        };

        // 簡單的 hover cursor 處理
        element.addEventListener('mousemove', (e) => {
            const rect = element.getBoundingClientRect();
            const edgeThreshold = 10;
            const hoverX = e.clientX - rect.left;

            if (hoverX < edgeThreshold || hoverX > rect.width - edgeThreshold) {
                element.style.cursor = 'col-resize'; // 邊緣顯示調整大小游標
            } else {
                element.style.cursor = 'move'; // 中間顯示移動游標
            }
        });

        element.addEventListener('mousedown', onMouseDown);
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

        // 添加 ESC 鍵關閉功能
        this.handleKeyDown = (e) => {
            if (e.key === 'Escape') this.closeEditor();
        };
        document.addEventListener('keydown', this.handleKeyDown);

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
        this.timelineTrack = null;
        this.tracksContainer = null;

        // 解鎖節點圖
        const graphCanvas = document.querySelector('.graph-canvas');
        if (graphCanvas) {
            graphCanvas.classList.remove('video-preview-locked');
            graphCanvas.style.pointerEvents = '';
            graphCanvas.style.opacity = '';
        }

        // 移除 ESC 鍵監聽器
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown);
            this.handleKeyDown = null;
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
