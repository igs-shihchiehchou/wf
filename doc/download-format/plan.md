# Download Format Selection Implementation Plan

## Overview
Add WAV/MP3 format selection for both single file downloads and batch ZIP downloads in the audio web tool.

## Current State Analysis

### Download Locations
1. **Single File Download** (BaseNode.js:549-576)
   - Method: `handleMultiFileDownloadSingle(index)`
   - Hardcoded to WAV format
   - Creates blob with `type: 'audio/wav'`
   - Filename: `${baseName}.wav`

2. **Batch Download** (BaseNode.js:581-620)
   - Method: `handleMultiFileDownloadAll()`
   - Hardcoded to WAV format
   - Each file in ZIP: `${baseName}.wav`

3. **Legacy Single Preview Download** (BaseNode.js:953-976)
   - Method: `downloadPreview()`
   - Hardcoded to WAV format
   - Filename: `${this.title}_processed.wav`

### Key Dependencies
- WAV conversion: `audioBufferToWav()` (utils.js:78-128)
- ZIP library: JSZip (already loaded via CDN)
- Format context menu will need to be created

## Implementation Strategy

### Phase 1: Add MP3 Encoding Library
**Goal:** Add lamejs (MP3 encoder) via CDN to enable MP3 export

**Tasks:**
1. Add lamejs CDN script tag to index.html (before app.js)
   - CDN: `https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js`
   - This is a pure JS LAME encoder, no build required

2. Create `audioBufferToMp3()` utility function in utils.js
   - Convert AudioBuffer to MP3 using lamejs
   - Return ArrayBuffer of MP3 data
   - Set bitrate to 192 kbps (good quality for game audio)

**Files to modify:**
- `index.html` - Add script tag
- `js/utils.js` - Add MP3 conversion function

### Phase 2: Create Format Selection UI
**Goal:** Show context menu when user clicks download button

**Design:**
- Small floating context menu with two buttons: "WAV" and "MP3"
- Position near the download button that was clicked
- Click outside to dismiss
- Simple CSS styling matching existing theme

**Tasks:**
1. Create format selection context menu HTML/CSS
   - Add CSS classes to `css/graph.css`
   - Menu structure: `.format-menu` container with `.format-option` buttons

2. Create `showFormatMenu()` helper in BaseNode
   - Takes parameters: position, callback
   - Creates menu, positions it, handles clicks
   - Returns selected format to callback

**Files to modify:**
- `css/graph.css` - Add format menu styles
- `js/nodes/BaseNode.js` - Add `showFormatMenu()` helper method

### Phase 3: Update Single File Download
**Goal:** Show format menu, then download in selected format

**Tasks:**
1. Modify `handleMultiFileDownloadSingle(index)`
   - Show format menu when download button clicked
   - Wait for user selection
   - Call new `downloadSingleFile(index, format)` method

2. Create `downloadSingleFile(index, format)` method
   - Accept 'wav' or 'mp3' format
   - Convert buffer to appropriate format
   - Set correct MIME type
   - Set correct file extension

**Files to modify:**
- `js/nodes/BaseNode.js` - Modify download logic

### Phase 4: Update Batch Download (ZIP)
**Goal:** Show format menu, then create ZIP with all files in selected format

**Tasks:**
1. Modify `handleMultiFileDownloadAll()`
   - Show format menu when "Download All" button clicked
   - Wait for user selection
   - Call new `downloadAllFiles(format)` method

2. Create `downloadAllFiles(format)` method
   - Accept 'wav' or 'mp3' format
   - Loop through all files
   - Convert each to selected format
   - Add to ZIP with correct extension
   - Download ZIP

**Files to modify:**
- `js/nodes/BaseNode.js` - Modify ZIP download logic

### Phase 5: Update Legacy Preview Download
**Goal:** Add format selection to old single-preview download

**Tasks:**
1. Modify `downloadPreview()`
   - Show format menu
   - Wait for selection
   - Download in selected format

**Files to modify:**
- `js/nodes/BaseNode.js` - Modify preview download

### Phase 6: Testing & Acceptance Criteria
**Goal:** Verify all scenarios from download-format.feature

