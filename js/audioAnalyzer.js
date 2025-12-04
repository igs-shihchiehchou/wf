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
    try {
      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);

      // ========== 參數設置 ==========
      // 100ms 窗口大小（0.1 * sampleRate 個樣本）
      const windowSize = Math.floor(0.1 * sampleRate);

      // 50ms hop 大小（50% 重疊），導致每個窗口之間間隔 50ms
      const hopSize = Math.floor(0.05 * sampleRate);

      // 計算總 hop 數（整個音訊將被分成多個 hop）
      const totalHops = Math.ceil((channelData.length - windowSize) / hopSize) + 1;

      // ========== 邊界檢查 ==========
      if (windowSize <= 0 || hopSize <= 0 || totalHops <= 0) {
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

      // ========== 初始化音高曲線陣列 ==========
      // 存儲所有窗口的音高檢測結果：{ time, frequency, confidence }
      const pitchCurve = [];

      // ========== 滑動窗口音高分析 ==========
      // 使用 50% 重疊的滑動窗口，對每個窗口執行 YIN 算法
      //
      // 窗口示例（windowSize=4410, hopSize=2205, 44.1kHz）：
      // Window 1: samples [0:4410]         → time = 0.0s
      // Window 2: samples [2205:6615]      → time = 0.05s
      // Window 3: samples [4410:8820]      → time = 0.1s
      // ...

      for (let hopIndex = 0; hopIndex < totalHops; hopIndex++) {
        // 計算當前窗口在樣本數組中的起始位置
        const windowStart = hopIndex * hopSize;
        const windowEnd = Math.min(windowStart + windowSize, channelData.length);

        // 邊界檢查：如果剩餘樣本不足以形成有效窗口，停止處理
        if (windowEnd - windowStart < windowSize / 2) {
          break;
        }

        // 提取當前窗口的音訊樣本
        const windowSamples = channelData.slice(windowStart, windowEnd);

        // 使用 YIN 算法檢測當前窗口的音高
        const pitchResult = this.detectPitchYIN(windowSamples, sampleRate);

        // 計算當前窗口的時間位置（秒）
        // 時間 = (hopIndex * hopSize) / sampleRate
        const time = (hopIndex * hopSize) / sampleRate;

        // 添加檢測結果到音高曲線
        pitchCurve.push({
          time: time,
          frequency: pitchResult.frequency,
          confidence: pitchResult.confidence
        });

        // ========== 進度報告 ==========
        // 計算已完成的進度百分比 (0-1)
        const progress = (hopIndex + 1) / totalHops;
        onProgress(progress);

        // ========== UI 響應性保證 ==========
        // 使用 setTimeout(0) 將控制權交回給瀏覽器事件循環
        // 這允許瀏覽器在長時間分析期間保持 UI 響應性
        // 每個 10 個窗口讓出一次控制權（節省許多微任務開銷）
        if (hopIndex % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // ========== 音高統計計算 ==========
      // 過濾出高置信度的音高點（置信度 > 0.5）用於統計
      const validPitches = pitchCurve.filter(p => p.confidence > 0.5);

      // 初始化統計變量
      let averagePitch = 0;
      let minPitch = Infinity;
      let maxPitch = -Infinity;
      let isPitched = false;

      // 計算平均音高和音高範圍
      if (validPitches.length > 0) {
        // 計算有效音高的平均值
        const pitchSum = validPitches.reduce((sum, p) => sum + p.frequency, 0);
        averagePitch = pitchSum / validPitches.length;

        // 找出音高的最小值和最大值
        minPitch = Math.min(...validPitches.map(p => p.frequency));
        maxPitch = Math.max(...validPitches.map(p => p.frequency));

        // 判斷是否為有音高的聲音
        // 如果有效音高點數佔總點數的 30% 以上，則認為是有音高的聲音
        const pitchedRatio = validPitches.length / pitchCurve.length;
        isPitched = pitchedRatio >= 0.3;
      }

      // ========== 生成頻譜圖 (Task 4.1) ==========
      // 使用 STFT 計算時頻表示，供頻譜圖可視化使用
      const spectrogram = await this.generateSpectrogram(audioBuffer, (progress) => {
        // 進度回調被集成到上層 analyzePitch 的進度報告中
        // 不需要額外的進度更新
      });

      // 返回分析結果
      return {
        pitchCurve: pitchCurve,          // 完整的音高曲線陣列 [{time, frequency, confidence}, ...]
        spectrogram: spectrogram,        // 頻譜圖數據 (由 Task 4.1 生成)
        averagePitch: averagePitch,      // 平均音高 (Hz)
        pitchRange: {
          min: minPitch === Infinity ? 0 : minPitch,  // 最低音高 (Hz)
          max: maxPitch === -Infinity ? 0 : maxPitch  // 最高音高 (Hz)
        },
        isPitched: isPitched             // 是否為有音高的聲音 (true/false)
      };
    } catch (error) {
      console.error('音高分析出現錯誤:', error);
      throw error;
    }
  }

  /**
   * 生成頻譜圖（STFT 短時傅立葉變換）
   *
   * 使用滑動窗口技術計算時頻表示（spectrogram）。頻譜圖是一個 2D 熱力圖，
   * 表示音訊在不同時間點的頻率分布。用於可視化音訊的時頻特性。
   *
   * 算法步驟：
   * 1. 設置 STFT 參數：FFT 大小 512，hop 大小 128（25% 重疊）
   * 2. 使用漢寧窗應用於每個窗口以減少頻譜洩漏
   * 3. 對每個窗口計算 FFT 頻譜
   * 4. 轉換為分貝 (dB) 標度：20 * log10(magnitude)
   * 5. 正規化為 0-255 強度值供可視化
   * 6. 構建 2D 陣列：data[timeIndex][frequencyBin] = intensity (0-255)
   *
   * 返回結構：
   * {
   *   data: Float32Array[][]  // 2D 強度矩陣 [時間][頻率]
   *   width: number           // 時間幀數（列數）
   *   height: number          // 頻率 bin 數（行數）
   *   timeStep: number        // 時間解析度（秒/幀）
   *   frequencyRange: [0, nyquist]  // 頻率範圍 (Hz)
   * }
   *
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Function} [onProgress] - 進度回調函數，簽名: (progress: 0-1) => void
   * @returns {Promise<SpectrogramData>} 頻譜圖數據物件
   *
   * @example
   * const spectrogram = await audioAnalyzer.generateSpectrogram(audioBuffer, (progress) => {
   *   console.log(`Spectrogram generation: ${(progress * 100).toFixed(1)}%`);
   * });
   * // spectrogram.data[10][50] = 128  // 第 10 幀，第 50 個頻率 bin 的強度
   *
   * @private
   */
  async generateSpectrogram(audioBuffer, onProgress = () => {}) {
    try {
      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);

      // ========== STFT 參數設置 ==========
      // FFT 大小：512 個樣本
      // 更小的 FFT 提供更好的時間解析度，但頻率解析度較差
      const FFT_SIZE = 512;

      // Hop 大小：128 個樣本（FFT 大小的 25%）
      // 更小的 hop 提供更密集的時頻表示，但需要更多計算
      const HOP_SIZE = 128;

      // ========== 計算時頻維度 ==========
      // 計算需要多少幀來覆蓋整個音訊
      const totalFrames = Math.ceil((channelData.length - FFT_SIZE) / HOP_SIZE) + 1;

      // 檢查是否有足夠的音訊樣本進行分析
      if (totalFrames <= 0 || FFT_SIZE > channelData.length) {
        onProgress(1);
        return {
          data: [],
          width: 0,
          height: 0,
          timeStep: 0,
          frequencyRange: [0, sampleRate / 2]
        };
      }

      // 初始化 2D 頻譜圖數據陣列
      // data[timeIndex] 是一個 Float32Array，包含該時間幀的所有頻率 bin
      const data = [];

      // 計算頻率解析度
      const nyquistFrequency = sampleRate / 2;
      const frequencyPerBin = nyquistFrequency / FFT_SIZE;

      // 計算時間解析度（每幀代表的時間長度）
      const timeStep = HOP_SIZE / sampleRate;

      // ========== 初始化離線音訊上下文用於 FFT ==========
      // 建立一個離線上下文用於 FFT 計算（比建立多個上下文更高效）
      const offlineContext = new OfflineAudioContext(
        1,                          // 單聲道
        FFT_SIZE,                   // 長度為 FFT_SIZE 樣本
        sampleRate                  // 使用原始採樣率
      );

      const analyser = offlineContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;  // 不使用時域平滑

      // ========== 滑動窗口 STFT 分析 ==========
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        // 計算當前窗口的起始和結束位置
        const windowStart = frameIndex * HOP_SIZE;
        const windowEnd = Math.min(windowStart + FFT_SIZE, channelData.length);

        // 邊界檢查：確保有足夠的樣本形成完整窗口
        if (windowEnd - windowStart < FFT_SIZE) {
          break;
        }

        // 提取當前窗口的音訊樣本
        const windowSamples = channelData.slice(windowStart, windowEnd);

        // ========== 應用漢寧窗函數 ==========
        // 窗函數用於減少頻譜洩漏，改善 FFT 分析質量
        const windowedSamples = new Float32Array(FFT_SIZE);
        for (let i = 0; i < FFT_SIZE; i++) {
          // Hann window: 0.5 * (1 - cos(2π * i / (N-1)))
          // 在窗口邊界處衰減到零，減少頻譜洩漏
          const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
          windowedSamples[i] = windowSamples[i] * windowValue;
        }

        // ========== 計算 FFT 頻譜 ==========
        // 為每個幀建立一個音訊緩衝區
        const analyserBuffer = offlineContext.createBuffer(1, FFT_SIZE, sampleRate);
        analyserBuffer.getChannelData(0).set(windowedSamples);

        // 建立音訊源並連接到分析器
        const source = offlineContext.createBufferSource();
        source.buffer = analyserBuffer;
        source.connect(analyser);
        analyser.connect(offlineContext.destination);

        // 啟動音訊源並渲染
        source.start(0);
        await offlineContext.startRendering();

        // ========== 提取頻率數據 ==========
        // 創建陣列存儲頻率域的數據（分貝值）
        const rawSpectrum = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(rawSpectrum);

        // 檢查是否有有效數據（備選方案：使用 DFT）
        const hasValidData = rawSpectrum.some(val => val > -Infinity && !isNaN(val));

        if (!hasValidData) {
          // 備用方案：使用簡化的 DFT 計算頻譜
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

        // ========== 轉換為強度值 (0-255) ==========
        // 將分貝值正規化為可視化的 0-255 強度值
        const spectrum = new Float32Array(analyser.frequencyBinCount);

        // 定義 dB 範圍用於正規化
        // -100 dB 映射到 0（黑色），0 dB 映射到 255（白色）
        const DB_MIN = -100;
        const DB_MAX = 0;
        const INTENSITY_MIN = 0;
        const INTENSITY_MAX = 255;

        for (let i = 0; i < rawSpectrum.length; i++) {
          // 處理 -Infinity 值（無效頻率），設為最小值
          const dbValue = Math.max(rawSpectrum[i], DB_MIN);

          // 正規化到 0-1 範圍
          const normalized = (dbValue - DB_MIN) / (DB_MAX - DB_MIN);

          // 縮放到 0-255 強度範圍
          spectrum[i] = normalized * INTENSITY_MAX;
        }

        // 添加該幀的頻譜到 2D 陣列
        data.push(spectrum);

        // ========== 進度報告 ==========
        const progress = (frameIndex + 1) / totalFrames;
        onProgress(progress);

        // ========== UI 響應性保證 ==========
        // 每 10 幀讓出一次控制權，保持 UI 響應性
        if (frameIndex % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // ========== 構建返回結果 ==========
      return {
        data: data,                           // 2D 強度矩陣 [時間幀][頻率 bin]
        width: data.length,                   // 時間幀數（列數）
        height: data.length > 0 ? data[0].length : 0,  // 頻率 bin 數（行數）
        timeStep: timeStep,                   // 時間解析度（秒/幀）= HOP_SIZE / sampleRate
        frequencyRange: [0, nyquistFrequency] // 頻率範圍 [0, Nyquist]
      };
    } catch (error) {
      console.error('頻譜圖生成出現錯誤:', error);
      // 返回空頻譜圖而不是拋出錯誤，允許分析繼續進行
      return {
        data: [],
        width: 0,
        height: 0,
        timeStep: 0,
        frequencyRange: [0, audioBuffer.sampleRate / 2]
      };
    }
  }
}

/**
 * 頻譜圖畫布渲染器 (Spectrogram Canvas Renderer)
 *
 * 將頻譜圖數據可視化為熱力圖，支持對數頻率軸標籤和線性時間軸標籤。
 * 使用像素級渲染實現高效的大型頻譜圖繪製。
 *
 * 使用方法：
 * ```javascript
 * const renderer = new SpectrogramRenderer(canvas);
 * renderer.render(spectrogramData, { canvasWidth: 300 });
 * ```
 */
class SpectrogramRenderer {
  /**
   * 建立頻譜圖渲染器
   * @param {HTMLCanvasElement} [canvas] - 目標 canvas 元素（如未提供會建立新的）
   */
  constructor(canvas) {
    // 如果未提供 canvas，建立新的
    if (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    } else {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }

    // 渲染參數
    this.spectrogramData = null;
    this.canvasWidth = 300;       // 預設寬度（像素）
    this.canvasHeight = 256;       // 預設高度（像素）
    this.marginLeft = 50;          // 左邊距（用於頻率軸標籤）
    this.marginBottom = 40;        // 下邊距（用於時間軸標籤）
    this.marginTop = 20;           // 上邊距
    this.marginRight = 10;         // 右邊距
  }

  /**
   * 強度值轉換為熱力圖顏色 (RGBA)
   *
   * 熱力圖配色：黑色 → 藍色 → 綠色 → 黃色 → 紅色
   * - 0 (黑色): rgb(0, 0, 0)
   * - 64 (藍色): rgb(0, 0, 255)
   * - 128 (綠色): rgb(0, 255, 0)
   * - 192 (黃色): rgb(255, 255, 0)
   * - 255 (紅色): rgb(255, 0, 0)
   *
   * @param {number} intensity - 強度值（0-255）
   * @returns {string} CSS RGBA 顏色字符串
   * @private
   */
  intensityToColor(intensity) {
    // 確保強度值在 0-255 範圍內
    intensity = Math.max(0, Math.min(255, intensity));

    let r = 0, g = 0, b = 0;

    if (intensity <= 64) {
      // 黑色 (0) → 藍色 (64)
      // [0, 0, 0] → [0, 0, 255]
      const ratio = intensity / 64;
      b = Math.round(255 * ratio);
    } else if (intensity <= 128) {
      // 藍色 (64) → 綠色 (128)
      // [0, 0, 255] → [0, 255, 0]
      const ratio = (intensity - 64) / 64;
      b = Math.round(255 * (1 - ratio));
      g = Math.round(255 * ratio);
    } else if (intensity <= 192) {
      // 綠色 (128) → 黃色 (192)
      // [0, 255, 0] → [255, 255, 0]
      const ratio = (intensity - 128) / 64;
      g = 255;
      r = Math.round(255 * ratio);
    } else {
      // 黃色 (192) → 紅色 (255)
      // [255, 255, 0] → [255, 0, 0]
      const ratio = (intensity - 192) / 63;
      r = 255;
      g = Math.round(255 * (1 - ratio));
    }

    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * 計算對數頻率軸上的像素位置
   *
   * 使用對數刻度使低頻更明顯（更易於人耳感知）
   * 公式：logFreq = log(frequency) / log(nyquistFrequency)
   *
   * @param {number} frequency - 頻率（Hz）
   * @param {number} maxFrequency - 最大頻率（Nyquist 頻率）
   * @param {number} width - 軸寬度（像素）
   * @returns {number} 像素位置（0-width）
   * @private
   */
  frequencyToLogPixel(frequency, maxFrequency, width) {
    if (frequency <= 0) return 0;

    // 對數刻度：log10(frequency) / log10(maxFrequency)
    const logFreq = Math.log10(frequency) / Math.log10(maxFrequency);
    return Math.max(0, Math.min(width, logFreq * width));
  }

  /**
   * 渲染頻譜圖到 canvas
   *
   * 渲染步驟：
   * 1. 配置 canvas 大小
   * 2. 繪製頻譜圖像素數據
   * 3. 繪製頻率軸（對數刻度）
   * 4. 繪製時間軸
   * 5. 繪製軸標籤
   *
   * @param {Object} spectrogramData - 頻譜圖數據（來自 generateSpectrogram）
   *                                   格式：{ data: Float32Array[][], width, height, timeStep, frequencyRange }
   * @param {Object} [options] - 選項物件
   * @param {number} [options.canvasWidth=300] - Canvas 寬度（像素）
   * @param {number} [options.canvasHeight=256] - Canvas 高度（像素）
   * @public
   */
  render(spectrogramData, options = {}) {
    // 設置參數
    this.spectrogramData = spectrogramData;
    this.canvasWidth = options.canvasWidth || 300;
    this.canvasHeight = options.canvasHeight || 256;

    // 邊界檢查
    if (!spectrogramData || !spectrogramData.data || spectrogramData.data.length === 0) {
      console.warn('SpectrogramRenderer: 無效的頻譜圖數據');
      return;
    }

    const { data, width: specWidth, height: specHeight, timeStep, frequencyRange } = spectrogramData;

    // 配置 canvas 實際大小（考慮邊距）
    const totalWidth = this.canvasWidth + this.marginLeft + this.marginRight;
    const totalHeight = this.canvasHeight + this.marginTop + this.marginBottom;
    this.canvas.width = totalWidth;
    this.canvas.height = totalHeight;

    // 設置高 DPI 支援（確保清晰渲染）
    const dpiScale = window.devicePixelRatio || 1;
    if (dpiScale > 1) {
      this.canvas.width = totalWidth * dpiScale;
      this.canvas.height = totalHeight * dpiScale;
      this.ctx.scale(dpiScale, dpiScale);
    }

    // 清空 canvas（白色背景）
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, totalWidth, totalHeight);

    // ========== 步驟 1: 繪製頻譜圖像素 ==========
    this.renderSpectrogramPixels(data, specWidth, specHeight);

    // ========== 步驟 2: 繪製軸線 ==========
    this.renderAxes();

    // ========== 步驟 3: 繪製頻率軸標籤（對數刻度） ==========
    this.renderFrequencyAxis(frequencyRange[1]);

    // ========== 步驟 4: 繪製時間軸標籤 ==========
    this.renderTimeAxis(specWidth, timeStep);
  }

  /**
   * 繪製頻譜圖像素到 canvas
   *
   * 使用 ImageData API 進行高效的像素級渲染：
   * 1. 建立 ImageData 物件以存儲像素數據
   * 2. 遍歷頻譜圖的每個像素
   * 3. 轉換強度值為 RGBA 顏色
   * 4. 將 ImageData 寫回 canvas
   *
   * @param {Float32Array[]} data - 2D 頻譜圖強度數據 [時間][頻率]
   * @param {number} specWidth - 頻譜圖寬度（時間幀數）
   * @param {number} specHeight - 頻譜圖高度（頻率 bin 數）
   * @private
   */
  renderSpectrogramPixels(data, specWidth, specHeight) {
    // 計算縮放比例（頻譜圖數據到 canvas 像素的映射）
    const scaleX = this.canvasWidth / specWidth;
    const scaleY = this.canvasHeight / specHeight;

    // 建立 ImageData 物件（RGBA 格式）
    const imageData = this.ctx.createImageData(this.canvasWidth, this.canvasHeight);
    const pixelData = imageData.data;

    // ========== 高效的像素填充 ==========
    // 遍歷 canvas 的每個像素
    for (let canvasY = 0; canvasY < this.canvasHeight; canvasY++) {
      for (let canvasX = 0; canvasX < this.canvasWidth; canvasX++) {
        // 將 canvas 像素映射回頻譜圖數據坐標
        // 注意：頻譜圖 Y 軸倒轉（0 = 高頻，height = 低頻）
        const specX = Math.floor(canvasX / scaleX);
        const specY = Math.floor(canvasY / scaleY);

        // 邊界檢查
        const x = Math.min(specX, specWidth - 1);
        const y = Math.min(specY, specHeight - 1);

        // 取得強度值
        let intensity = 0;
        if (data[x] && data[x][specHeight - 1 - y] !== undefined) {
          intensity = data[x][specHeight - 1 - y];
        }

        // 將強度值轉換為 RGBA
        const color = this.intensityToColor(intensity);
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const r = parseInt(match[1]);
          const g = parseInt(match[2]);
          const b = parseInt(match[3]);

          // 寫入像素數據（RGBA）
          const pixelIndex = (canvasY * this.canvasWidth + canvasX) * 4;
          pixelData[pixelIndex] = r;        // R
          pixelData[pixelIndex + 1] = g;    // G
          pixelData[pixelIndex + 2] = b;    // B
          pixelData[pixelIndex + 3] = 255;  // A（完全不透明）
        }
      }
    }

    // 將 ImageData 寫回 canvas
    this.ctx.putImageData(imageData, this.marginLeft, this.marginTop);
  }

  /**
   * 繪製坐標軸線
   * @private
   */
  renderAxes() {
    const x = this.marginLeft;
    const y = this.marginTop;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;

    // Y 軸（頻率軸）
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x, y + h);
    this.ctx.stroke();

    // X 軸（時間軸）
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + h);
    this.ctx.lineTo(x + w, y + h);
    this.ctx.stroke();
  }

  /**
   * 繪製頻率軸標籤（對數刻度）
   *
   * 標籤位置：100Hz, 500Hz, 1kHz, 5kHz, 10kHz, 20kHz
   * 使用對數刻度使低頻更明顯，與人耳感知相符。
   *
   * @param {number} maxFrequency - 最大頻率（Nyquist 頻率）
   * @private
   */
  renderFrequencyAxis(maxFrequency) {
    // 定義標籤頻率
    const frequencyLabels = [100, 500, 1000, 5000, 10000, 20000];

    // 篩選超出範圍的標籤
    const validLabels = frequencyLabels.filter(f => f <= maxFrequency);

    this.ctx.fillStyle = '#333';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    // 繪製每個標籤
    for (const freq of validLabels) {
      // 計算在對數刻度上的像素位置
      const pixelY = this.frequencyToLogPixel(freq, maxFrequency, this.canvasHeight);
      const yPos = this.marginTop + this.canvasHeight - pixelY;

      // 繪製刻度線
      this.ctx.strokeStyle = '#ccc';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(this.marginLeft - 5, yPos);
      this.ctx.lineTo(this.marginLeft, yPos);
      this.ctx.stroke();

      // 繪製文字標籤
      const label = freq >= 1000 ? `${(freq / 1000).toFixed(0)}k` : `${freq}`;
      this.ctx.fillText(label, this.marginLeft - 10, yPos);
    }

    // 繪製軸標籤 "頻率 (Hz)"
    this.ctx.save();
    this.ctx.translate(15, this.marginTop + this.canvasHeight / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#333';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.fillText('頻率 (Hz)', 0, 0);
    this.ctx.restore();
  }

  /**
   * 繪製時間軸標籤
   *
   * 標籤以固定時間間隔顯示（自動計算合適的間隔）
   * 間隔選擇：0.1s, 0.5s, 1s, 2s, 5s, 10s 等
   *
   * @param {number} specWidth - 頻譜圖寬度（時間幀數）
   * @param {number} timeStep - 時間解析度（秒/幀）
   * @private
   */
  renderTimeAxis(specWidth, timeStep) {
    // 計算總時長（秒）
    const totalTime = specWidth * timeStep;

    // 自動選擇合適的時間間隔標籤
    let timeInterval = 0.1;  // 預設 0.1 秒
    if (totalTime > 20) timeInterval = 5;
    else if (totalTime > 10) timeInterval = 2;
    else if (totalTime > 5) timeInterval = 1;
    else if (totalTime > 2) timeInterval = 0.5;

    // 計算應該顯示多少個標籤
    const numLabels = Math.ceil(totalTime / timeInterval);

    this.ctx.fillStyle = '#333';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    // 繪製時間標籤
    for (let i = 0; i <= numLabels; i++) {
      const time = i * timeInterval;

      // 轉換時間為幀索引
      const frameIndex = time / timeStep;

      // 轉換幀索引為 canvas 像素位置
      const pixelX = (frameIndex / specWidth) * this.canvasWidth;
      const xPos = this.marginLeft + pixelX;

      // 邊界檢查
      if (xPos < this.marginLeft || xPos > this.marginLeft + this.canvasWidth) {
        continue;
      }

      // 繪製刻度線
      this.ctx.strokeStyle = '#ccc';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(xPos, this.marginTop + this.canvasHeight);
      this.ctx.lineTo(xPos, this.marginTop + this.canvasHeight + 5);
      this.ctx.stroke();

      // 繪製文字標籤
      const label = time.toFixed(1) + 's';
      this.ctx.fillText(label, xPos, this.marginTop + this.canvasHeight + 10);
    }

    // 繪製軸標籤 "時間"
    this.ctx.fillStyle = '#333';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('時間 (秒)', this.marginLeft + this.canvasWidth / 2, this.marginTop + this.canvasHeight + 30);
  }

  /**
   * 為頻譜圖畫布添加交互功能 (Task 4.3)
   *
   * 設置滑鼠懸停事件監聽器，顯示時間、頻率和強度提示框。
   * 提示框跟隨滑鼠移動，顯示準確的時間和頻率值。
   *
   * 特性：
   * - 高效的事件處理（節流以防止過度重繪）
   * - 智能的提示框定位（保持在畫布內）
   * - 對數頻率刻度轉換
   * - 當滑鼠離開時自動隱藏提示框
   *
   * @public
   */
  addInteractivity() {
    // 檢查是否已初始化交互功能（防止重複添加事件監聽器）
    if (this.isInteractiveEnabled) {
      return;
    }
    this.isInteractiveEnabled = true;

    // 檢查 canvas 有效性
    if (!this.canvas || !this.spectrogramData) {
      console.warn('SpectrogramRenderer: 無法初始化交互功能，canvas 或頻譜圖數據無效');
      return;
    }

    // 存儲頻譜圖數據引用
    const spectrogramData = this.spectrogramData;
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;
    const marginLeft = this.marginLeft;
    const marginTop = this.marginTop;

    // 創建提示框 DOM 元素
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      display: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    document.body.appendChild(tooltip);

    // 儲存 tooltip 引用，以便清理
    this.tooltip = tooltip;

    // 節流計時器（防止過度頻繁的更新）
    let throttleTimer = null;
    let lastX = -1;
    let lastY = -1;

    /**
     * 滑鼠移動事件處理器
     * 計算游標位置對應的時間和頻率，更新提示框
     */
    const onMouseMove = (event) => {
      // 清除前一個節流計時器
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }

      // 使用節流延遲（每 16ms 更新一次，約 60fps）
      throttleTimer = setTimeout(() => {
        // 獲取 canvas 在頁面中的位置
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // 檢查游標是否在 spectrogram 繪製區域內
        const isInCanvas = (
          x >= marginLeft &&
          x <= marginLeft + canvasWidth &&
          y >= marginTop &&
          y <= marginTop + canvasHeight
        );

        if (isInCanvas) {
          // 更新提示框並顯示
          this.updateTooltip(x, y, spectrogramData);
          // 光滑地定位提示框到游標位置附近
          this.positionTooltip(tooltip, event.clientX, event.clientY, rect);
        } else {
          // 游標離開 spectrogram 區域，隱藏提示框
          this.hideTooltip();
        }
      }, 16);  // 節流間隔 16ms (約 60fps)
    };

    /**
     * 滑鼠離開事件處理器
     * 隱藏提示框
     */
    const onMouseLeave = () => {
      this.hideTooltip();
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };

    // 添加事件監聽器
    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mouseleave', onMouseLeave);

    // 保存事件監聽器引用，以便清理
    this.onMouseMove = onMouseMove;
    this.onMouseLeave = onMouseLeave;
  }

  /**
   * 更新提示框內容
   *
   * 計算游標位置對應的時間和頻率值，從頻譜圖數據中查詢強度值。
   * 支持對數頻率刻度轉換。
   *
   * @param {number} pixelX - canvas 上的 X 像素座標
   * @param {number} pixelY - canvas 上的 Y 像素座標
   * @param {Object} spectrogramData - 頻譜圖數據物件
   * @private
   */
  updateTooltip(pixelX, pixelY, spectrogramData) {
    const { data, width: specWidth, height: specHeight, timeStep, frequencyRange } = spectrogramData;

    // 轉換像素座標到相對於 spectrogram 繪製區域的座標
    const relX = pixelX - this.marginLeft;
    const relY = pixelY - this.marginTop;

    // 計算縮放比例（canvas 像素到頻譜圖數據的映射）
    const scaleX = this.canvasWidth / specWidth;
    const scaleY = this.canvasHeight / specHeight;

    // 轉換像素座標到頻譜圖數據索引
    // 注意：Y 軸倒轉（canvas 上方 = 高頻，下方 = 低頻）
    const timeIndex = Math.floor(relX / scaleX);
    const freqIndexFromTop = Math.floor(relY / scaleY);
    const freqIndex = specHeight - 1 - freqIndexFromTop;  // 反轉 Y 軸

    // 邊界檢查
    const safeTimeIndex = Math.max(0, Math.min(timeIndex, specWidth - 1));
    const safeFreqIndex = Math.max(0, Math.min(freqIndex, specHeight - 1));

    // 計算時間值（秒）
    const time = safeTimeIndex * timeStep;

    // 計算頻率值（Hz）
    // 使用線性頻率映射（0-Nyquist）
    const nyquistFrequency = frequencyRange[1];
    const frequencyPerBin = nyquistFrequency / specHeight;
    const frequency = safeFreqIndex * frequencyPerBin;

    // 獲取強度值（0-255）
    let intensity = 0;
    if (data[safeTimeIndex] && data[safeTimeIndex][safeFreqIndex] !== undefined) {
      intensity = Math.round(data[safeTimeIndex][safeFreqIndex]);
    }

    // 顯示提示框
    this.showTooltip(time, frequency, intensity);
  }

  /**
   * 顯示提示框，更新內容
   *
   * 格式化時間、頻率和強度值，並設置提示框的可見性。
   * 時間格式：「時間: X.XXs」
   * 頻率格式：「頻率: XXXX Hz」 或 「X.X kHz」
   * 強度格式：「強度: XXX/255」
   *
   * @param {number} time - 時間值（秒）
   * @param {number} frequency - 頻率值（Hz）
   * @param {number} intensity - 強度值（0-255）
   * @private
   */
  showTooltip(time, frequency, intensity) {
    if (!this.tooltip) {
      return;
    }

    // 格式化時間（保留 2-3 位小數）
    const timeStr = time.toFixed(2);

    // 格式化頻率（如果 >= 1000 Hz，使用 kHz 單位）
    let frequencyStr;
    if (frequency >= 1000) {
      frequencyStr = (frequency / 1000).toFixed(1) + ' kHz';
    } else {
      frequencyStr = Math.round(frequency) + ' Hz';
    }

    // 格式化強度（0-255 範圍）
    const intensityStr = intensity.toString().padStart(3, '0');

    // 更新提示框內容（使用繁體中文標籤）
    this.tooltip.innerHTML = `
      <div>時間: ${timeStr}s</div>
      <div>頻率: ${frequencyStr}</div>
      <div>強度: ${intensityStr}/255</div>
    `;

    // 顯示提示框
    this.tooltip.style.display = 'block';
  }

  /**
   * 隱藏提示框
   *
   * 設置 display: none，同時保留 DOM 元素以供再次使用。
   *
   * @private
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  /**
   * 定位提示框到游標位置附近
   *
   * 智能定位提示框，確保它保持在視口內，避免超出邊界。
   * 提示框首選位置在游標右下方，如果空間不足則自動調整。
   *
   * @param {HTMLElement} tooltip - 提示框 DOM 元素
   * @param {number} clientX - 游標的視口 X 座標
   * @param {number} clientY - 游標的視口 Y 座標
   * @param {DOMRect} canvasRect - canvas 的邊界矩形（getBoundingClientRect 結果）
   * @private
   */
  positionTooltip(tooltip, clientX, clientY, canvasRect) {
    // 初始位置：游標右下方 10 像素
    let left = clientX + 10;
    let top = clientY + 10;

    // 獲取提示框尺寸
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;

    // 視口邊界檢查
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 如果超出右邊界，移到游標左側
    if (left + tooltipWidth > viewportWidth - 10) {
      left = clientX - tooltipWidth - 10;
    }

    // 如果超出下邊界，移到游標上方
    if (top + tooltipHeight > viewportHeight - 10) {
      top = clientY - tooltipHeight - 10;
    }

    // 應用位置
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  /**
   * 清理交互功能（移除事件監聽器和 DOM 元素）
   *
   * 當不再需要交互功能時調用此方法以釋放資源。
   *
   * @public
   */
  removeInteractivity() {
    // 移除事件監聽器
    if (this.onMouseMove) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
    }
    if (this.onMouseLeave) {
      this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    }

    // 移除 DOM 元素
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }

    // 清除引用
    this.isInteractiveEnabled = false;
    this.tooltip = null;
    this.onMouseMove = null;
    this.onMouseLeave = null;
  }
}

// 建立全域實例
// 使用 audioProcessor 的 audioContext（已在 audioProcessor.js 中初始化）
window.audioAnalyzer = new AudioAnalyzer(audioProcessor.audioContext);
window.SpectrogramRenderer = SpectrogramRenderer;
