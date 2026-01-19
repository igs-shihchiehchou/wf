# Video Node Issues Fix Plan v0.1.0

## Version Information
- **Version**: v0.1.0
- **Release Date**: 2025-01-14
- **Type**: Initial Patch Release
- **Target Issues**: Video drag-and-drop, data flow, audio padding
- **Next Version**: v0.1.1 (if additional patches needed)

## Overview
This document outlines fixes needed for three critical issues with the video preview functionality in audio web tool. This v0.1.0 release will establish version display in console and UI footer.

## Issue Analysis

### Issue 1: Video drag-and-drop creates AudioInputNode instead of VideoPreviewNode
**Current Behavior**: When video files are dragged onto the canvas, the system creates AudioInputNode instances because the drag handler only filters for `audio/*` MIME types.

**Root Cause**: The canvas drag-and-drop handler in `canvas.js` doesn't recognize video files as a distinct media type that should create VideoPreviewNode instances.

### Issue 2: VideoPreviewNode cannot accept audio from non-input nodes  
**Current Behavior**: VideoPreviewNode fails to process audio when connected to processing nodes (Volume, Pitch, etc.) but works with AudioInputNode.

**Root Cause**: Data flow inconsistency between node types:
- **AudioInputNode** outputs: `{audioFiles: [AudioBuffer...], filenames: [string...]}`
- **Processing nodes** output: `{audio: AudioBuffer}` 
- **VideoPreviewNode** expects: Structured multi-file format

The `getInputAudioData()` method in VideoPreviewNode.js has logic to handle both formats, but the graph engine's `getNodeInputData()` method may not be correctly processing the outputs from processing nodes.

### Issue 3: Audio edited in VideoPreviewNode has wrong padding/empty voice at start
**Current Behavior**: Processed audio in VideoPreviewNode contains silence or empty regions at the beginning.

**Root Causes**:
1. **Audio processing artifacts**: Phase Vocoder and other algorithms add padding to prevent artifacts
2. **Sample rate mismatches**: AudioProcessor may not handle sample rate conversion properly
3. **Timeline synchronization issues**: Offset/crop calculations may not account for processing delays
4. **WaveSurfer normalization**: Preview/playback inconsistency if `normalize: true`

## Fix Strategy

### Phase 1: Version Display Implementation (v0.1.0 Foundation)

#### 1.1 Console Version Display
Add to `js/app.js`:
```javascript
const VERSION = '0.1.0';
console.log(`🎵 Audio Web Tool v${VERSION}`);
```

#### 1.2 UI Footer Version Display
Add to `css/theme.css`:
```css
.version-footer {
    position: fixed;
    bottom: 8px;
    right: 8px;
    font-size: 11px;
    color: var(--text-muted);
    background: rgba(0,0,0,0.7);
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    z-index: 1000;
}
```

Add to `index.html` (before closing body tag):
```html
<div class="version-footer">v0.1.0</div>
```

### Phase 2: Drag-and-Drop Enhancement

#### 2.1 Modify Canvas Drag Handler (`canvas.js`)
```javascript
// Add video file detection in dragover/drop handlers
const isVideo = files.some(f => f.type.startsWith('video/'));
const isAudio = files.some(f => f.type.startsWith('audio/'));

if (isVideo && !isAudio) {
    // Create VideoPreviewNode at drop position
    const node = this.engine.createNode('video-preview', x, y);
    node.loadVideoFile(videoFile);
} else if (isAudio) {
    // Existing AudioInputNode logic
}
```

#### 2.2 Update Global Drop Detection
- Add MIME type detection for both video and audio
- Implement priority logic (video files take precedence for mixed drops)
- Ensure proper positioning for video node creation

### Phase 3: Data Flow Standardization

#### 3.1 Create Data Adapter for VideoPreviewNode
```javascript
// In VideoPreviewNode.js, enhance getInputAudioData()
normalizeInputData(outputs) {
    // Convert processing node output to expected format
    if (outputs.audio && outputs.audio instanceof AudioBuffer) {
        return {
            audioFiles: [outputs.audio],
            filenames: ['Processed Audio']
        };
    }
    return outputs;
}
```

#### 3.2 Fix Graph Engine Data Processing
```javascript
// In graphEngine.js, update getNodeInputData()
// Ensure all node outputs are properly normalized for VideoPreviewNode
const normalizeOutputForVideoPreview = (output, sourceNode) => {
    if (output.audio && !(output.audioFiles)) {
        return {
            ...output,
            audioFiles: [output.audio],
            filenames: [sourceNode.data?.filename || 'Processed Audio']
        };
    }
    return output;
};
```

#### 3.3 Add Data Format Validation
- Validate AudioBuffer instances before processing
- Add fallbacks for missing metadata
- Ensure consistent filename handling

### Phase 4: Audio Processing Fixes

#### 4.1 Remove Processing Padding
```javascript
// In audioProcessor.js, modify algorithms to remove unnecessary padding
changePitch(audioBuffer, semitones) {
    // Existing phase vocoder logic
    // Remove: any automatic padding addition
    // Add: trimSilence() call after processing
    return trimmedBuffer;
}
```