**Test Cases:**
1. ✓ Single file download shows format menu
2. ✓ WAV download creates valid WAV file
3. ✓ MP3 download creates valid MP3 file
4. ✓ Batch download shows format menu
5. ✓ Batch WAV creates ZIP with all .wav files
6. ✓ Batch MP3 creates ZIP with all .mp3 files
7. ✓ File extensions match selected format
8. ✓ MIME types are correct
9. ✓ Files are playable in media players

## Technical Decisions

### MP3 Encoder: lamejs
**Why lamejs?**
- Pure JavaScript, no WebAssembly
- Works in all browsers
- CDN available, no build process
- Good quality encoding
- Actively maintained
- Small size (~60KB)

**Alternatives considered:**
- `@breezystack/lamejs` - Same library, different package
- `mp3-encoder` - Requires build process
- `vmsg` - Recorder focused, not suitable

### Format Menu Design
**Why context menu?**
- Minimal UI disruption
- Familiar pattern (right-click menus)
- Easy to dismiss (click outside)
- Positions near click point

**Why not modal/dialog?**
- Too heavy for simple 2-choice selection
- Requires more clicks to dismiss
- Blocks entire UI

### Bitrate Choice: 192 kbps
**Why 192 kbps?**
- High quality for game audio
- Good balance of quality vs. file size
- Industry standard for high-quality MP3
- Suitable for sound effects and music

## File Structure

```
js/
├── utils.js
│   └── audioBufferToMp3() [NEW]
├── nodes/
│   └── BaseNode.js
│       ├── showFormatMenu() [NEW]
│       ├── downloadSingleFile(index, format) [NEW]
│       ├── downloadAllFiles(format) [NEW]
│       ├── handleMultiFileDownloadSingle(index) [MODIFIED]
│       ├── handleMultiFileDownloadAll() [MODIFIED]
│       └── downloadPreview() [MODIFIED]
css/
└── graph.css
    └── .format-menu styles [NEW]
index.html
└── lamejs script tag [NEW]
```

## Implementation Order

### Step 1: Foundation (Can work independently)
- Add lamejs to index.html
- Add `audioBufferToMp3()` to utils.js
- Add format menu CSS to graph.css

### Step 2: Format Menu Helper
- Add `showFormatMenu()` to BaseNode.js
- Test menu appearance and interaction

### Step 3: Single File Download
- Modify `handleMultiFileDownloadSingle()`
- Add `downloadSingleFile(index, format)`
- Test both WAV and MP3 downloads

### Step 4: Batch Download
- Modify `handleMultiFileDownloadAll()`
- Add `downloadAllFiles(format)`
- Test both WAV and MP3 ZIPs

### Step 5: Legacy Preview Download
- Modify `downloadPreview()`
- Test format selection

### Step 6: Integration Testing
- Test all scenarios from BDD feature file
- Verify file playback in media players
- Check MIME types and extensions

## Risk Mitigation

### Risk: MP3 Encoding Performance
**Mitigation:**
- Show toast message "正在編碼 MP3..." before encoding
- Encode files in chunks if >50MB
- Consider Web Worker if performance is poor (future enhancement)

### Risk: Browser Compatibility
**Mitigation:**
- lamejs works in all modern browsers
- Fall back to WAV if encoding fails
- Show error toast if MP3 not supported

### Risk: File Size
**Mitigation:**
- lamejs is only ~60KB from CDN
- Only loaded once, cached by browser
- No impact on initial page load time

## Success Criteria

1. ✓ All BDD scenarios in download-format.feature pass
2. ✓ WAV files play correctly in VLC, Windows Media Player
3. ✓ MP3 files play correctly in VLC, Windows Media Player
4. ✓ ZIP files extract correctly
5. ✓ File extensions match format (.wav or .mp3)
6. ✓ MIME types are correct (audio/wav or audio/mpeg)
7. ✓ No performance degradation for small files (<10MB)
8. ✓ User can cancel format selection by clicking outside menu
9. ✓ Format menu positioning works on different screen sizes
10. ✓ No console errors during download process

## Future Enhancements (Out of Scope)

- Variable bitrate (VBR) option
- Quality slider (128/192/320 kbps)
- Remember last selected format (localStorage)
- Keyboard shortcuts (W for WAV, M for MP3)
- Progress bar for large file encoding
- Web Worker for background encoding
- Additional formats (OGG, FLAC)
