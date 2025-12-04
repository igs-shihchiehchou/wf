# Audio Analysis Feature - Task Breakdown

## Overview

This document breaks down the audio analysis feature into manageable tasks with complexity assessments and clear acceptance criteria. The feature adds automatic audio analysis to AudioInputNode, displaying basic info, frequency spectrum, and pitch analysis with YIN algorithm.

---

## Task List

### Phase 1: Foundation & Basic Infrastructure

#### Task 1.1: Create ProgressBar Component
**Complexity:** Simple
**Priority:** High
**Dependencies:** None
**Estimated Effort:** 30-45 minutes

**Description:**
Create a reusable progress bar component in `/mnt/e/projects/audio_workspace/audio_webtool/js/components/ProgressBar.js` that shows analysis progress with percentage and status message.

**Acceptance Criteria:**
- [ ] Create `js/components/ProgressBar.js` file
- [ ] Implement `ProgressBar` class with constructor, `update()`, and `remove()` methods
- [ ] Progress bar displays icon, label, progress fill, and percentage
- [ ] Progress updates smoothly with CSS transitions
- [ ] Component can be easily removed from DOM
- [ ] Export as window.ProgressBar for global access

**Files to Create:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/components/ProgressBar.js`

---

#### Task 1.2: Create AudioAnalyzer Class Structure
**Complexity:** Simple
**Priority:** High
**Dependencies:** None
**Estimated Effort:** 45-60 minutes

**Description:**
Create the main AudioAnalyzer class in `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js` with the basic structure for orchestrating all analysis tasks.

**Acceptance Criteria:**
- [ ] Create `js/audioAnalyzer.js` file
- [ ] Implement `AudioAnalyzer` class with constructor accepting audioContext
- [ ] Implement `analyze()` method that orchestrates all analysis steps
- [ ] Add progress callback support with percentage and status message
- [ ] Add Map-based cache structure for analysis results
- [ ] Export global instance: `window.audioAnalyzer`
- [ ] Include placeholder methods: `analyzeBasicInfo()`, `analyzeFrequency()`, `analyzePitch()`

**Files to Create:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 1.3: Implement Basic Info Analyzer
**Complexity:** Simple
**Priority:** High
**Dependencies:** Task 1.2
**Estimated Effort:** 30 minutes

**Description:**
Implement the `analyzeBasicInfo()` method in AudioAnalyzer class to extract basic audio information from AudioBuffer.

**Acceptance Criteria:**
- [ ] Extract duration, sample rate, number of channels, and length
- [ ] Format duration as "X.XXs"
- [ ] Format sample rate as "XX.X kHz"
- [ ] Determine channel mode (single/stereo in Chinese: "單聲道"/"立體聲")
- [ ] Return structured object matching specification in feature doc
- [ ] Handle edge cases (empty buffer, invalid data)

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 1.4: Create Analysis CSS Styles
**Complexity:** Simple
**Priority:** Medium
**Dependencies:** None
**Estimated Effort:** 45-60 minutes

**Description:**
Create CSS file for all analysis-related UI components including progress bar and analysis results display panel.

**Acceptance Criteria:**
- [ ] Create `css/analysis.css` file
- [ ] Style progress bar component (header, container, fill animation, text)
- [ ] Style analysis results panel (collapsible sections, info rows)
- [ ] Style frequency spectrum bars (low/mid/high with percentages)
- [ ] Style pitch analysis section (collapsible with detailed view)
- [ ] Use existing CSS variables from theme.css
- [ ] Ensure responsive design fits within node width
- [ ] Add to index.html stylesheet imports

**Files to Create:**
- `/mnt/e/projects/audio_workspace/audio_webtool/css/analysis.css`

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/index.html` (add CSS link)

---

### Phase 2: Frequency Spectrum Analysis

#### Task 2.1: Implement FFT Spectrum Computation
**Complexity:** Medium
**Priority:** High
**Dependencies:** Task 1.2
**Estimated Effort:** 1.5-2 hours

**Description:**
Implement frequency spectrum analysis using Web Audio API's AnalyserNode and FFT to compute frequency distribution.

