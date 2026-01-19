# Volume Clipping Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clipping detection and protection options (limiter, soft clip, normalize) to VolumeNode.

**Architecture:** Add four new methods to `audioProcessor.js` for clipping detection and three fix algorithms. Update `VolumeNode.js` UI with dropdown and warning display. Process audio through selected protection mode when clipping detected.

**Tech Stack:** Vanilla JavaScript, Web Audio API, existing CSS variables

---

## Task 1: Add Clipping Detection Method

**Files:**
- Modify: `js/audioProcessor.js:74` (after `adjustVolume` method)

**Step 1: Add detectClipping method**

Add after the `adjustVolume` method (around line 74):

```javascript
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
```

**Step 2: Verify syntax**

Open browser console, reload page, type:
```javascript
audioProcessor.detectClipping
```
Expected: Function definition displayed (not undefined)

**Step 3: Commit**

```bash
git add js/audioProcessor.js
git commit -m "feat(audio): add detectClipping method for volume clipping detection"
```

---

## Task 2: Add Limiter Method

**Files:**
- Modify: `js/audioProcessor.js` (after `detectClipping` method)

**Step 1: Add applyLimiter method**

```javascript
/**
 * 應用限制器（硬限幅）
 * @param {AudioBuffer} audioBuffer - 原始音訊
 * @param {number} threshold - 限幅閾值（預設 0.99）
 * @returns {AudioBuffer} 處理後的音訊
 */
applyLimiter(audioBuffer, threshold = 0.99) {
  const newBuffer = this.audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const oldData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      if (oldData[i] > threshold) {
        newData[i] = threshold;
      } else if (oldData[i] < -threshold) {
        newData[i] = -threshold;
      } else {
        newData[i] = oldData[i];
      }
    }
  }

  return newBuffer;
}
```

**Step 2: Verify syntax**

Browser console:
```javascript
audioProcessor.applyLimiter
```
Expected: Function definition displayed

**Step 3: Commit**

```bash
git add js/audioProcessor.js
git commit -m "feat(audio): add applyLimiter method for hard limiting"
```

---

## Task 3: Add Soft Clip Method

**Files:**
- Modify: `js/audioProcessor.js` (after `applyLimiter` method)

**Step 1: Add applySoftClip method**

```javascript
/**
 * 應用軟削波（使用 tanh 函數）
 * @param {AudioBuffer} audioBuffer - 原始音訊
 * @returns {AudioBuffer} 處理後的音訊
 */
applySoftClip(audioBuffer) {
  const newBuffer = this.audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const oldData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      // tanh naturally compresses values approaching ±1
      newData[i] = Math.tanh(oldData[i]);
    }
  }

  return newBuffer;
}
```

**Step 2: Verify syntax**

Browser console:
```javascript
audioProcessor.applySoftClip
```
Expected: Function definition displayed

**Step 3: Commit**

```bash
git add js/audioProcessor.js
git commit -m "feat(audio): add applySoftClip method using tanh curve"
```

---

## Task 4: Add Normalize Method

**Files:**
- Modify: `js/audioProcessor.js` (after `applySoftClip` method)

**Step 1: Add normalizeAudio method**

```javascript
/**
 * 正規化音訊（縮放至峰值為 0.99）
 * @param {AudioBuffer} audioBuffer - 原始音訊
 * @returns {AudioBuffer} 處理後的音訊
 */
normalizeAudio(audioBuffer) {
  // Find peak
  let maxSample = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxSample) {
        maxSample = abs;
      }
    }
  }

  // If no clipping or silent, return original
  if (maxSample <= 1.0 || maxSample === 0) {
    return audioBuffer;
  }

  // Scale down
  const scale = 0.99 / maxSample;
  const newBuffer = this.audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const oldData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      newData[i] = oldData[i] * scale;
    }
  }

  return newBuffer;
}
```

**Step 2: Verify syntax**

Browser console:
```javascript
audioProcessor.normalizeAudio
```
Expected: Function definition displayed

**Step 3: Commit**

```bash
git add js/audioProcessor.js
git commit -m "feat(audio): add normalizeAudio method for peak normalization"
```

---

## Task 5: Add CSS Styles for Clipping UI

**Files:**
- Modify: `css/graph.css` (append at end of file)

**Step 1: Add clipping protection styles**

Append to end of `css/graph.css`:

