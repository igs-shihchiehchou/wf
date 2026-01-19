/**
 * 音訊處理模組
 */

class AudioProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  /**
   * 從檔案載入音訊
   */
  async loadAudioFromFile(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('載入音訊失敗:', error);
      throw new Error('無法載入音訊檔案，請確認格式是否正確');
    }
  }

  /**
   * 裁切音訊
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} startTime - 開始時間（秒）
   * @param {number} endTime - 結束時間（秒）
   */
  cropAudio(audioBuffer, startTime, endTime) {
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const length = endSample - startSample;

    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      length,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        newData[i] = oldData[startSample + i];
      }
    }

    return newBuffer;
  }

  /**
   * 調整音量
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} gain - 音量倍數（0.0 - 2.0）
   */
  adjustVolume(audioBuffer, gain) {
    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      for (let i = 0; i < audioBuffer.length; i++) {
        newData[i] = oldData[i] * gain;
      }
    }

    return newBuffer;
  }

  /**
   * 偵測音訊是否會發生削波
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} gain - 音量倍數
   * @returns {Object} { clipped: boolean, peakLevel: number }
   */
  detectClipping(audioBuffer, gain) {
    let maxSample = 0;

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const amplified = Math.abs(data[i] * gain);
        if (amplified > maxSample) {
          maxSample = amplified;
        }
      }
    }

    return {
      clipped: maxSample > 1.0,
      peakLevel: maxSample
    };
  }

  /**
   * 應用淡入效果
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} duration - 淡入持續時間（秒）
   */
  applyFadeIn(audioBuffer, duration) {
    const sampleRate = audioBuffer.sampleRate;
    const fadeSamples = Math.floor(duration * sampleRate);

    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      for (let i = 0; i < audioBuffer.length; i++) {
        if (i < fadeSamples) {
          // 線性淡入
          newData[i] = oldData[i] * (i / fadeSamples);
        } else {
          newData[i] = oldData[i];
        }
      }
    }

    return newBuffer;
  }

  /**
   * 應用淡出效果
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} duration - 淡出持續時間（秒）
   */
  applyFadeOut(audioBuffer, duration) {
    const sampleRate = audioBuffer.sampleRate;
    const fadeSamples = Math.floor(duration * sampleRate);
    const startFade = audioBuffer.length - fadeSamples;

    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      for (let i = 0; i < audioBuffer.length; i++) {
        if (i > startFade) {
          // 線性淡出
          const fadeProgress = (audioBuffer.length - i) / fadeSamples;
          newData[i] = oldData[i] * fadeProgress;
        } else {
          newData[i] = oldData[i];
        }
      }
    }

    return newBuffer;
  }

  /**
   * 調整音高（保持時長不變）
   * 使用 Phase Vocoder 算法：先時間拉伸，再重新採樣
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} semitones - 半音數（-12 到 +12）
   */
  changePitch(audioBuffer, semitones) {
    if (semitones === 0) return audioBuffer;

    // 音高變換的比率：每個半音是 2^(1/12)
    const pitchRatio = Math.pow(2, semitones / 12);

    // Phase Vocoder 方法：
    // 1. 先進行時間拉伸（改變時長但不改變音高）
    // 2. 再重新採樣（改變音高和時長）
    // 結果：音高改變，但時長恢復原本

    // 步驟 1: 時間拉伸 - 拉伸到 pitchRatio 倍長度
    const stretchedBuffer = this.timeStretchOLA(audioBuffer, pitchRatio);

    // 步驟 2: 重新採樣 - 壓縮回原始長度（同時提高音高）
    let finalBuffer = this.resample(stretchedBuffer, pitchRatio);

    // 步驟 3: 移除處理過程中產生的靜音填充
    finalBuffer = this.trimSilence(finalBuffer, 0.005);

    return finalBuffer;
  }

  /**
   * 移除音訊開頭和結尾的靜音
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} threshold - 靜音閾值（0-1）
   */
  trimSilence(audioBuffer, threshold = 0.01) {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    
    // 找到第一個非靜音樣本
    let startSample = 0;
    for (let i = 0; i < length; i++) {
      let isSilent = true;
      for (let channel = 0; channel < numChannels; channel++) {
        if (Math.abs(audioBuffer.getChannelData(channel)[i]) > threshold) {
          isSilent = false;
          break;
        }
      }
      if (!isSilent) {
        startSample = i;
        break;
      }
    }
    
    // 找到最後一個非靜音樣本
    let endSample = length;
    for (let i = length - 1; i >= startSample; i--) {
      let isSilent = true;
      for (let channel = 0; channel < numChannels; channel++) {
        if (Math.abs(audioBuffer.getChannelData(channel)[i]) > threshold) {
          isSilent = false;
          break;
        }
      }
      if (!isSilent) {
        endSample = i + 1;
        break;
      }
    }
    
    // 如果沒有找到有效音訊，返回原始緩衝區
    if (startSample >= endSample) {
      return audioBuffer;
    }
    
    const newLength = endSample - startSample;
    const newBuffer = this.audioContext.createBuffer(
      numChannels,
      newLength,
      audioBuffer.sampleRate
    );
    
    for (let channel = 0; channel < numChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      for (let i = 0; i < newLength; i++) {
        newData[i] = oldData[startSample + i];
      }
    }
    
    return newBuffer;
  }

  /**
   * 時間拉伸（OLA - Overlap-Add 算法）
   * 改變時長但盡量保持音高
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} stretchRatio - 拉伸比率（>1 延長，<1 縮短）
   */
  timeStretchOLA(audioBuffer, stretchRatio) {
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const inputLength = audioBuffer.length;
    const outputLength = Math.round(inputLength * stretchRatio);

    if (outputLength <= 0) return audioBuffer;

    const newBuffer = this.audioContext.createBuffer(numChannels, outputLength, sampleRate);

    // OLA 參數
    const windowSize = 2048;
    const hopIn = Math.round(windowSize / 4);  // 輸入跳躍大小
    const hopOut = Math.round(hopIn * stretchRatio);  // 輸出跳躍大小

    // Hanning 窗函數
    const window = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / windowSize));
    }

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);

      // 初始化輸出為 0
      outputData.fill(0);

      let inputPos = 0;
      let outputPos = 0;

      while (inputPos < inputLength - windowSize && outputPos < outputLength - windowSize) {
        // 取出一個窗口的樣本並應用窗函數
        for (let i = 0; i < windowSize; i++) {
          if (inputPos + i < inputLength && outputPos + i < outputLength) {
            outputData[outputPos + i] += inputData[inputPos + i] * window[i];
          }
        }

        inputPos += hopIn;
        outputPos += hopOut;
      }

      // 正規化（因為重疊相加會使音量增加）
      const normFactor = hopOut / hopIn;
      for (let i = 0; i < outputLength; i++) {
        outputData[i] *= normFactor * 0.6;  // 0.6 是經驗值避免過大
      }
    }

    return newBuffer;
  }

  /**
   * 重新採樣（改變音高和時長）
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} ratio - 採樣比率
   */
  resample(audioBuffer, ratio) {
    const inputLength = audioBuffer.length;
    const outputLength = Math.round(inputLength / ratio);

    if (outputLength <= 0) return audioBuffer;

    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      outputLength,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);

      for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * ratio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, inputLength - 1);
        const fraction = srcIndex - srcFloor;

        // 線性插值
        outputData[i] = inputData[srcFloor] * (1 - fraction) + inputData[srcCeil] * fraction;
      }
    }

    return newBuffer;
  }

  /**
   * 調整播放速度（簡易版本）
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {number} rate - 速度倍率（0.5 - 2.0）
   */
  changePlaybackRate(audioBuffer, rate) {
    const newLength = Math.floor(audioBuffer.length / rate);
    const newBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      for (let i = 0; i < newLength; i++) {
        const oldIndex = Math.floor(i * rate);
        if (oldIndex < audioBuffer.length) {
          newData[i] = oldData[oldIndex];
        }
      }
    }

    return newBuffer;
  }

  /**
   * 處理音訊（應用所有效果）
   * @param {AudioBuffer} audioBuffer - 原始音訊
   * @param {Object} settings - 處理設定
   */
  processAudio(audioBuffer, settings) {
    let processedBuffer = audioBuffer;

    // 裁切
    if (settings.crop && settings.crop.enabled) {
      processedBuffer = this.cropAudio(
        processedBuffer,
        settings.crop.start,
        settings.crop.end
      );
    }

    // 調整音量
    if (settings.volume !== undefined && settings.volume !== 1.0) {
      processedBuffer = this.adjustVolume(processedBuffer, settings.volume);
    }

    // 淡入
    if (settings.fadeIn && settings.fadeIn.enabled) {
      processedBuffer = this.applyFadeIn(processedBuffer, settings.fadeIn.duration);
    }

    // 淡出
    if (settings.fadeOut && settings.fadeOut.enabled) {
      processedBuffer = this.applyFadeOut(processedBuffer, settings.fadeOut.duration);
    }

    // 速度調整
    if (settings.playbackRate !== undefined && settings.playbackRate !== 1.0) {
      processedBuffer = this.changePlaybackRate(processedBuffer, settings.playbackRate);
    }

    // 音高調整
    if (settings.pitch !== undefined && settings.pitch !== 0) {
      processedBuffer = this.changePitch(processedBuffer, settings.pitch);
    }

    // 如果應用了任何可能引入填充的處理，修剪靜音
    if ((settings.playbackRate !== undefined && settings.playbackRate !== 1.0) ||
        (settings.pitch !== undefined && settings.pitch !== 0)) {
      processedBuffer = this.trimSilence(processedBuffer, 0.005);
    }

    return processedBuffer;
  }

  /**
   * 播放音訊
   * @param {AudioBuffer} audioBuffer - 要播放的音訊
   */
  playAudio(audioBuffer) {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();
    return source;
  }

  /**
   * 串接兩個音訊（首尾相接）
   * @param {AudioBuffer} buffer1 - 前段音訊
   * @param {AudioBuffer} buffer2 - 後段音訊
   * @returns {AudioBuffer} 串接後的音訊
   */
  joinAudio(buffer1, buffer2) {
    // 取較高的取樣率
    const sampleRate = Math.max(buffer1.sampleRate, buffer2.sampleRate);

    // 取較多的聲道數
    const numChannels = Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels);

    // 如果取樣率不同，需要重新採樣
    const resampled1 = buffer1.sampleRate !== sampleRate
      ? this.resampleBuffer(buffer1, sampleRate)
      : buffer1;
    const resampled2 = buffer2.sampleRate !== sampleRate
      ? this.resampleBuffer(buffer2, sampleRate)
      : buffer2;

    // 計算總長度
    const totalLength = resampled1.length + resampled2.length;

    // 建立新的 AudioBuffer
    const newBuffer = this.audioContext.createBuffer(numChannels, totalLength, sampleRate);

    // 複製資料
    for (let channel = 0; channel < numChannels; channel++) {
      const newData = newBuffer.getChannelData(channel);

      // 複製 buffer1 的資料（處理聲道數不匹配的情況）
      const data1 = resampled1.getChannelData(Math.min(channel, resampled1.numberOfChannels - 1));
      for (let i = 0; i < resampled1.length; i++) {
        newData[i] = data1[i];
      }

      // 複製 buffer2 的資料（處理聲道數不匹配的情況）
      const data2 = resampled2.getChannelData(Math.min(channel, resampled2.numberOfChannels - 1));
      for (let i = 0; i < resampled2.length; i++) {
        newData[resampled1.length + i] = data2[i];
      }
    }

    return newBuffer;
  }

  /**
   * 混合兩個音訊（疊加）
   * @param {AudioBuffer} buffer1 - 音軌1
   * @param {AudioBuffer} buffer2 - 音軌2
   * @param {number} balance1 - 音軌1的音量比例（0.0-1.0）
   * @param {number} balance2 - 音軌2的音量比例（0.0-1.0）
   * @param {boolean} autoNormalize - 是否自動標準化防止削波
   * @returns {Object} { buffer: AudioBuffer, normalized: boolean, clipped: boolean }
   */
  mixAudio(buffer1, buffer2, balance1 = 0.5, balance2 = 0.5, autoNormalize = true) {
    // 取較高的取樣率
    const sampleRate = Math.max(buffer1.sampleRate, buffer2.sampleRate);

    // 取較多的聲道數
    const numChannels = Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels);

    // 如果取樣率不同，需要重新採樣
    const resampled1 = buffer1.sampleRate !== sampleRate
      ? this.resampleBuffer(buffer1, sampleRate)
      : buffer1;
    const resampled2 = buffer2.sampleRate !== sampleRate
      ? this.resampleBuffer(buffer2, sampleRate)
      : buffer2;

    // 取較長的長度
    const maxLength = Math.max(resampled1.length, resampled2.length);

    // 建立新的 AudioBuffer
    const newBuffer = this.audioContext.createBuffer(numChannels, maxLength, sampleRate);

    let maxSample = 0;
    let clipped = false;

    // 混合資料
    for (let channel = 0; channel < numChannels; channel++) {
      const newData = newBuffer.getChannelData(channel);

      // 取得兩個來源的資料（處理聲道數不匹配的情況）
      const data1 = resampled1.getChannelData(Math.min(channel, resampled1.numberOfChannels - 1));
      const data2 = resampled2.getChannelData(Math.min(channel, resampled2.numberOfChannels - 1));

      for (let i = 0; i < maxLength; i++) {
        const sample1 = i < resampled1.length ? data1[i] * balance1 : 0;
        const sample2 = i < resampled2.length ? data2[i] * balance2 : 0;
        const mixed = sample1 + sample2;

        newData[i] = mixed;

        // 追蹤最大值以便標準化
        if (Math.abs(mixed) > maxSample) {
          maxSample = Math.abs(mixed);
        }

        // 檢查是否有削波
        if (Math.abs(mixed) > 1.0) {
          clipped = true;
        }
      }
    }

    let normalized = false;

    // 自動標準化
    if (autoNormalize && maxSample > 1.0) {
      const normalizeRatio = 0.99 / maxSample;  // 保留一點餘量
      for (let channel = 0; channel < numChannels; channel++) {
        const data = newBuffer.getChannelData(channel);
        for (let i = 0; i < maxLength; i++) {
          data[i] *= normalizeRatio;
        }
      }
      normalized = true;
      clipped = false;  // 標準化後不會有削波
    } else if (!autoNormalize) {
      // 不標準化時，直接限制在 -1 到 1 之間（硬削波）
      for (let channel = 0; channel < numChannels; channel++) {
        const data = newBuffer.getChannelData(channel);
        for (let i = 0; i < maxLength; i++) {
          data[i] = Math.max(-1, Math.min(1, data[i]));
        }
      }
    }

    return {
      buffer: newBuffer,
      normalized: normalized,
      clipped: clipped
    };
  }

  /**
   * 重新採樣 AudioBuffer 到指定取樣率
   * @param {AudioBuffer} buffer - 原始音訊
   * @param {number} targetSampleRate - 目標取樣率
   * @returns {AudioBuffer} 重新採樣後的音訊
   */
  resampleBuffer(buffer, targetSampleRate) {
    if (buffer.sampleRate === targetSampleRate) {
      return buffer;
    }

    const ratio = targetSampleRate / buffer.sampleRate;
    const newLength = Math.round(buffer.length * ratio);
    const numChannels = buffer.numberOfChannels;

    const newBuffer = this.audioContext.createBuffer(numChannels, newLength, targetSampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = newBuffer.getChannelData(channel);

      for (let i = 0; i < newLength; i++) {
        const srcIndex = i / ratio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, buffer.length - 1);
        const fraction = srcIndex - srcFloor;

        // 線性插值
        outputData[i] = inputData[srcFloor] * (1 - fraction) + inputData[srcCeil] * fraction;
      }
    }

    return newBuffer;
  }
}

// 建立全域音訊處理器實例
window.audioProcessor = new AudioProcessor();