**Acceptance Criteria:**
- [ ] Implement `analyzeFrequency()` method in AudioAnalyzer
- [ ] Use OfflineAudioContext with AnalyserNode for FFT analysis
- [ ] Use FFT size of 2048 samples
- [ ] Extract frequency data from middle section of audio
- [ ] Compute frequency spectrum magnitude array
- [ ] Handle both mono and stereo audio (analyze first channel)
- [ ] Return raw spectrum data for further processing

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 2.2: Calculate Frequency Band Distribution
**Complexity:** Medium
**Priority:** High
**Dependencies:** Task 2.1
**Estimated Effort:** 1 hour

**Description:**
Implement frequency band energy calculation to determine low/mid/high frequency distribution percentages.

**Acceptance Criteria:**
- [ ] Implement `calculateFrequencyBands()` method
- [ ] Define frequency ranges: Low (20-250 Hz), Mid (250-4000 Hz), High (4000-20000 Hz)
- [ ] Calculate energy sum for each frequency band
- [ ] Normalize to percentages (0-1 range)
- [ ] Return object with `{low, mid, high}` percentage values
- [ ] Handle division by zero (silent audio)

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 2.3: Find Dominant Frequency and Spectral Centroid
**Complexity:** Simple
**Priority:** Medium
**Dependencies:** Task 2.1
**Estimated Effort:** 45 minutes

**Description:**
Implement methods to find the dominant frequency (peak) and calculate spectral centroid (brightness measure).

**Acceptance Criteria:**
- [ ] Implement `findDominantFrequency()` method
- [ ] Find frequency bin with maximum magnitude
- [ ] Convert bin index to frequency in Hz
- [ ] Implement `calculateSpectralCentroid()` method
- [ ] Calculate weighted average of spectrum (center of mass)
- [ ] Return both values in frequency analysis result

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

### Phase 3: YIN Pitch Detection Algorithm

#### Task 3.1: Implement YIN Algorithm Core
**Complexity:** Complex
**Priority:** High
**Dependencies:** Task 1.2
**Estimated Effort:** 3-4 hours

**Description:**
Implement the YIN pitch detection algorithm following the academic paper specification with all 4 steps: difference function, CMNDF, absolute threshold search, and parabolic interpolation.

**Acceptance Criteria:**
- [ ] Implement `detectPitchYIN()` method in AudioAnalyzer
- [ ] Step 1: Compute difference function for lag values
- [ ] Step 2: Calculate cumulative mean normalized difference function (CMNDF)
- [ ] Step 3: Absolute threshold search (threshold = 0.15)
- [ ] Step 4: Parabolic interpolation for sub-sample precision
- [ ] Set frequency range: 80-1000 Hz (suitable for game audio)
- [ ] Return `{frequency, confidence}` object
- [ ] Handle edge cases (silent audio, no valid pitch)
- [ ] Add comprehensive code comments explaining each step

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 3.2: Implement Pitch Curve Generation
**Complexity:** Medium
**Priority:** High
**Dependencies:** Task 3.1
**Estimated Effort:** 1.5-2 hours

**Description:**
Implement sliding window pitch analysis to generate pitch curve over time using YIN algorithm.

**Acceptance Criteria:**
- [ ] Implement `analyzePitch()` method that processes audio in windows
- [ ] Use 100ms window size (0.1 * sampleRate)
- [ ] Use 50ms hop size (50% overlap)
- [ ] Call `detectPitchYIN()` for each window
- [ ] Build pitch curve array with `{time, frequency, confidence}` objects
- [ ] Report progress during long analysis
- [ ] Use async/await with setTimeout to avoid blocking UI
- [ ] Filter valid pitches (confidence > 0.5) for statistics

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 3.3: Calculate Pitch Statistics
**Complexity:** Simple
**Priority:** Medium
**Dependencies:** Task 3.2
**Estimated Effort:** 30 minutes

**Description:**
Calculate statistical information from pitch curve: average pitch, range, and determine if audio has clear pitch.

**Acceptance Criteria:**
- [ ] Calculate average pitch from valid pitch points (confidence > 0.5)
- [ ] Find min/max pitch range
- [ ] Determine `isPitched` flag (>30% valid pitches = pitched sound)
- [ ] Return statistics in pitch analysis result
- [ ] Handle edge cases (no valid pitches detected)

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

### Phase 4: Spectrogram Visualization

#### Task 4.1: Generate Spectrogram Data
**Complexity:** Complex
**Priority:** High
**Dependencies:** Task 2.1
**Estimated Effort:** 2-3 hours

**Description:**
Implement spectrogram generation using Short-Time Fourier Transform (STFT) to create time-frequency heat map data.

