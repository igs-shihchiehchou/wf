# VideoPreviewNode 功能位置指南

此文檔詳細記錄了 VideoPreviewNode 各個功能的代碼位置。

## 文件位置
**主文件**: `/js/nodes/VideoPreviewNode.js`

---

## 核心功能位置

### 1. 視窗信息顯示 (View Info Display)

#### 功能說明
顯示當前視窗的時間範圍和縮放級別，固定在時間軸上方。

#### 代碼位置
- **創建視窗信息容器**: 第 506-525 行 (在 `createModalElement()` 中)
- **更新視窗信息**: 第 1115-1136 行 (`updateViewInfo()` 方法)
- **滾動事件綁定**: 第 1107-1112 行 (在 `bindZoomEvents()` 中)
- **清理事件處理器**: 第 2225-2229 行 (在 `closeEditor()` 中)

#### 關鍵代碼
```javascript
// 創建 (第 506-525 行)
const viewInfoContainer = document.createElement('div');
viewInfoContainer.id = 'timeline-view-info';
viewInfoContainer.innerHTML = `
    <span id="view-time-range">View: 0.00s - 0.00s</span>
    <span id="view-zoom-level">Zoom: 100%</span>
`;

// 更新 (第 1115-1136 行)
updateViewInfo() {
    const viewStartTime = (scrollLeft / trackRect.width) * duration;
    const viewEndTime = ((scrollLeft + containerRect.width) / trackRect.width) * duration;
    viewTimeRange.textContent = `View: ${viewStartTime.toFixed(2)}s - ${viewEndTime.toFixed(2)}s`;
    viewZoomLevel.textContent = `Zoom: ${Math.round(this.zoomLevel * 100)}%`;
}
```

---

### 2. 縮放功能 (Zoom)

#### 功能說明
- 滾輪縮放 (1x - 10x)
- 基於滑鼠位置的焦點縮放
- 固定每次 10% 步進

#### 代碼位置
- **縮放狀態變數**: 第 33-35 行 (在構造函數中)
- **綁定縮放事件**: 第 1040-1113 行 (`bindZoomEvents()` 方法)
- **時間軸寬度調整**: 第 866-876 行 (在 `renderTimeline()` 中)
- **音軌寬度調整**: 第 1605-1607 行 (在 `renderTracks()` 中)
- **清理縮放事件**: 第 2214-2223 行 (在 `closeEditor()` 中)

#### 關鍵代碼
```javascript
// 縮放計算 (第 1039-1067 行)
const zoomStep = 0.1; // 固定每次 10%
const zoomChange = deltaY > 0 ? -zoomStep : zoomStep;
const newZoomLevel = Math.max(1.0, Math.min(10.0, this.zoomLevel + zoomChange));

// 焦點縮放 (第 1069-1091 行)
const mouseTime = ((mouseX + containerScrollLeft) / rect.width) * duration;
// 縮放後調整滾動位置保持焦點
const newMouseX = (mouseTime / duration) * newRect.width;
const targetScrollLeft = newMouseX - (e.clientX - containerRect.left);
this.timelineContainer.scrollLeft = Math.max(0, targetScrollLeft);
```

---

### 3. 時間軸渲染 (Timeline Rendering)

#### 功能說明
渲染時間刻度、軌道和播放游標。

#### 代碼位置
- **渲染時間軸**: 第 800-928 行 (`renderTimeline()` 方法)
- **計算刻度間隔**: 第 937-949 行 (`calculateTimeInterval()` 方法)
- **綁定時間軸事件**: 第 966-1011 行 (`bindTimelineEvents()` 方法)
- **跳轉到時間**: 第 1141-1158 行 (`seekToPosition()` 方法)

#### 關鍵代碼
```javascript
// 時間刻度渲染 (第 820-861 行)
for (let i = 0; i <= tickCount; i++) {
    const time = i * interval;
    const percentage = (time / duration) * 100;
    // 創建刻度標記和標籤
}

// 時間軸軌道 (第 863-894 行)
const track = document.createElement('div');
track.style.width = `${100 * this.zoomLevel}%`; // 支持縮放
```

