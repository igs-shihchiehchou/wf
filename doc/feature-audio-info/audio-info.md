# 音訊分析功能設計文件

## 功能概述

當使用者上傳音訊檔案到 `AudioInputNode` 時，系統將自動在背景執行音訊分析，並顯示進度條。分析完成後，在節點中顯示分析結果，幫助遊戲音效製作者快速了解音訊的特性。

### 設計原則（針對遊戲音效製作）
- **簡潔實用**：只顯示對遊戲音效製作有用的資訊
- **視覺化優先**：用圖表取代複雜數據
- **自動化分析**：無需使用者手動觸發
- **非阻塞式處理**：異步處理避免 UI 凍結

### 分析項目
1. **基本資訊** - 了解檔案規格（採樣率、時長、聲道）
2. **頻譜分布** - 查看頻率成分（低/中/高頻比例）
3. **音高分析** ⭐ - 顯示音高隨時間變化（頻譜圖或音高曲線）

> **為何移除音量與靜音分析？**
> 波形圖已能直觀顯示音量變化和靜音區間，無需重複顯示。

## 技術架構

### 核心組件

```
AudioInputNode (修改)
    ↓
AudioAnalyzer (新建)
    ├─ ProgressTracker (進度追蹤)
    └─ Analysis Modules (分析模組)
        ├─ BasicInfoAnalyzer (基本資訊)
        ├─ FrequencyAnalyzer (頻譜分析)
        └─ PitchAnalyzer (音高分析) ⭐
```

### 檔案結構

```
js/
├─ audioAnalyzer.js        # 新增：音訊分析引擎
├─ nodes/
│   └─ AudioInputNode.js   # 修改：整合分析功能
└─ components/
    └─ ProgressBar.js      # 新增：進度條組件

css/
└─ analysis.css            # 新增：分析結果樣式
```

## 實現細節

### 1. AudioAnalyzer 類別

```javascript
class AudioAnalyzer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.analysisCache = new Map(); // 快取分析結果
  }

  /**
   * 分析音訊檔案
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Function} onProgress - 進度回調 (0-100)
   * @returns {Promise<AnalysisResult>}
   */
  async analyze(audioBuffer, onProgress) {
    const result = {
      basic: {},
      frequency: {},
      pitch: {}
    };

    // 步驟 1: 基本資訊 (20%)
    onProgress(0, '分析基本資訊...');
    result.basic = this.analyzeBasicInfo(audioBuffer);
    onProgress(20, '基本資訊完成');

    // 步驟 2: 頻譜分析 (40%)
    onProgress(20, '分析頻譜分布...');
    result.frequency = await this.analyzeFrequency(audioBuffer, (p) => {
      onProgress(20 + p * 0.4, '分析頻譜...');
    });
    onProgress(60, '頻譜分析完成');

    // 步驟 3: 音高分析 (40%)
    onProgress(60, '分析音高變化...');
    result.pitch = await this.analyzePitch(audioBuffer, (p) => {
      onProgress(60 + p * 0.4, '分析音高...');
    });
    onProgress(100, '分析完成');

    return result;
  }

  analyzeBasicInfo(audioBuffer) { /* 實作 */ }
  async analyzeFrequency(audioBuffer, onProgress) { /* 實作 */ }
  async analyzePitch(audioBuffer, onProgress) { /* 實作 - 新增 */ }
}
```

### 2. 進度條組件

建立可重用的進度條組件：

```javascript
class ProgressBar {
  constructor(container) {
    this.container = container;
    this.element = this.createProgressBar();
    this.container.appendChild(this.element);
  }

  createProgressBar() {
    const wrapper = document.createElement('div');
    wrapper.className = 'analysis-progress';
    wrapper.innerHTML = `
      <div class="progress-header">
        <span class="progress-icon">🔍</span>
        <span class="progress-label">分析中...</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: 0%"></div>
      </div>
      <div class="progress-text">0%</div>
    `;
    return wrapper;
  }

  update(progress, message) {
    const fill = this.element.querySelector('.progress-bar-fill');
    const text = this.element.querySelector('.progress-text');
    const label = this.element.querySelector('.progress-label');

    fill.style.width = `${progress}%`;
    text.textContent = `${Math.round(progress)}%`;
    if (message) label.textContent = message;
  }

  remove() {
    this.element.remove();
  }
}
```

### 3. AudioInputNode 整合

在 `AudioInputNode.js` 的 `loadFile()` 方法中整合分析：

