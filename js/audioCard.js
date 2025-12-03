/**
 * 音訊卡片管理
 */

class AudioCard {
  constructor(audioBuffer, filename, parentCard = null) {
    this.id = generateId();
    this.audioBuffer = audioBuffer;
    this.filename = filename;
    this.parentCard = parentCard;
    this.wavesurfer = null;
    this.isPlaying = false;

    // 預設設定
    this.settings = {
      crop: {
        enabled: false,
        start: 0,
        end: audioBuffer.duration
      },
      volume: 1.0,
      fadeIn: {
        enabled: false,
        duration: 0.5
      },
      fadeOut: {
        enabled: false,
        duration: 1.0
      },
      playbackRate: 1.0
    };

    this.element = this.createCardElement();
    this.attachEventListeners();
    // WaveSurfer 將在卡片加入 DOM 後初始化
  }

  createCardElement() {
    const card = document.createElement('div');
    card.className = 'audio-card';
    card.id = this.id;
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          🎵 ${this.filename}
        </div>
        <div class="card-actions">
          <button class="btn-secondary download-btn" aria-label="下載">下載</button>
          <button class="btn-danger delete-btn" aria-label="刪除">×</button>
        </div>
      </div>

      <div class="playback-controls">
        <button class="btn-icon play-btn" aria-label="播放/暫停">▶</button>
        <div class="time-display">
          <span class="current-time">00:00</span> / <span class="total-time">00:00</span>
        </div>
      </div>

      <div class="waveform-container">
        <div id="waveform-${this.id}"></div>
      </div>

      <div class="edit-controls">
        <!-- 基本調整區塊 -->
        <div class="control-section">
          <div class="section-header">
            <span class="section-icon">🎚️</span>
            <span class="section-title">基本調整</span>
          </div>

          <div class="control-group">
            <div class="control-row">
              <label class="control-label">音量</label>
              <input type="range" class="volume-slider" min="0" max="200" value="100" step="1">
              <span class="control-value volume-value">100%</span>
              <button class="btn-reset" data-reset="volume" title="重置">↺</button>
            </div>
          </div>

          <div class="control-group">
            <div class="control-row">
              <label class="control-label">速度</label>
              <input type="range" class="speed-slider" min="50" max="200" value="100" step="1">
              <span class="control-value speed-value">1.0x</span>
              <button class="btn-reset" data-reset="speed" title="重置">↺</button>
            </div>
          </div>
        </div>

        <!-- 裁切區塊 -->
        <div class="control-section">
          <div class="section-header">
            <label class="section-title-checkbox">
              <input type="checkbox" class="crop-enabled">
              <span class="section-icon">✂️</span>
              <span class="section-title">裁切</span>
            </label>
          </div>

          <div class="control-group crop-controls" style="display: none;">
            <div class="control-row">
              <div class="dual-range-slider">
                <input type="range" class="crop-start-slider" min="0" step="0.01" value="0">
                <input type="range" class="crop-end-slider" min="0" step="0.01" value="0">
              </div>
              <span class="control-value crop-time-display" title="點擊可精確輸入">00:00 - 00:00</span>
              <button class="btn-reset" data-reset="crop" title="重置範圍">↺</button>
            </div>
            <div class="crop-fine-tune">
              <div class="fine-tune-group">
                <label>起點</label>
                <button class="btn-fine" data-adjust="start" data-amount="-1">-1s</button>
                <button class="btn-fine" data-adjust="start" data-amount="-0.1">-0.1s</button>
                <input type="number" class="crop-start-input" step="0.01" min="0">
                <button class="btn-fine" data-adjust="start" data-amount="0.1">+0.1s</button>
                <button class="btn-fine" data-adjust="start" data-amount="1">+1s</button>
              </div>
              <div class="fine-tune-group">
                <label>終點</label>
                <button class="btn-fine" data-adjust="end" data-amount="-1">-1s</button>
                <button class="btn-fine" data-adjust="end" data-amount="-0.1">-0.1s</button>
                <input type="number" class="crop-end-input" step="0.01" min="0">
                <button class="btn-fine" data-adjust="end" data-amount="0.1">+0.1s</button>
                <button class="btn-fine" data-adjust="end" data-amount="1">+1s</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 音效處理區塊 -->
        <div class="control-section">
          <div class="section-header">
            <span class="section-icon">🌊</span>
            <span class="section-title">音效處理</span>
          </div>

          <div class="control-group">
            <div class="control-row fade-control-header">
              <label class="control-label fade-label">
                <input type="checkbox" class="fadein-enabled">
                <span>淡入</span>
              </label>
              <label class="control-label fade-label">
                <input type="checkbox" class="fadeout-enabled">
                <span>淡出</span>
              </label>
            </div>
            <div class="control-row">
              <div class="dual-fade-slider">
                <input type="range" class="fadein-slider" min="0" max="10" step="0.1" value="0.5">
                <input type="range" class="fadeout-slider" min="0" max="10" step="0.1" value="1.0">
              </div>
            </div>
            <div class="control-row fade-time-display">
              <span class="control-value fadein-value">淡入 0.5s</span>
              <span class="control-value fadeout-value">淡出 1.0s</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card-footer">
        <button class="btn-secondary preview-btn">👁 預覽</button>
        <button class="btn-primary process-btn">執行處理 →</button>
      </div>
    `;

    return card;
  }

  async initializeWaveSurfer() {
    // 創建 Region 插件
    this.regionsPlugin = WaveSurfer.Regions.create();

    this.wavesurfer = WaveSurfer.create({
      container: `#waveform-${this.id}`,
      waveColor: 'hsl(56 38% 57% / 0.6)',
      progressColor: 'hsl(56 38% 57%)',
      cursorColor: 'hsl(58 40% 92%)',
      height: 120,
      barWidth: 2,
      barGap: 1,
      responsive: true,
      normalize: true,
      plugins: [this.regionsPlugin]
    });

    // 將 AudioBuffer 轉換為 Blob 並載入
    const blob = new Blob([audioBufferToWav(this.audioBuffer)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    try {
      await this.wavesurfer.load(url);

      // 載入完成後清理 URL
      URL.revokeObjectURL(url);

      // 更新總時間
      const totalTimeElement = this.element.querySelector('.total-time');
      totalTimeElement.textContent = formatTime(this.audioBuffer.duration);

      // 創建裁切區域（初始為整個音訊）
      this.cropRegion = this.regionsPlugin.addRegion({
        start: 0,
        end: this.audioBuffer.duration,
        color: 'rgba(242, 214, 137, 0.2)',
        drag: false,
        resize: false
      });
    } catch (error) {
      console.error('WaveSurfer 載入失敗:', error);
      URL.revokeObjectURL(url);
      throw error;
    }

    // 播放進度更新
    this.wavesurfer.on('timeupdate', (currentTime) => {
      const currentTimeElement = this.element.querySelector('.current-time');
      currentTimeElement.textContent = formatTime(currentTime);
    });

    // 播放完成
    this.wavesurfer.on('finish', () => {
      this.isPlaying = false;
      this.updatePlayButton();
    });

    // 播放/暫停事件
    this.wavesurfer.on('play', () => {
      this.isPlaying = true;
      this.updatePlayButton();
    });

    this.wavesurfer.on('pause', () => {
      this.isPlaying = false;
      this.updatePlayButton();
    });
  }

  attachEventListeners() {
    // 播放/暫停
    const playBtn = this.element.querySelector('.play-btn');
    playBtn.addEventListener('click', () => this.togglePlay());

    // 下載
    const downloadBtn = this.element.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => this.downloadAudio());

    // 刪除
    const deleteBtn = this.element.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => this.delete());

    // 裁切功能
    const cropEnabled = this.element.querySelector('.crop-enabled');
    const cropControls = this.element.querySelector('.crop-controls');
    const cropStartSlider = this.element.querySelector('.crop-start-slider');
    const cropEndSlider = this.element.querySelector('.crop-end-slider');
    const cropTimeDisplay = this.element.querySelector('.crop-time-display');
    const dualRangeSlider = this.element.querySelector('.dual-range-slider');

    // 精確輸入控制
    const cropStartInput = this.element.querySelector('.crop-start-input');
    const cropEndInput = this.element.querySelector('.crop-end-input');
    const fineTuneButtons = this.element.querySelectorAll('.btn-fine');

    // 設定裁切範圍為音訊總長度
    const duration = this.audioBuffer.duration;
    cropStartSlider.max = duration;
    cropEndSlider.max = duration;
    cropEndSlider.value = duration;
    cropStartInput.max = duration;
    cropEndInput.max = duration;
    cropStartInput.value = 0;
    cropEndInput.value = duration.toFixed(2);
    this.settings.crop.end = duration;

    // 更新時間顯示和視覺高亮
    const updateCropDisplay = () => {
      const start = parseFloat(cropStartSlider.value);
      const end = parseFloat(cropEndSlider.value);

      // 更新時間顯示
      cropTimeDisplay.textContent = `${formatTime(start)} - ${formatTime(end)}`;

      // 更新數字輸入框
      cropStartInput.value = start.toFixed(2);
      cropEndInput.value = end.toFixed(2);

      // 更新視覺高亮範圍（使用 CSS 變數）
      const startPercent = (start / duration) * 100;
      const endPercent = (end / duration) * 100;
      const rangeWidth = endPercent - startPercent;

      dualRangeSlider.style.setProperty('--range-start', `${startPercent}%`);
      dualRangeSlider.style.setProperty('--range-width', `${rangeWidth}%`);

      // 更新波形圖上的 region
      if (this.cropRegion) {
        this.cropRegion.setOptions({
          start: start,
          end: end
        });
      }
    };

    // 初始化 CSS 變數
    dualRangeSlider.style.setProperty('--range-start', '0%');
    dualRangeSlider.style.setProperty('--range-width', '100%');
    updateCropDisplay();

    cropEnabled.addEventListener('change', (e) => {
      this.settings.crop.enabled = e.target.checked;
      cropControls.style.display = e.target.checked ? 'block' : 'none';

      // 控制 region 的顯示/隱藏
      if (this.cropRegion) {
        if (e.target.checked) {
          this.cropRegion.setOptions({ color: 'rgba(242, 214, 137, 0.3)' });
        } else {
          this.cropRegion.setOptions({ color: 'rgba(242, 214, 137, 0.05)' });
        }
      }
    });

    // 開始時間滑桿
    cropStartSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      const endValue = parseFloat(cropEndSlider.value);

      // 確保開始時間不超過結束時間
      if (value <= endValue) {
        this.settings.crop.start = value;
        updateCropDisplay();
      } else {
        e.target.value = endValue;
      }
    });

    // 結束時間滑桿
    cropEndSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      const startValue = parseFloat(cropStartSlider.value);

      // 確保結束時間不小於開始時間
      if (value >= startValue) {
        this.settings.crop.end = value;
        updateCropDisplay();
      } else {
        e.target.value = startValue;
      }
    });

    // 精確輸入框（起點）
    cropStartInput.addEventListener('change', (e) => {
      let value = parseFloat(e.target.value);
      const endValue = parseFloat(cropEndSlider.value);

      // 驗證範圍
      if (value < 0) value = 0;
      if (value > duration) value = duration;
      if (value > endValue) value = endValue;

      cropStartSlider.value = value;
      this.settings.crop.start = value;
      updateCropDisplay();
    });

    // 精確輸入框（終點）
    cropEndInput.addEventListener('change', (e) => {
      let value = parseFloat(e.target.value);
      const startValue = parseFloat(cropStartSlider.value);

      // 驗證範圍
      if (value < 0) value = 0;
      if (value > duration) value = duration;
      if (value < startValue) value = startValue;

      cropEndSlider.value = value;
      this.settings.crop.end = value;
      updateCropDisplay();
    });

    // 微調按鈕
    fineTuneButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const adjustType = btn.dataset.adjust;
        const amount = parseFloat(btn.dataset.amount);

        if (adjustType === 'start') {
          let newValue = parseFloat(cropStartSlider.value) + amount;
          const endValue = parseFloat(cropEndSlider.value);

          // 驗證範圍
          if (newValue < 0) newValue = 0;
          if (newValue > endValue) newValue = endValue;

          cropStartSlider.value = newValue;
          this.settings.crop.start = newValue;
        } else if (adjustType === 'end') {
          let newValue = parseFloat(cropEndSlider.value) + amount;
          const startValue = parseFloat(cropStartSlider.value);

          // 驗證範圍
          if (newValue > duration) newValue = duration;
          if (newValue < startValue) newValue = startValue;

          cropEndSlider.value = newValue;
          this.settings.crop.end = newValue;
        }

        updateCropDisplay();
      });
    });

    // 音量
    const volumeSlider = this.element.querySelector('.volume-slider');
    const volumeValue = this.element.querySelector('.volume-value');
    volumeSlider.addEventListener('input', (e) => {
      const value = e.target.value / 100;
      this.settings.volume = value;
      volumeValue.textContent = `${e.target.value}%`;
    });

    // 速度
    const speedSlider = this.element.querySelector('.speed-slider');
    const speedValue = this.element.querySelector('.speed-value');
    speedSlider.addEventListener('input', (e) => {
      const value = e.target.value / 100;
      this.settings.playbackRate = value;
      speedValue.textContent = `${value.toFixed(1)}x`;
    });

    // 淡入（改用滑桿）
    const fadeinEnabled = this.element.querySelector('.fadein-enabled');
    const fadeinSlider = this.element.querySelector('.fadein-slider');
    const fadeinValue = this.element.querySelector('.fadein-value');

    fadeinEnabled.addEventListener('change', (e) => {
      this.settings.fadeIn.enabled = e.target.checked;
      fadeinSlider.disabled = !e.target.checked;
      fadeinSlider.style.opacity = e.target.checked ? '1' : '0.5';
    });

    fadeinSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.settings.fadeIn.duration = value;
      fadeinValue.textContent = `${value.toFixed(1)}s`;
    });

    // 淡出（改用滑桿）
    const fadeoutEnabled = this.element.querySelector('.fadeout-enabled');
    const fadeoutSlider = this.element.querySelector('.fadeout-slider');
    const fadeoutValue = this.element.querySelector('.fadeout-value');

    fadeoutEnabled.addEventListener('change', (e) => {
      this.settings.fadeOut.enabled = e.target.checked;
      fadeoutSlider.disabled = !e.target.checked;
      fadeoutSlider.style.opacity = e.target.checked ? '1' : '0.5';
    });

    fadeoutSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.settings.fadeOut.duration = value;
      fadeoutValue.textContent = `${value.toFixed(1)}s`;
    });

    // 重置按鈕
    const resetButtons = this.element.querySelectorAll('.btn-reset');
    resetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const resetType = btn.dataset.reset;

        switch(resetType) {
          case 'volume':
            volumeSlider.value = 100;
            this.settings.volume = 1.0;
            volumeValue.textContent = '100%';
            break;
          case 'speed':
            speedSlider.value = 100;
            this.settings.playbackRate = 1.0;
            speedValue.textContent = '1.0x';
            break;
          case 'crop':
            cropStartSlider.value = 0;
            cropEndSlider.value = duration;
            this.settings.crop.start = 0;
            this.settings.crop.end = duration;
            updateCropDisplay();
            break;
        }
      });
    });

    // 預覽按鈕
    const previewBtn = this.element.querySelector('.preview-btn');
    previewBtn.addEventListener('click', () => this.previewAudio());

    // 執行處理
    const processBtn = this.element.querySelector('.process-btn');
    processBtn.addEventListener('click', () => this.processAudio());
  }

  togglePlay() {
    this.wavesurfer.playPause();
  }

  updatePlayButton() {
    const playBtn = this.element.querySelector('.play-btn');
    playBtn.textContent = this.isPlaying ? '⏸' : '▶';
  }

  async previewAudio() {
    try {
      const previewBtn = this.element.querySelector('.preview-btn');
      const originalText = previewBtn.textContent;
      previewBtn.disabled = true;
      previewBtn.textContent = '⏳ 處理中...';

      // 處理音訊（使用當前設定）
      const processedBuffer = audioProcessor.processAudio(this.audioBuffer, this.settings);

      // 停止當前播放
      if (this.isPlaying) {
        this.wavesurfer.pause();
      }

      // 播放處理後的音訊
      previewBtn.textContent = '▶ 播放中...';
      const source = audioProcessor.playAudio(processedBuffer);

      showToast('預覽播放中', 'info');

      // 播放完成後恢復按鈕
      source.onended = () => {
        previewBtn.disabled = false;
        previewBtn.textContent = originalText;
      };

    } catch (error) {
      console.error('預覽音訊失敗:', error);
      showToast('預覽失敗：' + error.message, 'error');

      const previewBtn = this.element.querySelector('.preview-btn');
      previewBtn.disabled = false;
      previewBtn.textContent = '👁 預覽';
    }
  }

  async processAudio() {
    try {
      const processBtn = this.element.querySelector('.process-btn');
      const originalHTML = processBtn.innerHTML;
      processBtn.disabled = true;
      processBtn.innerHTML = '<span class="spinner"></span>處理中...';
      this.element.classList.add('processing');

      // 處理音訊
      const processedBuffer = audioProcessor.processAudio(this.audioBuffer, this.settings);

      // 建立新卡片
      const newCard = new AudioCard(processedBuffer, `${this.filename} (已處理)`, this);
      cardsManager.addCard(newCard);

      showToast('處理完成！', 'success');

      processBtn.disabled = false;
      processBtn.innerHTML = originalHTML;
      this.element.classList.remove('processing');

      // 滾動到新卡片
      setTimeout(() => {
        scrollToElement(newCard.element);
      }, 100);

    } catch (error) {
      console.error('處理音訊失敗:', error);
      showToast('處理失敗：' + error.message, 'error');

      const processBtn = this.element.querySelector('.process-btn');
      processBtn.disabled = false;
      processBtn.innerHTML = '執行處理 →';
      this.element.classList.remove('processing');
    }
  }

  downloadAudio() {
    const baseFilename = this.filename.replace(/\.[^/.]+$/, '');
    downloadAudioBuffer(this.audioBuffer, `${baseFilename}.wav`);
    showToast('下載開始', 'success');
  }

  delete() {
    if (confirm('確定要刪除此卡片？')) {
      if (this.wavesurfer) {
        this.wavesurfer.destroy();
      }
      this.element.remove();
      cardsManager.removeCard(this.id);
      showToast('已刪除', 'info');
    }
  }

  getElement() {
    return this.element;
  }

  // 在卡片加入 DOM 後呼叫此方法初始化 WaveSurfer
  initialize() {
    this.initializeWaveSurfer();
  }
}