---

### 4. 音軌渲染 (Track Rendering)

#### 功能說明
渲染音訊列表，包括標題、時間信息、WaveSurfer 波形。

#### 代碼位置
- **渲染音軌列表**: 第 1483-1776 行 (`renderTracks()` 方法)
- **初始化 WaveSurfer**: 第 1778-1843 行 (`initTrackWaveSurfer()` 方法)
- **獲取音訊數據**: 第 1435-1481 行 (`getInputAudioData()` 方法)

#### 關鍵代碼
```javascript
// 音訊區塊定位 (第 1605-1621 行)
const basePixelsPerSecond = timelineWidth / (timelineDuration || 1);
const pixelsPerSecond = basePixelsPerSecond * this.zoomLevel; // 考慮縮放
const blockLeftPixels = trackParams.offset * pixelsPerSecond;
const blockWidthPixels = audioDuration * pixelsPerSecond;

audioBlockContainer.style.left = `${blockLeftPixels}px`;
audioBlockContainer.style.width = `${blockWidthPixels}px`;
```

---

### 5. 拖拉功能 (Drag & Drop)

#### 功能說明
- 預設模式: 拖拉移動音訊位置
- Shift 模式: 裁切音訊邊界

#### 代碼位置
- **綁定拖拉事件**: 第 1850-1985 行 (`bindTrackDragEvents()` 方法)
- **拖拉模式判定**: 第 1885-1909 行
- **移動處理**: 第 1923-1945 行
- **裁切處理**: 第 1947-1978 行
- **Hover 游標**: 第 1987-2011 行

#### 關鍵代碼
```javascript
// 拖拉模式判定 (第 1885-1909 行)
if (e.shiftKey) {
    // Shift 模式: 啟用裁切功能
    if (Math.abs(clickXPixels - cropStartPixels) < edgeThreshold) {
        dragMode = 'resize-left';
    } else if (Math.abs(clickXPixels - cropEndPixels) < edgeThreshold) {
        dragMode = 'resize-right';
    } else {
        dragMode = 'move';
    }
} else {
    // 預設模式: 整個區域都可以拖拉
    dragMode = 'move';
}
```

---

### 6. 時長調整 (Duration Stretching)

#### 功能說明
調整音訊播放時長而不改變音高（使用 stretchFactor）。

#### 代碼位置
- **切換時長模式**: 第 1646-1667 行 (按鈕事件)
- **重置時長**: 第 1669-1688 行 (重置按鈕事件)
- **更新顯示**: 第 2013-2047 行 (`updateStretchDisplay()` 方法)
- **應用伸縮**: 在音訊處理時使用 stretchFactor

#### 關鍵代碼
```javascript
// 切換時長調整模式 (第 1646-1667 行)
stretchBtn.addEventListener('click', () => {
    trackParams.stretchMode = !trackParams.stretchMode;
    this.setData('tracks', this.data.tracks);
    showToast(
        trackParams.stretchMode ? '時長調整模式: 開啟' : '時長調整模式: 關閉',
        'info'
    );
});

// 重置時長 (第 1669-1688 行)
resetBtn.addEventListener('click', () => {
    trackParams.stretchFactor = 1.0;
    this.setData('tracks', this.data.tracks);
    showToast('時長已重置', 'success');
});
```

---

### 7. 播放控制 (Playback Control)

#### 功能說明
影片播放控制、時間顯示、播放進度同步。

#### 代碼位置
- **渲染播放控制**: 第 626-745 行 (`renderPlaybackControls()` 方法)
- **綁定控制事件**: 第 747-798 行 (`bindPlaybackControlsEvents()` 方法)
- **更新播放游標**: 第 1160-1177 行 (`updatePlaybackCursor()` 方法)
- **更新播放線**: 第 1179-1199 行 (`updatePlaybackLine()` 方法)
- **播放循環**: 第 1201-1220 行 (`startPlaybackLoop()` 方法)

