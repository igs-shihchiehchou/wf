# VideoPreviewNode 設計文檔

**日期：** 2025-12-16
**作者：** Design Session
**狀態：** 設計完成，待實作

## 概述

VideoPreviewNode（影片預覽節點）是一個中間處理節點，允許使用者以影片作為視覺參考，調整多個音訊的播放時機和裁切範圍。這個節點特別適合遊戲音效、影片配音等需要精確時間對齊的場景。

## 設計目標

1. **視覺化編輯**：提供直觀的時間軸介面，讓使用者看著影片調整音效
2. **精確控制**：支援毫秒級的時間偏移和裁切
3. **複用現有技術**：使用 WaveSurfer.js、Web Audio API 等現有技術
4. **輕量級實作**：保持簡潔，符合專案風格

## 整體架構

### 節點定位

- **類型**：Process Node（中間處理節點）
- **繼承**：BaseNode
- **圖示**：🎬 或 📹
- **標題**：影片預覽

### 核心流程

```
[音訊輸入] → [影片參考編輯] → [時間偏移 + 裁切處理] → [多音訊輸出]
```

1. 接收輸入音訊列表（來自 CombineNode 或其他節點）
2. 使用者載入影片作為編輯參考（不序列化）
3. 在模態視窗中調整每個音訊的時間偏移和裁切點
4. 根據參數處理音訊（裁切 + 添加靜音偏移）
5. 使用 BaseNode 的多檔案預覽系統輸出

## 節點結構設計

### 輸入端口

- `audio` (input) - 接收音訊列表或單一音訊

### 輸出端口

使用 BaseNode 的統一多輸出系統：
- 每個處理後的音訊有獨立的 `preview-output-{index}` 端口
- 主輸出端口 `audio` 輸出第一個音訊（向下相容）
- `audioFiles` 輸出所有處理後的音訊陣列

### 資料結構

```javascript
class VideoPreviewNode extends BaseNode {
  constructor(id, options = {}) {
    super(id, 'video-preview', '影片預覽', '🎬', options, {
      videoFile: null,    // File 物件（運行時，不序列化）
      videoUrl: null,     // Blob URL（運行時）
      tracks: []          // 音軌編輯參數（會序列化）
    });
  }
}

// tracks 結構
this.data.tracks = [
  {
    offset: 0,        // 時間偏移（秒），正值=延後播放，負值=提前播放
    cropStart: 0,     // 裁切起點（秒）
    cropEnd: null     // 裁切終點（秒），null 表示不裁切
  }
];
```

### 節點內容區域

節點顯示邏輯根據狀態變化：

| 輸入音訊 | 影片 | 節點顯示內容 | 編輯器按鈕狀態 |
|---------|------|-------------|---------------|
| 無 | 無 | 「等待輸入」提示 | 禁用（灰階）|
| 無 | 有 | 影片縮圖 + 清除按鈕(×) | 可用（可預覽影片）|
| 有 | 無 | 影片上傳區域 + 拖放提示 | 禁用（灰階）|
| 有 | 有 | 影片縮圖 + 清除按鈕(×) | 可用（完整編輯）|

**UI 元素：**
- 「選擇影片檔案」按鈕（未載入時）
- 影片縮圖預覽（已載入時）
- 右上角「×」清除影片按鈕
- 「開啟編輯器」按鈕
- 底部：BaseNode 的預覽區域（顯示處理後的音訊）

## 模態視窗設計

### 視窗佈局

