/**
 * 工具函數
 */

// 格式化時間（秒轉換為 mm:ss 格式）
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '00:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 將頻率轉換為音符名稱（如 440 Hz → A4）
function frequencyToNoteName(frequency) {
  if (!frequency || frequency <= 0) return null;

  // A4 = 440 Hz 作為參考音
  const A4 = 440;
  const A4_INDEX = 57; // A4 is the 57th key on a piano (counting from C0)

  // 計算與 A4 的半音差距
  // 公式: n = 12 * log2(f / 440)
  const halfStepsFromA4 = 12 * Math.log2(frequency / A4);
  const noteIndex = Math.round(A4_INDEX + halfStepsFromA4);

  // 音符名稱（C, C#, D, D#, E, F, F#, G, G#, A, A#, B）
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 計算八度（C0 開始）
  const octave = Math.floor(noteIndex / 12);
  const note = noteNames[noteIndex % 12];

  return `${note}${octave}`;
}

// 產生唯一 ID
function generateId() {
  return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 顯示提示訊息
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 檢查是否為支援的音訊格式
function isSupportedAudioFormat(file) {
  const supportedFormats = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a'];
  return supportedFormats.includes(file.type) || file.name.match(/\.(mp3|wav|ogg|m4a)$/i);
}

// 下載 AudioBuffer 為 WAV 檔案
function downloadAudioBuffer(audioBuffer, filename = 'processed-audio.wav') {
  const wav = audioBufferToWav(audioBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// 將 AudioBuffer 轉換為 WAV 格式
function audioBufferToWav(buffer) {
  const length = buffer.length * buffer.numberOfChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // 寫入 WAV 檔頭
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(buffer.numberOfChannels);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
  setUint16(buffer.numberOfChannels * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // 寫入交錯的資料
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length - 44) {
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][offset]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      pos += 2;
    }
    offset++;
  }

  return arrayBuffer;

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

// 節流函數
function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

// 防抖函數
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// 滾動到元素
function scrollToElement(element, offset = 20) {
  const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
  const offsetPosition = elementPosition - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });
}