```javascript
async loadFile(file) {
  try {
    this.setProcessing(true);

    // 載入音訊
    this.audioBuffer = await audioProcessor.loadAudioFromFile(file);
    this.filename = file.name;

    // 更新 UI
    this.updateContent();

    // === 新增：音訊分析 ===
    await this.analyzeAudio();

    // 延遲初始化波形
    await new Promise(resolve => setTimeout(resolve, 50));
    await this.initWaveSurfer();

    this.setProcessing(false);

    if (this.onDataChange) {
      this.onDataChange('audioBuffer', this.audioBuffer);
    }

    showToast(`已載入: ${this.filename}`, 'success');

  } catch (error) {
    this.setProcessing(false);
    showToast(`載入失敗: ${error.message}`, 'error');
    console.error('載入音訊失敗:', error);
  }
}

async analyzeAudio() {
  // 在節點內容區域顯示進度條
  const contentEl = this.element.querySelector('.node-content');
  const progressBar = new ProgressBar(contentEl);

  try {
    // 執行分析
    this.analysisResult = await audioAnalyzer.analyze(
      this.audioBuffer,
      (progress, message) => {
        progressBar.update(progress, message);
      }
    );

    // 移除進度條
    progressBar.remove();

    // 顯示分析結果
    this.showAnalysisResult();

  } catch (error) {
    progressBar.remove();
    console.error('音訊分析失敗:', error);
    showToast('分析失敗，但音訊已載入', 'warning');
  }
}
```

## 分析指標

### 1. 基本資訊 (BasicInfo)

```javascript
{
  duration: 2.45,             // 時長（秒）
  durationFormatted: "2.45s", // 格式化時長
  sampleRate: 44100,          // 採樣率 (Hz)
  sampleRateFormatted: "44.1 kHz", // 格式化採樣率
  numberOfChannels: 2,        // 1=單聲道, 2=立體聲
  channelMode: "立體聲",      // 聲道模式（中文）
  length: 108045              // 樣本數
}
```

### 2. 頻譜分析 (Frequency)

```javascript
{
  spectrum: {
    low: 0.35,                // 低頻能量 (20-250 Hz) - 比例 0-1
    mid: 0.45,                // 中頻能量 (250-4000 Hz)
    high: 0.20                // 高頻能量 (4000-20000 Hz)
  },
  dominantFrequency: 440.0,   // 主要頻率 (Hz)
  spectralCentroid: 2500.0    // 頻譜重心 (Hz) - 音色指標
}
```

**頻譜分布解讀（遊戲音效）：**
- **低頻主導** (>40%)：爆炸、引擎、重擊音效
- **中頻主導** (>50%)：人聲、腳步聲、環境音
- **高頻主導** (>40%)：金屬碰撞、UI 音效、鈴聲

### 3. 音高分析 (Pitch) ⭐

```javascript
{
  // 方案 A: 音高曲線（時間序列）
  pitchCurve: [
    { time: 0.0, frequency: 440.0, confidence: 0.95 },   // A4
    { time: 0.1, frequency: 523.25, confidence: 0.92 },  // C5
    { time: 0.2, frequency: 659.25, confidence: 0.88 },  // E5
    // ... 每 100ms 一個數據點
  ],

  // 方案 B: 頻譜圖資料（熱力圖）
  spectrogram: {
    width: 100,              // 時間軸分段數
    height: 256,             // 頻率軸分段數 (FFT bins)
    data: [                  // 二維陣列 [時間][頻率] → 強度 (0-255)
      [120, 45, 78, ...],    // 時間 0 的頻率分布
      [115, 50, 82, ...],    // 時間 1 的頻率分布
      // ...
    ],
    timeStep: 0.02,          // 每個時間段的長度（秒）
    frequencyRange: [20, 20000] // 頻率範圍 (Hz)
  },

  // 統計資訊
  averagePitch: 523.25,      // 平均音高 (Hz)
  pitchRange: {              // 音高範圍
    min: 392.0,              // 最低頻率 (G4)
    max: 783.99              // 最高頻率 (G5)
  },
  isPitched: true            // 是否有明確音高（vs 噪音類音效）
}
```

**音高分析用途（遊戲音效）：**
- **音階匹配**：確保音效符合遊戲音樂的音階
- **音高一致性**：同類音效保持相似音高特徵
- **頻譜圖視覺化**：快速識別音效類型（純音、噪音、混合）
- **調音參考**：使用 Pitch 節點時的參考依據

## UI 設計