```
┌─────────────────────────────────────────────┐
│ 影片預覽編輯器                      [關閉 ×] │
├─────────────────────────────────────────────┤
│                                             │
│            影片播放區域                      │
│         (HTML5 video 元素)                  │
│                                             │
├─────────────────────────────────────────────┤
│  [▶]  00:00.000 / 05:30.500                 │ ← 播放控制
├─────────────────────────────────────────────┤
│  0:00      1:00      2:00      3:00    5:30 │ ← 時間刻度
│  ┌──────────|────────|────────|─────────┐  │
│  │                   ●                   │  │ ← 統一時間軸（播放游標）
│  └──────────|────────|────────|─────────┘  │
├─────────────────────────────────────────────┤
│  音軌 1: audio_file_1.mp3                   │
│  ┌──────────────────────────────────────┐  │
│  │◀   ████████波形████████   ▶│         │  │ ← 可拖動/縮放
│  └──────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  音軌 2: audio_file_2.mp3                   │
│  ┌──────────────────────────────────────┐  │
│  │    ◀   ██████波形██████   ▶│         │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 組件說明

#### 1. 影片播放區域
- HTML5 `<video>` 元素
- 載入影片並顯示當前幀
- 響應播放控制

#### 2. 播放控制列
- **播放/暫停按鈕**：同步控制影片和所有音訊
- **時間顯示**：`當前時間 / 總時長`，精確到毫秒（`MM:SS.mmm`）

#### 3. 統一時間軸系統
- **時間刻度尺**：顯示時間標記（每秒或每分鐘）
- **時間軸容器**：所有音軌共用相同寬度，視覺對齊
- **播放游標**：垂直線穿過所有音軌，顯示當前播放位置
  - 播放時自動移動
  - 可點擊時間軸跳轉
  - 可拖動游標調整位置
- **時間軸長度**：以影片長度或最長音訊（含偏移）的較長者為準

#### 4. 音軌區域
每個音軌顯示：
- **音軌標題**：顯示檔案名稱
- **時間軸容器**：與統一時間軸對齊的長方形區域
- **音訊波形區塊**：
  - 顯示 WaveSurfer.js 渲染的波形
  - 位置對應實際播放時機（根據 offset）
  - 寬度對應音訊長度（根據 crop）
  - 左右邊緣有控制柄「◀」「▶」

#### 5. 編輯器內容適應
- **僅有影片**：只顯示影片播放區域和播放控制，無音軌區域
- **影片 + 音訊**：顯示完整介面

## 音軌編輯交互

### 時間偏移（拖動音訊區塊）

**操作方式：**
1. 滑鼠移到音訊波形區塊中間，游標變為「↔」
2. 按住左鍵拖動，音訊區塊左右移動
3. 拖動時顯示當前偏移時間（例如：`+2.350s`）
4. 釋放滑鼠，更新 `tracks[index].offset`

**邊界處理：**
- 允許拖動到時間軸起點之前（負偏移）
- 允許拖動超出影片長度（時間軸自動擴展）

### 裁切音訊（調整區塊邊界）

**左邊界裁切：**
1. 滑鼠移到音訊區塊左側邊緣（約 10px 範圍），游標變為「◀」
2. 按住左鍵向右拖動，裁切音訊開頭
3. 波形區塊從左側縮短，右側位置不變
4. 更新 `tracks[index].cropStart`

**右邊界裁切：**
1. 滑鼠移到右側邊緣，游標變為「▶」
2. 按住左鍵向左拖動，裁切音訊結尾
3. 波形區塊從右側縮短，左側位置不變
4. 更新 `tracks[index].cropEnd`

**邊界處理：**
- cropStart 不能 >= cropEnd（保證至少 0.1 秒音訊）
- 拖動時顯示當前裁切後的長度

### 波形顯示

使用 WaveSurfer.js 渲染：
- 波形隨區塊寬度自動縮放
- 完整波形渲染，裁切部分以半透明顯示
- 波形顏色與專案主題一致

## 播放同步機制

### 播放邏輯

#### 啟動播放
1. 呼叫 `video.play()` 開始播放影片
2. 為每個音軌創建 Web Audio API 的 `AudioBufferSourceNode`
3. 根據當前播放位置和音軌參數計算每個音訊的播放起點
4. 同步啟動所有音訊源

#### 時間同步
- 使用 `requestAnimationFrame` 循環更新播放游標
- 以 `video.currentTime` 作為主時間軸基準
- 更新時間顯示（毫秒精度）

#### 暫停播放
- 呼叫 `video.pause()`
- 停止所有 `AudioBufferSourceNode`
- 記錄當前播放位置

#### 跳轉播放位置
- 使用者拖動游標或點擊時間軸
- 停止當前播放，設定 `video.currentTime`
- 如果正在播放中，重新啟動播放流程

### 音訊播放計算

對於每個音軌，根據參數計算播放：

```javascript
// 音軌參數
const offset = tracks[i].offset;      // 時間偏移（可能為負）
const cropStart = tracks[i].cropStart; // 裁切起點
const cropEnd = tracks[i].cropEnd;     // 裁切終點

// 當前播放位置（以影片時間為準）
const currentTime = video.currentTime;

// 計算音訊應該播放的時間點
const audioPlayTime = currentTime - offset + cropStart;

