---
name: ffmpeg-stream-processing
description: >-
  Deep FFmpeg and FFprobe video processing guide for YouTube Live Stream Video Cutter.
  Details direct HTTP Range stream seeking, keyframe-accurate vs frame-accurate trimming,
  video/audio sync preservation, zero-RAM pipeline, and batch ZIP packaging.
metadata:
  icon: video
  version: "1.0.0"
  project: YouTube Live Stream Video Cutter
  workspace: "d:/New folder (5)/yt video clipper"
---

# FFmpeg Stream Processing & Video Optimization Guide

This skill specifies the video engineering standards and FFmpeg command construction for extracting clips from long livestreams and high-resolution videos without downloading source files.

---

## 1. Direct HTTP Range Stream Seeking

When processing YouTube streams or remote media, **never download the entire multi-gigabyte video**.

### Fast HTTP Range Seek Pattern
Place `-ss` and `-to` **before** each `-i` parameter:

```bash
ffmpeg -y \
  -ss 01:23:45 -to 01:25:45 -i "VIDEO_STREAM_URL" \
  -ss 01:23:45 -to 01:25:45 -i "AUDIO_STREAM_URL" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 192k \
  -avoid_negative_ts make_zero \
  -movflags +faststart \
  output_clip.mp4
```

### Why this works:
1. When `-ss` precedes `-i`, FFmpeg requests only the HTTP byte ranges needed from the remote CDN using HTTP `Range` headers.
2. Slicing 2 minutes from hour 4 of a 5-hour video downloads only ~50MB of data instead of 25GB.
3. Total processing duration is **under 10 seconds** instead of 30+ minutes of download time.

---

## 2. Trimming Modes: Stream Copy vs. Frame-Accurate Re-encoding

### Mode A: Smart Frame-Accurate (Default)
* **Command:**
  `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -avoid_negative_ts make_zero -movflags +faststart`
* **Characteristics:**
  - Trims at exact frame boundaries (down to the millisecond).
  - Pristine visual quality (CRF 18 is visually indistinguishable from source).
  - Guarantees 100% audio/video sync across all media players and browsers.
  - Generates web-optimized MP4 with moov atom at beginning (`-movflags +faststart`).
  - Duration: ~10–20 seconds for a 2-minute 1080p clip.

### Mode B: Ultra-Fast Stream Copy
* **Command:**
  `-c:v copy -c:a copy -avoid_negative_ts make_zero -movflags +faststart`
* **Characteristics:**
  - Zero recompression, 100% untouched bitstream.
  - Near-instantaneous (2–5 seconds).
  - Snaps to the nearest prior keyframe (I-frame). If keyframes occur every 2 seconds, the cut may start slightly before the exact second.

---

## 3. Audio/Video Synchronization Standards

To eliminate sync drift or blank audio starts:
1. Always apply `-avoid_negative_ts make_zero` when seeking.
2. Synchronize both video and audio streams by passing identical `-ss` and `-to` parameters before both inputs.
3. When combining separate DASH video and audio streams, transcode audio to standard stereo AAC (`-c:a aac -b:a 192k -ac 2`) to ensure universal playback.

---

## 4. Batch ZIP Packaging

For multi-clip batch exports:
1. Sanitize the video title to create safe filenames:
   - Example: `PUBG_Championship_Finals_Clip_01.mp4`, `PUBG_Championship_Finals_Clip_02.mp4`
2. Process clips sequentially or with controlled concurrency (e.g., 2 workers) to prevent CPU starvation.
3. Package all completed clips into a ZIP archive using Python's `zipfile` module:
   ```python
   import zipfile
   with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
       for clip_file in clip_files:
           zipf.write(clip_file, arcname=os.path.basename(clip_file))
   ```
4. Return both individual clip download links and the overall ZIP package download link.

---

## 5. Storage Lifecycle & Automatic Cleanup

1. Output directory: `exports/{session_id}/`.
2. Temporary files: `temp/{session_id}/`.
3. Background cleanup task runs every 30 minutes, deleting completed files and temp artifacts older than 2 hours.
4. Active memory footprint remains $< 50\text{ MB}$ at all times.
