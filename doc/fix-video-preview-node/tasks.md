# Video Preview Node Fix - Tasks

## Task 1: Make Timeline Always Visible ⚡ (Quick Win)

### 1.1 Update Timeline Container CSS
- [ ] Open `js/nodes/VideoPreviewNode.js`
- [ ] Locate timeline container creation (line ~528)
- [ ] Add sticky positioning to `timelineContainer.style.cssText`:
  ```javascript
  position: sticky;
  top: 0;
  z-index: 10;
  ```
- [ ] Verify background is solid (no transparency)

### 1.2 Test Timeline Sticky Behavior
- [ ] Start local dev server (`python -m http.server 8000`)
- [ ] Create video preview node with 5+ audio tracks
- [ ] Open video preview editor
- [ ] Scroll down in timeline scroll wrapper
- [ ] Verify timeline stays visible at top
- [ ] Verify timeline remains interactive (click, drag)
- [ ] Verify no visual glitches (tracks showing through)

**Estimated Time:** 15 minutes

---

## Task 2: Verify Timeline Coordinate Synchronization

### 2.1 Code Review
- [ ] Verify timeline scale width calculation (line ~825): `${100 * this.zoomLevel}%`
- [ ] Verify timeline track width calculation (line ~877): `${100 * this.zoomLevel}%`
- [ ] Verify audio track width calculation (line ~1566): `${100 * this.zoomLevel}%`
- [ ] Verify duration source consistency (both use `calculateTimelineDuration()`)
- [ ] Verify percentage positioning formula (line ~844): `(time / duration) * 100`

### 2.2 Test Timeline Alignment
- [ ] Load 3 audio tracks with different offsets (e.g., 0s, 2s, 5s)
- [ ] Verify audio blocks align with timeline markers at start positions
- [ ] Verify audio blocks align with timeline markers at end positions
- [ ] Zoom to 200% and verify alignment maintained
- [ ] Zoom to 400% and verify alignment maintained
- [ ] Zoom back to 100% and verify alignment maintained
- [ ] Scroll horizontally and verify alignment during scroll
- [ ] Play video and verify playback cursor alignment

### 2.3 Fix Alignment Issues (if found)
- [ ] Inspect audio block positioning code (line ~1596-1650)
- [ ] Ensure consistent formula:
  ```javascript
  const leftPercentage = (trackParams.offset / timelineDuration) * 100;
  const widthPercentage = (audioDuration / timelineDuration) * 100;
  ```
- [ ] Apply fixes and re-test

**Estimated Time:** 30 minutes

---

## Task 3: Fix Audio Input Detection Logic

### 3.1 Research Port Connection System
- [ ] Open `js/nodes/AudioInputNode.js`
- [ ] Find preview port creation code
- [ ] Document preview port naming convention (e.g., `preview-0`, `preview-1`)
- [ ] Open `js/link.js`
- [ ] Verify `connectedTo` object structure
- [ ] Confirm `portName` property is available
- [ ] Document connection data structure

### 3.2 Implement Audio Input Detection
- [ ] Open `js/nodes/VideoPreviewNode.js`
- [ ] Locate `getInputAudioData()` method (line ~1369)
- [ ] Add logic to get `sourcePortName` from `audioPort.connectedTo`
- [ ] Add preview port detection logic:
  ```javascript
  const isPreviewPort = sourcePortName && sourcePortName.startsWith('preview-');
  ```
- [ ] Add preview index extraction:
  ```javascript
  const previewIndex = parseInt(sourcePortName.split('-')[1]);
  ```
- [ ] Add single-audio return for preview connections:
  ```javascript
  if (isPreviewPort && outputs.audioFiles && Array.isArray(outputs.audioFiles)) {
      const previewIndex = parseInt(sourcePortName.split('-')[1]);
      if (previewIndex >= 0 && previewIndex < outputs.audioFiles.length) {
          const buffer = outputs.audioFiles[previewIndex];
          const filename = outputs.filenames ? outputs.filenames[previewIndex] : `音訊 ${previewIndex + 1}`;

          if (buffer instanceof AudioBuffer) {
              return [{
                  buffer: buffer,
                  filename: filename
              }];
          }
      }
  }
  ```
- [ ] Ensure existing logic for main port remains unchanged

