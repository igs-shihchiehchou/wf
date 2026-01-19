# Bug Tracking

## Completed Bugs (Committed: 9def1f2, 78dcd9d)

### Bug #1: VideoPreviewNode shows "無音訊輸入" even when audio connected
- **Status**: ✅ FIXED
- **Root Cause**: `node.lastOutputs` never assigned in graphEngine.executeNode()
- **Fix**: Added `node.lastOutputs = outputs;` in graphEngine.js:579

### Bug #2: Preview shows only 1 file when input has many
- **Status**: ✅ FIXED
- **Root Cause**: Wrong condition order - checked `inputs.audio` before `inputs.audioFiles`
- **Fix**: Reordered conditions in VideoPreviewNode.process() to check audioFiles first

### Bug #3: NaN in Start/End times in video editor
- **Status**: ✅ FIXED
- **Root Cause**: Missing `await` on async `calculateTimelineDuration()` in 7 places
- **Fix**: Added await to all calls and made calling functions async

### Bug #4: Audio doesn't play in video editor
- **Status**: ✅ FIXED
- **Root Cause**: Missing `await` on async `getInputAudioData()` in playAudio()
- **Fix**: Made playAudio() async and added await

### Bug #5: Clip start time wrong (plays from offset only, ignores cropStart)
- **Status**: ✅ FIXED
- **Root Cause**: process() was adding silence padding for offset to exported audio
- **Fix**: Removed applyTimeOffset() from export path - offset only affects timeline positioning

### Bug #6: Duration scaling not working in preview playback
- **Status**: ✅ FIXED
- **Root Cause**: playAudio() didn't account for stretchFactor
- **Fix**: Added stretchFactor support via AudioBufferSourceNode.playbackRate

### WaveSurfer normalization issue
- **Status**: ✅ FIXED
- **Issue**: Preview volume didn't match download
- **Fix**: Set `normalize: false` in all WaveSurfer configs

### Bug #7: Crop visuals wrong after scaling
- **Status**: ✅ FIXED
- **Root Cause**: Multiple locations used `pixelsPerSecond` (global timeline value) which doesn't account for individual track `stretchFactor`. After stretching, visual width changes but crop calculations and curtain positions used unstretched pixel ratio.
- **Symptoms**:
  1. Edge detection didn't work after scaling (cursor didn't change)
  2. Crop amount wrong when dragging after scaling
  3. Curtain positions wrong when scaling after cropping
- **Fix**: Replaced all `pixelsPerSecond`-based calculations with `rect.width` or `stretchFactor`-aware calculations:
  1. ✅ Initial container width - multiply by `stretchFactor` (line ~1789)
  2. ✅ Initial curtain widths - use `(time / duration) * stretchedWidth` pattern (lines ~1818, ~1833)
  3. ✅ Mousedown edge detection - use `rect.width` (line ~2034)
  4. ✅ Hover edge detection - use `rect.width` (line ~2180)
  5. ✅ Drag delta calculation - use `rect.width` (line ~2107)
  6. ✅ Drag curtain updates - use `rect.width` (lines ~2135, ~2153)
  7. ✅ Stretch handle drag - update curtains dynamically (line ~2305)
  8. ✅ Reset button - update curtains when resetting stretch (line ~1902)
- **Files**: js/nodes/VideoPreviewNode.js

### Bug #8: Playback offset wrong after clipping
- **Status**: ✅ FIXED
- **Issue**: After clipping, audio plays at timeline position 0 instead of where the visible (non-curtained) region starts
- **Root Cause**: Two issues:
  1. `trackStartTime` used `track.offset` without accounting for `cropStart`, so audio timeline position didn't match visual position
  2. Some browsers ignore the `offset` parameter in `AudioBufferSourceNode.start(when, offset, duration)`
- **Symptoms**:
  - Visual shows curtain covering [0, cropStart], playable region at [cropStart, cropEnd]
  - Audio played from timeline [0, croppedDuration] instead of [cropStart, cropEnd]
- **Fix**:
  1. Changed `trackStartTime = track.offset` to `trackStartTime = track.offset + cropStart * stretchFactor` to match visual timeline
  2. Pre-crop the AudioBuffer using `audioProcessor.cropAudio()` before playback instead of relying on `source.start()` offset parameter
- **Files**: js/nodes/VideoPreviewNode.js (playAudio, scheduleAudioSource)

### Bug #9: Downloaded audio doesn't reflect edits made in video editor
- **Status**: ✅ FIXED
- **Issue**: After editing audio in VideoPreviewNode editor (crop, stretch), downloading WAV/MP3 returns the original unedited audio. Additionally, the preview section didn't update to show edited audio after closing the editor.
- **Root Cause**:
  1. BaseNode's `getFileBuffer()` returns the original buffer from `this.files.items`, not the processed buffer with edits applied
  2. Preview system uses `previewBuffers` but `syncInputToProcessedItems()` only populated `_processedItems`
- **Fix**:
  1. Added `getFileBuffer()` override that returns processed audio
  2. Added `getMultiFileItems()` override that returns cached processed items
  3. Added `applyTrackProcessing()` helper method to apply crop and stretch
  4. Added `updateProcessedItemsCache()` to prepare processed buffers
  5. Overrode `handleMultiFileDownloadSingle()`, `handleMultiFileDownloadAll()`, and `downloadPreview()` to update cache before download
  6. In `closeEditor()`: sync `_processedItems` to `previewBuffers`/`previewFilenames` before calling `refreshPreviewUI()`
- **Files**: js/nodes/VideoPreviewNode.js

## Current Bugs (In Progress)

(none)

## Original TODOs (Completed)

- ✅ Support drag and drop for video files → Fixed in Bug #1
- ✅ Video preview node cannot input audio from other node → Fixed in Bug #2
- ✅ Audio edited in video preview node wrong padding → Fixed in Bug #5