#### 關鍵代碼
```javascript
// 更新播放游標 (第 1160-1177 行)
updatePlaybackCursor() {
    const duration = this.calculateTimelineDuration();
    const percentage = (this.videoElement.currentTime / duration) * 100;
    this.playbackCursor.style.left = `${percentage}%`;
    this.updatePlaybackLine();
}

// 更新播放線 (第 1179-1199 行)
updatePlaybackLine() {
    const percentage = this.videoElement.currentTime / duration;
    const leftPosition = trackRect.left + (trackRect.width * percentage);
    this.playbackLine.style.left = `${leftPosition}px`;
}
```

---

### 8. 音訊播放同步 (Audio Playback Sync)

#### 功能說明
將音訊與影片時間軸同步播放。

#### 代碼位置
- **初始化 AudioContext**: 第 1228-1237 行 (`setupAudioContext()` 方法)
- **播放音訊**: 第 1239-1300 行 (`playAudio()` 方法)
- **停止音訊**: 第 1302-1320 行 (`stopAudio()` 方法)
- **調度音訊源**: 第 1322-1348 行 (`scheduleAudioSource()` 方法)

#### 關鍵代碼
```javascript
// 音訊播放時間計算 (第 1260-1273 行)
const trackStartTime = track.offset; // 音訊在時間軸上的起始時間
const trackEndTime = trackStartTime + trackDuration;

// 情況 1: 尚未播放到此音訊
if (startTime < trackStartTime) {
    const delay = trackStartTime - startTime;
    const offset = cropStart; // 從裁切起點開始播
    this.scheduleAudioSource(buffer, delay, offset, duration);
}

// 情況 2: 正處於此音訊播放期間
else if (startTime >= trackStartTime && startTime < trackEndTime) {
    const timeInTrack = startTime - trackStartTime;
    const offset = cropStart + timeInTrack;
    const duration = trackDuration - timeInTrack;
    this.scheduleAudioSource(buffer, 0, offset, duration);
}
```

---

### 9. 影片事件處理 (Video Events)

#### 功能說明
處理影片的各種事件（播放、暫停、時間更新等）。

#### 代碼位置
- **綁定影片事件**: 第 2049-2166 行 (`bindVideoEvents()` 方法)

#### 關鍵事件
```javascript
// timeupdate: 更新播放游標和時間顯示
video.addEventListener('timeupdate', () => {
    this.updatePlaybackCursor();
    this.updateCurrentTimeDisplay();
});

// play/pause: 同步音訊播放
video.addEventListener('play', () => {
    this.playAudio(video.currentTime);
});

video.addEventListener('pause', () => {
    this.stopAudio();
});
```

---

### 10. 資源清理 (Cleanup)

#### 功能說明
關閉編輯器時清理所有資源和事件監聽器。

#### 代碼位置
- **關閉編輯器**: 第 2168-2263 行 (`closeEditor()` 方法)
- **資源清理**: 第 57-76 行 (`cleanup()` 方法)

#### 清理項目
1. 停止影片和音訊播放
2. 清理影片事件處理器
3. 清理時間軸事件處理器
4. 清理縮放事件處理器
5. 清理滾動事件處理器
6. 銷毀 WaveSurfer 實例
7. 移除 DOM 元素
8. 重置縮放狀態

---

## 數據結構

### Node Data
```javascript
this.data = {
    videoUrl: '',           // 影片 URL
    videoDuration: 0,       // 影片時長
    tracks: []              // 音軌陣列
};
```

### Track Data
```javascript
{
    offset: 0,              // 音訊在時間軸上的起始位置 (秒)
    cropStart: 0,           // 裁切起點 (秒)
    cropEnd: null,          // 裁切終點 (秒，null = 使用音訊總長)
    stretchFactor: 1.0,     // 時長伸縮倍數
    stretchMode: false      // 是否啟用時長調整模式
}
```

---

## 狀態變數

### 縮放相關
```javascript
this.zoomLevel = 1.0;      // 縮放倍數 (1.0 = 100%, 10.0 = 1000%)
this.viewOffset = 0;       // 視窗偏移 (秒)
```

