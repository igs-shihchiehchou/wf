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
    const finalBuffer = this.resample(stretchedBuffer, pitchRatio);

    return finalBuffer;
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
}

// 建立全域音訊處理器實例
window.audioProcessor = new AudioProcessor();