### 分析結果顯示

在 AudioInputNode 載入音訊後，在波形下方顯示可摺疊的分析結果面板：

```
┌─────────────────────────────────────┐
│ 📁 音訊輸入                          │
├─────────────────────────────────────┤
│ 📄 explosion.wav                    │
│ [波形圖 - WaveSurfer]                │
│ ▶ 00:00 / 2.45                      │
├─────────────────────────────────────┤
│ 📊 音訊分析 [收合▲]                  │  ← 新增區域（預設展開）
├─────────────────────────────────────┤
│ ⚙️ 基本資訊                          │
│   時長: 2.45s | 44.1 kHz | 立體聲   │
├─────────────────────────────────────┤
│ 🎵 頻譜分布                          │
│   低頻 ████████░░ 35%               │
│   中頻 █████████░ 45%               │
│   高頻 ████░░░░░░ 20%               │
│   主頻: 180 Hz (爆炸音效特徵)        │
├─────────────────────────────────────┤
│ 🎼 音高分析 [查看詳細▼]              │  ← 預設折疊
│   平均音高: 180 Hz (F#3)            │
│   音高範圍: 120-450 Hz              │
│   類型: 噪音類音效                   │
└─────────────────────────────────────┘

展開音高分析後：
┌─────────────────────────────────────┐
│ 🎼 音高分析 [隱藏▲]                  │
├─────────────────────────────────────┤
│   [頻譜圖熱力圖]                     │
│   ▲                                  │
│20k┤ ░░░░░░░░░░                      │
│10k┤ ░▒▒░░░░░░░                      │
│ 5k┤ ▒▒▓▓▒▒░░░░                      │
│ 2k┤ ▓▓██▓▓▒░░░                      │
│ 1k┤ ███████▓▒░                      │
│500┤ ████████▓▒                      │
│200┤ █████████▓                      │
│100┤ ██████████                      │
│   └───────────────► 時間 (秒)       │
│   0   0.5  1.0  1.5  2.0  2.5       │
├─────────────────────────────────────┤
│   平均音高: 180 Hz (F#3)            │
│   音高範圍: 120-450 Hz              │
│   類型: 噪音類音效                   │
└─────────────────────────────────────┘
```

### UI 特點

1. **簡潔呈現**：基本資訊在一行顯示
2. **視覺化優先**：頻譜用條狀圖，音高用熱力圖
3. **可摺疊設計**：音高分析預設折疊，需要時展開查看
4. **遊戲音效提示**：根據頻譜特徵提供類型提示

### 進度條樣式