// 判斷是否應該播放此音軌
if (audioPlayTime >= cropStart && audioPlayTime <= cropEnd) {
  // 使用 Web Audio API 播放
  const source = audioContext.createBufferSource();
  source.buffer = processedBuffer; // 已裁切的 buffer
  source.connect(audioContext.destination);
  source.start(0, audioPlayTime - cropStart);
}
```

### 影片結束後的處理

- 影片播放到結束時，停留在最後一幀
- 如果有音訊尚未播放完畢，繼續播放音訊
- 直到所有音訊播放完畢或使用者暫停

## 資料處理流程

### process() 方法實作

```javascript
async process(inputs) {
  // 1. 接收輸入
  const inputAudioFiles = inputs.audioFiles || [];
  const inputFilenames = inputs.filenames || [];

  if (inputAudioFiles.length === 0) {
    return { audio: null, audioFiles: [], filenames: [] };
  }

  // 2. 確保 tracks 參數與輸入數量一致
  this.ensureTracksArray(inputAudioFiles.length);

  // 3. 處理每個音訊
  const processedBuffers = [];

  for (let i = 0; i < inputAudioFiles.length; i++) {
    const buffer = inputAudioFiles[i];
    const track = this.data.tracks[i];

    let processedBuffer = buffer;

    // 步驟 A: 裁切音訊
    if (track.cropStart > 0 || track.cropEnd < buffer.duration) {
      const start = track.cropStart;
      const end = track.cropEnd || buffer.duration;
      processedBuffer = await audioProcessor.cropAudio(
        processedBuffer,
        start,
        end
      );
    }

    // 步驟 B: 應用時間偏移
    if (track.offset !== 0) {
      processedBuffer = await this.applyTimeOffset(
        processedBuffer,
        track.offset
      );
    }

    processedBuffers.push(processedBuffer);
  }

  // 4. 輸出
  return {
    audio: processedBuffers[0] || null,
    audioFiles: processedBuffers,
    filenames: inputFilenames
  };
}
```

### 時間偏移實作

```javascript
async applyTimeOffset(buffer, offset) {
  if (offset === 0) return buffer;

  const audioContext = audioProcessor.audioContext;
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;

  // 計算靜音樣本數
  const silentSamples = Math.abs(Math.floor(offset * sampleRate));

  if (offset > 0) {
    // 正偏移：前面添加靜音
    const newLength = buffer.length + silentSamples;
    const newBuffer = audioContext.createBuffer(
      channels,
      newLength,
      sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = buffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);
      newData.set(oldData, silentSamples); // 從 silentSamples 位置開始
    }
    return newBuffer;
  } else {
    // 負偏移：裁切前面部分
    return await audioProcessor.cropAudio(
      buffer,
      -offset,
      buffer.duration
    );
  }
}
```

### 參數初始化

```javascript
ensureTracksArray(count) {
  if (!this.data.tracks) {
    this.data.tracks = [];
  }

  // 補齊到 count 個
  while (this.data.tracks.length < count) {
    this.data.tracks.push({
      offset: 0,
      cropStart: 0,
      cropEnd: null
    });
  }

  // 移除多餘的
  if (this.data.tracks.length > count) {
    this.data.tracks = this.data.tracks.slice(0, count);
  }
}
```

## 錯誤處理與邊界情況

### 影片載入

- **格式檢查**：只接受 video/* 類型，其他格式顯示錯誤
- **載入失敗**：顯示「影片載入失敗」並清除資料
- **大檔案警告**：超過 100MB 時顯示警告

### 節點狀態

- **無輸入 + 無影片**：顯示「等待輸入」
- **無輸入 + 有影片**：可開啟編輯器預覽影片
- **有輸入 + 無影片**：編輯器按鈕禁用，提示載入影片
- **編輯器開啟時**：節點圖無法編輯（避免輸入變更）

### 編輯器操作

- **拖動邊界**：音訊區塊最小 0.1 秒
- **記憶體管理**：關閉編輯器時釋放所有 WaveSurfer 和 AudioBufferSourceNode

### 序列化與還原

- **儲存**：只序列化 `tracks` 參數陣列
- **載入**：`tracks` 參數保留，影片需重新載入
- **參數驗證**：載入時驗證參數合法性
- **參數初始化**：首次執行時根據輸入數量初始化

### 效能優化

- **波形快取**：編輯器開啟時創建，關閉時銷毀
- **播放優化**：使用 Web Audio API 的 `start(when, offset)` 精確控制
- **大量音軌警告**：超過 10 個音軌時顯示警告

## 技術棧

- **HTML5 Video API**：影片播放
- **Web Audio API**：音訊播放和同步
- **WaveSurfer.js v7**：波形顯示（複用現有版本）
- **audioProcessor**：音訊處理（cropAudio 等）
- **BaseNode**：節點基類和多輸出系統

## 實作檔案清單

1. **js/nodes/VideoPreviewNode.js** - 節點類別實作
2. **css/video-preview.css** - 模態視窗樣式
3. **js/components/VideoPreviewModal.js** - 模態視窗組件（可選，可整合在節點中）

## 未來擴展可能性

1. **時間標記**：允許使用者在時間軸上添加書籤
2. **音量調整**：每個音軌獨立音量控制
3. **循環播放**：音訊可設定循環填滿影片長度
4. **影片時間碼匯出**：匯出編輯參數為時間碼文件
5. **快捷鍵支援**：空白鍵播放/暫停，方向鍵微調等

## 總結

VideoPreviewNode 提供了一個直觀的視覺化編輯介面，讓使用者可以精確地調整音效與影片的時間對齊。設計上遵循專案的輕量級原則，複用現有技術，保持簡潔易用。
