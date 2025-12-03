# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based audio processing web tool built as a pure static website. It enables users to load, edit, and export audio files entirely in the browser without server-side processing. The application uses a card-based workflow where each processing operation creates a new card, allowing multi-layer audio editing.

## Development Commands

### Local Development Server

Since this is a static website with no build process, use any HTTP server:

```bash
# Python 3 (recommended)
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

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
- **Card-Based Workflow** - Each audio edit creates a new card, enabling chained multi-layer processing
- **Browser-Only Processing** - All audio processing happens client-side using Web Audio API

### Module Structure

The codebase follows a class-based modular design with global instances:

**js/utils.js** - Utility functions
- `formatTime()` - Convert seconds to mm:ss format
- `generateId()` - Unique ID generation for cards
- `showToast()` - Toast notification system
- `audioBufferToWav()` - Convert AudioBuffer to WAV format for download
- `downloadAudioBuffer()` - Trigger browser download

**js/audioProcessor.js** - Audio processing engine (singleton: `audioProcessor`)
- `AudioProcessor` class with `audioContext` (Web Audio API)
- Methods: `loadAudioFromFile()`, `cropAudio()`, `adjustVolume()`, `applyFadeIn()`, `applyFadeOut()`, `changePlaybackRate()`, `processAudio()`
- All processing returns new AudioBuffer (immutable pattern)

**js/audioCard.js** - Audio card component
- `AudioCard` class represents one audio editing card
- Each card has: AudioBuffer, WaveSurfer instance, settings object, UI element
- Settings structure: `{ crop, volume, fadeIn, fadeOut, playbackRate }`
- Card lifecycle: construct → add to DOM → `initialize()` (creates WaveSurfer) → user edits → `processAudio()` → new card

**js/app.js** - Main application controller
- `CardsManager` class (singleton: `cardsManager`) - Manages card array and DOM container
- `FileUploadHandler` class - Handles file uploads and drag-drop
- Global keyboard shortcuts (Ctrl+O to upload, Ctrl+Shift+C to clear)

### Data Flow

```
File Upload → AudioBuffer → AudioCard (with WaveSurfer)
                               ↓
                        User Edits Parameters
                               ↓
                   AudioProcessor.processAudio()
                               ↓
                 New AudioBuffer → New AudioCard (chained)
```

### Key Technical Details

**WaveSurfer Integration:**
- WaveSurfer must be initialized AFTER the card element is in the DOM
- Card construction creates the element, `initialize()` creates WaveSurfer
- AudioBuffer is converted to WAV Blob for WaveSurfer to load
- Waveform colors use theme CSS variables (hsl(56 38% 57%))

**Audio Processing Pipeline:**
Operations are applied sequentially in `processAudio()`:
1. Crop (if enabled)
2. Volume adjustment
3. Fade in (if enabled)
4. Fade out (if enabled)
5. Playback rate (simple resampling, changes pitch)

**Dual-Handle Range Slider for Crop:**
- Two overlapping `<input type="range">` elements
- CSS variables `--range-start` and `--range-width` control visual highlight
- Logic ensures start ≤ end at all times
- Located in audioCard.js:196-262

**Card Chaining:**
- `processAudio()` creates new AudioCard with processed buffer
- New card's filename is `${original} (已處理)`
- Optional `parentCard` parameter tracks lineage (not currently used for UI)

## Design System

### Color Theme

Dark theme based on warm yellow/beige tones defined in `css/theme.css`:

- Primary: `hsl(56 38% 57%)` - Main actions, waveform
- Secondary: `hsl(242 68% 80%)` - Secondary actions
- Background hierarchy: `--bg-dark` (page) → `--bg` (content) → `--bg-light` (cards)
- Text: `--text` (main), `--text-muted` (secondary)
- Semantic: `--danger`, `--warning`, `--success`, `--info`

All colors are defined as CSS variables in `:root`. See `doc/plan.md` for complete design specifications.

### Spacing System

8px baseline grid: `--spacing-1` (4px) through `--spacing-12` (48px)

## Important Patterns and Conventions

### File Loading Must Happen Before Edits

Always read files before proposing changes. This codebase has no TypeScript or type definitions, so understanding existing patterns requires reading the source.

### WaveSurfer Lifecycle

When working with audio cards:
1. Card element must be created
2. Element must be added to DOM
3. Only then call `card.initialize()` to create WaveSurfer
4. Never create WaveSurfer before DOM insertion

### Settings Object Structure

When modifying audio processing features, maintain the settings object structure in AudioCard:

```javascript
{
  crop: { enabled: boolean, start: number, end: number },
  volume: number,  // 0.0-2.0
  fadeIn: { enabled: boolean, duration: number },
  fadeOut: { enabled: boolean, duration: number },
  playbackRate: number  // 0.5-2.0
}
```

### Browser Compatibility

Target modern browsers with Web Audio API support (Chrome, Firefox, Safari, Edge). No IE11 support needed.

## Common Tasks

### Adding a New Audio Effect

1. Add effect method to `AudioProcessor` class (audioProcessor.js)
2. Add settings property to `AudioCard.settings` default structure (audioCard.js:14-31)
3. Add UI controls in `createCardElement()` (audioCard.js:38-123)
4. Add event listeners in `attachEventListeners()` (audioCard.js:181-311)
5. Add effect application in `AudioProcessor.processAudio()` pipeline (audioProcessor.js:175-208)

### Modifying UI Components

All styles are in `css/theme.css`. Use existing CSS variables for colors/spacing to maintain consistency. The codebase uses both Tailwind utility classes (via CDN) and custom CSS.

### Debugging Audio Processing

- Check browser console for errors
- Use `console.log()` to inspect AudioBuffer properties (sampleRate, numberOfChannels, duration, length)
- Verify Web Audio API operations complete synchronously (no await needed except for `loadAudioFromFile`)

## Known Limitations

- Playback rate adjustment is simple resampling - WILL change pitch
- Large files (>50MB) may cause performance issues
- No undo/redo functionality
- Export format is WAV only (no MP3 encoding)
- No project save/load capability

## Documentation

- `README.md` - User-facing documentation (in Traditional Chinese)
- `doc/plan.md` - Complete development plan with design specifications
- `doc/task.md` - Task tracking list
- `doc/theme.md` - Color theme definitions

## Git Commit Convention

Follow conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code refactoring
- `style:` - UI/styling changes
- `perf:` - Performance improvements
- `test:` - Testing related
- `docs:` - Documentation updates

Example: `feat: add reverb effect to audio processor`
