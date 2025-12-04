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

      // 步驟 6: 計算主頻率和頻譜重心 (Task 2.3)
      // 使用 rawSpectrum 計算主頻率（能量最強的頻率）和頻譜重心（平均頻率位置）
      const dominantFrequency = this.findDominantFrequency(rawSpectrum, sampleRate);
      const spectralCentroid = this.calculateSpectralCentroid(rawSpectrum, sampleRate);

      // 返回分析結果
      // rawSpectrum 會被後續任務（主頻率、頻譜重心）使用
      return {
        spectrum: frequencyBands,   // 由 Task 2.2 計算的頻率帶能量分布
        dominantFrequency: dominantFrequency,  // 由 Task 2.3 計算的主頻率
        spectralCentroid: spectralCentroid,    // 由 Task 2.3 計算的頻譜重心
        rawSpectrum: rawSpectrum    // 原始 FFT 頻譜資料供後續任務使用
      };
    } catch (error) {
      console.error('頻譜分析出現錯誤:', error);
      throw error;
    }
  }

  /**
   * 查找主頻率（能量最強的頻率）
   *
   * 主頻率是頻譜中能量最強的頻率分量，代表聲音最突出的頻率特徵。
   * 對遊戲音效分類很有用：
   * - 低頻爆炸音：主頻率通常在 50-200 Hz
   * - 中頻人聲/踏步：主頻率通常在 200-2000 Hz
   * - 高頻金屬碰撞：主頻率通常在 4000-10000 Hz
   *
   * 計算方法：
   * 1. 遍歷整個頻譜，找出最大能量的 bin
   * 2. 使用公式轉換 bin 索引為頻率：frequency = binIndex * (sampleRate / 2) / spectrumLength
   *
   * @param {Float32Array} rawSpectrum - FFT 原始頻譜資料（分貝值，範圍 -Infinity 到 0）
   * @param {number} sampleRate - 音訊採樣率 (Hz)
   * @returns {number} 主頻率（Hz），範圍 0 到 Nyquist 頻率（sampleRate/2）
   *
   * @example
   * const dominantFreq = this.findDominantFrequency(rawSpectrum, 44100);
   * // 返回: 440 (假設 440Hz 音符是最強的)
   *
   * @private
   */
  findDominantFrequency(rawSpectrum, sampleRate) {
    // 邊界檢查：空頻譜或長度無效
    if (!rawSpectrum || rawSpectrum.length === 0) {
      return 0;
    }

    // 遍歷頻譜找出最大能量的 bin
    let maxMagnitude = -Infinity;  // 初始化為負無窮（因為 dB 值最高為 0）
    let maxBinIndex = 0;

    for (let i = 0; i < rawSpectrum.length; i++) {
      const dbValue = rawSpectrum[i];

      // 忽略無效值（-Infinity），取有效的最大值
      if (dbValue > -Infinity && dbValue > maxMagnitude) {
        maxMagnitude = dbValue;
        maxBinIndex = i;
      }
    }

    // 邊界檢查：所有值都是 -Infinity（無聲或無效數據）
    if (maxMagnitude === -Infinity) {
      return 0;
    }

    // 將 bin 索引轉換為頻率 (Hz)
    // Nyquist 頻率 = sampleRate / 2
    // 頻率解析度 = Nyquist 頻率 / bin 數量
    // frequency = binIndex * 頻率解析度
    const nyquistFrequency = sampleRate / 2;
    const frequencyPerBin = nyquistFrequency / rawSpectrum.length;
    const dominantFrequency = maxBinIndex * frequencyPerBin;

    return dominantFrequency;
  }

  /**
   * 計算頻譜重心（頻率的加權平均）
   *
   * 頻譜重心是頻譜的加權平均頻率，代表聲音的整體「亮度」或「音色重心」。
   * 它用於描述聲音在頻率軸上的分布位置：
   * - 低頻重心（< 1000 Hz）：音色較暗，溫暖（如貝斯、低沈鼓聲）
   * - 中頻重心（1000-5000 Hz）：音色清晰，平衡（如人聲、主要樂器）
   * - 高頻重心（> 5000 Hz）：音色明亮，銳利（如高音樂器、金屬音）
   *
   * 計算公式：
   * centroid = Σ(frequency[i] * magnitude[i]) / Σ(magnitude[i])
   *
   * 由於 rawSpectrum 包含分貝值，需先轉換為線性能量：
   * linearMagnitude = 10^(dB/20)
   *
   * @param {Float32Array} rawSpectrum - FFT 原始頻譜資料（分貝值，範圍 -Infinity 到 0）
   * @param {number} sampleRate - 音訊採樣率 (Hz)
   * @returns {number} 頻譜重心（Hz），範圍 0 到 Nyquist 頻率（sampleRate/2）
   *
   * @example
   * const centroid = this.calculateSpectralCentroid(rawSpectrum, 44100);
   * // 返回: 2500 (頻譜重心位於 2500Hz)
   *
   * @private
   */
  calculateSpectralCentroid(rawSpectrum, sampleRate) {
    // 邊界檢查：空頻譜或長度無效
    if (!rawSpectrum || rawSpectrum.length === 0) {
      return 0;
    }

    // 計算頻率解析度
    const nyquistFrequency = sampleRate / 2;
    const frequencyPerBin = nyquistFrequency / rawSpectrum.length;

    // 累加加權頻率和總能量
    let weightedFrequencySum = 0;  // Σ(frequency[i] * magnitude[i])
    let totalMagnitude = 0;        // Σ(magnitude[i])

    for (let i = 0; i < rawSpectrum.length; i++) {
      const dbValue = rawSpectrum[i];

      // 只處理有效的 dB 值（不是 -Infinity）
      if (dbValue > -Infinity) {
        // 將分貝值轉換為線性能量
        // 分貝公式：dB = 20 * log10(linear)
        // 反轉得：linear = 10^(dB/20)
        const linearMagnitude = Math.pow(10, dbValue / 20);

        // 計算該 bin 對應的頻率
        const frequency = i * frequencyPerBin;

        // 累加加權頻率
        weightedFrequencySum += frequency * linearMagnitude;

        // 累加總能量
        totalMagnitude += linearMagnitude;
      }
    }

    // 邊界檢查：無有效能量（無聲或無效數據）
    if (totalMagnitude === 0 || totalMagnitude < 1e-10) {
      return 0;
    }

    // 計算頻譜重心：加權平均 = 總加權頻率 / 總能量
    const spectralCentroid = weightedFrequencySum / totalMagnitude;

    return spectralCentroid;
  }

  /**
   * 檢測單一音訊幀的音高（使用 YIN 算法）
   *
   * YIN 算法是一種鯉魚型音高檢測算法，相比自相關方法更精確、更快速。
   * 適用於遊戲音效和語音的音高檢測。
   *
   * 算法流程（4 個步驟）：
   * 1. 差異函數（Difference Function）：計算不同時間差（lag）的樣本平方差
   * 2. CMNDF（Cumulative Mean Normalized Difference Function）：累積平均正規化
   * 3. 絕對閾值搜尋（Absolute Threshold）：找第一個低於 0.15 的 CMNDF 值
   * 4. 拋物線插值（Parabolic Interpolation）：精細化 lag 以獲得亞樣本精度
   *
   * @param {Float32Array} audioData - 單一音訊幀的樣本陣列
   * @param {number} sampleRate - 採樣率 (Hz)
   * @returns {Object} 音高檢測結果 { frequency: number, confidence: number }
   *                   - frequency: 檢測到的頻率 (Hz)，範圍 80-1000 Hz
   *                   - confidence: 置信度 (0-1)，越高越可信
   *
   * @private
   */
  detectPitchYIN(audioData, sampleRate) {
    // ========== 步驟 0: 初始化和邊界檢查 ==========
    // 檢查輸入有效性
    if (!audioData || audioData.length === 0) {
      return { frequency: 0, confidence: 0 };
    }

    // YIN 算法的關鍵參數
    const THRESHOLD = 0.15;           // 絕對閾值：CMNDF 値 < 0.15 表示找到週期
    const MIN_FREQUENCY = 80;          // 最低頻率 (Hz)
    const MAX_FREQUENCY = 1000;        // 最高頻率 (Hz)
    const MAX_LAG = Math.floor(sampleRate / MIN_FREQUENCY);      // 對應最低頻率的最大 lag
    const MIN_LAG = Math.floor(sampleRate / MAX_FREQUENCY);      // 對應最高頻率的最小 lag
    const FRAME_LENGTH = audioData.length;

    // 確保 lag 範圍在合理值內
    if (MIN_LAG < 1 || MAX_LAG > FRAME_LENGTH) {
      return { frequency: 0, confidence: 0 };
    }

    // ========== 步驟 1: 計算差異函數（Difference Function）==========
    // 差異函數定義：d[lag] = Σ(x[i] - x[i+lag])^2，其中 i = 0 到 N-lag-1
    // 這計算了訊號與其自身延遲版本之間的差異
    const differenceFunction = new Float32Array(FRAME_LENGTH);
    let sumSquares = 0;

    // 計算所有樣本的平方和（用於 CMNDF 正規化）
    for (let i = 0; i < FRAME_LENGTH; i++) {
      sumSquares += audioData[i] * audioData[i];
    }

    // 計算各個 lag 的差異函數值
    for (let lag = 0; lag < FRAME_LENGTH; lag++) {
      let sum = 0;
      for (let i = 0; i < FRAME_LENGTH - lag; i++) {
        const diff = audioData[i] - audioData[i + lag];
        sum += diff * diff;
      }
      differenceFunction[lag] = sum;
    }

    // ========== 步驟 2: 計算 CMNDF（Cumulative Mean Normalized Difference Function）==========
    // CMNDF 正規化差異函數，提高 YIN 算法的魯棒性
    // 標準 YIN 公式：d'_cmndf[τ] = d[τ] / ((1/τ) * Σ d[j] for j=1 to τ)
    // 等價於：d'_cmndf[τ] = d[τ] * τ / (Σ d[j] for j=1 to τ)
    // 分子：差異函數值乘以 lag；分母：差異函數在 1 到 lag 的累積和
    const cmndf = new Float32Array(FRAME_LENGTH);
    cmndf[0] = 1;  // 定義 cmndf[0] = 1（約定）

    let runningMean = 0;

    for (let lag = 1; lag < FRAME_LENGTH; lag++) {
      runningMean += differenceFunction[lag];
      // 計算累積平均：sum(d[1:lag])
      // 為避免除以零，加上極小值 epsilon = 1e-10
      cmndf[lag] = (differenceFunction[lag] * lag) / (runningMean + 1e-10);
    }

    // ========== 步驟 3: 絕對閾值搜尋（Absolute Threshold Search）==========
    // 找第一個 CMNDF 值低於閾值 (0.15) 的 lag，這通常對應訊號的基本週期
    let foundLag = 0;
    let minCmndf = Infinity;

    for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
      if (cmndf[lag] < THRESHOLD) {
        // 找到第一個低於閾值的 lag
        foundLag = lag;
        minCmndf = cmndf[lag];
        break;
      }
      // 同時追蹤最小值，備用（如果沒找到閾值點）
      if (cmndf[lag] < minCmndf) {
        minCmndf = cmndf[lag];
        foundLag = lag;
      }
    }

    // ========== 步驟 4: 拋物線插值（Parabolic Interpolation）==========
    // 如果找到有效的 lag，使用拋物線插值來精細化 lag 值
    // 以獲得更高的精度（亞樣本精度）
    let refinedLag = foundLag;

    if (foundLag > 0 && foundLag < FRAME_LENGTH - 1) {
      // 使用拋物線公式進行細化：
      // f(x) = a*x^2 + b*x + c，通過三點 (lag-1, y1), (lag, y0), (lag+1, y2)
      // 最小值在 x = -b/(2a)
      const y1 = cmndf[foundLag - 1];
      const y0 = cmndf[foundLag];
      const y2 = cmndf[foundLag + 1];

      // 拋物線係數
      const a = (y1 - 2 * y0 + y2) / 2;
      const b = (y2 - y1) / 2;

      // 如果 a 不為零，計算最小值位置的精確 lag
      if (Math.abs(a) > 1e-10) {
        // 最小值位置：lag + (-b / 2a)
        const lagRefinement = -b / (2 * a);
        refinedLag = foundLag + lagRefinement;
      }
    }

    // ========== 計算最終結果 ==========
    // 從 lag 轉換為頻率：frequency = sampleRate / lag
    // lag 單位為樣本，一個週期等於 lag 個樣本
    let frequency = refinedLag > 0 ? sampleRate / refinedLag : 0;

    // 檢查頻率是否在合理範圍內，防止極端值
    const maxReasonableFrequency = MAX_FREQUENCY * 10;  // 允許範圍的 10 倍
    const minReasonableFrequency = MIN_FREQUENCY / 10;   // 允許範圍的 1/10
    if (frequency > maxReasonableFrequency || frequency < minReasonableFrequency) {
      return { frequency: 0, confidence: 0 };
    }

    // 置信度計算：基於 CMNDF 的最小值（使用插值以匹配精細化的 lag）
    // CMNDF 越低，置信度越高（CMNDF 接近 0 表示找到明確的週期）
    // 使用拋物線插值計算精細化 lag 位置的 CMNDF 值，確保置信度與精細化頻率一致
    let interpolatedCmndf = 1;
    const lagIndex = Math.floor(refinedLag);
    if (lagIndex > 0 && lagIndex < FRAME_LENGTH - 1) {
      // 使用與 lag 相同的拋物線插值方法計算 CMNDF
      const y1 = cmndf[lagIndex - 1];
      const y0 = cmndf[lagIndex];
      const y2 = cmndf[lagIndex + 1];
      const a = (y1 - 2 * y0 + y2) / 2;
      const b = (y2 - y1) / 2;
      const c = y0;
      const lagOffset = refinedLag - lagIndex;
      interpolatedCmndf = a * lagOffset * lagOffset + b * lagOffset + c;
    } else if (lagIndex >= 0 && lagIndex < FRAME_LENGTH) {
      // 邊界情況：直接使用最接近的 CMNDF 值
      interpolatedCmndf = cmndf[lagIndex];
    }
    const baseConfidence = Math.max(0, 1 - Math.max(interpolatedCmndf, 0));

    // 應用頻率範圍過濾：如果頻率超出 80-1000 Hz 範圍，降低置信度
    let confidence = baseConfidence;
    if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
      confidence *= 0.5;  // 降低信心，但保留信息以便調試
    }

    // 防止置信度為負或超過 1
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      frequency: frequency,
      confidence: confidence
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
