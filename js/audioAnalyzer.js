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
   *   spectralCentroid: 2500.0,
   *   rawSpectrum: Float32Array  // 原始 FFT 頻譜資料
   * }
   */
  async analyzeFrequency(audioBuffer, onProgress = () => {}) {
    try {
      // 常數定義
      const FFT_SIZE = 2048;
      const NYQUIST_FREQUENCY = audioBuffer.sampleRate / 2;

      // 步驟 1: 建立離線音訊上下文 (使用原始採樣率)
      // OfflineAudioContext 用於離線處理音訊，避免即時播放的複雜度
      const offlineContext = new OfflineAudioContext(
        1, // 輸出為單聲道（只分析第一聲道）
        audioBuffer.duration * audioBuffer.sampleRate,
        audioBuffer.sampleRate
      );

      onProgress(0.2);

      // 步驟 2: 建立音訊圖的各個節點
      // BufferSource: 音訊來源
      const bufferSource = offlineContext.createBufferSource();
      bufferSource.buffer = audioBuffer;

      // AnalyserNode: 執行 FFT 分析，提取頻譜資訊
      const analyser = offlineContext.createAnalyser();
      analyser.fftSize = FFT_SIZE; // 設定 FFT 大小為 2048 樣本

      // 步驟 3: 建立音訊圖連線
      // 連線: BufferSource → Analyser → Destination
      bufferSource.connect(analyser);
      analyser.connect(offlineContext.destination);

      // 啟動音訊處理（播放整個音訊）
      bufferSource.start(0);

      onProgress(0.4);

      // 步驟 4: 離線渲染音訊，使 AnalyserNode 能夠存儲頻譜資訊
      // 這會執行整個音訊檔案的離線處理
      await offlineContext.startRendering();

      onProgress(0.6);

      // 步驟 5: 從音訊緩衝區提取中間部分用於頻譜分析
      // 選用中間部分是為了取得代表性的頻譜，避免開頭或結尾可能的異常
      const channelData = audioBuffer.getChannelData(0); // 取得第一聲道（單聲道）
      const quarterPoint = Math.floor(audioBuffer.length / 4); // 音訊的 1/4 位置
      const halfLength = Math.floor(audioBuffer.length / 2);   // 音訊的 1/2 長度

      // 從 1/4 位置提取 1/2 長度的音訊片段（中間部分）
      // 例如: 10秒音訊，從2.5秒位置提取5秒的片段
      const middleSection = channelData.slice(quarterPoint, quarterPoint + halfLength);

      onProgress(0.7);

      // 步驟 6: 建立新的 AnalyserNode 以分析中間部分
      // 使用新的 AnalyserNode 以確保有清晰的頻譜資訊
      const frequencyAnalyser = this.audioContext.createAnalyser();
      frequencyAnalyser.fftSize = FFT_SIZE;

      // 建立臨時的 BufferSource 來播放中間片段
      const tempBuffer = this.audioContext.createBuffer(
        1,
        middleSection.length,
        audioBuffer.sampleRate
      );
      tempBuffer.getChannelData(0).set(middleSection);

      const tempSource = this.audioContext.createBufferSource();
      tempSource.buffer = tempBuffer;
      tempSource.connect(frequencyAnalyser);
      frequencyAnalyser.connect(this.audioContext.destination);

      tempSource.start(0);

      // 等待足夠的時間讓 AnalyserNode 更新頻譜資訊
      // FFT 處理時間取決於採樣率，給予足夠的毫秒來處理
      await new Promise(resolve => setTimeout(resolve, 100));

      onProgress(0.85);

      // 步驟 7: 提取頻譜資訊
      // 創建 Float32Array 用於存儲頻率域的數據（以分貝為單位）
      const rawSpectrum = new Float32Array(frequencyAnalyser.frequencyBinCount);

      // getFloatFrequencyData() 返回分貝值（dB，範圍 -Infinity 到 0）
      // 這提供了更精確的頻譜資訊用於後續計算
      frequencyAnalyser.getFloatFrequencyData(rawSpectrum);

      onProgress(0.95);

      // 步驟 8: 清理臨時資源
      // 停止臨時音訊源
      tempSource.stop();

      // 返回分析結果
      // rawSpectrum 會被 Task 2.2 和 2.3 使用來計算頻譜帶、主頻率和頻譜重心
      onProgress(1);

      return {
        spectrum: {
          low: 0,    // 待 Task 2.2 實作
          mid: 0,
          high: 0
        },
        dominantFrequency: 0,     // 待 Task 2.3 實作
        spectralCentroid: 0,      // 待 Task 2.3 實作
        rawSpectrum: rawSpectrum  // 原始 FFT 頻譜資料供後續任務使用
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