**Acceptance Criteria:**
- [ ] Implement `generateSpectrogram()` method in AudioAnalyzer
- [ ] Use FFT size of 512 samples
- [ ] Use hop size of 128 samples (25% of FFT size)
- [ ] Process entire audio buffer in sliding windows
- [ ] For each window, compute FFT spectrum
- [ ] Convert magnitude to dB scale (20 * log10)
- [ ] Normalize to 0-255 intensity values for visualization
- [ ] Return 2D array structure `[time][frequency]` with intensity values
- [ ] Include metadata: width, height, timeStep, frequencyRange
- [ ] Report progress during generation
- [ ] Use async processing to avoid UI blocking

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 4.2: Create Spectrogram Canvas Renderer
**Complexity:** Complex
**Priority:** Medium
**Dependencies:** Task 4.1
**Estimated Effort:** 2.5-3 hours

**Description:**
Create a Canvas-based heat map renderer to visualize spectrogram data with proper frequency axis, time axis, and color mapping.

**Acceptance Criteria:**
- [ ] Create `SpectrogramRenderer` class (can be in audioAnalyzer.js or separate file)
- [ ] Render spectrogram data to canvas element
- [ ] Implement heat map color scheme (black -> blue -> green -> yellow -> red)
- [ ] Draw frequency axis (logarithmic scale preferred) with labels (100Hz, 500Hz, 1kHz, 5kHz, 10kHz, 20kHz)
- [ ] Draw time axis with labels at regular intervals
- [ ] Scale canvas to fit within node width (e.g., 300px wide)
- [ ] Handle canvas creation and sizing
- [ ] Implement efficient pixel-level rendering for large spectrograms

**Files to Modify/Create:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js` (or create new file for renderer)

---

#### Task 4.3: Add Spectrogram Interactivity
**Complexity:** Medium
**Priority:** Low
**Dependencies:** Task 4.2
**Estimated Effort:** 1-1.5 hours

**Description:**
Add mouse hover interactivity to spectrogram to show time and frequency information at cursor position.

**Acceptance Criteria:**
- [ ] Add mousemove event listener to spectrogram canvas
- [ ] Calculate time and frequency at cursor position
- [ ] Display tooltip or overlay showing exact time and frequency
- [ ] Show intensity value at hovered position (optional)
- [ ] Update tooltip position smoothly
- [ ] Remove tooltip when mouse leaves canvas
- [ ] Ensure performance doesn't degrade with hover tracking

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

### Phase 5: UI Integration with AudioInputNode

#### Task 5.1: Integrate Analysis into AudioInputNode
**Complexity:** Medium
**Priority:** High
**Dependencies:** Tasks 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.2, 3.3, 4.1
**Estimated Effort:** 2-2.5 hours

**Description:**
Modify AudioInputNode to trigger automatic analysis after loading audio file and display progress bar during analysis.

**Acceptance Criteria:**
- [ ] Add `analyzeAudio()` method to AudioInputNode
- [ ] Call analysis after audio buffer is loaded in `loadFile()`
- [ ] Create and display ProgressBar component in node content
- [ ] Pass progress callback to audioAnalyzer.analyze()
- [ ] Store analysis result in `this.analysisResult`
- [ ] Remove progress bar when analysis completes
- [ ] Handle analysis errors gracefully (show warning toast but continue)
- [ ] Ensure analysis doesn't block waveform initialization

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`

---

#### Task 5.2: Create Analysis Results Panel UI
**Complexity:** Medium
**Priority:** High
**Dependencies:** Task 5.1
**Estimated Effort:** 2-3 hours

**Description:**
Create the analysis results display panel in AudioInputNode with collapsible sections for basic info, frequency spectrum, and pitch analysis.

