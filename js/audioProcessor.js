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
const audioProcessor = new AudioProcessor();
