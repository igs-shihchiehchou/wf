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
        <div class="control-group">
          <div class="control-row">
            <label class="control-label">
              <input type="checkbox" class="crop-enabled"> 裁切
            </label>
            <div class="crop-controls" style="display: none; flex: 1; align-items: center; gap: var(--spacing-3);">
              <div class="dual-range-slider">
                <input type="range" class="crop-start-slider" min="0" step="0.1" value="0">
                <input type="range" class="crop-end-slider" min="0" step="0.1" value="0">
              </div>
              <span class="control-value crop-time-display">00:00 - 00:00</span>
            </div>
          </div>
        </div>

        <div class="control-group">
          <label class="control-label">音量</label>
          <div class="control-row">
            <input type="range" class="volume-slider" min="0" max="200" value="100" step="1">
            <span class="control-value volume-value">100%</span>
          </div>
        </div>

        <div class="control-group">
          <div class="control-row">
            <label class="control-label">
              <input type="checkbox" class="fadein-enabled"> 淡入
            </label>
            <input type="number" class="fadein-duration" min="0" max="10" step="0.1" value="0.5" style="display: none;">
            <span class="control-value fadein-label" style="display: none;">秒</span>
          </div>
        </div>

        <div class="control-group">
          <div class="control-row">
            <label class="control-label">
              <input type="checkbox" class="fadeout-enabled"> 淡出
            </label>
            <input type="number" class="fadeout-duration" min="0" max="10" step="0.1" value="1.0" style="display: none;">
            <span class="control-value fadeout-label" style="display: none;">秒</span>
          </div>
        </div>

        <div class="control-group">
          <label class="control-label">速度</label>
          <div class="control-row">
            <input type="range" class="speed-slider" min="50" max="200" value="100" step="1">
            <span class="control-value speed-value">1.0x</span>
          </div>
        </div>
      </div>

      <div class="card-footer">
        <button class="btn-primary process-btn">執行處理 →</button>
      </div>
    `;

    return card;
  }

  async initializeWaveSurfer() {
    this.wavesurfer = WaveSurfer.create({
      container: `#waveform-${this.id}`,
      waveColor: 'hsl(56 38% 57% / 0.6)',
      progressColor: 'hsl(56 38% 57%)',
      cursorColor: 'hsl(58 40% 92%)',
      height: 120,
      barWidth: 2,
      barGap: 1,
      responsive: true,
      normalize: true
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

    // 裁切啟用
    const cropEnabled = this.element.querySelector('.crop-enabled');
    const cropControls = this.element.querySelector('.crop-controls');
    const cropStartSlider = this.element.querySelector('.crop-start-slider');
    const cropEndSlider = this.element.querySelector('.crop-end-slider');
    const cropTimeDisplay = this.element.querySelector('.crop-time-display');
    const dualRangeSlider = this.element.querySelector('.dual-range-slider');

    // 設定裁切範圍為音訊總長度
    const duration = this.audioBuffer.duration;
    cropStartSlider.max = duration;
    cropEndSlider.max = duration;
    cropEndSlider.value = duration;
    this.settings.crop.end = duration;

    // 更新時間顯示和視覺高亮
    const updateCropDisplay = () => {
      const start = parseFloat(cropStartSlider.value);
      const end = parseFloat(cropEndSlider.value);

      // 更新時間顯示
      cropTimeDisplay.textContent = `${formatTime(start)} - ${formatTime(end)}`;

      // 更新視覺高亮範圍（使用 CSS 變數）
      const startPercent = (start / duration) * 100;
      const endPercent = (end / duration) * 100;
      const rangeWidth = endPercent - startPercent;

      dualRangeSlider.style.setProperty('--range-start', `${startPercent}%`);
      dualRangeSlider.style.setProperty('--range-width', `${rangeWidth}%`);
    };

    // 初始化 CSS 變數
    dualRangeSlider.style.setProperty('--range-start', '0%');
    dualRangeSlider.style.setProperty('--range-width', '100%');
    updateCropDisplay();

    cropEnabled.addEventListener('change', (e) => {
      this.settings.crop.enabled = e.target.checked;
      cropControls.style.display = e.target.checked ? 'flex' : 'none';
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

    // 音量
    const volumeSlider = this.element.querySelector('.volume-slider');
    const volumeValue = this.element.querySelector('.volume-value');
    volumeSlider.addEventListener('input', (e) => {
      const value = e.target.value / 100;
      this.settings.volume = value;
      volumeValue.textContent = `${e.target.value}%`;
    });

    // 淡入
    const fadeinEnabled = this.element.querySelector('.fadein-enabled');
    const fadeinDuration = this.element.querySelector('.fadein-duration');
    const fadeinLabel = this.element.querySelector('.fadein-label');
    fadeinEnabled.addEventListener('change', (e) => {
      this.settings.fadeIn.enabled = e.target.checked;
      fadeinDuration.style.display = e.target.checked ? 'block' : 'none';
      fadeinLabel.style.display = e.target.checked ? 'block' : 'none';
    });
    fadeinDuration.addEventListener('input', (e) => {
      this.settings.fadeIn.duration = parseFloat(e.target.value);
    });

    // 淡出
    const fadeoutEnabled = this.element.querySelector('.fadeout-enabled');
    const fadeoutDuration = this.element.querySelector('.fadeout-duration');
    const fadeoutLabel = this.element.querySelector('.fadeout-label');
    fadeoutEnabled.addEventListener('change', (e) => {
      this.settings.fadeOut.enabled = e.target.checked;
      fadeoutDuration.style.display = e.target.checked ? 'block' : 'none';
      fadeoutLabel.style.display = e.target.checked ? 'block' : 'none';
    });
    fadeoutDuration.addEventListener('input', (e) => {
      this.settings.fadeOut.duration = parseFloat(e.target.value);
    });

    // 速度
    const speedSlider = this.element.querySelector('.speed-slider');
    const speedValue = this.element.querySelector('.speed-value');
    speedSlider.addEventListener('input', (e) => {
      const value = e.target.value / 100;
      this.settings.playbackRate = value;
      speedValue.textContent = `${value.toFixed(1)}x`;
    });

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

  async processAudio() {
    try {
      const processBtn = this.element.querySelector('.process-btn');
      processBtn.disabled = true;
      processBtn.textContent = '處理中...';
      processBtn.classList.add('pulse');

      // 處理音訊
      const processedBuffer = audioProcessor.processAudio(this.audioBuffer, this.settings);

      // 建立新卡片
      const newCard = new AudioCard(processedBuffer, `${this.filename} (已處理)`, this);
      cardsManager.addCard(newCard);

      showToast('處理完成！', 'success');

      processBtn.disabled = false;
      processBtn.textContent = '執行處理 →';
      processBtn.classList.remove('pulse');

      // 滾動到新卡片
      setTimeout(() => {
        scrollToElement(newCard.element);
      }, 100);

    } catch (error) {
      console.error('處理音訊失敗:', error);
      showToast('處理失敗：' + error.message, 'error');

      const processBtn = this.element.querySelector('.process-btn');
      processBtn.disabled = false;
      processBtn.textContent = '執行處理 →';
      processBtn.classList.remove('pulse');
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