```css
/* ===========================
   音量節點削波保護樣式
   =========================== */

.clipping-mode-select {
  width: 100%;
  padding: var(--spacing-2);
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: var(--text-sm);
  cursor: pointer;
}

.clipping-mode-select:focus {
  outline: none;
  border-color: var(--primary);
}

.clipping-warning {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  margin-top: var(--spacing-2);
  background-color: hsla(45, 100%, 50%, 0.1);
  border: 1px solid hsla(45, 100%, 50%, 0.3);
  border-radius: 4px;
  font-size: var(--text-xs);
  color: hsl(45, 100%, 70%);
}

.clipping-warning-icon {
  flex-shrink: 0;
}
```

**Step 2: Verify CSS loads**

Reload page, open DevTools Elements tab, search for `.clipping-mode-select`. Should find the rule.

**Step 3: Commit**

```bash
git add css/graph.css
git commit -m "style: add CSS for volume node clipping protection UI"
```

---

## Task 6: Update VolumeNode Data Model

**Files:**
- Modify: `js/nodes/VolumeNode.js:8-10`

**Step 1: Add clippingMode to defaultData**

Change:
```javascript
const defaultData = {
    volume: options.volume || 100
};
```

To:
```javascript
const defaultData = {
    volume: options.volume || 100,
    clippingMode: options.clippingMode || 'none'
};
```

**Step 2: Verify**

Reload, create VolumeNode, check in console:
```javascript
graphEngine.nodes[0].data.clippingMode
```
Expected: `"none"`

**Step 3: Commit**

```bash
git add js/nodes/VolumeNode.js
git commit -m "feat(volume): add clippingMode to VolumeNode data model"
```

---

## Task 7: Update VolumeNode renderContent

**Files:**
- Modify: `js/nodes/VolumeNode.js:23-34`

**Step 1: Update renderContent method**

Replace the entire `renderContent()` method:

```javascript
renderContent() {
    const volume = this.data.volume || 100;
    const clippingMode = this.data.clippingMode || 'none';
    return `
  <div class="node-control">
    <label class="node-control-label">音量</label>
    <div class="node-control-row">
      <input type="range" class="volume-slider" min="0" max="200" value="${volume}" step="1">
      <span class="node-control-value">${volume}%</span>
    </div>
  </div>
  <div class="node-control">
    <label class="node-control-label">削波保護</label>
    <select class="clipping-mode-select">
      <option value="none" ${clippingMode === 'none' ? 'selected' : ''}>無 (僅警告)</option>
      <option value="limiter" ${clippingMode === 'limiter' ? 'selected' : ''}>限制器</option>
      <option value="softclip" ${clippingMode === 'softclip' ? 'selected' : ''}>軟削波</option>
      <option value="normalize" ${clippingMode === 'normalize' ? 'selected' : ''}>自動正規化</option>
    </select>
  </div>
  <div class="clipping-warning" style="display: none;">
    <span class="clipping-warning-icon">⚠️</span>
    <span>偵測到削波</span>
  </div>
`;
}
```

**Step 2: Verify UI**

Reload, create VolumeNode. Should see dropdown with 4 options below volume slider.

**Step 3: Commit**

```bash
git add js/nodes/VolumeNode.js
git commit -m "feat(volume): add clipping protection dropdown and warning to UI"
```

---

## Task 8: Update VolumeNode bindContentEvents

**Files:**
- Modify: `js/nodes/VolumeNode.js:36-53`

**Step 1: Update bindContentEvents method**

Replace the entire `bindContentEvents()` method:

```javascript
bindContentEvents() {
    const slider = this.element.querySelector('.volume-slider');
    const valueDisplay = this.element.querySelector('.node-control-value');
    const clippingSelect = this.element.querySelector('.clipping-mode-select');

    if (slider) {
        slider.addEventListener('input', (e) => {
            this.data.volume = parseInt(e.target.value);
            valueDisplay.textContent = this.data.volume + '%';

            // 自動更新預覽
            this.schedulePreviewUpdate();

            if (this.onDataChange) {
                this.onDataChange('volume', this.data.volume);
            }
        });
    }

    if (clippingSelect) {
        clippingSelect.addEventListener('change', (e) => {
            this.data.clippingMode = e.target.value;

            // 自動更新預覽
            this.schedulePreviewUpdate();

            if (this.onDataChange) {
                this.onDataChange('clippingMode', this.data.clippingMode);
            }
        });
    }
}
```

**Step 2: Verify events**

Reload, create VolumeNode, change dropdown value. Check console:
```javascript
graphEngine.nodes[0].data.clippingMode
```
Expected: Selected value (e.g., `"limiter"`)