**Acceptance Criteria:**
- [ ] Add `showAnalysisResult()` method to AudioInputNode
- [ ] Create collapsible panel structure (expand/collapse functionality)
- [ ] Display basic info section (duration, sample rate, channels in one line)
- [ ] Display frequency spectrum section with visual bars for low/mid/high
- [ ] Show dominant frequency and interpret for game audio (e.g., "explosion sound")
- [ ] Display pitch analysis summary (collapsed by default)
- [ ] Show average pitch, range, and type (pitched/noise)
- [ ] Include expand/collapse icons (▼/▲)
- [ ] Use Chinese labels as specified in feature doc
- [ ] Panel appears below waveform in node content

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`
- `/mnt/e/projects/audio_workspace/audio_webtool/css/analysis.css`

---

#### Task 5.3: Add Spectrogram Visualization to Panel
**Complexity:** Medium
**Priority:** Medium
**Dependencies:** Tasks 4.2, 5.2
**Estimated Effort:** 1.5-2 hours

**Description:**
Integrate spectrogram canvas visualization into the expandable pitch analysis section of the results panel.

**Acceptance Criteria:**
- [ ] Add canvas element to pitch analysis detail view
- [ ] Render spectrogram when pitch analysis section is expanded
- [ ] Ensure canvas is properly sized within node
- [ ] Show/hide spectrogram based on section collapse state
- [ ] Display spectrogram only if pitch analysis succeeded
- [ ] Add fallback message if spectrogram generation failed
- [ ] Ensure proper cleanup when node is removed

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`

---

### Phase 6: Performance Optimization & Polish

#### Task 6.1: Implement Analysis Caching
**Complexity:** Medium
**Priority:** Medium
**Dependencies:** Task 1.2
**Estimated Effort:** 1.5-2 hours

**Description:**
Implement file hash-based caching to avoid re-analyzing the same audio file multiple times.

**Acceptance Criteria:**
- [ ] Implement `computeFileHash()` method using SubtleCrypto SHA-256
- [ ] Implement `getCachedAnalysis()` method to check localStorage
- [ ] Store analysis results in localStorage with file hash as key
- [ ] Check cache before starting analysis in AudioInputNode
- [ ] Use cached results immediately if available
- [ ] Add cache size management (limit to prevent localStorage overflow)
- [ ] Handle cache serialization/deserialization properly
- [ ] Provide option to force re-analysis (bypass cache)

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`

---

#### Task 6.2: Optimize Performance for Large Files
**Complexity:** Complex
**Priority:** Medium
**Dependencies:** Tasks 2.1, 3.2, 4.1
**Estimated Effort:** 2-3 hours

**Description:**
Implement chunked processing and async execution to prevent UI freezing when analyzing large audio files.

**Acceptance Criteria:**
- [ ] Implement `analyzeInChunks()` helper for long-running tasks
- [ ] Break pitch analysis into chunks (e.g., 5 seconds of audio per chunk)
- [ ] Use `setTimeout(0)` or `requestIdleCallback` between chunks to yield to UI
- [ ] Break spectrogram generation into chunks
- [ ] Update progress bar smoothly during chunked processing
- [ ] Ensure total progress reflects all sub-tasks
- [ ] Test with large files (>5MB, >5 minutes duration)
- [ ] Verify UI remains responsive during analysis

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`

---

#### Task 6.3: Error Handling and Graceful Degradation
**Complexity:** Simple
**Priority:** High
**Dependencies:** All analysis tasks
**Estimated Effort:** 1 hour

**Description:**
Add comprehensive error handling and graceful degradation when analysis fails or produces invalid results.

**Acceptance Criteria:**
- [ ] Wrap all analysis methods in try-catch blocks
- [ ] If basic info fails, return empty object
- [ ] If frequency analysis fails, skip frequency section in UI
- [ ] If pitch analysis fails, skip pitch section in UI
- [ ] Show appropriate warning toasts for failures
- [ ] Log detailed error messages to console
- [ ] Ensure audio file still loads and plays even if analysis fails
- [ ] Display partial results if some analyses succeed
- [ ] Add fallback for unsupported browsers (check for required APIs)

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/audioAnalyzer.js`
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`

---

#### Task 6.4: Add Analysis Panel Collapse Persistence
**Complexity:** Simple
**Priority:** Low
**Dependencies:** Task 5.2
**Estimated Effort:** 30 minutes

**Description:**
Save user's collapse/expand preferences for analysis sections to localStorage.

