# Video Preview Node Fix Implementation Plan

## Overview
This plan addresses issues in the Video Preview Node related to:
1. Audio input handling (single vs. multiple audio sources)
2. Timeline display always visible when scrolling
3. Timeline coordinate synchronization with audio tracks

## Current Implementation Analysis

### Audio Input Handling (VideoPreviewNode.js:1369)
The `getInputAudioData()` method currently:
- Supports two output formats from connected nodes:
  - Format 1: `{audioFiles: [...], filenames: [...]}` (multiple audios)
  - Format 2: `{audio: AudioBuffer}` (single audio)
- Always processes ALL audioFiles from the source node
- Returns array of `{buffer, filename}` objects

### Timeline Structure (VideoPreviewNode.js:520-570)
Current DOM hierarchy:
```
modal
└── content
    ├── videoContainer
    ├── controlsContainer
    ├── viewInfoContainer
    └── timelineScrollWrapper (overflow-x: auto, overflow-y: auto, max-height: 60vh)
        ├── timelineContainer (normal flow, scrolls away)
        └── tracksContainer (normal flow)
```

### Timeline Rendering (VideoPreviewNode.js:811-948)
- Timeline width: `${100 * this.zoomLevel}%`
- Track width: `${100 * this.zoomLevel}%`
- Both use percentage-based positioning for markers/content
- **Already synchronized** in width calculation

## Issues to Fix

### Issue 1: Audio Input Quantity Handling
**Problem:** When user connects a single audio from a multi-audio node's preview pane, the video preview editor should show only that 1 audio, not all 3.

**Root Cause:** The `getInputAudioData()` method at line 1376-1438 always retrieves ALL audioFiles from the connected node, regardless of which specific output port was connected.

**Current Flow:**
1. User has AudioInputNode with 3 audio files
2. User connects from AudioInputNode's preview output (specific audio) to VideoPreviewNode
3. VideoPreviewNode calls `getInputAudioData()`
4. Method retrieves entire `audioFiles` array (all 3 audios)
5. Displays all 3 audios instead of just the selected one

**Detection Strategy:**
We need to check if the connection is from:
- A. Main audio output port → Show all audios
- B. Individual preview output port → Show only that specific audio

### Issue 2: Timeline Not Always Visible
**Problem:** When scrolling down in the editor, the timeline scrolls away and is no longer visible.

**Root Cause:** The `timelineContainer` at line 528-538 has normal positioning within `timelineScrollWrapper`, so it scrolls vertically with the tracks.

**Current CSS (line 530-536):**
```css
.video-preview-timeline {
    padding: var(--spacing-3);
    background: var(--bg);
    border-radius: 4px 4px 0 0;
    margin-bottom: 0;
    overflow: visible;
}
```

**Required Change:** Add `position: sticky; top: 0; z-index: 10;` to keep timeline visible when scrolling.

### Issue 3: Timeline Coordinate Synchronization
**Status:** Already implemented correctly.

**Verification:**
- Timeline scale width: `${100 * this.zoomLevel}%` (line 825)
- Timeline track width: `${100 * this.zoomLevel}%` (line 877)
- Audio track width: `${100 * this.zoomLevel}%` (line 1566)
- All use percentage-based positioning relative to same duration

**Action:** Verify no alignment issues in testing.

## Implementation Tasks

### Task 1: Fix Audio Input Detection Logic

**File:** `js/nodes/VideoPreviewNode.js`

**Changes Required:**

#### 1.1 Enhance `getInputAudioData()` Method (line 1369)
Add logic to detect connection type:

```javascript
getInputAudioData() {
    // Get audio port
    const audioPort = this.getInputPort('audio');
    if (!audioPort || !audioPort.connected) {
        return [];
    }

    // Get connected node and port
    const sourceNode = audioPort.connectedTo?.node;
    const sourcePortName = audioPort.connectedTo?.portName; // ADD THIS

    if (!sourceNode) {
        return [];
    }

    // Check if connection is from a preview-specific port
    // Preview ports are typically named like 'preview-0', 'preview-1', etc.
    const isPreviewPort = sourcePortName && sourcePortName.startsWith('preview-');

    // ... rest of existing logic to get outputs ...

    // IF connected from preview port, extract only that specific audio
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

    // OTHERWISE, return all audioFiles (existing logic)
    // ... existing array building logic ...
}
```

**Testing Scenarios:**
1. Connect AudioInputNode (3 files) main output → VideoPreviewNode
   - Expected: 3 tracks displayed
2. Connect AudioInputNode (3 files) preview[1] → VideoPreviewNode
   - Expected: 1 track displayed (the selected audio)
3. Connect AudioInputNode (1 file) main output → VideoPreviewNode
   - Expected: 1 track displayed
4. Connect AudioInputNode (1 file) preview[0] → VideoPreviewNode
   - Expected: 1 track displayed

### Task 2: Make Timeline Always Visible

**File:** `js/nodes/VideoPreviewNode.js`

**Changes Required:**

#### 2.1 Update Timeline Container Styling (line 528-538)

**Current:**
```javascript
timelineContainer.style.cssText = `
    padding: var(--spacing-3);
    background: var(--bg);
    border-radius: 4px 4px 0 0;
    margin-bottom: 0;
    overflow: visible;
`;
```