**Step 3: Commit**

```bash
git add js/nodes/VolumeNode.js
git commit -m "feat(volume): bind clipping mode select events"
```

---

## Task 9: Update VolumeNode process Method

**Files:**
- Modify: `js/nodes/VolumeNode.js:55-95`

**Step 1: Update process method**

Replace the entire `process()` method:

```javascript
async process(inputs) {
    const audioBuffer = inputs.audio;
    const audioFiles = inputs.audioFiles;
    const gain = this.data.volume / 100;
    const clippingMode = this.data.clippingMode || 'none';

    // Helper function to process single buffer
    const processSingleBuffer = (buffer) => {
        if (!buffer) return null;

        // Apply volume
        let processed = audioProcessor.adjustVolume(buffer, gain);

        // Detect clipping
        const clippingResult = audioProcessor.detectClipping(buffer, gain);

        // Apply clipping protection if needed
        if (clippingResult.clipped && clippingMode !== 'none') {
            switch (clippingMode) {
                case 'limiter':
                    processed = audioProcessor.applyLimiter(processed);
                    break;
                case 'softclip':
                    processed = audioProcessor.applySoftClip(processed);
                    break;
                case 'normalize':
                    processed = audioProcessor.normalizeAudio(processed);
                    break;
            }
        }

        return { buffer: processed, clipped: clippingResult.clipped && clippingMode === 'none' };
    };

    // 處理多檔案
    if (audioFiles && audioFiles.length > 0) {
        const processedFiles = [];
        let anyClipped = false;

        for (const buffer of audioFiles) {
            const result = processSingleBuffer(buffer);
            if (result) {
                processedFiles.push(result.buffer);
                if (result.clipped) anyClipped = true;
            }
        }

        // Update warning display
        this.updateClippingWarning(anyClipped);

        return {
            audio: processedFiles[0] || null,
            audioFiles: processedFiles,
            filenames: inputs.filenames
        };
    }

    // 單檔案處理（向下相容）
    if (!audioBuffer) {
        this.updateClippingWarning(false);
        return { audio: null };
    }

    const result = processSingleBuffer(audioBuffer);
    this.updateClippingWarning(result.clipped);

    return { audio: result.buffer };
}
```

**Step 2: Add updateClippingWarning helper method**

Add this method after `process()`:

```javascript
/**
 * 更新削波警告顯示
 */
updateClippingWarning(show) {
    const warning = this.element?.querySelector('.clipping-warning');
    if (warning) {
        warning.style.display = show ? 'flex' : 'none';
    }
}
```

**Step 3: Verify complete flow**

1. Load audio file
2. Connect to VolumeNode
3. Set volume to 200%
4. With "無 (僅警告)" selected: Warning should appear
5. Switch to "限制器": Warning should disappear
6. Preview should sound clean (no distortion)

**Step 4: Commit**

```bash
git add js/nodes/VolumeNode.js
git commit -m "feat(volume): implement clipping detection and protection in process()"
```

---

## Task 10: Manual Testing & Final Commit

**Step 1: Full test checklist**

Test each scenario:

| Test | Expected |
|------|----------|
| Volume 50%, mode: none | No warning |
| Volume 200%, mode: none, quiet audio | No warning |
| Volume 200%, mode: none, loud audio | Warning shown |
| Volume 200%, mode: limiter, loud audio | No warning, clean sound |
| Volume 200%, mode: softclip, loud audio | No warning, warm sound |
| Volume 200%, mode: normalize, loud audio | No warning, quieter but clean |
| Download WAV with each mode | Output matches preview |

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete volume clipping protection feature

- Added detectClipping() for clipping detection
- Added applyLimiter() for hard limiting at threshold
- Added applySoftClip() using tanh for smooth limiting
- Added normalizeAudio() for peak normalization
- Updated VolumeNode UI with dropdown and warning
- Clipping protection applied during audio processing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add detectClipping method | audioProcessor.js |
| 2 | Add applyLimiter method | audioProcessor.js |
| 3 | Add applySoftClip method | audioProcessor.js |
| 4 | Add normalizeAudio method | audioProcessor.js |
| 5 | Add CSS styles | graph.css |
| 6 | Update data model | VolumeNode.js |
| 7 | Update renderContent | VolumeNode.js |
| 8 | Update bindContentEvents | VolumeNode.js |
| 9 | Update process method | VolumeNode.js |
| 10 | Manual testing | - |

Total: 10 tasks, ~9 commits