### 3.3 Test Audio Input Detection
- [ ] Create AudioInputNode with 3 audio files
- [ ] Connect main output to VideoPreviewNode
- [ ] Verify 3 tracks are displayed
- [ ] Disconnect
- [ ] Connect preview port [0] to VideoPreviewNode
- [ ] Verify 1 track is displayed (first audio)
- [ ] Disconnect
- [ ] Connect preview port [1] to VideoPreviewNode
- [ ] Verify 1 track is displayed (second audio)
- [ ] Disconnect
- [ ] Connect preview port [2] to VideoPreviewNode
- [ ] Verify 1 track is displayed (third audio)
- [ ] Test with single audio file AudioInputNode
- [ ] Verify correct behavior for all scenarios

### 3.4 Handle Edge Cases
- [ ] Test with empty AudioInputNode (no files loaded)
- [ ] Test disconnecting and reconnecting multiple times
- [ ] Test switching between preview and main port
- [ ] Verify no errors in console
- [ ] Verify track count updates correctly on reconnection

### 3.5 Add Visual Feedback (Optional Enhancement)
- [ ] Consider adding indicator when showing subset of audios
- [ ] Example: "Showing 1 of 3 audio tracks" message
- [ ] Update UI to clarify which audio is being shown

**Estimated Time:** 1-2 hours

---

## Task 4: Integration Testing

### 4.1 Full Workflow Testing
- [ ] Create complex graph with multiple audio nodes
- [ ] Test all connection scenarios:
  - [ ] Multi-audio main port → Video preview
  - [ ] Multi-audio preview port → Video preview
  - [ ] Single-audio main port → Video preview
  - [ ] Single-audio preview port → Video preview
- [ ] Test timeline scrolling with all scenarios
- [ ] Test timeline alignment with all scenarios
- [ ] Test zoom functionality with all scenarios
- [ ] Test playback with all scenarios

### 4.2 Regression Testing
- [ ] Verify video upload still works
- [ ] Verify video playback still works
- [ ] Verify audio editing (offset, crop, stretch) still works
- [ ] Verify export functionality still works
- [ ] Verify keyboard shortcuts still work
- [ ] Verify zoom controls still work
- [ ] Verify no console errors
- [ ] Verify no visual glitches

### 4.3 Performance Testing
- [ ] Test with 10+ audio tracks
- [ ] Verify scrolling is smooth
- [ ] Verify zoom is responsive
- [ ] Verify no memory leaks (open/close editor multiple times)
- [ ] Check browser console for warnings

**Estimated Time:** 45 minutes

---

## Task 5: Documentation and Cleanup

### 5.1 Code Documentation
- [ ] Add comments explaining preview port detection logic
- [ ] Add JSDoc comments for modified methods
- [ ] Document sticky positioning approach

### 5.2 Update Documentation
- [ ] Update CLAUDE.md if needed (document port naming convention)
- [ ] Add notes about preview vs. main port behavior
- [ ] Document timeline sticky behavior

### 5.3 Git Commit
- [ ] Review all changes
- [ ] Create commit with message:
  ```
  fix(video-preview): resolve audio input and timeline display issues

  - Fix audio input detection to support preview port connections
  - Make timeline always visible with sticky positioning
  - Verify timeline coordinate synchronization

  Fixes scenario 1 (audio input quantity) and scenario 2 (timeline visibility)
  from fix-video-preview-node.feature
  ```

**Estimated Time:** 15 minutes

---

## Summary

**Total Estimated Time:** 3-4 hours

**Task Order:**
1. Task 1 (Timeline Sticky) - Quick win, immediate improvement
2. Task 2 (Verify Sync) - Likely already working, verification only
3. Task 3 (Audio Input) - Most complex, requires research
4. Task 4 (Integration Testing) - Ensure no regressions
5. Task 5 (Documentation) - Clean up and commit

**Files to Modify:**
- `js/nodes/VideoPreviewNode.js` (primary changes)

**Files to Review:**
- `js/nodes/AudioInputNode.js` (understand port naming)
- `js/link.js` (understand connection data)
- `js/graphEngine.js` (understand connection management)

**Success Criteria:**
- ✅ Timeline remains visible when scrolling
- ✅ Timeline coordinates align with audio tracks at all zoom levels
- ✅ Preview port connections show only selected audio
- ✅ Main port connections show all audios
- ✅ No regressions in existing functionality

## Note
- Commit pattern: {type}({scope}): {description only one line}
- Always commit after finish each task