**Updated:**
```javascript
timelineContainer.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 10;
    padding: var(--spacing-3);
    background: var(--bg);
    border-radius: 4px 4px 0 0;
    margin-bottom: 0;
    overflow: visible;
`;
```

**Explanation:**
- `position: sticky;` - Element acts as relative until scroll threshold, then becomes fixed
- `top: 0;` - Sticks to top of scrolling container
- `z-index: 10;` - Ensures timeline appears above tracks when sticky

**Testing Scenarios:**
1. Open video preview editor with 5+ audio tracks
2. Scroll down in the timeline scroll wrapper
3. Verify timeline remains visible at top
4. Verify timeline coordinates remain aligned with audio tracks while scrolling

#### 2.2 Ensure Background Opacity

The timeline needs a solid background to prevent tracks from showing through when scrolled under it. Current `background: var(--bg)` should be sufficient, but verify it's not transparent.

**Verification:**
- Check that `--bg` CSS variable is not using rgba with alpha < 1
- If needed, add `background: var(--bg); opacity: 1;` or explicit color

### Task 3: Verify Timeline Coordinate Synchronization

**File:** `js/nodes/VideoPreviewNode.js`

**Verification Points:**

#### 3.1 Width Calculations
Verify consistency across:
- Timeline scale: line 825 (`width: ${100 * this.zoomLevel}%`)
- Timeline track: line 877 (`width: ${100 * this.zoomLevel}%`)
- Audio tracks: line 1566 (`width: ${100 * this.zoomLevel}%`)

#### 3.2 Duration Calculations
Verify both use same duration source:
- Timeline: line 814 (`this.calculateTimelineDuration()`)
- Tracks: line 1473 (`this.calculateTimelineDuration()`)

#### 3.3 Percentage Positioning
Verify markers use consistent formulas:
- Timeline ticks: line 844 (`(time / duration) * 100`)
- Audio blocks: line 1596-1618 (needs inspection for alignment)

**Testing Scenarios:**
1. Open editor with 3 audio tracks at different offsets
2. Verify audio blocks align with timeline markers at their start/end times
3. Zoom in/out (1x, 2x, 4x)
4. Verify alignment maintained at all zoom levels
5. Scroll horizontally
6. Verify alignment maintained while scrolling

**If Misalignment Found:**
Review audio block positioning calculation around line 1596-1650 and ensure it uses:
```javascript
const leftPercentage = (trackParams.offset / timelineDuration) * 100;
const widthPercentage = (audioDuration / timelineDuration) * 100;
```

## Testing Checklist

### Audio Input Handling
- [ ] Connect multi-audio node (3 files) main output → Shows 3 tracks
- [ ] Connect multi-audio node (3 files) preview port → Shows 1 track
- [ ] Connect single-audio node main output → Shows 1 track
- [ ] Connect single-audio node preview port → Shows 1 track
- [ ] Disconnect and reconnect → Correct track count maintained

### Timeline Always Visible
- [ ] Open editor with 5+ tracks
- [ ] Scroll down → Timeline stays at top
- [ ] Scroll up → Timeline returns to normal position
- [ ] Timeline remains interactive (click, drag cursor)
- [ ] Background is solid (no tracks showing through)

### Timeline Synchronization
- [ ] Load 3 tracks with different offsets
- [ ] Verify start/end positions align with timeline markers
- [ ] Zoom to 200% → Verify alignment maintained
- [ ] Zoom to 400% → Verify alignment maintained
- [ ] Zoom back to 100% → Verify alignment maintained
- [ ] Scroll horizontally → Verify alignment during scroll
- [ ] Play video → Verify playback cursor alignment

## Implementation Order

1. **Task 2: Make Timeline Always Visible** (Easiest, immediate UX improvement)
   - Update timeline container CSS
   - Test scrolling behavior
   - Estimated: 15 minutes

2. **Task 3: Verify Timeline Synchronization** (Likely already working)
   - Run alignment tests
   - Fix if any issues found
   - Estimated: 30 minutes

3. **Task 1: Fix Audio Input Detection** (Most complex, requires understanding port system)
   - Research AudioInputNode preview port naming
   - Implement detection logic
   - Test all connection scenarios
   - Estimated: 1-2 hours

## Risks and Considerations

### Risk 1: Preview Port Naming Convention
**Risk:** Preview port names might not follow 'preview-N' convention.

**Mitigation:**
- Inspect AudioInputNode implementation to confirm port naming
- If different, adjust detection logic accordingly
- Consider adding a port property to indicate preview vs. main output

### Risk 2: Sticky Positioning Browser Support
**Risk:** Older browsers might not support `position: sticky`.

**Mitigation:**
- Modern browsers all support sticky (since 2017)
- This is a development tool, likely used on recent browsers
- If needed, add fallback with fixed positioning + scroll listener

### Risk 3: Connection Data Structure
**Risk:** `connectedTo` might not include `portName` information.

**Mitigation:**
- Inspect Link/GraphEngine implementation to confirm data structure
- If portName not available, consider alternative approach:
  - Add metadata to connection object
  - Check source port type property
  - Modify AudioInputNode to tag preview outputs

## Files to Modify

1. **js/nodes/VideoPreviewNode.js** - All changes
   - `getInputAudioData()` method (~line 1369)
   - Timeline container creation (~line 528)

## Files to Review (No Changes Expected)

1. **js/nodes/AudioInputNode.js** - Verify preview port naming
2. **js/link.js** - Verify connection data structure
3. **js/graphEngine.js** - Verify connection management
4. **css/graph.css** - Verify CSS variable definitions

## Success Criteria

1. ✅ Connecting from preview port shows only selected audio
2. ✅ Connecting from main port shows all audios
3. ✅ Timeline remains visible when scrolling down
4. ✅ Timeline coordinates align with audio track positions at all zoom levels
5. ✅ No regression in existing functionality (playback, editing, etc.)

## Notes

- All changes are contained in VideoPreviewNode.js
- Changes are CSS-only for timeline visibility (low risk)
- Audio input detection requires understanding port connection system
- Consider adding documentation for port naming conventions
- May want to add visual indicator when only showing subset of audios
