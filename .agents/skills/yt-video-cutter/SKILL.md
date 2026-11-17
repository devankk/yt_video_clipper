---
name: yt-video-cutter
description: >-
  Authoritative engineering guide and comprehensive skill for the YouTube Live Stream Video Cutter.
  Covers YouTube URL extraction, official YouTube IFrame and HTML5 player coordination,
  zero-download HTTP range slicing via FFmpeg, multi-clip timeline editing, batch export packaging,
  and dark/orange DAW UI specifications.
metadata:
  icon: scissors
  version: "1.0.0"
  project: YouTube Live Stream Video Cutter
  workspace: "d:/New folder (5)/yt video clipper"
---

# YouTube Live Stream Video Cutter: Core Project Skill

This skill is the authoritative architectural and engineering specification for every agent working on the **YouTube Live Stream Video Cutter** platform. Load and follow these instructions whenever modifying video extraction, timeline rendering, FFmpeg pipelines, job state management, or UI interactions.

---

## 1. Project Overview & Core Philosophy

**YouTube Live Stream Video Cutter** is a specialized web application engineered to extract short, high-fidelity video clips (1–2 minutes) from long YouTube videos and completed livestreams (4–5 hours or longer).

* **Root Directory:** `d:/New folder (5)/yt video clipper/`
* **Core Philosophy:**
  1. **Zero Full-Video Downloads:** Never download entire 10GB–50GB livestream files to disk. Pass direct GoogleVideo streaming URLs directly to FFmpeg with input seeking (`-ss` before `-i`) to leverage HTTP `Range` requests, clipping in seconds.
  2. **URL-Only Workflow:** Accept YouTube URLs directly as first-class input; users must never be forced to manually download and upload multi-hour streams.
  3. **Visual Frame-Accurate Timeline:** Provide an interactive, zoomable timeline with draggable dual handles, visual range highlights, and instant player synchronization.
  4. **Strict Safety Guardrail:** **NEVER PUSH TO GITHUB** without explicit user consent (`"push"` or `"push to github"`).
  5. **Windows Shell Invariant:** All agent commands on Windows must use `cmd /c "..."` syntax due to PowerShell script execution restrictions.

---

## 2. Environment & System Inventory

| Tool | Version | Location / Command | Status |
| :--- | :--- | :--- | :--- |
| **Node.js** | v26.13.0 | `C:\Program Files\nodejs\node.exe` | ✅ Installed |
| **npm / npx** | 11.20.0 | **Always via `cmd /c npm ...`** | ✅ Installed |
| **Python** | 3.14.7 | `C:\Users\LUCIFER\AppData\Local\Programs\Python\Python314\python.exe` | ✅ Installed |
| **pip** | 26.2.1 | `cmd /c "pip ..."` | ✅ Installed |
| **FFmpeg** | N-128433 | System PATH | ✅ Installed |
| **FFprobe** | N-128433 | System PATH | ✅ Installed |
| **yt-dlp** | 2026.10.26 | Python module / CLI | ✅ Installed |

> [!CAUTION]
> **PowerShell Execution Policy Restriction:**
> PowerShell disables running unsigned `.ps1` scripts on this system.
> **Mandatory Rule:** Always invoke `npm`, `npx`, `pip`, and `python` wrapped in `cmd /c "..."`. Never execute bare PowerShell script wrappers.

---

## 3. Technology Stack & Design System

### 3.1 Backend Architecture
* **Framework:** FastAPI 0.115+ (Python 3.14, async/await native, `python-multipart` required).
* **Extraction Engine:** `yt-dlp` configured with `live_from_start: True` and cookie support (`cookiefile` / `YOUTUBE_COOKIES`).
* **Processing Engine:** FFmpeg with fast HTTP range seeking (`-ss` before `-i`), smart frame-accurate transcoding (`-c:v libx264 -crf 18 -c:a aac`) and ultra-fast stream copy (`-c copy`).
* **Background Worker:** `BackgroundTasks` / `asyncio` task queue with real-time job state management and polling (`GET /api/jobs/{job_id}`).

---

### 3.3 Deployment Environments: Localhost vs Cloud Datacenter (Render / AWS)

| Aspect | Localhost (`python run.py`) | Cloud Datacenter (Render / AWS / GCP) |
| :--- | :--- | :--- |
| **IP Classification** | Residential / Home Broadband | Datacenter ASN |
| **YouTube Bot Detection** | Passes silently with zero authentication | Blocks anonymous stream extraction (`Failed to extract any player response`) |
| **Player Preview** | YouTube IFrame API (runs in user's browser) | YouTube IFrame API (runs in user's browser, unaffected) |
| **Export Performance** | **1–2 min clip in ~2.8s** directly from GoogleVideo CDN | Requires **YouTube Cookies** (`cookies.txt` / `YOUTUBE_COOKIES`) or PO Token |
| **FFmpeg Binary** | Windows system FFmpeg in PATH | Debian/Ubuntu native `ffmpeg` installed via build script |
* **Packaging:** Python standard `zipfile` with `deflate` compression for batch exports.

### 3.2 Frontend Architecture & Design System
* **Design Aesthetic:** High-performance Video DAW / Studio Editing Console.
* **Palette Tokens:**
  - Base Obsidian: `#090a0f`
  - Workspace Canvas: `#12151e`
  - Elevated Surface: `#1a1e2b`
  - Console Borders: `#262c3e`
  - **Vivid Accent Orange:** `#ff6b00` (Playhead, active clip highlights, primary buttons)
  - **Orange Glow / Focus:** `rgba(255, 107, 0, 0.25)`
  - Text High Contrast: `#f3f4f6`
  - Text Muted: `#9ca3af`
  - Monospace Numbers: `JetBrains Mono` / `ui-monospace` for all timestamps, duration, and time ruler markers.
* **Player Abstraction:**
  - Official YouTube IFrame Player API for YouTube links.
  - Native HTML5 `<video>` player for local uploaded media files.

---

## 4. Ingestion & Playback Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INGESTION PIPELINES                                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│      1. YOUTUBE URL INGESTION        │      2. LOCAL FILE DROPZONE          │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. Metadata & Stream Resolution:     │ 1. Multipart Upload:                 │
│    yt-dlp extracts format URLs       │    POST /api/upload-video            │
│    (MP4 video + AAC audio).          │    Stored under temp directory.      │
│ 2. In-Memory Session Cache:          │ 2. ffprobe Duration Inspection:      │
│    Cached by video_id for 2 hours.   │    Returns resolution, fps, duration.│
│    Subsequent clip exports: 0.01s.   │ 3. HTML5 Video Player:               │
│ 3. YouTube IFrame Player Embed:      │    Streams with HTTP 206 Partial     │
│    Plays preview directly from YT.   │    Content for local preview.        │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 5. Testing & Verification Checklist

Before reporting any feature or bugfix as complete, verify:
- [ ] YouTube metadata extraction succeeds in < 3s without bot blocks.
- [ ] Direct stream range extraction extracts a 30s clip from a 4-hour video in < 10s.
- [ ] Exported MP4 files open cleanly in VLC and browser with perfect audio/video sync.
- [ ] Timeline ruler accurately displays ticks from 00:00:00 to 04:00:00+.
- [ ] Zooming in/out and panning works smoothly without layout distortion.
- [ ] Dragging start/end handles updates timestamp inputs and duration badge in real time.
- [ ] "Preview Clip" button accurately plays only the selected interval and pauses.
- [ ] Batch export exports multiple clips and packages them into a clean ZIP archive.
- [ ] `cmd /c` wrapper used for all system executions.
- [ ] Never push to GitHub without explicit user command (`"push"`).
