# Volume Node Discrepancy Fix Plan

## Problem Analysis

### Issue Description
The volume node works differently in preview mode compared to the actual downloaded file. Users notice that the volume level they hear in preview doesn't match the volume in the downloaded audio.

### Root Cause Identified

The issue is caused by **WaveSurfer.js automatic normalization**:
- **Preview Path**: VolumeNode processes audio correctly → WaveSurfer normalizes it for louder playback
- **Download Path**: VolumeNode processes audio correctly → Direct file conversion without normalization

This creates a mismatch where preview sounds louder than the actual downloaded file.

### Technical Details

**WaveSurfer Configuration Issue:**
In `js/nodes/BaseNode.js`, WaveSurfer is created with `normalize: true` in two locations:
- Line ~820 in `initSingleWaveSurfer()` method
- Line ~1040 in `initPreviewWaveSurfer()` method

**Data Flow Comparison:**
1. **Preview**: `schedulePreviewUpdate()` → `updatePreview()` → `process()` → WaveSurfer normalization → normalized playback
2. **Download**: `handleMultiFileDownloadSingle()` → `downloadSingleFile()` → direct conversion → no normalization

## Solution: Disable WaveSurfer Normalization

### Chosen Approach
User selected: **"Disable WaveSurfer normalization"** (recommended option)

### Implementation Plan

#### Files to Modify
- `js/nodes/BaseNode.js` - Two locations where WaveSurfer is created

#### Specific Changes Required

**Change 1: Line ~820 (initSingleWaveSurfer method)**
```javascript
// FROM:
normalize: true

// TO:
normalize: false
```

**Change 2: Line ~1040 (initPreviewWaveSurfer method)**
```javascript
// FROM:
normalize: true

// TO:
normalize: false
```

#### Expected Outcome
- Preview audio will now accurately reflect actual volume setting from VolumeNode
- Downloaded files will match exactly what users hear in preview
- No more confusing volume differences between preview and download
- Users can still use VolumeNode to achieve desired loudness levels

## Testing Strategy

### Test Cases
1. **Volume at 100%**: Preview should match download (both at original volume)
2. **Volume at 50%**: Preview should match download (both at half volume)
3. **Volume at 200%**: Preview should match download (both at double volume, potentially with clipping)
4. **Volume at 0%**: Preview should match download (both silent)

### Test Steps
1. Load an audio file into AudioInputNode
2. Connect to VolumeNode
3. Set various volume levels (100%, 50%, 200%, 0%)
4. Compare preview playback volume to downloaded file volume
5. Verify they match across all test cases

## Rationale

This solution is recommended because:
1. **Accuracy**: Makes preview accurately represent actual output
2. **Simplicity**: Single line change in two locations
3. **User Experience**: Eliminates confusion between preview and download
4. **Predictability**: Users can trust that what they hear is what they get

## Alternative Solutions Considered

1. **Apply normalization to downloads**: More complex, could cause unexpected clipping
2. **Make normalization configurable**: Adds UI complexity, still creates potential confusion

The chosen approach provides the most straightforward and user-friendly solution.

## Implementation Status

- [ ] Backup current files
- [ ] Modify BaseNode.js line ~820
- [ ] Modify BaseNode.js line ~1040  
- [ ] Test with various volume levels
- [ ] Verify preview-download consistency
- [ ] Update documentation if needed

---

*Created: 2026-01-14*
*Status: Planning Complete*