**Acceptance Criteria:**
- [ ] Store collapse state in localStorage when user toggles sections
- [ ] Restore collapse state when showing new analysis results
- [ ] Use unique keys per section (e.g., `analysis_pitch_collapsed`)
- [ ] Apply default state (expanded for basic/frequency, collapsed for pitch)
- [ ] Handle localStorage access errors gracefully

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/js/nodes/AudioInputNode.js`

---

### Phase 7: Testing & Documentation

#### Task 7.1: Cross-Browser Testing
**Complexity:** Simple
**Priority:** Medium
**Dependencies:** All implementation tasks
**Estimated Effort:** 1 hour

**Description:**
Test audio analysis feature across different browsers to ensure compatibility.

**Acceptance Criteria:**
- [ ] Test in Chrome/Edge (Chromium-based)
- [ ] Test in Firefox
- [ ] Test in Safari (if available)
- [ ] Verify Web Audio API support
- [ ] Verify AnalyserNode works correctly
- [ ] Verify Canvas rendering works correctly
- [ ] Document any browser-specific issues or limitations
- [ ] Add browser compatibility notes to code comments

**No files to modify** (testing task)

---

#### Task 7.2: Test with Various Audio Types
**Complexity:** Simple
**Priority:** High
**Dependencies:** All implementation tasks
**Estimated Effort:** 1-1.5 hours

**Description:**
Test analysis accuracy and performance with various types of game audio files.

**Acceptance Criteria:**
- [ ] Test with explosion sounds (low frequency, noise-like)
- [ ] Test with UI sounds (high frequency, short duration)
- [ ] Test with music/melodies (pitched, tonal)
- [ ] Test with ambient/environmental sounds (mixed spectrum)
- [ ] Test with mono and stereo files
- [ ] Test with different sample rates (44.1kHz, 48kHz)
- [ ] Test with various durations (short <1s, medium 1-5s, long >5s)
- [ ] Verify analysis results are sensible for each type
- [ ] Document any issues or unexpected results

**No files to modify** (testing task)

---

#### Task 7.3: Update CLAUDE.md Documentation
**Complexity:** Simple
**Priority:** Medium
**Dependencies:** All implementation tasks
**Estimated Effort:** 30-45 minutes

**Description:**
Update CLAUDE.md to document the new audio analysis feature for future development.

**Acceptance Criteria:**
- [ ] Add audio analysis to Architecture section
- [ ] Document new files (audioAnalyzer.js, ProgressBar.js, analysis.css)
- [ ] Explain analysis capabilities (basic info, frequency, pitch)
- [ ] Document YIN algorithm usage
- [ ] Note any performance considerations
- [ ] Add to "Known Limitations" if any discovered

**Files to Modify:**
- `/mnt/e/projects/audio_workspace/audio_webtool/CLAUDE.md`

---

## Summary Statistics

### Total Tasks: 23

### Complexity Distribution:
- **Simple:** 9 tasks (39%)
- **Medium:** 10 tasks (43%)
- **Complex:** 4 tasks (17%)

### Priority Distribution:
- **High:** 15 tasks (65%)
- **Medium:** 7 tasks (30%)
- **Low:** 2 tasks (9%)

### Estimated Total Effort:
- **Minimum:** 29 hours
- **Maximum:** 37.5 hours

---

## Recommended Implementation Order

### Sprint 1: Foundation (Tasks 1.1 - 1.4)
Complete basic infrastructure to enable progress tracking and basic info display.

1. Task 1.1: Create ProgressBar Component
2. Task 1.2: Create AudioAnalyzer Class Structure
3. Task 1.3: Implement Basic Info Analyzer
4. Task 1.4: Create Analysis CSS Styles

**Deliverable:** Progress bar component and basic audio info analysis working

---

### Sprint 2: Frequency Analysis (Tasks 2.1 - 2.3)
Implement frequency spectrum analysis and visualization.

5. Task 2.1: Implement FFT Spectrum Computation
6. Task 2.2: Calculate Frequency Band Distribution
7. Task 2.3: Find Dominant Frequency and Spectral Centroid

**Deliverable:** Frequency spectrum analysis complete with low/mid/high distribution

---

### Sprint 3: Pitch Detection (Tasks 3.1 - 3.3)
Implement YIN algorithm and pitch curve generation.

8. Task 3.1: Implement YIN Algorithm Core ⚠️ COMPLEX
9. Task 3.2: Implement Pitch Curve Generation
10. Task 3.3: Calculate Pitch Statistics

**Deliverable:** Pitch detection working with YIN algorithm

---

### Sprint 4: Spectrogram (Tasks 4.1 - 4.3)
Create spectrogram visualization with interactivity.

11. Task 4.1: Generate Spectrogram Data ⚠️ COMPLEX
12. Task 4.2: Create Spectrogram Canvas Renderer ⚠️ COMPLEX
13. Task 4.3: Add Spectrogram Interactivity

**Deliverable:** Spectrogram heat map visualization working

---

### Sprint 5: UI Integration (Tasks 5.1 - 5.3)
Integrate all analysis features into AudioInputNode UI.

14. Task 5.1: Integrate Analysis into AudioInputNode
15. Task 5.2: Create Analysis Results Panel UI
16. Task 5.3: Add Spectrogram Visualization to Panel

**Deliverable:** Complete analysis UI integrated in AudioInputNode

---

### Sprint 6: Optimization (Tasks 6.1 - 6.4)
Optimize performance and add polish.

17. Task 6.1: Implement Analysis Caching
18. Task 6.2: Optimize Performance for Large Files ⚠️ COMPLEX
19. Task 6.3: Error Handling and Graceful Degradation
20. Task 6.4: Add Analysis Panel Collapse Persistence

**Deliverable:** Feature optimized and production-ready

---

### Sprint 7: Testing & Docs (Tasks 7.1 - 7.3)
Comprehensive testing and documentation.

21. Task 7.1: Cross-Browser Testing
22. Task 7.2: Test with Various Audio Types
23. Task 7.3: Update CLAUDE.md Documentation

**Deliverable:** Feature fully tested and documented

---

## Critical Dependencies

### Blocking Dependencies:
- **Task 2.1** blocks 2.2, 2.3, 4.1 (FFT computation required for all frequency analysis)
- **Task 3.1** blocks 3.2, 3.3 (YIN algorithm required for pitch analysis)
- **Task 4.1** blocks 4.2, 4.3 (spectrogram data required for visualization)
- **Tasks 1.1, 1.2, 1.3, 2.x, 3.x, 4.1** block 5.1 (UI integration needs all analysis working)
- **Task 5.2** blocks 5.3 (panel must exist before adding spectrogram)

### Parallel Opportunities:
- Phase 1 tasks (1.1-1.4) can be done in parallel
- Tasks 2.x and 3.x can be developed in parallel (independent analysis modules)
- Task 4.3 (interactivity) can be done separately after 4.2

---

## Potential Blockers & Risk Assessment

### High Risk Areas:

1. **YIN Algorithm Implementation (Task 3.1)**
   - **Risk:** Complex mathematical algorithm, potential for bugs
   - **Mitigation:** Follow reference implementation closely, add extensive testing
   - **Fallback:** Use simpler autocorrelation method if YIN proves too difficult

2. **Spectrogram Performance (Tasks 4.1, 6.2)**
   - **Risk:** Large audio files may cause performance issues
   - **Mitigation:** Implement chunked processing early, test with large files
   - **Fallback:** Limit spectrogram resolution for files >5 minutes

3. **Canvas Rendering (Task 4.2)**
   - **Risk:** Complex visualization, pixel-level manipulation
   - **Mitigation:** Start with simple color mapping, iterate
   - **Fallback:** Use simpler bar chart visualization instead of heat map

### Medium Risk Areas:

4. **Web Audio API Compatibility (Task 7.1)**
   - **Risk:** Browser differences in AnalyserNode behavior
   - **Mitigation:** Test early across browsers
   - **Fallback:** Graceful degradation with feature detection

5. **localStorage Caching (Task 6.1)**
   - **Risk:** Quota exceeded errors, serialization issues
   - **Mitigation:** Implement size limits and error handling
   - **Fallback:** In-memory cache only if localStorage fails

### Dependencies on External Libraries:
- None - Feature uses only native Web Audio API and Canvas API

---

## Testing Strategy

### Unit Testing:
- YIN algorithm correctness (compare with known pitch detection results)
- Frequency band calculation accuracy
- Spectrogram data structure validation

### Integration Testing:
- Full analysis pipeline with sample audio files
- Progress tracking accuracy
- UI updates during analysis

### Performance Testing:
- Analysis time for files of varying sizes
- Memory usage during analysis
- UI responsiveness during long operations

### User Acceptance Testing:
- Analysis results accuracy for game audio types
- UI usability and clarity
- Collapse/expand functionality
- Spectrogram interactivity

---

## Notes

- All file paths are absolute based on project root: `/mnt/e/projects/audio_workspace/audio_webtool/`
- Follow existing code style and conventions from CLAUDE.md
- Use conventional commits for all changes (feat:, fix:, refactor:, etc.)
- All text in UI should be in Chinese (Traditional) as per feature doc
- Maintain zero-build philosophy - no transpilation or bundling required
- Test in latest Chrome/Firefox as primary browsers
