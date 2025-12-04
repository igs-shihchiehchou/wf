# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based audio processing web tool built as a pure static website with a **node-based graph UI**. Users can visually connect audio processing nodes to create audio editing pipelines. All processing happens client-side using the Web Audio API.

## Development Commands

### Local Development Server

Since this is a static website with no build process, use any HTTP server:

```bash
# Python 3 (recommended)
python -m http.server 8000

# Node.js
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

### No Build/Test Commands

This project has no build process, package manager, or test framework. All dependencies are loaded via CDN.

## Architecture

### Core Design Philosophy

- **Zero Build** - Pure static HTML/CSS/JS, no build tools or npm
- **CDN Dependencies** - All libraries loaded via CDN (Tone.js, WaveSurfer.js v7, Tailwind CSS)
- **Node-Based Graph UI** - Visual node editor for connecting audio processing operations
- **Browser-Only Processing** - All audio processing happens client-side using Web Audio API

### Module Structure

```
js/
├── utils.js              # Utility functions (formatTime, generateId, showToast, audioBufferToWav)
├── audioProcessor.js     # Audio processing engine (singleton: audioProcessor)
├── audioAnalyzer.js      # Audio analysis engine (basic info, frequency, pitch, spectrogram)
├── canvas.js             # Graph canvas for node rendering and interaction
├── link.js               # Connection links between nodes
├── graphEngine.js        # Manages node connections and data flow execution
├── nodePanel.js          # Left sidebar panel for dragging nodes
├── app.js                # Main application controller
├── components/
│   └── ProgressBar.js    # Progress bar component for analysis
└── nodes/
    ├── BaseNode.js       # Base class for all nodes
    ├── AudioInputNode.js # Audio file input node with automatic analysis
    └── ProcessNodes.js   # Processing nodes (Volume, Crop, FadeIn, FadeOut, Speed, Pitch)
```

### Node Types

| Type | Icon | Description |
|------|------|-------------|
| `audio-input` | 📁 | Load audio files |
| `volume` | 🎚️ | Adjust volume (0-200%) |
| `crop` | ✂️ | Trim audio with visual waveform |
| `fade-in` | 📈 | Add fade-in effect |
| `fade-out` | 📉 | Add fade-out effect |
| `speed` | ⏩ | Adjust playback speed (changes pitch) |
| `pitch` | 🎵 | Adjust pitch without changing duration (Phase Vocoder) |

### Data Flow

```
AudioInputNode → [ProcessNode] → [ProcessNode] → ... → Preview/Download
                     ↓
              Each node processes AudioBuffer
              and passes to connected nodes
```

### Key Technical Details

**Node System:**
- All nodes extend `BaseNode` class
- Nodes have input/output ports for connections
- `process(inputs)` method handles audio processing
- Preview functionality built into BaseNode

**Audio Processing Pipeline (audioProcessor.js):**
- `cropAudio()` - Trim audio by time range
- `adjustVolume()` - Scale audio samples
- `applyFadeIn()` / `applyFadeOut()` - Linear fade effects
- `changePlaybackRate()` - Simple resampling (changes pitch)
- `changePitch()` - Phase Vocoder algorithm (preserves duration)

**Audio Analysis Engine (audioAnalyzer.js):**
- `analyzeBasicInfo()` - Extract duration, sample rate, channels
- `analyzeFrequency()` - FFT-based frequency spectrum analysis
  - Frequency band distribution (low/mid/high)
  - Dominant frequency detection
  - Spectral centroid calculation
- `analyzePitch()` - YIN algorithm for pitch detection
  - Sliding window analysis (100ms windows, 50ms hop)
  - Pitch curve generation over time
  - Average pitch and range calculation
  - Pitched vs. noise classification
- `generateSpectrogram()` - STFT-based spectrogram generation
  - Time-frequency heat map visualization
  - Interactive canvas rendering with mouse hover
- **Caching System:**
  - SHA-256 hash-based audio fingerprinting
  - localStorage caching (7-day expiration, max 10 entries)
  - Automatic cache management and cleanup
- **Performance Optimizations:**
  - Async processing with `setTimeout(0)` for UI responsiveness
  - Progress reporting during long analyses
  - Chunked processing for large files

**Graph Engine (graphEngine.js):**
- Manages node creation and deletion
- Handles port connections
- Executes data flow with topological sort
- Provides save/load to localStorage

## Design System

### Color Theme

Dark theme with warm yellow/beige tones defined in `css/theme.css`:

- Primary: `hsl(56 38% 57%)` - Main actions, waveform
- Secondary: `hsl(242 68% 80%)` - Secondary actions
- Node categories distinguished by header color

### Node Styling (css/graph.css)

- Input nodes: Green header
- Process nodes: Blue header
- Output nodes: Purple header

## Adding a New Node

1. **Create node class** in `js/nodes/ProcessNodes.js`:
   ```javascript
   class MyNode extends BaseNode {
     constructor(id, options = {}) {
       const defaultData = { myParam: 100 };
       super(id, 'my-node', 'My Node', '🎯', options, defaultData);
     }
     
     setupPorts() {
       this.addInputPort('audio', 'audio', 'audio');
       this.addOutputPort('audio', 'audio', 'audio');
     }
     
     getNodeCategory() { return 'process'; }
     
     renderContent() { /* Return HTML for controls */ }
     
     bindContentEvents() { /* Bind control events */ }
     
     async process(inputs) {
       const audioBuffer = inputs.audio;
       if (!audioBuffer) return { audio: null };
       // Process and return
       return { audio: processedBuffer };
     }
   }
   window.MyNode = MyNode;
   ```

2. **Register in graphEngine.js**:
   ```javascript
   this.nodeTypes = {
     // ...existing nodes
     'my-node': MyNode
   };
   ```

3. **Add to nodePanel.js**:
   ```javascript
   { type: 'my-node', label: 'My Node', icon: '🎯', description: 'Description' }
   ```

4. **Add to context menu** in `graphEngine.js` `showContextMenu()` and `handleContextMenuAction()`

5. **Add CSS** for node-specific styles in `css/graph.css`

## Keyboard Shortcuts

- `1-6`: Quick add nodes
- `Space`: Execute all (when no selection)
- `Ctrl+S`: Save to localStorage
- `Ctrl+O`: Load from localStorage
- `F`: Fit view to content
- `Home`: Reset view
- `+/-`: Zoom in/out
- `Delete`: Remove selected nodes/links

## Known Limitations

- Large files (>50MB) may cause performance issues
- No undo/redo functionality
- Export format is WAV only (no MP3 encoding)
- Phase Vocoder pitch shift has some audio artifacts
- Audio analysis:
  - YIN pitch detection optimized for 80-1000 Hz range (game audio focus)
  - Spectrogram generation uses first 10 seconds for hash-based caching
  - Analysis cache limited to 10 most recent files (localStorage constraint)

## Git Commit Convention

Follow conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code refactoring
- `style:` - UI/styling changes

Example: `feat: add reverb effect node`
