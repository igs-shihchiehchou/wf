# Volume Node Clipping Protection Design

## Overview

Add clipping protection to VolumeNode to prevent audio distortion when volume exceeds 100% on loud audio.

**Problem**: When volume gain > 1.0, audio samples can exceed ±1.0 range, causing digital clipping (harsh distortion).

**Solution**: Detect clipping and offer multiple fix options via dropdown.

## User Flow

1. User loads audio and connects to VolumeNode
2. User adjusts volume slider (0-200%)
3. When preview updates, system detects if any samples would exceed ±1.0
4. If clipping detected and mode is "None": show warning text
5. If clipping detected and mode is Limiter/Soft Clip/Normalize: apply fix, no warning

## UI Design

```
┌─────────────────────────────┐
│ ▲ 音量調整                   │
├─────────────────────────────┤
│ 音量                         │
│ [━━━━━━━━━━●━━━] 150%       │
│                              │
│ 削波保護                     │
│ [無 (僅警告)          ▼]    │
│                              │
│ ⚠️ 偵測到削波                │  ← only when clipping & mode=None
├─────────────────────────────┤
│ [Preview] [Download]         │
└─────────────────────────────┘
```

## Clipping Mode Options

| Mode | Label | Behavior |
|------|-------|----------|
| `none` | 無 (僅警告) | Show warning, no processing |
| `limiter` | 限制器 | Cap samples at ±0.99 |
| `softclip` | 軟削波 | Apply tanh() for smooth limiting |
| `normalize` | 自動正規化 | Scale all samples so peak = 0.99 |

## Data Model

```javascript
// VolumeNode.data
{
  volume: 100,           // 0-200 (percentage)
  clippingMode: 'none'   // 'none' | 'limiter' | 'softclip' | 'normalize'
}
```

## Audio Processing Algorithms

### Clipping Detection

```javascript
detectClipping(audioBuffer, gain) → { clipped: boolean, peakLevel: number }
```
- Scan all samples, find max absolute value after applying gain
- Return `clipped: true` if any sample would exceed 1.0
- Return `peakLevel` for potential UI use

### Limiter

```javascript
applyLimiter(audioBuffer, threshold = 0.99)
```
- Samples above threshold capped to threshold
- Samples below -threshold capped to -threshold
- Fast, transparent, no lookahead

### Soft Clip

```javascript
applySoftClip(audioBuffer)
```
- Apply `tanh()` function: `output = tanh(input)`
- Naturally compresses values approaching ±1.0
- Adds subtle warmth, never exceeds ±1.0

### Normalize

```javascript
normalizeAudio(audioBuffer)
```
- Find peak absolute value
- Scale all samples by `0.99 / peak`
- Preserves dynamics, just scales down

## Processing Order

In VolumeNode.process():
1. Apply volume gain (multiply samples)
2. Detect if clipping occurred
3. If clipping AND mode ≠ 'none': apply selected fix
4. Return processed buffer + clipping status for UI

## Files to Modify

| File | Changes |
|------|---------|
| `js/audioProcessor.js` | Add `detectClipping()`, `applyLimiter()`, `applySoftClip()`, `normalizeAudio()` |
| `js/nodes/VolumeNode.js` | Update UI (dropdown, warning), update `process()` |
| `css/graph.css` | Add styles for `.clipping-mode-select` and `.clipping-warning` |

## Testing Checklist

- [ ] Load audio, set volume to 200% → warning appears (mode: none)
- [ ] Switch to "Limiter" → warning disappears, preview sounds clean
- [ ] Switch to "Soft Clip" → preview has slight warmth, no distortion
- [ ] Switch to "Normalize" → preview is quieter but clean
- [ ] Set volume to 50% → no warning in any mode
- [ ] Download in each mode → verify output matches preview
- [ ] Test with loud audio (peaks near 1.0) at 110% volume

## Edge Cases

- Silent audio → no clipping, no warning
- Audio with peaks at exactly 1.0 → volume > 100% triggers warning
- Multiple VolumeNodes chained → each handles its own clipping
