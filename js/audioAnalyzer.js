/**
 * 音訊分析引擎
 *
 * 負責分析音訊檔案的各項特性，包括：
 * - 基本資訊（時長、採樣率、聲道）
 * - 頻譜分布（低中高頻能量）
 * - 音高分析（音高曲線、頻譜圖）
 */

class AudioAnalyzer {
  /**
   * 建立音訊分析器
   * @param {AudioContext} audioContext - Web Audio API 的音訊上下文
   */
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.cache = new Map();
  }

  /**
   * 分析音訊檔案
   *
   * 依序執行各個分析步驟，並通過 onProgress 回調報告進度：
   * - 0-20%: 基本資訊分析
   * - 20-60%: 頻譜分析
   * - 60-100%: 音高分析
   *
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Function} [onProgress] - 進度回調函數，簽名: (progress: number, message: string) => void
   *                                   progress: 0-100 的百分比
   *                                   message: 當前執行的操作描述
   * @returns {Promise<AnalysisResult>} 分析結果物件，包含 { basic, frequency, pitch }
   */
  async analyze(audioBuffer, onProgress = () => {}) {
    if (!audioBuffer) {
      throw new Error('audioBuffer 不能為空');
    }

    const result = {
      basic: {},
      frequency: {},
      pitch: {}
    };

    try {
      // 步驟 1: 基本資訊分析 (0-20%)
      onProgress(0, '分析基本資訊...');
      result.basic = this.analyzeBasicInfo(audioBuffer);
      onProgress(20, '基本資訊完成');

      // 步驟 2: 頻譜分析 (20-60%)
      onProgress(20, '分析頻譜分布...');
      result.frequency = await this.analyzeFrequency(audioBuffer, (progress) => {
        // 子步驟進度：20% + (進度 * 40%)
        onProgress(20 + progress * 0.4, '分析頻譜...');
      });
      onProgress(60, '頻譜分析完成');

      // 步驟 3: 音高分析 (60-100%)
      onProgress(60, '分析音高變化...');
      result.pitch = await this.analyzePitch(audioBuffer, (progress) => {
        // 子步驟進度：60% + (進度 * 40%)
        onProgress(60 + progress * 0.4, '分析音高...');
      });
      onProgress(100, '分析完成');

      return result;
    } catch (error) {
      console.error('音訊分析出現錯誤:', error);
      throw error;
    }
  }

  /**
   * 分析音訊的基本資訊
   *
   * 提取以下資訊：
   * - 時長（秒）
   * - 採樣率（Hz）
   * - 聲道數（1=單聲道, 2=立體聲）
   * - 總樣本數
   *
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @returns {BasicInfo} 基本資訊物件
   *
   * @example
   * {
   *   duration: 2.45,
   *   durationFormatted: "2.45s",
   *   sampleRate: 44100,
   *   sampleRateFormatted: "44.1 kHz",
   *   numberOfChannels: 2,
   *   channelMode: "立體聲",
   *   length: 108045
   * }
   */
  analyzeBasicInfo(audioBuffer) {
    const sampleRate = audioBuffer.sampleRate;
    const sampleRateKHz = (sampleRate / 1000).toFixed(1);
    const channelMode = audioBuffer.numberOfChannels === 1 ? '單聲道' : '立體聲';
    const duration = audioBuffer.duration;

    return {
      duration: duration,
      durationFormatted: `${duration.toFixed(2)}s`,
      sampleRate: sampleRate,
      sampleRateFormatted: `${sampleRateKHz} kHz`,
      numberOfChannels: audioBuffer.numberOfChannels,
      channelMode: channelMode,
      length: audioBuffer.length
    };
  }

  /**
   * 計算頻率帶能量分布
   *
   * 將原始 FFT 頻譜資料分為三個頻率帶，計算各帶的能量比例。
   * 由於 rawSpectrum 包含分貝值（dB），需先轉換為線性能量進行求和。
   *
   * 頻率帶定義：
   * - 低頻 (Low): 20-250 Hz - 低頻成分，通常包含低沈的爆炸音、鼓聲等
   * - 中頻 (Mid): 250-4000 Hz - 中頻成分，包含人聲、踏步聲、主要音樂元素
   * - 高頻 (High): 4000-20000 Hz - 高頻成分，包含細節、金屬音、空氣感
   *
   * @param {Float32Array} rawSpectrum - FFT 原始頻譜資料（分貝值，範圍 -Infinity 到 0）
   * @param {number} sampleRate - 音訊採樣率 (Hz)
   * @returns {Object} 頻率帶能量分布物件 {low: number, mid: number, high: number}
   *
   * @example
   * const bands = calculateFrequencyBands(rawSpectrum, 44100);
   * // 返回: { low: 0.35, mid: 0.45, high: 0.20 }
   *
   * @private
   */
  calculateFrequencyBands(rawSpectrum, sampleRate) {
    // 計算頻率解析度（每個頻率 bin 的頻率寬度）
    // Nyquist 頻率 = sampleRate / 2 (根據 Nyquist 定理，能表示的最高頻率)
    // 頻率 bin 寬度 = Nyquist 頻率 / 頻譜 bin 數量
    const nyquistFrequency = sampleRate / 2;
    const binWidth = nyquistFrequency / rawSpectrum.length;

    // 初始化能量累加器
    let lowEnergy = 0;   // 低頻帶能量
    let midEnergy = 0;   // 中頻帶能量
    let highEnergy = 0;  // 高頻帶能量

    // 遍歷所有頻率 bin，計算各帶能量
    for (let i = 0; i < rawSpectrum.length; i++) {
      // 當前 bin 對應的頻率
      const frequency = i * binWidth;

      // 從分貝值轉換為線性能量
      // 分貝公式：dB = 20 * log10(linear)，反轉得：linear = 10^(dB/20)
      // 注意：rawSpectrum 中的值為 -Infinity 到 0 的範圍
      // 避免使用 -Infinity 值，設定最小值為 -100 dB
      const dbValue = Math.max(rawSpectrum[i], -100);
      const linearEnergy = Math.pow(10, dbValue / 20);

      // 將該 bin 的能量累加到相應的頻率帶
      if (frequency >= 20 && frequency < 250) {
        // 低頻帶: 20-250 Hz
        lowEnergy += linearEnergy;
      } else if (frequency >= 250 && frequency < 4000) {
        // 中頻帶: 250-4000 Hz
        midEnergy += linearEnergy;
      } else if (frequency >= 4000 && frequency <= nyquistFrequency) {
        // 高頻帶: 4000-Nyquist Hz
        // 上限使用 Nyquist 頻率，確保涵蓋所有有效頻率
        highEnergy += linearEnergy;
      }
    }

    // 計算總能量
    const totalEnergy = lowEnergy + midEnergy + highEnergy;

    // 處理無效情況（無聲音或能量極小）
    if (totalEnergy === 0 || totalEnergy < 1e-10) {
      // 無聲音訊，返回零分布
      return {
        low: 0,
        mid: 0,
        high: 0
      };
    }

    // 正規化為 0-1 範圍的比例
    return {
      low: lowEnergy / totalEnergy,    // 低頻比例
      mid: midEnergy / totalEnergy,    // 中頻比例
      high: highEnergy / totalEnergy   // 高頻比例
    };
  }

  /**
   * 分析頻譜分布
   *
   * 計算以下資訊：
   * - 低頻（20-250 Hz）、中頻（250-4000 Hz）、高頻（4000-20000 Hz）的能量比
   * - 主要頻率（能量最強的頻率）
   * - 頻譜重心（平均頻率位置）
   *
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Function} [onProgress] - 進度回調函數 (0-1)
   * @returns {Promise<FrequencyInfo>} 頻譜分析結果
   *
   * @example
   * {
   *   spectrum: {
   *     low: 0.35,      // 低頻比例 (20-250 Hz)
   *     mid: 0.45,      // 中頻比例 (250-4000 Hz)
   *     high: 0.20      // 高頻比例 (4000-20000 Hz)
   *   },
   *   dominantFrequency: 440.0,
   *   spectralCentroid: 2500.0,
   *   rawSpectrum: Float32Array  // 原始 FFT 頻譜資料
   * }
   */
  async analyzeFrequency(audioBuffer, onProgress = () => {}) {
    try {
      const FFT_SIZE = 2048;
      const sampleRate = audioBuffer.sampleRate;

      onProgress(0.2);

      // 步驟 1: 從音訊緩衝區提取中間部分用於頻譜分析
      // 選用中間部分是為了取得代表性的頻譜，避免開頭或結尾可能的異常
      const channelData = audioBuffer.getChannelData(0); // 取得第一聲道

      // 計算中間位置，提取 FFT_SIZE 個樣本
      const middleIndex = Math.floor((audioBuffer.length - FFT_SIZE) / 2);
      const samples = channelData.slice(middleIndex, middleIndex + FFT_SIZE);

      onProgress(0.4);

      // 步驟 2: 應用漢寧窗函數 (Hann Window)
      // 窗函數用於減少頻譜洩漏，改善 FFT 分析質量
      const windowedSamples = new Float32Array(FFT_SIZE);
      for (let i = 0; i < FFT_SIZE; i++) {
        // Hann window: 0.5 * (1 - cos(2π * i / (N-1)))
        const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
        windowedSamples[i] = samples[i] * windowValue;
      }

      onProgress(0.6);

      // 步驟 3: 使用 OfflineAudioContext 和 AnalyserNode 執行 FFT
      // 建立一個短暫的離線上下文，只需要處理 FFT_SIZE 個樣本
      const offlineContext = new OfflineAudioContext(
        1,                                    // 單聲道
        FFT_SIZE,                            // 長度為 FFT_SIZE 樣本
        sampleRate                           // 使用原始採樣率
      );

      // 建立 AnalyserNode 用於 FFT 分析
      const analyser = offlineContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;  // 不使用時域平滑，確保精確的快照

      // 建立包含窗化樣本的音訊緩衝區
      const analyserBuffer = offlineContext.createBuffer(1, FFT_SIZE, sampleRate);
      analyserBuffer.getChannelData(0).set(windowedSamples);

      // 建立音訊源並連接到分析器
      const source = offlineContext.createBufferSource();
      source.buffer = analyserBuffer;
      source.connect(analyser);
      analyser.connect(offlineContext.destination);

      onProgress(0.7);

      // 啟動音訊源
      source.start(0);

      // 渲染離線音訊上下文
      await offlineContext.startRendering();

      onProgress(0.85);

      // 步驟 4: 提取頻譜資訊
      // 創建陣列用於存儲頻率域的數據（以分貝為單位）
      const rawSpectrum = new Float32Array(analyser.frequencyBinCount);

      // getFloatFrequencyData() 返回分貝值（dB，範圍 -Infinity 到 0）
      // 注意：由於 AnalyserNode 在離線上下文中可能不會更新，
      // 我們使用手動 FFT 計算作為備選方案
      analyser.getFloatFrequencyData(rawSpectrum);

      // 檢查是否有有效數據（AnalyserNode 在離線上下文中可能不工作）
      const hasValidData = rawSpectrum.some(val => val > -Infinity && !isNaN(val));

      if (!hasValidData) {
        // 備用方案：使用簡化的 DFT 計算頻譜
        // 計算功率譜（僅需要幅度，不需要完整的 FFT）
        for (let k = 0; k < analyser.frequencyBinCount; k++) {
          let real = 0;
          let imag = 0;

          // DFT 公式: X[k] = Σ x[n] * e^(-2πikn/N)
          for (let n = 0; n < FFT_SIZE; n++) {
            const angle = -2 * Math.PI * k * n / FFT_SIZE;
            real += windowedSamples[n] * Math.cos(angle);
            imag += windowedSamples[n] * Math.sin(angle);
          }

          // 計算幅度並轉換為分貝
          const magnitude = Math.sqrt(real * real + imag * imag) / FFT_SIZE;
          rawSpectrum[k] = magnitude > 0 ? 20 * Math.log10(magnitude) : -100;
        }
      }

      onProgress(0.95);

      // 步驟 5: 計算頻率帶能量分布 (Task 2.2)
      // 使用 rawSpectrum 計算低/中/高頻的能量比例
      const frequencyBands = this.calculateFrequencyBands(rawSpectrum, sampleRate);

      onProgress(1);

      // 返回分析結果
      // rawSpectrum 會被後續任務（主頻率、頻譜重心）使用
      return {
        spectrum: frequencyBands,   // 由 Task 2.2 計算的頻率帶能量分布
        dominantFrequency: 0,       // 待 Task 2.3 實作
        spectralCentroid: 0,        // 待 Task 2.3 實作
        rawSpectrum: rawSpectrum    // 原始 FFT 頻譜資料供後續任務使用
      };
    } catch (error) {
      console.error('頻譜分析出現錯誤:', error);
      throw error;
    }
  }

  /**
   * 分析音高特性
   *
   * 使用 YIN 算法進行音高檢測，計算以下資訊：
   * - 音高曲線（隨時間變化的音高和置信度）
   * - 頻譜圖（熱力圖形式的頻率時間分布）
   * - 平均音高和音高範圍
   * - 是否為有音高的聲音（vs 純噪音）
   *
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Function} [onProgress] - 進度回調函數 (0-1)
   * @returns {Promise<PitchInfo>} 音高分析結果
   *
   * @example
   * {
   *   pitchCurve: [
   *     { time: 0.0, frequency: 440.0, confidence: 0.95 },
   *     { time: 0.1, frequency: 523.25, confidence: 0.92 },
   *     ...
   *   ],
   *   spectrogram: {
   *     width: 100,
   *     height: 256,
   *     data: [[...], [...], ...],
   *     timeStep: 0.02,
   *     frequencyRange: [20, 20000]
   *   },
   *   averagePitch: 523.25,
   *   pitchRange: { min: 392.0, max: 783.99 },
   *   isPitched: true
   * }
   */
  async analyzePitch(audioBuffer, onProgress = () => {}) {
    // 預留位置，待後續實作
    // 此版本返回空物件，實際實作將使用 YIN 算法進行音高檢測和頻譜圖生成

    onProgress(1);

    return {
      pitchCurve: [],
      spectrogram: {
        width: 0,
        height: 0,
        data: [],
        timeStep: 0,
        frequencyRange: [0, 0]
      },
      averagePitch: 0,
      pitchRange: { min: 0, max: 0 },
      isPitched: false
    };
  }
}

// 建立全域實例
// 使用 audioProcessor 的 audioContext（已在 audioProcessor.js 中初始化）
window.audioAnalyzer = new AudioAnalyzer(audioProcessor.audioContext);