```css
.analysis-progress {
  background: var(--bg-node);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--spacing-3);
  margin: var(--spacing-2) 0;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-2);
}

.progress-bar-container {
  background: var(--bg-tertiary);
  border-radius: var(--radius);
  height: 8px;
  overflow: hidden;
  margin-bottom: var(--spacing-1);
}

.progress-bar-fill {
  background: linear-gradient(90deg,
    hsl(146 17% 59%),
    hsl(56 38% 57%)
  );
  height: 100%;
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

## 實現步驟

### Phase 1: 基礎架構
1. 建立 `js/audioAnalyzer.js` - 音訊分析引擎
2. 建立 `js/components/ProgressBar.js` - 進度條組件
3. 實作 `BasicInfoAnalyzer` - 提取基本資訊（時長、採樣率、聲道）

### Phase 2: 頻譜分析
4. 實作 `FrequencyAnalyzer` - 使用 AnalyserNode 進行 FFT
5. 計算低/中/高頻能量分布
6. 找出主要頻率（dominantFrequency）

### Phase 3: 音高分析 ⭐
7. 實作 `PitchAnalyzer` - 音高檢測（**YIN 算法**）
8. 生成頻譜圖資料（Spectrogram）
9. 建立 Canvas 熱力圖渲染器
10. 計算音高統計資訊（平均值、範圍、類型）

### Phase 4: UI 整合
11. 修改 `AudioInputNode.js` 整合分析流程
12. 設計分析結果面板（可摺疊）
13. 建立 `css/analysis.css` 樣式表
14. 實作頻譜圖互動（hover 顯示時間/頻率）

### Phase 5: 優化與測試
15. 效能優化：分批處理大型檔案
16. 加入錯誤處理和降級方案
17. 測試各種音效類型（爆炸、UI、音樂等）

## 技術考量

### 效能

**問題：大型音訊檔案分析可能阻塞 UI**

解決方案：
1. 分批處理：將音訊分成多個區塊逐一分析
2. 異步處理：使用 `requestIdleCallback` 在瀏覽器空閒時執行
3. Web Worker（進階）：將分析邏輯移至背景執行緒

```javascript
async function analyzeInChunks(audioBuffer, chunkSize = 44100 * 5) {
  const totalSamples = audioBuffer.length;
  let processedSamples = 0;

  while (processedSamples < totalSamples) {
    const chunkEnd = Math.min(processedSamples + chunkSize, totalSamples);
    const chunk = getAudioChunk(audioBuffer, processedSamples, chunkEnd);

    await analyzeChunk(chunk);
    processedSamples = chunkEnd;

    // 更新進度
    const progress = (processedSamples / totalSamples) * 100;
    onProgress(progress);

    // 讓出控制權給 UI
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

### 快取策略

為避免重複分析，使用檔案指紋（File Hash）快取結果：

```javascript
async function getCachedAnalysis(file) {
  const fileHash = await computeFileHash(file);
  const cached = localStorage.getItem(`analysis_${fileHash}`);

  if (cached) {
    return JSON.parse(cached);
  }

  return null;
}

async function computeFileHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 瀏覽器相容性

所有功能基於標準 Web Audio API：
- `AudioContext.decodeAudioData()` - 支援所有現代瀏覽器
- `AnalyserNode` - 用於頻譜分析
- `OfflineAudioContext` - 離線處理（不播放）

降級方案：
- 若分析失敗，僅顯示基本資訊（從 AudioBuffer 直接取得）
- 靜音檢測失敗時不顯示該區塊

## 未來擴展

### 遊戲音效專用功能
- **音效分類器**：自動識別音效類型（打擊、環境、UI、音樂）
- **Loop 點檢測**：自動找出適合循環的起始/結束點
- **音效比對**：比較兩個音效的相似度（避免重複）
- **批次分析**：一次分析多個音效檔案，生成報表

### 視覺化增強
- 3D 頻譜圖（立體聲空間分布）
- 可互動的頻譜圖（點擊播放該時間點）
- 音高曲線疊加在波形圖上

### 整合功能
- 根據分析結果自動建議處理參數（如：低頻太弱 → 建議加 Volume +3dB）
- 匯出分析報告（JSON/Markdown）供團隊協作

## 參考資源

- [Web Audio API 文件](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AnalyserNode - FFT 頻譜分析](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [YIN 音高檢測算法](https://github.com/ashokfernandez/Yin-Pitch-Tracking)
- [Spectrogram 頻譜圖原理](https://en.wikipedia.org/wiki/Spectrogram)
- [音高檢測方法比較](https://www.dsprelated.com/freebooks/sasp/Pitch_Detection.html)

---

## 附錄：程式碼範例

### 完整 AudioAnalyzer 類別骨架

```javascript
/**
 * 音訊分析器
 */
class AudioAnalyzer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.cache = new Map();
  }

  /**
   * 分析音訊
   */
  async analyze(audioBuffer, onProgress = () => {}) {
    const result = {};

    // 基本資訊
    result.basic = this.analyzeBasicInfo(audioBuffer);
    onProgress(20, '基本資訊完成');

    // 頻譜分析
    result.frequency = await this.analyzeFrequency(audioBuffer);
    onProgress(60, '頻譜分析完成');

    // 音高分析
    result.pitch = await this.analyzePitch(audioBuffer, (p) => {
      onProgress(60 + p * 0.4, '分析音高...');
    });
    onProgress(100, '分析完成');

    return result;
  }

  /**
   * 基本資訊分析
   */
  analyzeBasicInfo(audioBuffer) {
    const sampleRate = audioBuffer.sampleRate;
    const sampleRateKHz = (sampleRate / 1000).toFixed(1);
    const channelMode = audioBuffer.numberOfChannels === 1 ? '單聲道' : '立體聲';

    return {
      duration: audioBuffer.duration,
      durationFormatted: `${audioBuffer.duration.toFixed(2)}s`,
      sampleRate: sampleRate,
      sampleRateFormatted: `${sampleRateKHz} kHz`,
      numberOfChannels: audioBuffer.numberOfChannels,
      channelMode: channelMode,
      length: audioBuffer.length
    };
  }

  /**
   * 頻譜分析
   */
  async analyzeFrequency(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // FFT 分析
    const fftSize = 2048;
    const freqData = new Float32Array(fftSize);

    // 取中間一段進行分析
    const startSample = Math.floor(audioBuffer.length / 2);
    for (let i = 0; i < fftSize && startSample + i < channelData.length; i++) {
      freqData[i] = channelData[startSample + i];
    }

    // 簡易 FFT（實際應使用 AnalyserNode 或 FFT 庫）
    const spectrum = this.computeSpectrum(freqData, sampleRate);

    // 計算低、中、高頻能量
    const freqBands = this.calculateFrequencyBands(spectrum, sampleRate);

    // 找出主要頻率
    const dominantFreq = this.findDominantFrequency(spectrum, sampleRate);

    return {
      spectrum: freqBands,
      dominantFrequency: dominantFreq,
      spectralCentroid: this.calculateSpectralCentroid(spectrum, sampleRate)
    };
  }

  /**
   * 計算頻段能量分布
   */
  calculateFrequencyBands(spectrum, sampleRate) {
    const nyquist = sampleRate / 2;
    const binSize = nyquist / spectrum.length;

    let lowSum = 0, midSum = 0, highSum = 0;

    spectrum.forEach((magnitude, i) => {
      const freq = i * binSize;
      if (freq < 250) lowSum += magnitude;
      else if (freq < 4000) midSum += magnitude;
      else highSum += magnitude;
    });

    const total = lowSum + midSum + highSum;

    return {
      low: total > 0 ? lowSum / total : 0,
      mid: total > 0 ? midSum / total : 0,
      high: total > 0 ? highSum / total : 0
    };
  }

  /**
   * 找出主要頻率
   */
  findDominantFrequency(spectrum, sampleRate) {
    let maxMagnitude = 0;
    let maxIndex = 0;

    spectrum.forEach((magnitude, i) => {
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
        maxIndex = i;
      }
    });

    const binSize = (sampleRate / 2) / spectrum.length;
    return maxIndex * binSize;
  }

  /**
   * 計算頻譜重心
   */
  calculateSpectralCentroid(spectrum, sampleRate) {
    const binSize = (sampleRate / 2) / spectrum.length;
    let weightedSum = 0;
    let totalMagnitude = 0;

    spectrum.forEach((magnitude, i) => {
      const freq = i * binSize;
      weightedSum += freq * magnitude;
      totalMagnitude += magnitude;
    });

    return totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
  }

  /**
   * 簡易頻譜計算（實際應使用 FFT）
   */
  computeSpectrum(timeData, sampleRate) {
    // 這裡簡化處理，實際應使用 AnalyserNode
    const spectrum = new Float32Array(timeData.length / 2);

    // 簡易能量計算
    for (let i = 0; i < spectrum.length; i++) {
      const real = timeData[i * 2] || 0;
      const imag = timeData[i * 2 + 1] || 0;
      spectrum[i] = Math.sqrt(real * real + imag * imag);
    }

    return spectrum;
  }

  /**
   * 音高分析（使用 YIN 算法）
   */
  async analyzePitch(audioBuffer, onProgress = () => {}) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // 分段分析音高
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms 窗口
    const hopSize = Math.floor(windowSize / 2);      // 50ms 跳躍
    const pitchCurve = [];

    let processed = 0;
    const totalWindows = Math.floor((channelData.length - windowSize) / hopSize);

    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      const window = channelData.slice(i, i + windowSize);
      const pitch = this.detectPitchYIN(window, sampleRate);

      pitchCurve.push({
        time: i / sampleRate,
        frequency: pitch.frequency,
        confidence: pitch.confidence
      });

      processed++;
      onProgress(processed / totalWindows);
    }

    // 計算統計資訊
    const validPitches = pitchCurve.filter(p => p.confidence > 0.5);
    const avgPitch = validPitches.length > 0
      ? validPitches.reduce((sum, p) => sum + p.frequency, 0) / validPitches.length
      : 0;

    const frequencies = validPitches.map(p => p.frequency);
    const minPitch = Math.min(...frequencies) || 0;
    const maxPitch = Math.max(...frequencies) || 0;

    // 判斷是否為有音高的音效
    const isPitched = validPitches.length / pitchCurve.length > 0.3;

    // 生成頻譜圖（簡化版）
    const spectrogram = await this.generateSpectrogram(audioBuffer, onProgress);

    return {
      pitchCurve,
      spectrogram,
      averagePitch: avgPitch,
      pitchRange: { min: minPitch, max: maxPitch },
      isPitched
    };
  }

  /**
   * YIN 音高檢測算法
   * 參考論文：http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf
   *
   * YIN 算法優點：
   * - 減少八度錯誤（octave errors）
   * - 對複雜音效（爆炸、環境音）更準確
   * - 提供可靠的置信度指標
   */
  detectPitchYIN(buffer, sampleRate) {
    const threshold = 0.15;  // 閾值（論文建議值）
    const minFreq = 80;      // 最低頻率 (Hz)
    const maxFreq = 1000;    // 最高頻率 (Hz)

    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    // 步驟 1: 計算差異函數（Difference Function）
    const differenceFunction = new Float32Array(maxPeriod);
    for (let tau = 0; tau < maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < buffer.length - tau; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      differenceFunction[tau] = sum;
    }

    // 步驟 2: 累積平均正規化差異函數（CMNDF）
    const cmndf = new Float32Array(maxPeriod);
    cmndf[0] = 1;

    let runningSum = 0;
    for (let tau = 1; tau < maxPeriod; tau++) {
      runningSum += differenceFunction[tau];
      cmndf[tau] = differenceFunction[tau] / (runningSum / tau);
    }

    // 步驟 3: 找出第一個低於閾值的谷底（絕對閾值搜尋）
    let bestPeriod = 0;
    let bestConfidence = 0;

    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (cmndf[tau] < threshold) {
        // 找局部最小值
        while (tau + 1 < maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        bestPeriod = tau;
        bestConfidence = 1 - cmndf[tau];
        break;
      }
    }

    // 若沒找到低於閾值的，則找全域最小值
    if (bestPeriod === 0) {
      let minValue = 1;
      for (let tau = minPeriod; tau < maxPeriod; tau++) {
        if (cmndf[tau] < minValue) {
          minValue = cmndf[tau];
          bestPeriod = tau;
        }
      }
      bestConfidence = 1 - minValue;
    }

    // 步驟 4: 拋物線插值提高精度
    if (bestPeriod > 0 && bestPeriod < maxPeriod - 1) {
      const s0 = cmndf[bestPeriod - 1];
      const s1 = cmndf[bestPeriod];
      const s2 = cmndf[bestPeriod + 1];

      const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));
      if (!isNaN(adjustment) && Math.abs(adjustment) < 1) {
        bestPeriod += adjustment;
      }
    }

    const frequency = bestPeriod > 0 ? sampleRate / bestPeriod : 0;

    return {
      frequency,
      confidence: bestConfidence
    };
  }

  /**
   * 生成頻譜圖
   */
  async generateSpectrogram(audioBuffer, onProgress = () => {}) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const fftSize = 512;
    const hopSize = Math.floor(fftSize / 4);
    const width = Math.floor((channelData.length - fftSize) / hopSize);
    const height = fftSize / 2;

    const data = [];

    for (let i = 0; i < width; i++) {
      const startSample = i * hopSize;
      const window = channelData.slice(startSample, startSample + fftSize);

      // 簡易 FFT（實際應使用 AnalyserNode）
      const spectrum = this.computeSpectrum(window, sampleRate);

      // 轉換為 0-255 的強度值
      const magnitudes = Array.from(spectrum).map(m => {
        const db = 20 * Math.log10(m + 1e-10);
        return Math.max(0, Math.min(255, (db + 100) * 2.55));
      });

      data.push(magnitudes);

      if (i % 10 === 0) onProgress(i / width);
    }

    return {
      width,
      height,
      data,
      timeStep: hopSize / sampleRate,
      frequencyRange: [20, sampleRate / 2]
    };
  }
}

// 建立全域實例
const audioAnalyzer = new AudioAnalyzer(audioProcessor.audioContext);
```

---

**版本歷史**
- v1.0 (2024-12-04): 初始設計文件
- v1.1 (2024-12-04): 針對遊戲音效製作優化
  - 移除音量分析與靜音檢測（波形圖已足夠）
  - 新增音高分析功能（音高曲線 + 頻譜圖熱力圖）
  - 簡化 UI 設計，聚焦於遊戲音效製作需求
  - 添加完整的音高分析實現範例（自相關法 + 頻譜圖生成）
- v1.2 (2024-12-04): 改用 YIN 音高檢測算法
  - 將 Autocorrelation 替換為 YIN 算法（更準確）
  - YIN 優勢：減少八度錯誤、對複雜音效更準確、提供可靠置信度
  - 添加完整 YIN 算法實現（含 4 個步驟的詳細註解）
  - 適合遊戲音效的複雜頻譜特性