### DOM 引用
```javascript
this.videoElement          // 影片元素
this.modalElement          // 模態框元素
this.timelineContainer     // 時間軸容器
this.timelineTrack         // 時間軸軌道
this.playbackCursor        // 播放游標
this.playbackLine          // 播放線
this.tracksContainer       // 音軌列表容器
this.trackWaveSurfers      // WaveSurfer 實例陣列
```

### 音訊相關
```javascript
this.audioContext          // Web Audio API Context
this.sourceNodes           // 音訊源節點陣列
```

---

## 工具方法

### 時間格式化
- **formatTimeShort()**: 第 951-963 行 - 格式化為 "0:05"
- **formatTime()**: utils.js - 格式化為 "00:05.2"

### 時間計算
- **calculateTimelineDuration()**: 第 600-611 行 - 計算時間軸總長度
- **calculateTimeInterval()**: 第 937-949 行 - 計算時間刻度間隔

### HTML 工具
- **escapeHtml()**: 第 613-624 行 - 轉義 HTML 特殊字符

---

## 性能優化

### WaveSurfer 優化
- **跳過重新創建**: 第 1769-1776 行
  ```javascript
  if (!skipWaveSurfer) {
      // 只在非縮放時創建 WaveSurfer
      this.initTrackWaveSurfer(index, audio.buffer);
  }
  ```

### 渲染優化
- **requestAnimationFrame**: 用於平滑更新
- **防抖**: Toast 提示使用 200ms 防抖
- **條件渲染**: 只在需要時更新特定部分

---

## 事件處理流程

### 縮放流程
1. 滾輪事件 → `onWheel` (第 1043 行)
2. 計算新縮放級別 (第 1064-1067 行)
3. 重新渲染時間軸和音軌 (第 1074-1075 行)
4. 調整滾動位置保持焦點 (第 1078-1091 行)
5. 更新視窗信息 (第 1110 行)
6. 更新播放游標 (第 1112 行)

### 拖拉流程
1. mousedown → 判定拖拉模式 (第 1885-1909 行)
2. mousemove → 計算新位置/裁切點 (第 1923-1978 行)
3. mouseup → 應用變更並重新渲染 (第 1981-1983 行)

### 播放流程
1. 影片播放 → play 事件 (第 2093 行)
2. 計算音訊播放時間 (第 1260-1298 行)
3. 調度音訊源 (第 1322-1348 行)
4. timeupdate → 更新游標 (第 2074 行)

---

## 常見修改位置

### 修改縮放速度
**位置**: 第 1064 行
```javascript
const zoomStep = 0.1; // 改這裡，0.05 = 5%, 0.2 = 20%
```

### 修改縮放範圍
**位置**: 第 1067 行
```javascript
const newZoomLevel = Math.max(1.0, Math.min(10.0, ...)); // 改最小/最大值
```

### 修改音訊區塊樣式
**位置**: 第 1693-1703 行
```javascript
audioBlockContainer.style.cssText = `...`;
```

### 修改時間刻度間隔邏輯
**位置**: 第 937-949 行 (`calculateTimeInterval()`)

---

## 調試技巧

### 啟用調試日誌
**位置**: 第 1073 行
```javascript
console.log(`Zoom: ${oldZoomLevel.toFixed(2)} → ${newZoomLevel.toFixed(2)}`);
```

### 檢查音訊播放時間
**位置**: 第 1260-1298 行，添加 console.log

### 檢查音訊區塊位置
**位置**: 第 1608 行
```javascript
console.log(`RenderTracks[${index}]: ... PPS=${pixelsPerSecond}`);
```

---

## 版本歷史

### 最新改進 (2025-12-19)
1. ✅ 移除遮罩誤觸關閉功能
2. ✅ 永遠顯示音軌時間信息
3. ✅ 拖拉優先級修復 (Shift 鍵裁切)
4. ✅ 重置按鈕永遠可用
5. ✅ 滾輪縮放功能 (固定 10% 步進)
6. ✅ 視窗信息顯示 (時間範圍和縮放級別)
7. ✅ 修復音訊播放同步
8. ✅ 修復音訊位置偏移

---

此文檔隨代碼更新而更新，最後更新: 2025-12-19
