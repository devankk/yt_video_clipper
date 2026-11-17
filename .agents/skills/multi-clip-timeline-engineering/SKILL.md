---
name: multi-clip-timeline-engineering
description: >-
  Advanced timeline editor engineering guide for YouTube Live Stream Video Cutter.
  Covers dynamic time rulers, zoom/pan interaction, draggable dual handles,
  active orange highlights, player synchronization, and multi-clip data state.
metadata:
  icon: sliders
  version: "1.0.0"
  project: YouTube Live Stream Video Cutter
  workspace: "d:/New folder (5)/yt video clipper"
---

# Multi-Clip Timeline Engineering Guide

This skill governs the architecture, mathematical models, and interaction design of the interactive visual timeline editor.

---

## 1. Timeline Mathematical Model

The timeline maps between two coordinate spaces:
1. **Time Domain:** $[0, \text{TotalDurationSeconds}]$
2. **Pixel Domain:** $[0, \text{ViewportWidthPx} \times \text{ZoomFactor}]$

### Key Conversion Functions
```javascript
// Convert seconds to pixel position
function timeToPixels(seconds, totalDuration, trackWidth) {
  if (totalDuration <= 0) return 0;
  return (seconds / totalDuration) * trackWidth;
}

// Convert pixel position to seconds
function pixelsToTime(pixels, totalDuration, trackWidth) {
  if (trackWidth <= 0) return 0;
  const time = (pixels / trackWidth) * totalDuration;
  return Math.max(0, Math.min(totalDuration, time));
}
```

---

## 2. Dynamic Time Ruler

The time ruler must adaptively scale its tick marks depending on the video's total duration and current zoom factor:

| Visible Duration in Viewport | Major Tick Interval | Minor Tick Interval | Label Format |
| :--- | :--- | :--- | :--- |
| $> 2 \text{ hours}$ | 30 minutes | 10 minutes | `HH:MM:SS` |
| $30 \text{ min} - 2 \text{ hours}$ | 10 minutes | 2 minutes | `HH:MM:SS` |
| $5 \text{ min} - 30 \text{ min}$ | 1 minute | 15 seconds | `MM:SS` |
| $1 \text{ min} - 5 \text{ min}$ | 10 seconds | 2 seconds | `MM:SS` |
| $< 1 \text{ min}$ | 2 seconds | 0.5 seconds | `SS.ss` |

### Rendering Performance
- Render the ruler using HTML5 Canvas or lightweight SVG line elements.
- Re-draw only on zoom, resize, or horizontal scroll events.

---

## 3. Draggable Range Handles & Interaction

Each clip range contains three interactive zones:
1. **Left Handle (`.handle-start`):** Drags to adjust Start Timestamp. Clamped between `0` and `endTime - 1.0s`.
2. **Right Handle (`.handle-end`):** Drags to adjust End Timestamp. Clamped between `startTime + 1.0s` and `totalDuration`.
3. **Center Body (`.range-body`):** Drags to shift the entire clip window left or right without altering its duration.

### Visual Styling
- **Inactive Clip:** Dark grey/orange tint border (`rgba(255, 107, 0, 0.3)`), subtle translucent fill.
- **Active / Selected Clip:** High-contrast Vivid Orange fill (`rgba(255, 107, 0, 0.25)`), solid orange border (`#ff6b00`), illuminated handles with cursor `ew-resize`.

---

## 4. Player Synchronization & Playhead Scrubber

1. **Scrubbing:**
   - Clicking anywhere on the ruler or track immediately seeks the video player to that timestamp.
   - Dragging the playhead cursor updates the video player in real time.
2. **Playback Tracking:**
   - When the video is playing, poll `player.getCurrentTime()` every 50ms (or via `requestAnimationFrame`).
   - Move the playhead cursor smoothly along the track: `playhead.style.left = \`\${pixels}px\``.
3. **Clip Preview Loop:**
   - When the user clicks "Preview Clip", set `targetEndTime = clip.endTime`.
   - Jump player to `clip.startTime` and play.
   - When `player.getCurrentTime() >= targetEndTime`, pause the player and reposition to `clip.startTime`.

---

## 5. Multi-Clip Data State

```typescript
interface ClipRange {
  id: string;              // e.g. "clip-1"
  name: string;            // e.g. "PUBG_Clip_01"
  startTime: number;       // In seconds (e.g. 3724.5)
  endTime: number;         // In seconds (e.g. 3844.5)
  duration: number;        // endTime - startTime
  color?: string;          // Orange accent
  isSelected: boolean;
}
```

- Synchronize changes bidirectionally: editing the numerical HH:MM:SS inputs updates the timeline handles; dragging the timeline handles updates the inputs.