#### 4.2 Ensure Sample Rate Consistency
```javascript
// Add sample rate validation and conversion
ensureSampleRateConsistency(buffer, targetRate) {
    if (buffer.sampleRate !== targetRate) {
        return this.resample(buffer, targetRate);
    }
    return buffer;
}
```

#### 4.3 Fix WaveSurfer Configuration
```javascript
// In VideoPreviewNode.js, ensure consistent preview/playback
const wavesurfer = WaveSurfer.create({
    container: container,
    normalize: false, // Critical: prevent preview-download discrepancy
    // ... other options
});
```

#### 4.4 Timeline Synchronization Improvements
```javascript
// In VideoPreviewNode.js, fix offset calculations
calculateTrackTiming(track, buffer) {
    // Account for any processing delays
    const processingDelay = this.getProcessingDelay(buffer);
    const adjustedOffset = track.offset - processingDelay;
    
    return {
        startTime: adjustedOffset,
        endTime: adjustedOffset + (track.cropEnd - track.cropStart)
    };
}
```

## Implementation Plan

### Week 1: Version Foundation & Drag-and-Drop Fix
1. **Version Display**: Implement console and UI footer version display
2. **Research**: Test current drag behavior with different file combinations
3. **Implement**: Modify canvas.js to detect video files and create VideoPreviewNode
4. **Test**: Verify video file handling, positioning, and edge cases

### Week 2: Data Flow Resolution  
1. **Analysis**: Map exact data structures from each node type
2. **Implement**: Add normalization logic in VideoPreviewNode
3. **Fix**: Update graphEngine.js to handle processing node outputs correctly
4. **Test**: Connect various processing chains to VideoPreviewNode

### Week 3: Audio Processing Fixes
1. **Investigate**: Profile audio processing algorithms for padding artifacts
2. **Implement**: Remove unnecessary padding and add silence trimming
3. **Fix**: Ensure sample rate consistency throughout the pipeline
4. **Verify**: Confirm preview-download volume consistency

### Week 4: Integration Testing & Polish
1. **End-to-end testing**: Complete workflows from video drop to final export
2. **Performance**: Test with large files and complex processing chains  
3. **Documentation**: Update any relevant API documentation
4. **Bug fixes**: Address any remaining edge cases

## Risk Assessment

### Low Risk
- Version display implementation
- Drag-and-drop detection modification
- WaveSurfer configuration fix

### Medium Risk  
- Data flow normalization (potential regression with other node types)
- Audio processing algorithm changes

### High Risk
- Sample rate conversion implementation
- Timeline synchronization logic changes

## Success Criteria

1. ✅ Version v0.1.0 displayed in console and UI footer
2. ✅ Video files dropped on canvas create VideoPreviewNode at correct position
3. ✅ VideoPreviewNode accepts audio from any processing node without errors
4. ✅ Processed audio in VideoPreviewNode has no unwanted silence/padding
5. ✅ Preview playback matches downloaded export audio levels
6. ✅ All existing functionality remains intact (no regressions)

## Testing Strategy

### Unit Tests
- Test version display functionality
- Test video MIME type detection
- Test data format normalization functions
- Test audio processing padding removal

### Integration Tests  
- Test complete workflows: Video drop → Audio processing → Preview → Export
- Test all processing node types connected to VideoPreviewNode
- Test edge cases: empty tracks, invalid files, mixed node connections

### Manual Tests
- Test version display across different browsers
- Test with various video formats and sizes
- Test complex processing chains (Volume → Pitch → VideoPreview)
- Verify timeline accuracy with processed audio

## Code Locations

### Primary Files to Modify
- `js/app.js` - Version constant and console output
- `index.html` - Version footer element
- `css/theme.css` - Version footer styling
- `js/canvas.js` - Drag-and-drop handling
- `js/nodes/VideoPreviewNode.js` - Data input normalization, timeline fixes
- `js/graphEngine.js` - Data flow processing
- `js/audioProcessor.js` - Remove padding artifacts

### Secondary Files for Testing
- `css/graph.css` - Any UI changes needed

## Dependencies

### External Libraries
- Tone.js (audio processing)
- WaveSurfer.js v7 (waveform visualization)

### Internal Dependencies  
- BaseNode class (node inheritance)
- AudioProcessor singleton (audio processing)
- GraphEngine (data flow management)

## Rollback Plan

If any fix introduces regressions:
1. Revert changes to affected files
2. Restore previous functionality
3. Implement alternative approach with lower risk
4. Test thoroughly before re-deployment

## Estimated Timeline

- **Phase 1 (Version + Drag-and-Drop)**: 3-4 days
- **Phase 2 (Data Flow)**: 4-5 days  
- **Phase 3 (Audio Processing)**: 3-4 days
- **Phase 4 (Testing & Polish)**: 2-3 days

**Total Estimated Time**: 12-16 working days

---

*This plan should be reviewed and approved before implementation begins. Regular progress updates should be provided during development.*