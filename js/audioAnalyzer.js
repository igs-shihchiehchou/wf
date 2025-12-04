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
   *   spectralCentroid: 2500.0
   * }
   */
  async analyzeFrequency(audioBuffer, onProgress = () => {}) {
    // 預留位置，待後續實作
    // 此版本返回空物件，實際實作將使用 AnalyserNode 進行 FFT 分析

    onProgress(1);

    return {
      spectrum: {
        low: 0,
        mid: 0,
        high: 0
      },
      dominantFrequency: 0,
      spectralCentroid: 0
    };
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
